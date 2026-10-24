/**
 * The sync step before a pull request and the verify gate after it, against a throwaway
 * origin and clone: an up-to-date branch is left alone, a clean merge is committed without
 * running checks, a conflicted one is left in progress for the resolver, a base origin
 * lacks falls back to its default branch, and a bad base name is refused. Verify re-runs
 * the recorded checks once and decides on them.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PACK = resolve(import.meta.dir, '..', '..');
// Each test spawns a dozen git subprocesses; on Windows that outlasts the 5s default.
setDefaultTimeout(60_000);

function run(cwd: string, argv: string[], env: Record<string, string> = {}): { code: number; out: string; err: string } {
  const result = Bun.spawnSync(argv, { cwd, stdout: 'pipe', stderr: 'pipe', env: { ...process.env, ...env } });
  return { code: result.exitCode ?? 1, out: result.stdout.toString().trim(), err: result.stderr.toString() };
}

function git(cwd: string, ...args: string[]): string {
  const result = run(cwd, ['git', ...args]);
  if (result.code !== 0) throw new Error(`git ${args.join(' ')}: ${result.err}`);
  return result.out;
}

function commit(cwd: string, file: string, text: string, message: string): void {
  writeFileSync(join(cwd, file), text);
  git(cwd, 'add', file);
  git(cwd, 'commit', '-q', '-m', message);
}

/** An origin with `main`, a clone on `feature` one commit ahead, and the commit the run started from. */
function setup(): { origin: string; work: string; start: string; artifacts: string } {
  const root = mkdtempSync(join(tmpdir(), 'lril-sync-'));
  const origin = join(root, 'origin.git');
  const work = join(root, 'work');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'clone', '-q', origin, work);
  git(work, 'config', 'user.email', 'test@example.com');
  git(work, 'config', 'user.name', 'Test');
  git(work, 'checkout', '-q', '-b', 'main');
  commit(work, 'README.md', '# Shop\n', 'init');
  git(work, 'push', '-q', '-u', 'origin', 'main');
  const start = git(work, 'rev-parse', 'HEAD');
  git(work, 'checkout', '-q', '-b', 'feature');
  commit(work, 'cards.ts', 'export const saved = true;\n', 'save a card');
  const artifacts = join(root, 'artifacts');
  mkdirSync(join(artifacts, 'checks'), { recursive: true });
  writeFileSync(join(artifacts, 'checks', 'commands.json'), JSON.stringify(['true']));
  return { origin, work, start, artifacts };
}

/** Another clone lands `file` on origin's main, as a PR merged while the run was going would. */
function landOnMain(origin: string, file: string, text: string): void {
  const other = mkdtempSync(join(tmpdir(), 'lril-sync-other-'));
  git(other, 'clone', '-q', origin, 'clone');
  const clone = join(other, 'clone');
  git(clone, 'config', 'user.email', 'other@example.com');
  git(clone, 'config', 'user.name', 'Other');
  commit(clone, file, text, `land ${file}`);
  git(clone, 'push', '-q', 'origin', 'main');
}

function sync(work: string, start: string, base = 'main'): { code: number; out: string; err: string } {
  return run(work, ['bun', join(PACK, 'implement/scripts/sync-base.ts')], { BASE_BRANCH: base, INPUTS_START_SHA: start });
}

function verify(work: string, start: string, artifacts: string, agents: { fixer?: object; resolver?: object } = {}, env: Record<string, string> = {}) {
  return run(work, ['bun', join(PACK, 'implement/scripts/verify.ts')], {
    ARTIFACTS_DIR: artifacts,
    INPUTS_START_SHA: start,
    // A skipped agent arrives as 'null' or ''; cover both.
    INPUTS_FIXER: agents.fixer === undefined ? 'null' : JSON.stringify(agents.fixer),
    INPUTS_RESOLVER: agents.resolver === undefined ? '' : JSON.stringify(agents.resolver),
    ...env,
  });
}

describe('sync-base', () => {
  test('a branch already up to date with its base is left as it is', () => {
    const { work, start } = setup();
    const head = git(work, 'rev-parse', 'HEAD');
    const result = sync(work, start);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out)).toEqual({ conflicted: false, files: [], behind: 0, base: 'main', diff_base: 'origin/main' });
    expect(git(work, 'rev-parse', 'HEAD')).toBe(head);
  });

  test('a clean merge is committed, and no checks run', () => {
    const { origin, work, start, artifacts } = setup();
    landOnMain(origin, 'orders.ts', 'export const orders = [];\n');
    const result = sync(work, start);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out)).toEqual({ conflicted: false, files: [], behind: 1, base: 'main', diff_base: 'origin/main' });
    expect(git(work, 'rev-list', '--parents', '-n', '1', 'HEAD').split(' ')).toHaveLength(3);
    expect(existsSync(join(work, 'orders.ts'))).toBe(true);
    expect(readdirSync(join(artifacts, 'checks'))).toEqual(['commands.json']);
  });

  test('a conflicted merge is left in progress, naming the conflicted files', () => {
    const { origin, work, start } = setup();
    landOnMain(origin, 'cards.ts', 'export const saved = false;\n');
    const result = sync(work, start);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out)).toEqual({ conflicted: true, files: ['cards.ts'], behind: 1, base: 'main', diff_base: 'origin/main' });
    expect(run(work, ['git', 'rev-parse', '--quiet', '--verify', 'MERGE_HEAD']).code).toBe(0);
  });

  test('a base that origin does not have falls back to its default branch', () => {
    const { origin, work, start } = setup();
    landOnMain(origin, 'orders.ts', 'export const orders = [];\n');
    const result = sync(work, start, 'fix/never-pushed');
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out)).toEqual({ conflicted: false, files: [], behind: 1, base: 'main', diff_base: 'origin/main' });
    expect(result.err).toContain('fix/never-pushed is not on origin');
  });

  test('a base name that is not a branch name is refused before anything is fetched', () => {
    const { work, start } = setup();
    const result = sync(work, start, 'main..evil');
    expect(result.code).not.toBe(0);
    expect(result.err).toContain('not a valid branch name');
    expect(result.out).toBe('');
  });

  test('a passing gate records the commands it declared, without running them', () => {
    const { work, start, artifacts } = setup();
    writeFileSync(join(artifacts, 'checks', 'commands.json'), '[]');
    const verdict = JSON.stringify({ done: true, green: true, summary: 'built', check_commands: ['false', ' false '] });
    const result = run(work, ['bun', join(PACK, 'implement/scripts/gate.ts')], { ARTIFACTS_DIR: artifacts, INPUTS_VERDICT: verdict, INPUTS_START_SHA: start });
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out)).toEqual({ passed: true, commits: 1 });
    expect(JSON.parse(readFileSync(join(artifacts, 'checks', 'commands.json'), 'utf8'))).toEqual(['false']);
  });
});

describe('verify', () => {
  test('re-runs the recorded check commands once on the final tree', () => {
    const { work, start, artifacts } = setup();
    const result = verify(work, start, artifacts);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out)).toEqual({ passed: true, commits: 1, checks: 1 });
    expect(readFileSync(join(artifacts, 'checks', 'verify.md'), 'utf8')).toContain('`true` exited 0');
  });

  test('a failing check fails the run after one more attempt, naming how to resume', () => {
    const { work, start, artifacts } = setup();
    writeFileSync(join(artifacts, 'checks', 'commands.json'), JSON.stringify(['false']));
    const runId = '94a619b4232946c24775dbf6a62194a5';
    const result = verify(work, start, artifacts, {}, { WORKFLOW_ID: runId });
    expect(result.code).not.toBe(0);
    expect(result.err).toContain('failed when re-run');
    expect(result.err).toContain('Failed each time it ran (2 attempts).');
    expect(result.err).toContain(`archon workflow resume ${runId} --detach`);
  });

  test('a review fixer that reports not green is overruled by checks that pass', () => {
    const { work, start, artifacts } = setup();
    const result = verify(work, start, artifacts, { fixer: { done: true, green: false, summary: 'build still running' } });
    expect(result.code).toBe(0);
    expect(result.err).toContain('the re-run checks decide');
  });

  test('a merge resolver that declined stops the run before any check runs', () => {
    const { work, start, artifacts } = setup();
    const result = verify(work, start, artifacts, { resolver: { done: true, green: false, summary: 'the base removed the card store' } });
    expect(result.code).not.toBe(0);
    expect(result.err).toContain('was not resolved');
    expect(existsSync(join(artifacts, 'checks', 'verify.md'))).toBe(false);
  });

  test('no recorded check commands is refused rather than published unchecked', () => {
    const { work, start, artifacts } = setup();
    writeFileSync(join(artifacts, 'checks', 'commands.json'), '[]');
    const result = verify(work, start, artifacts);
    expect(result.code).not.toBe(0);
    expect(result.err).toContain('cannot be verified');
  });

  test('files a check command rewrites are stashed and recorded, not a failure', () => {
    const { work, start, artifacts } = setup();
    writeFileSync(join(artifacts, 'checks', 'commands.json'), JSON.stringify(['echo regenerated > cards.ts']));
    const result = verify(work, start, artifacts);
    expect(result.code).toBe(0);
    expect(git(work, 'status', '--porcelain')).toBe('');
    expect(git(work, 'stash', 'list')).toContain('lril verify: files the check commands changed');
    expect(readFileSync(join(artifacts, 'checks', 'verify.md'), 'utf8')).toContain('## Files the checks changed');
  });
});
