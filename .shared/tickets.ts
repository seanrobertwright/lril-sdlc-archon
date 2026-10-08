/**
 * Tickets as a task graph: tracer-bullet slices, each declaring the tickets that
 * block it (Matt Pocock's `/to-tickets`). The **frontier** is every open ticket whose
 * blockers are all done.
 */

export interface DraftTicket {
  readonly key: string;
  readonly title: string;
  readonly what_to_build: string;
  readonly acceptance: readonly string[];
  readonly blocked_by: readonly string[];
}

export interface DraftTickets {
  readonly feature: { readonly title: string; readonly slug: string };
  readonly tickets: readonly DraftTicket[];
}

export interface GraphTicket {
  readonly key: string;
  /** `#12` on GitHub, a file path locally. */
  readonly ref: string;
  readonly title: string;
  readonly blocked_by: readonly string[];
  readonly done: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

/** Every problem with a drafted breakdown, so one refusal names them all. */
export function draftProblems(value: unknown): string[] {
  const problems: string[] = [];
  if (!isRecord(value)) return ['tickets.json is not an object'];
  const feature = value.feature;
  if (!isRecord(feature) || typeof feature.title !== 'string' || feature.title.trim() === '') {
    problems.push('feature.title is missing');
  }
  if (!isRecord(feature) || typeof feature.slug !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(feature.slug)) {
    problems.push('feature.slug must be kebab-case');
  }
  if (!Array.isArray(value.tickets) || value.tickets.length === 0) {
    problems.push('tickets must be a non-empty array');
    return problems;
  }
  const keys = new Set<string>();
  for (const [index, ticket] of value.tickets.entries()) {
    const at = `tickets[${index}]`;
    if (!isRecord(ticket)) {
      problems.push(`${at} is not an object`);
      continue;
    }
    if (typeof ticket.key !== 'string' || ticket.key.trim() === '') problems.push(`${at}.key is missing`);
    else if (keys.has(ticket.key)) problems.push(`${at}.key "${ticket.key}" is duplicated`);
    else keys.add(ticket.key);
    if (typeof ticket.title !== 'string' || ticket.title.trim() === '') problems.push(`${at}.title is missing`);
    if (typeof ticket.what_to_build !== 'string' || ticket.what_to_build.trim() === '') {
      problems.push(`${at}.what_to_build is missing`);
    }
    if (!strings(ticket.acceptance) || ticket.acceptance.length === 0) {
      problems.push(`${at}.acceptance needs at least one criterion`);
    }
    if (!strings(ticket.blocked_by)) problems.push(`${at}.blocked_by must be an array of keys`);
  }
  if (problems.length > 0) return problems;
  const tickets = value.tickets as DraftTicket[];
  for (const ticket of tickets) {
    for (const blocker of ticket.blocked_by) {
      if (!keys.has(blocker)) problems.push(`"${ticket.key}" is blocked by unknown ticket "${blocker}"`);
      if (blocker === ticket.key) problems.push(`"${ticket.key}" blocks itself`);
    }
  }
  if (problems.length === 0 && topoOrder(tickets) === undefined) {
    problems.push('the blocking edges form a cycle');
  }
  return problems;
}

/** Blockers first; `undefined` when the edges cycle. */
export function topoOrder<T extends { key: string; blocked_by: readonly string[] }>(tickets: readonly T[]): T[] | undefined {
  const byKey = new Map(tickets.map(ticket => [ticket.key, ticket]));
  const ordered: T[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (ticket: T): boolean => {
    const seen = state.get(ticket.key);
    if (seen === 'done') return true;
    if (seen === 'visiting') return false;
    state.set(ticket.key, 'visiting');
    for (const blocker of ticket.blocked_by) {
      const next = byKey.get(blocker);
      if (next !== undefined && !visit(next)) return false;
    }
    state.set(ticket.key, 'done');
    ordered.push(ticket);
    return true;
  };
  for (const ticket of tickets) if (!visit(ticket)) return undefined;
  return ordered;
}

/** Open tickets whose blockers are all done, in graph order. */
export function frontier(tickets: readonly GraphTicket[], done: ReadonlySet<string>): GraphTicket[] {
  return tickets.filter(ticket => !done.has(ticket.key) && ticket.blocked_by.every(blocker => done.has(blocker)));
}
