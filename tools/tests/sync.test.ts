/**
 * The sync step before a pull request, against a throwaway origin and clone: an up-to-date
 * branch is left alone, a clean merge is committed and re-checked, a conflicted one is left
 * in progress for the resolver, and a bad base name or a missing check record is refused.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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

function sync(work: string, start: string, artifacts: string, base = 'main'): { code: number; out: string; err: string } {
  return run(work, ['bun', join(PACK, 'implement/scripts/sync-base.ts')], { ARTIFACTS_DIR: artifacts, BASE_BRANCH: base, INPUTS_START_SHA: start });
}

describe('sync-base', () => {
  test('a branch already up to date with its base is left as it is', () => {
    const { work, start, artifacts } = setup();
    const head = git(work, 'rev-parse', 'HEAD');
    const result = sync(work, start, artifacts);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out)).toEqual({ conflicted: false, files: [], behind: 0, checks: 0, diff_base: 'origin/main' });
    expect(git(work, 'rev-parse', 'HEAD')).toBe(head);
  });

  test('a clean merge is committed and the last gate\'s checks are re-run', () => {
    const { origin, work, start, artifacts } = setup();
    landOnMain(origin, 'orders.ts', 'export const orders = [];\n');
    const result = sync(work, start, artifacts);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out)).toEqual({ conflicted: false, files: [], behind: 1, checks: 1, diff_base: 'origin/main' });
    expect(git(work, 'rev-list', '--parents', '-n', '1', 'HEAD').split(' ')).toHaveLength(3);
    expect(existsSync(join(work, 'orders.ts'))).toBe(true);
    expect(readFileSync(join(artifacts, 'checks', 'after-sync.md'), 'utf8')).toContain('`true` exited 0');
  });

  test('a conflicted merge is left in progress, naming the conflicted files', () => {
    const { origin, work, start, artifacts } = setup();
    landOnMain(origin, 'cards.ts', 'export const saved = false;\n');
    const result = sync(work, start, artifacts);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out)).toEqual({ conflicted: true, files: ['cards.ts'], behind: 1, checks: 0, diff_base: 'origin/main' });
    expect(run(work, ['git', 'rev-parse', '--quiet', '--verify', 'MERGE_HEAD']).code).toBe(0);
  });

  test('a base name that is not a branch name is refused before anything is fetched', () => {
    const { work, start, artifacts } = setup();
    const result = sync(work, start, artifacts, 'main..evil');
    expect(result.code).not.toBe(0);
    expect(result.err).toContain('not a valid branch name');
    expect(result.out).toBe('');
  });

  test('a clean merge with no recorded check commands is refused rather than published unchecked', () => {
    const { origin, work, start, artifacts } = setup();
    writeFileSync(join(artifacts, 'checks', 'commands.json'), '[]');
    landOnMain(origin, 'orders.ts', 'export const orders = [];\n');
    const result = sync(work, start, artifacts);
    expect(result.code).not.toBe(0);
    expect(result.err).toContain('cannot be re-checked');
  });

  test('a passing gate records the commands it ran for the sync to re-run', () => {
    const { work, start, artifacts } = setup();
    writeFileSync(join(artifacts, 'checks', 'commands.json'), '[]');
    const verdict = JSON.stringify({ done: true, green: true, summary: 'built', check_commands: ['true', ' true '] });
    const result = run(work, ['bun', join(PACK, 'implement/scripts/gate.ts')], { ARTIFACTS_DIR: artifacts, INPUTS_VERDICT: verdict, INPUTS_START_SHA: start, INPUTS_LABEL: 'implement' });
    expect(result.code).toBe(0);
    expect(JSON.parse(readFileSync(join(artifacts, 'checks', 'commands.json'), 'utf8'))).toEqual(['true']);
  });
});
