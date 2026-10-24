/**
 * The two gates around the implementers.
 *
 * `gate` follows each implementer: its own verdict, the check commands it declared,
 * and proof that the work is committed and nothing is left behind. It does not re-run
 * the checks; it records them for `verify`.
 *
 * `verify` runs once per run, on the final tree, after the review fixes and the merge
 * with the base. It re-runs the recorded check commands independently: "I ran the
 * tests" is a claim; this is the evidence. An AI node that declines still exits 0, so
 * run status is never the verdict.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ATTEMPTS, declaredCommands, runChecks } from './checks.ts';
import { note } from './io.ts';
import { write } from './local.ts';
import { exec, git, tryGit } from './proc.ts';

/** The check commands the last gate to pass recorded, for `verify` to re-run. */
export function lastGreenCommands(artifacts: string): string[] {
  const path = join(artifacts, 'checks', 'commands.json');
  if (!existsSync(path)) return [];
  try {
    return declaredCommands(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return [];
  }
}

/** How to run this gate again from where it stopped; '' outside a run. */
function resumeLine(): string {
  const runId = process.env.WORKFLOW_ID ?? '';
  return /^[0-9a-f][0-9a-f-]{7,63}$/i.test(runId)
    ? `\n\nResuming the run reruns this gate without redoing the work before it: archon workflow resume ${runId} --detach`
    : '';
}

export interface ImplementerVerdict {
  readonly done: boolean;
  readonly green: boolean;
  readonly summary: string;
  readonly check_commands: readonly string[];
}

/** What a review fixer or a merge resolver declares; they run targeted checks only. */
export interface AgentVerdict {
  readonly done: boolean;
  readonly green: boolean;
  readonly summary: string;
}

export interface GateResult {
  readonly passed: true;
  readonly commits: number;
}

export interface VerifyResult {
  readonly passed: true;
  readonly commits: number;
  readonly checks: number;
}

/** Nothing uncommitted, and at least one commit since `startSha`; returns the commit count. */
function committedSince(startSha: string): number {
  const dirty = exec(['git', 'status', '--porcelain']).stdout.trim();
  if (dirty !== '') {
    throw new Error(`Uncommitted changes were left behind; commit or remove them:\n${dirty}`);
  }
  if (tryGit('rev-parse', '--verify', '--quiet', `${startSha}^{commit}`) === undefined) {
    throw new Error(`The recorded start commit ${startSha} does not resolve.`);
  }
  const commits = Number(git('rev-list', '--count', `${startSha}..HEAD`));
  if (commits === 0) {
    throw new Error('Nothing was committed since this run started. The work must be committed to the branch.');
  }
  return commits;
}

/** After an implementer: green by its own account, checks declared, work committed. Runs no checks. */
export function gate(verdict: ImplementerVerdict, startSha: string, artifacts: string): GateResult {
  if (!verdict.green) {
    throw new Error(`The implementer did not reach green.\n${verdict.summary}`);
  }
  const commands = declaredCommands(verdict.check_commands);
  if (commands.length === 0) {
    throw new Error(
      'The implementer declared no project checks. It must report the type-check, lint and test commands it ran. ' +
        'A repo with no checks at all needs a guardrail first; lril-retro flags that.',
    );
  }
  const commits = committedSince(startSha);
  write(join(artifacts, 'checks', 'commands.json'), JSON.stringify(commands, null, 2));
  return { passed: true, commits };
}

/**
 * Once, on the final tree: re-run the recorded check commands. A merge resolver that
 * declined stops the run here. A review fixer's own verdict is advisory, because it runs
 * only targeted checks and these re-runs decide. Check commands that rewrite tracked
 * files (a build that regenerates committed output) do not fail the run: what they
 * changed is stashed, and the record and a note say so.
 */
export function verify(options: {
  readonly startSha: string;
  readonly artifacts: string;
  readonly fixer: AgentVerdict | null;
  readonly resolver: AgentVerdict | null;
}): VerifyResult {
  const { startSha, artifacts, fixer, resolver } = options;
  if (resolver !== null && !resolver.green) {
    throw new Error(`The merge with the base branch was not resolved.\n${resolver.summary}`);
  }
  if (fixer !== null && !fixer.green) {
    note(`The review fixer did not report green; the re-run checks decide.\n${fixer.summary}`);
  }
  const commits = committedSince(startSha);
  const commands = lastGreenCommands(artifacts);
  if (commands.length === 0) {
    throw new Error('No gate recorded the check commands it passed (checks/commands.json), so the branch cannot be verified.');
  }
  const results = runChecks(commands, artifacts, 'verify');
  const failed = results.filter(result => result.code !== 0);
  if (failed.length > 0) {
    throw new Error(
      `${failed.length} of ${results.length} check(s) failed when re-run or were not run:\n` +
        failed.map(result => `$ ${result.command} (${result.notRun ? 'not run' : `exit ${result.code}`})\n${result.tail}`).join('\n\n') +
        resumeLine(),
    );
  }
  for (const result of results.filter(r => r.flaky !== undefined)) {
    note(`Flaky: \`${result.command}\` failed (exit ${result.flaky!.code}), then passed when run again (up to ${ATTEMPTS} attempts). See checks/verify.md.`);
  }
  const changed = exec(['git', 'status', '--porcelain']).stdout.trim();
  if (changed !== '') {
    exec(['git', 'stash', 'push', '--include-untracked', '-m', 'lril verify: files the check commands changed']);
    const message = `The check commands changed files in the tree; they were stashed, not committed:\n${changed}`;
    appendFileSync(join(artifacts, 'checks', 'verify.md'), `\n## Files the checks changed\n\n\`\`\`text\n${message}\n\`\`\`\n`);
    note(message);
  }
  return { passed: true, commits, checks: results.length };
}
