/**
 * Load a spec's ticket graph from the configured tracker, and keep this run's own
 * record of which tickets are done (`state/state.json` in the artifacts), so a
 * resumed run continues at the ticket it stopped on.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { featureDirOf, listTickets, SCRATCH, write } from './local.ts';
import { must } from './proc.ts';
import type { GraphTicket } from './tickets.ts';
import { topoOrder } from './tickets.ts';
import { blockedBy, getIssue, issueComments, issueNumber, readTrackerConfig, subIssues, type TrackerKind } from './tracker.ts';

export interface Graph {
  readonly tracker: TrackerKind;
  readonly spec: { readonly ref: string; readonly number: number; readonly title: string; readonly dir: string };
  readonly tickets: readonly GraphTicket[];
}

const DONE_STATUSES = /^(done|resolved|closed|completed)$/i;

function localSpecDir(ref: string): string {
  if (existsSync(ref) && statSync(ref).isDirectory()) return ref;
  if (existsSync(ref)) return featureDirOf(ref);
  const bySlug = join(SCRATCH, ref);
  if (existsSync(bySlug)) return bySlug;
  const features = existsSync(SCRATCH) ? readdirSync(SCRATCH).filter(name => existsSync(join(SCRATCH, name, 'spec.md'))) : [];
  throw new Error(
    `Spec "${ref}" not found. Pass a .scratch/<feature>/spec.md path or feature slug` +
      (features.length > 0 ? ` (found: ${features.join(', ')}).` : '.'),
  );
}

function githubChildren(spec: number): number[] {
  const native = subIssues(spec).map(issue => issue.number);
  if (native.length > 0) return native;
  const listed = JSON.parse(
    must(['gh', 'issue', 'list', '--state', 'all', '--limit', '300', '--json', 'number,body']),
  ) as { number: number; body: string }[];
  return listed
    .filter(issue => new RegExp(`##\\s*Parent[\\s\\S]*?#${spec}\\b|^Part of #${spec}\\b`, 'im').test(issue.body))
    .map(issue => issue.number);
}

export function loadGraph(ref: string): Graph {
  if (ref === '') throw new Error('No spec given: pass the spec issue number or its .scratch/<feature>/spec.md path.');
  const tracker = readTrackerConfig().kind;
  let graph: Graph;
  if (tracker === 'github') {
    const number = issueNumber(ref);
    if (number === undefined) throw new Error(`"${ref}" is not a GitHub issue reference.`);
    const spec = getIssue(number);
    const children = githubChildren(number).map(getIssue);
    if (children.length === 0) throw new Error(`Spec #${number} has no tickets. Run lril-idea-to-tickets (or /to-tickets) first.`);
    const keys = new Set(children.map(child => `#${child.number}`));
    const tickets = children.map(child => ({
      key: `#${child.number}`,
      ref: `#${child.number}`,
      title: child.title,
      blocked_by: blockedBy(child).map(n => `#${n}`).filter(key => keys.has(key)),
      done: child.state === 'closed',
    }));
    graph = { tracker, spec: { ref: `#${number}`, number, title: spec.title, dir: '' }, tickets };
  } else {
    const dir = localSpecDir(ref);
    const specFile = join(dir, 'spec.md');
    const title = existsSync(specFile) ? (readFileSync(specFile, 'utf8').match(/^#\s+(.+)$/m)?.[1] ?? dir) : dir;
    const local = listTickets(dir);
    if (local.length === 0) throw new Error(`${dir} has no tickets under issues/. Run lril-idea-to-tickets (or /to-tickets) first.`);
    const tickets = local.map(ticket => ({
      key: ticket.number,
      ref: ticket.path.replace(/\\/g, '/'),
      title: ticket.title,
      blocked_by: [...ticket.blockedBy],
      done: DONE_STATUSES.test(ticket.status),
    }));
    graph = { tracker, spec: { ref: specFile.replace(/\\/g, '/'), number: 0, title, dir: dir.replace(/\\/g, '/') }, tickets };
  }
  const ordered = topoOrder(graph.tickets);
  if (ordered === undefined) throw new Error('The tickets\' blocking edges form a cycle; fix them on the tracker first.');
  return { ...graph, tickets: ordered };
}

/** The full text of a ticket, for the implementer working it. */
export function ticketText(graph: Graph, ticket: GraphTicket): string {
  if (graph.tracker === 'local') return readFileSync(ticket.ref, 'utf8');
  const number = Number(ticket.key.slice(1));
  const issue = getIssue(number);
  const comments = issueComments(number).map(entry => `### Comment by ${entry.author}\n\n${entry.body}`).join('\n\n');
  return `# ${ticket.key}: ${issue.title}\n\n${issue.body}\n\n${comments}`.trim();
}

export function specText(graph: Graph): string {
  if (graph.tracker === 'local') return existsSync(graph.spec.ref) ? readFileSync(graph.spec.ref, 'utf8') : `# ${graph.spec.title}`;
  const issue = getIssue(graph.spec.number);
  return `# #${issue.number}: ${issue.title}\n\n${issue.body}`;
}

// --- Run state -------------------------------------------------------------------------

export interface RunState {
  readonly done: string[];
}

export function statePaths(artifacts: string): { graph: string; state: string } {
  return {
    graph: join(artifacts, 'state', 'graph.json'),
    state: join(artifacts, 'state', 'state.json'),
  };
}

export function readGraph(artifacts: string): Graph {
  return JSON.parse(readFileSync(statePaths(artifacts).graph, 'utf8')) as Graph;
}

export function readState(artifacts: string): RunState {
  const path = statePaths(artifacts).state;
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as RunState) : { done: [] };
}

export function writeState(artifacts: string, state: RunState): void {
  write(statePaths(artifacts).state, JSON.stringify(state, null, 2));
}
