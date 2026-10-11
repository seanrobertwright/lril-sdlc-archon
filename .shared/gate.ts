/**
 * The green gate after an implementer: its own verdict, the project checks it
 * declared (re-run here), and proof that the work is committed and nothing is left
 * behind. An AI node that declines still exits 0, so run status is never the verdict.
 */
import { declaredCommands, runChecks } from './checks.ts';
import { exec, git, tryGit } from './proc.ts';

export interface ImplementerVerdict {
  readonly done: boolean;
  readonly green: boolean;
  readonly summary: string;
  readonly check_commands: readonly string[];
}

export interface GateResult {
  readonly passed: true;
  readonly commits: number;
  readonly checks: number;
}

export function gate(verdict: ImplementerVerdict, startSha: string, artifacts: string, label: string): GateResult {
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
  const results = runChecks(commands, artifacts, label);
  const failed = results.filter(result => result.code !== 0);
  if (failed.length > 0) {
    throw new Error(
      `${failed.length} of ${results.length} declared check(s) failed when re-run or were not run:\n` +
        failed.map(result => `$ ${result.command} (${result.notRun ? 'not run' : `exit ${result.code}`})\n${result.tail}`).join('\n\n'),
    );
  }
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
  return { passed: true, commits, checks: results.length };
}
