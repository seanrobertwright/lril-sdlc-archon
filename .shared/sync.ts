/**
 * Bring the branch up to date with its base before the pull request is written, so the PR
 * opens against the base it will merge into, not the one the run started from. Runs left
 * going for hours otherwise open PRs that conflict with whatever merged meanwhile.
 *
 * It merges and never rebases: the branch may already be pushed. It runs no checks: the
 * `verify` gate after it re-runs them once on the merged tree. A conflicted merge is left in
 * progress for the resolver node, which commits it.
 */
import { note } from './io.ts';
import { exec, git, must, tryGit } from './proc.ts';

export interface SyncResult {
  /** The merge stopped on conflicts and is still in progress. */
  readonly conflicted: boolean;
  /** The conflicted paths; empty unless `conflicted`. */
  readonly files: readonly string[];
  /** How many base commits the branch lacked; 0 when it was up to date or no base is known. */
  readonly behind: number;
  /** The branch the pull request targets; '' when no base is known. */
  readonly base: string;
  /** What the pull request's diff is taken against: `origin/<base>`, or the run's start when no base is known. */
  readonly diff_base: string;
}

/** Origin's default branch, asked of origin, else the local `origin/HEAD`; '' when neither answers. */
function remoteDefault(): string {
  const listed = exec(['git', 'ls-remote', '--symref', 'origin', 'HEAD']);
  const match = listed.code === 0 ? /^ref: refs\/heads\/(\S+)\s+HEAD$/m.exec(listed.stdout) : null;
  if (match?.[1] !== undefined) return match[1];
  const head = tryGit('symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD');
  return head?.startsWith('origin/') ? head.slice('origin/'.length) : '';
}

/** Whether origin has `base` as a branch. */
function onOrigin(base: string): boolean {
  const result = exec(['git', 'ls-remote', '--exit-code', '--heads', 'origin', `refs/heads/${base}`]);
  if (result.code === 0) return true;
  // ls-remote --exit-code exits 2 when the ref is absent; anything else is a fault.
  if (result.code === 2) return false;
  throw new Error(`git ls-remote origin failed (exit ${result.code}): ${result.stderr.trim()}`);
}

/**
 * The base branch: Archon's `BASE_BRANCH` when origin has it, else origin's default
 * branch. A configured base that was never pushed would otherwise fail the fetch here and
 * the pull request after it.
 */
function baseBranch(configured: string): string {
  if (configured === '') return remoteDefault();
  if (tryGit('check-ref-format', '--branch', configured) === undefined) {
    throw new Error(`The base branch name is not a valid branch name: ${JSON.stringify(configured)}`);
  }
  if (onOrigin(configured)) return configured;
  const fallback = remoteDefault();
  note(
    `The base branch ${configured} is not on origin, so the branch is brought up to date with ` +
      (fallback === '' ? 'nothing, and the pull request targets the repository default.' : `origin's default branch, ${fallback}, and the pull request targets it.`),
  );
  return fallback;
}

export function syncBase(configured: string, startSha: string): SyncResult {
  const base = baseBranch(configured);
  if (base === '') {
    note('No base branch is known (no BASE_BRANCH on origin and no origin default), so the branch was not brought up to date before the pull request.');
    return { conflicted: false, files: [], behind: 0, base: '', diff_base: startSha };
  }
  if (tryGit('check-ref-format', '--branch', base) === undefined) {
    throw new Error(`The base branch name is not a valid branch name: ${JSON.stringify(base)}`);
  }
  const ref = `origin/${base}`;
  must(['git', 'fetch', '--quiet', 'origin', `+refs/heads/${base}:refs/remotes/${ref}`]);
  const behind = Number(git('rev-list', '--count', `HEAD..${ref}`));
  if (behind === 0) return { conflicted: false, files: [], behind: 0, base, diff_base: ref };

  const merge = exec(['git', 'merge', '--no-edit', ref]);
  if (merge.code !== 0) {
    if (tryGit('rev-parse', '--quiet', '--verify', 'MERGE_HEAD') === undefined) {
      throw new Error(`git merge ${ref} stopped before merging anything (exit ${merge.code}):\n${(merge.stderr || merge.stdout).trim()}`);
    }
    const files = git('diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
    if (files.length > 0) return { conflicted: true, files, behind, base, diff_base: ref };
    // Every conflict was settled by a resolution Git recorded earlier (rerere); finish the merge.
    must(['git', 'commit', '--no-edit']);
  }
  return { conflicted: false, files: [], behind, base, diff_base: ref };
}
