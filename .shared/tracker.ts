/**
 * The repo's issue tracker, as `/setup-matt-pocock-skills` (or `lril-setup`)
 * configured it in `docs/agents/`.
 *
 * Matt Pocock's skills speak in canonical triage roles and "publish to the issue
 * tracker". This module is the one place the pack turns those into real writes,
 * for the two trackers it supports: GitHub (through `gh`) and local markdown under
 * `.scratch/`. Any other tracker refuses loudly instead of guessing.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exec, must } from './proc.ts';

export type TrackerKind = 'github' | 'local';

export const ROLES = ['needs-triage', 'needs-info', 'ready-for-agent', 'ready-for-human', 'wontfix'] as const;
export type Role = (typeof ROLES)[number];
export const CATEGORIES = ['bug', 'enhancement'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface TrackerConfig {
  readonly kind: TrackerKind;
  /** Canonical role → the label string this repo actually uses. */
  readonly labels: Readonly<Record<Role, string>>;
}

const SETUP_HINT =
  'Configure the repo first: run the lril-setup workflow (or /setup-matt-pocock-skills in Claude Code).';

export function readTrackerConfig(root = '.'): TrackerConfig {
  const trackerPath = join(root, 'docs', 'agents', 'issue-tracker.md');
  if (!existsSync(trackerPath)) {
    throw new Error(`docs/agents/issue-tracker.md is missing. ${SETUP_HINT}`);
  }
  const heading = readFileSync(trackerPath, 'utf8').match(/^#\s*Issue tracker:\s*(.+)$/im)?.[1]?.trim().toLowerCase() ?? '';
  let kind: TrackerKind;
  if (heading.includes('github')) kind = 'github';
  else if (heading.includes('local')) kind = 'local';
  else {
    throw new Error(
      `docs/agents/issue-tracker.md names the tracker "${heading || 'unknown'}". ` +
        'This pack automates GitHub and local markdown only; switch trackers with lril-setup.',
    );
  }
  return { kind, labels: readLabels(root) };
}

function readLabels(root: string): Record<Role, string> {
  const labels = Object.fromEntries(ROLES.map(role => [role, role])) as Record<Role, string>;
  const path = join(root, 'docs', 'agents', 'triage-labels.md');
  if (!existsSync(path)) return labels;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const cells = line.split('|').map(cell => cell.trim());
    const canonical = cells[1]?.replace(/`/g, '');
    const actual = cells[2]?.replace(/`/g, '');
    if (canonical && actual && (ROLES as readonly string[]).includes(canonical)) {
      labels[canonical as Role] = actual;
    }
  }
  return labels;
}

// --- GitHub ---------------------------------------------------------------------------

export interface GhIssue {
  readonly number: number;
  readonly id: number;
  readonly title: string;
  readonly body: string;
  readonly state: string;
  readonly url: string;
  readonly labels: readonly string[];
  readonly assignees: readonly string[];
}

let cachedRepo: string | undefined;

/** `owner/repo` of the current checkout, as gh resolves it. */
export function ghRepo(): string {
  cachedRepo ??= must(['gh', 'repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).trim();
  return cachedRepo;
}

function api(path: string, ...args: string[]): string {
  return must(['gh', 'api', ...args, `repos/${ghRepo()}/${path}`]);
}

interface RawIssue {
  number: number;
  id: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  labels: { name: string }[];
  assignees: { login: string }[] | null;
  pull_request?: unknown;
}

function toIssue(raw: RawIssue): GhIssue {
  return {
    number: raw.number,
    id: raw.id,
    title: raw.title,
    body: raw.body ?? '',
    state: raw.state,
    url: raw.html_url,
    labels: raw.labels.map(label => label.name),
    assignees: (raw.assignees ?? []).map(user => user.login),
  };
}

export function getIssue(number: number): GhIssue {
  return toIssue(JSON.parse(api(`issues/${number}`)) as RawIssue);
}

export function issueComments(number: number): { body: string; created_at: string; author: string }[] {
  const raw = JSON.parse(api(`issues/${number}/comments?per_page=100`)) as {
    body: string;
    created_at: string;
    user: { login: string };
  }[];
  return raw.map(comment => ({ body: comment.body, created_at: comment.created_at, author: comment.user.login }));
}

export function createIssue(title: string, body: string, labels: readonly string[]): GhIssue {
  const args = ['gh', 'api', '--method', 'POST', `repos/${ghRepo()}/issues`, '--input', '-'];
  const created = JSON.parse(must(args, { input: JSON.stringify({ title, body, labels }) })) as RawIssue;
  return toIssue(created);
}

export function editIssueBody(number: number, body: string): void {
  must(['gh', 'api', '--method', 'PATCH', `repos/${ghRepo()}/issues/${number}`, '--input', '-'], {
    input: JSON.stringify({ body }),
  });
}

export function comment(number: number, body: string): void {
  must(['gh', 'api', '--method', 'POST', `repos/${ghRepo()}/issues/${number}/comments`, '--input', '-'], {
    input: JSON.stringify({ body }),
  });
}

export function closeIssue(number: number, reason: 'completed' | 'not_planned'): void {
  must(['gh', 'api', '--method', 'PATCH', `repos/${ghRepo()}/issues/${number}`, '--input', '-'], {
    input: JSON.stringify({ state: 'closed', state_reason: reason }),
  });
}

export function setLabels(number: number, labels: readonly string[]): void {
  must(['gh', 'api', '--method', 'PUT', `repos/${ghRepo()}/issues/${number}/labels`, '--input', '-'], {
    input: JSON.stringify({ labels }),
  });
}

export function assignSelf(number: number): void {
  const me = must(['gh', 'api', 'user', '--jq', '.login']).trim();
  must(['gh', 'api', '--method', 'POST', `repos/${ghRepo()}/issues/${number}/assignees`, '--input', '-'], {
    input: JSON.stringify({ assignees: [me] }),
  });
}

/** Link `child` under `parent` as a native sub-issue. Returns false when the repo lacks sub-issues. */
export function addSubIssue(parent: number, child: GhIssue): boolean {
  const result = exec(['gh', 'api', '--method', 'POST', `repos/${ghRepo()}/issues/${parent}/sub_issues`, '-F', `sub_issue_id=${child.id}`]);
  return result.code === 0;
}

export function subIssues(parent: number): GhIssue[] {
  const result = exec(['gh', 'api', '--paginate', `repos/${ghRepo()}/issues/${parent}/sub_issues?per_page=100`]);
  if (result.code !== 0) return [];
  return (JSON.parse(result.stdout) as RawIssue[]).map(toIssue);
}

/** The parent of a sub-issue, or undefined when it has none (or the API is unavailable). */
export function parentIssue(child: number): GhIssue | undefined {
  const result = exec(['gh', 'api', `repos/${ghRepo()}/issues/${child}/parent`]);
  if (result.code !== 0) return undefined;
  return toIssue(JSON.parse(result.stdout) as RawIssue);
}

/** Add a native "blocked by" edge. Returns false when the repo lacks issue dependencies. */
export function addBlockedBy(child: number, blocker: GhIssue): boolean {
  const result = exec([
    'gh', 'api', '--method', 'POST',
    `repos/${ghRepo()}/issues/${child}/dependencies/blocked_by`,
    '-F', `issue_id=${blocker.id}`,
  ]);
  return result.code === 0;
}

/** Issue numbers blocking `child`: native edges first, then a `Blocked by` body line. */
export function blockedBy(child: GhIssue): number[] {
  const result = exec(['gh', 'api', `repos/${ghRepo()}/issues/${child.number}/dependencies/blocked_by`]);
  const native = result.code === 0 ? (JSON.parse(result.stdout) as RawIssue[]).map(issue => issue.number) : [];
  const section = child.body.match(/##\s*Blocked by\s*\n([\s\S]*?)(?:\n##\s|$)/i)?.[1] ?? '';
  const line = child.body.match(/^\**Blocked by:?\**:?\s*(.+)$/im)?.[1] ?? '';
  const written = [...`${section}\n${line}`.matchAll(/#(\d+)/g)].map(match => Number(match[1]));
  return [...new Set([...native, ...written])];
}

/** Parse `#12`, `12`, or an issue URL of this repo into a number. */
export function issueNumber(ref: string): number | undefined {
  const match = ref.trim().match(/^(?:#)?(\d+)$/) ?? ref.trim().match(/\/issues\/(\d+)(?:[/#?].*)?$/);
  return match?.[1] === undefined ? undefined : Number(match[1]);
}
