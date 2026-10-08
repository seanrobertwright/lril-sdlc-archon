/**
 * Matt Pocock's /wayfinder map on the configured tracker.
 *
 * The **map** is one issue (`wayfinder:map`) or `.scratch/<effort>/map.md`, an index
 * with five sections: Destination, Notes, Decisions so far, Not yet specified, Out
 * of scope. Its **decision tickets** are child issues (or `issues/NN-*.md` files),
 * each a question labelled `wayfinder:<type>`. Blocking uses the tracker's native
 * dependencies where it has them. The **frontier** is every open, unblocked,
 * unclaimed ticket.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appendComment, listTickets, pad, SCRATCH, setField, slugify, write } from './local.ts';
import {
  addBlockedBy,
  addSubIssue,
  blockedBy,
  assignSelf,
  closeIssue,
  comment,
  createIssue,
  editIssueBody,
  getIssue,
  issueNumber,
  subIssues,
  type GhIssue,
  type TrackerKind,
} from './tracker.ts';
import { topoOrder } from './tickets.ts';

export const TYPES = ['research', 'prototype', 'grilling', 'task'] as const;
export type TicketType = (typeof TYPES)[number];
const SECTIONS = ['Destination', 'Notes', 'Decisions so far', 'Not yet specified', 'Out of scope'] as const;
type Section = (typeof SECTIONS)[number];

export interface DraftDecision {
  readonly key: string;
  readonly title: string;
  readonly type: TicketType;
  readonly question: string;
  /** Keys of other draft tickets, or refs (`#12`, `03`) of tickets already on the map. */
  readonly blocked_by: readonly string[];
}

export interface DraftMap {
  readonly title: string;
  readonly slug: string;
  readonly destination: string;
  readonly notes: string;
  readonly not_yet_specified: string;
  readonly out_of_scope: readonly string[];
  readonly tickets: readonly DraftDecision[];
}

export interface MapTicket {
  readonly ref: string;
  readonly title: string;
  readonly type: string;
  readonly open: boolean;
  readonly claimed: boolean;
  readonly blockedBy: readonly string[];
  readonly link: string;
}

// --- Validation -----------------------------------------------------------------------

export function decisionProblems(tickets: unknown, known: ReadonlySet<string> = new Set()): string[] {
  if (!Array.isArray(tickets)) return ['tickets must be an array'];
  const problems: string[] = [];
  const keys = new Set<string>();
  for (const [index, raw] of tickets.entries()) {
    const at = `tickets[${index}]`;
    const ticket = raw as Record<string, unknown>;
    if (typeof ticket !== 'object' || ticket === null) {
      problems.push(`${at} is not an object`);
      continue;
    }
    if (typeof ticket.key !== 'string' || ticket.key === '' || keys.has(ticket.key)) problems.push(`${at}.key is missing or duplicated`);
    else keys.add(ticket.key);
    if (typeof ticket.title !== 'string' || ticket.title.trim() === '') problems.push(`${at}.title is missing`);
    if (!(TYPES as readonly unknown[]).includes(ticket.type)) problems.push(`${at}.type must be one of ${TYPES.join(', ')}`);
    if (typeof ticket.question !== 'string' || ticket.question.trim() === '') problems.push(`${at}.question is missing`);
    if (!Array.isArray(ticket.blocked_by)) problems.push(`${at}.blocked_by must be an array`);
  }
  if (problems.length > 0) return problems;
  const drafts = tickets as DraftDecision[];
  for (const ticket of drafts) {
    for (const blocker of ticket.blocked_by) {
      if (!keys.has(blocker) && !known.has(blocker)) problems.push(`"${ticket.key}" is blocked by unknown "${blocker}"`);
    }
  }
  const internal = drafts.map(ticket => ({ key: ticket.key, blocked_by: ticket.blocked_by.filter(b => keys.has(b)) }));
  if (problems.length === 0 && topoOrder(internal) === undefined) problems.push('the blocking edges form a cycle');
  return problems;
}

export function mapProblems(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) return ['map.json is not an object'];
  const map = value as Record<string, unknown>;
  const problems: string[] = [];
  for (const key of ['title', 'destination', 'notes'] as const) {
    if (typeof map[key] !== 'string' || (map[key] as string).trim() === '') problems.push(`${key} is missing`);
  }
  if (typeof map.slug !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(map.slug)) problems.push('slug must be kebab-case');
  if (typeof map.not_yet_specified !== 'string') problems.push('not_yet_specified must be a string');
  if (!Array.isArray(map.out_of_scope)) problems.push('out_of_scope must be an array of lines');
  if (!Array.isArray(map.tickets) || map.tickets.length === 0) problems.push('a map needs at least one ticket');
  else problems.push(...decisionProblems(map.tickets));
  return problems;
}

// --- Map body -------------------------------------------------------------------------

export function renderMap(map: DraftMap): string {
  const body: Record<Section, string> = {
    Destination: map.destination.trim(),
    Notes: map.notes.trim(),
    'Decisions so far': '<!-- the index: one line per closed ticket, then zoom the link for the detail -->',
    'Not yet specified': map.not_yet_specified.trim() || '_Nothing yet._',
    'Out of scope': map.out_of_scope.length === 0 ? '_Nothing yet._' : map.out_of_scope.map(line => `- ${line}`).join('\n'),
  };
  return SECTIONS.map(section => `## ${section}\n\n${body[section]}`).join('\n\n');
}

function sectionRange(body: string, section: Section): [number, number] | undefined {
  const heading = new RegExp(`^##\\s+${section}\\s*$`, 'im').exec(body);
  if (heading === null) return undefined;
  const start = heading.index + heading[0].length;
  const next = body.slice(start).search(/^##\s/m);
  return [start, next === -1 ? body.length : start + next];
}

export function replaceSection(body: string, section: Section, content: string): string {
  const range = sectionRange(body, section);
  if (range === undefined) return `${body.trimEnd()}\n\n## ${section}\n\n${content.trim()}\n`;
  return `${body.slice(0, range[0])}\n\n${content.trim()}\n\n${body.slice(range[1])}`.replace(/\n{3,}/g, '\n\n');
}

export function appendToSection(body: string, section: Section, line: string): string {
  const range = sectionRange(body, section);
  const current = range === undefined ? '' : body.slice(range[0], range[1]).trim();
  const kept = current === '_Nothing yet._' ? '' : current;
  return replaceSection(body, section, `${kept}\n${line}`.trim());
}

// --- The tracker ----------------------------------------------------------------------

export interface MapRef {
  readonly tracker: TrackerKind;
  /** `#12`, or the map.md path. */
  readonly ref: string;
  readonly dir: string;
}

export function resolveMap(tracker: TrackerKind, ref: string): MapRef {
  if (tracker === 'github') {
    const number = issueNumber(ref);
    if (number === undefined) throw new Error(`"${ref}" is not a map issue reference.`);
    const issue = getIssue(number);
    if (!issue.labels.includes('wayfinder:map')) throw new Error(`#${number} is not labelled wayfinder:map.`);
    return { tracker, ref: `#${number}`, dir: '' };
  }
  const candidates = [ref, join(ref, 'map.md'), join(SCRATCH, ref, 'map.md')];
  const path = candidates.find(candidate => candidate.endsWith('map.md') && existsSync(candidate));
  if (path === undefined) throw new Error(`No map.md found for "${ref}".`);
  return { tracker, ref: path.replace(/\\/g, '/'), dir: join(path, '..').replace(/\\/g, '/') };
}

export function mapBody(map: MapRef): string {
  if (map.tracker === 'github') return getIssue(Number(map.ref.slice(1))).body;
  return readFileSync(map.ref, 'utf8');
}

export function setMapBody(map: MapRef, body: string): void {
  if (map.tracker === 'github') editIssueBody(Number(map.ref.slice(1)), body);
  else write(map.ref, body);
}

function githubChildren(mapNumber: number, body: string): GhIssue[] {
  const native = subIssues(mapNumber);
  if (native.length > 0) return native;
  const listed = [...body.matchAll(/^\s*- \[[ x]\] #(\d+)/gim)].map(match => Number(match[1]));
  return listed.map(getIssue);
}

export function mapTickets(map: MapRef): MapTicket[] {
  if (map.tracker === 'github') {
    const children = githubChildren(Number(map.ref.slice(1)), mapBody(map));
    const open = new Set(children.filter(child => child.state === 'open').map(child => `#${child.number}`));
    return children.map(child => ({
      ref: `#${child.number}`,
      title: child.title,
      type: child.labels.find(label => label.startsWith('wayfinder:'))?.slice('wayfinder:'.length) ?? '',
      open: child.state === 'open',
      claimed: child.assignees.length > 0,
      blockedBy: blockedBy(child)
        .map(number => `#${number}`)
        .filter(ref => open.has(ref)),
      link: child.url,
    }));
  }
  const tickets = listTickets(map.dir);
  const resolved = new Set(tickets.filter(t => /^(resolved|closed|out-of-scope)$/i.test(t.status)).map(t => t.number));
  return tickets.map(ticket => ({
    ref: ticket.number,
    title: ticket.title,
    type: ticket.type,
    open: !resolved.has(ticket.number),
    claimed: /^claimed$/i.test(ticket.status),
    blockedBy: ticket.blockedBy.filter(number => !resolved.has(number)),
    link: ticket.path.replace(/\\/g, '/').replace(`${map.dir}/`, ''),
  }));
}

/** Open, unblocked, unclaimed tickets, in map order. */
export function mapFrontier(tickets: readonly MapTicket[]): MapTicket[] {
  return tickets.filter(ticket => ticket.open && !ticket.claimed && ticket.blockedBy.length === 0);
}

export function ticketBody(map: MapRef, ticket: MapTicket): string {
  if (map.tracker === 'github') {
    const issue = getIssue(Number(ticket.ref.slice(1)));
    return `# ${ticket.ref}: ${issue.title}\n\nType: ${ticket.type}\n\n${issue.body}`;
  }
  return readFileSync(join(map.dir, ticket.link), 'utf8');
}

export function claim(map: MapRef, ticket: MapTicket): void {
  if (map.tracker === 'github') {
    const number = Number(ticket.ref.slice(1));
    assignSelf(number);
    if (getIssue(number).assignees.length === 0) throw new Error(`The claim on ${ticket.ref} did not read back.`);
    return;
  }
  const path = join(map.dir, ticket.link);
  write(path, setField(readFileSync(path, 'utf8'), 'Status', 'claimed'));
}

/** Create tickets blockers-first, then wire edges in a second pass. Returns key → ref. */
export function createDecisions(map: MapRef, drafts: readonly DraftDecision[]): Map<string, string> {
  const created = new Map<string, string>();
  const ordered = topoOrder(drafts.map(d => ({ ...d, blocked_by: d.blocked_by.filter(b => drafts.some(o => o.key === b)) }))) ?? [];
  if (map.tracker === 'github') {
    const mapNumber = Number(map.ref.slice(1));
    const issues = new Map<string, GhIssue>();
    const unlinked: string[] = [];
    for (const draft of ordered) {
      const original = drafts.find(d => d.key === draft.key) ?? draft;
      const issue = createIssue(original.title, `## Question\n\n${original.question}`, [`wayfinder:${original.type}`]);
      issues.set(original.key, issue);
      created.set(original.key, `#${issue.number}`);
      if (!addSubIssue(mapNumber, issue)) unlinked.push(`- [ ] #${issue.number}`);
    }
    if (unlinked.length > 0) setMapBody(map, `${mapBody(map).trimEnd()}\n\n${unlinked.join('\n')}\n`);
    for (const draft of drafts) {
      const child = issues.get(draft.key);
      if (child === undefined) continue;
      const fallback: string[] = [];
      for (const blocker of draft.blocked_by) {
        const ref = created.get(blocker) ?? blocker;
        const number = issueNumber(ref);
        if (number === undefined) continue;
        if (!addBlockedBy(child.number, getIssue(number))) fallback.push(`#${number}`);
      }
      if (fallback.length > 0 || unlinked.length > 0) {
        const parts = [unlinked.length > 0 ? `Part of ${map.ref}` : '', fallback.length > 0 ? `Blocked by: ${fallback.join(', ')}` : '']
          .filter(Boolean)
          .join('\n');
        editIssueBody(child.number, `${parts}\n\n## Question\n\n${draft.question}`);
      }
    }
    return created;
  }
  const existing = listTickets(map.dir);
  let next = existing.reduce((max, t) => Math.max(max, Number(t.number) || 0), 0) + 1;
  const numbers = new Map<string, string>();
  for (const draft of ordered) numbers.set(draft.key, pad(next++));
  for (const draft of ordered) {
    const original = drafts.find(d => d.key === draft.key) ?? draft;
    const number = numbers.get(original.key) ?? '';
    const blockers = original.blocked_by.map(b => numbers.get(b) ?? b.replace(/^#/, '')).filter(Boolean);
    const path = join(map.dir, 'issues', `${number}-${slugify(original.title)}.md`);
    write(
      path,
      `# ${number}: ${original.title}\n\nType: ${original.type}\nStatus: open\n` +
        `${blockers.length > 0 ? `Blocked by: ${blockers.join(', ')}\n` : ''}\n## Question\n\n${original.question}\n`,
    );
    created.set(original.key, number);
  }
  return created;
}

/** Record a resolution on its ticket, close it, and index it in Decisions so far. */
export function resolveTicket(map: MapRef, ticket: MapTicket, answer: string, gist: string): void {
  if (map.tracker === 'github') {
    const number = Number(ticket.ref.slice(1));
    comment(number, answer);
    closeIssue(number, 'completed');
    if (getIssue(number).state !== 'closed') throw new Error(`${ticket.ref} did not read back closed.`);
  } else {
    const path = join(map.dir, ticket.link);
    write(path, `${setField(readFileSync(path, 'utf8'), 'Status', 'resolved').trimEnd()}\n\n## Answer\n\n${answer.trim()}\n`);
  }
  setMapBody(map, appendToSection(mapBody(map), 'Decisions so far', `- [${ticket.title}](${ticket.link}): ${gist}`));
}

/** Close a ticket off the route: out of scope, or invalidated by a decision. */
export function closeOffRoute(map: MapRef, ticket: MapTicket, reason: string, outOfScopeLine: string | undefined): void {
  if (map.tracker === 'github') {
    const number = Number(ticket.ref.slice(1));
    comment(number, reason);
    closeIssue(number, 'not_planned');
  } else {
    const path = join(map.dir, ticket.link);
    write(path, setField(readFileSync(path, 'utf8'), 'Status', outOfScopeLine === undefined ? 'closed' : 'out-of-scope'));
    appendComment(path, reason);
  }
  if (outOfScopeLine !== undefined) {
    setMapBody(map, appendToSection(mapBody(map), 'Out of scope', `- [${ticket.title}](${ticket.link}): ${outOfScopeLine}`));
  }
}

export function localMapPath(slug: string): string {
  return join(SCRATCH, slug, 'map.md');
}

