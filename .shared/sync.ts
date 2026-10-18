/**
 * Bring the branch up to date with its base before the pull request is written, so the PR
 * opens against the base it will merge into, not the one the run started from. Runs left
 * going for hours otherwise open PRs that conflict with whatever merged meanwhile.
 *
 * It merges and never rebases: the branch may already be pushed. A clean merge re-runs the
 * checks the last green gate ran. A conflicted merge is left in progress for the resolver
 * node, which commits it, and the gate after that re-runs the checks.
 */
import { gate, lastGreenCommands } from './gate.ts';
import { note } from './io.ts';
import { exec, git, must, tryGit } from './proc.ts';

export interface SyncResult {
  /** The merge stopped on conflicts and is still in progress. */
  readonly conflicted: boolean;
  /** The conflicted paths; empty unless `conflicted`. */
  readonly files: readonly string[];
  /** How many base commits the branch lacked; 0 when it was up to date or no base is known. */
  readonly behind: number;
  /** How many check commands were re-run after a clean merge; 0 when nothing was merged or it conflicted. */
  readonly checks: number;
  /** What the pull request's diff is taken against: `origin/<base>`, or the run's start when no base is known. */
  readonly diff_base: string;
}

/** The base branch: Archon's `BASE_BRANCH`, else the remote's default branch; '' when neither is known. */
function baseBranch(configured: string): string {
  if (configured !== '') return configured;
  const head = tryGit('symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD');
  return head?.startsWith('origin/') ? head.slice('origin/'.length) : '';
}

export function syncBase(configured: string, startSha: string, artifacts: string): SyncResult {
  const base = baseBranch(configured);
  if (base === '') {
    note('No base branch is known (no BASE_BRANCH and no origin/HEAD), so the branch was not brought up to date before the pull request.');
    return { conflicted: false, files: [], behind: 0, checks: 0, diff_base: startSha };
  }
  if (tryGit('check-ref-format', '--branch', base) === undefined) {
    throw new Error(`The base branch name is not a valid branch name: ${JSON.stringify(base)}`);
  }
  const ref = `origin/${base}`;
  must(['git', 'fetch', '--quiet', 'origin', `+refs/heads/${base}:refs/remotes/${ref}`]);
  const behind = Number(git('rev-list', '--count', `HEAD..${ref}`));
  if (behind === 0) return { conflicted: false, files: [], behind: 0, checks: 0, diff_base: ref };

  const merge = exec(['git', 'merge', '--no-edit', ref]);
  if (merge.code !== 0) {
    if (tryGit('rev-parse', '--quiet', '--verify', 'MERGE_HEAD') === undefined) {
      throw new Error(`git merge ${ref} stopped before merging anything (exit ${merge.code}):\n${(merge.stderr || merge.stdout).trim()}`);
    }
    const files = git('diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
    if (files.length > 0) return { conflicted: true, files, behind, checks: 0, diff_base: ref };
    // Every conflict was settled by a resolution Git recorded earlier (rerere); finish the merge.
    must(['git', 'commit', '--no-edit']);
  }

  const commands = lastGreenCommands(artifacts);
  if (commands.length === 0) {
    throw new Error('No gate recorded the check commands it ran (checks/commands.json), so the merged branch cannot be re-checked.');
  }
  const { checks } = gate({ done: true, green: true, summary: `Merged ${ref}.`, check_commands: commands }, startSha, artifacts, 'after-sync');
  return { conflicted: false, files: [], behind, checks, diff_base: ref };
}
