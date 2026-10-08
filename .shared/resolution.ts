/**
 * A resolved wayfinder ticket, as the resolving session writes it to
 * `wayfinder/resolution.json`: the answer, its one-line gist for the map's index,
 * and whatever the answer changed on the map.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decisionProblems, type DraftDecision } from './wayfinder.ts';

export interface Resolution {
  readonly answer: string;
  readonly gist: string;
  readonly new_tickets: readonly DraftDecision[];
  /** Replacement text for Not yet specified, or null to leave it unchanged. */
  readonly not_yet_specified: string | null;
  readonly out_of_scope: readonly { readonly ref: string; readonly line: string }[];
  readonly close_tickets: readonly { readonly ref: string; readonly reason: string }[];
}

export function resolutionProblems(value: unknown, known: ReadonlySet<string>): string[] {
  if (typeof value !== 'object' || value === null) return ['resolution.json is not an object'];
  const r = value as Record<string, unknown>;
  const problems: string[] = [];
  if (typeof r.answer !== 'string' || r.answer.trim() === '') problems.push('answer is missing');
  if (typeof r.gist !== 'string' || r.gist.trim() === '' || r.gist.includes('\n')) problems.push('gist must be one line');
  if (r.not_yet_specified !== null && typeof r.not_yet_specified !== 'string') problems.push('not_yet_specified must be a string or null');
  if (!Array.isArray(r.new_tickets)) problems.push('new_tickets must be an array');
  else problems.push(...decisionProblems(r.new_tickets, known).map(p => `new_tickets: ${p}`));
  for (const key of ['out_of_scope', 'close_tickets'] as const) {
    const list = r[key];
    if (!Array.isArray(list)) {
      problems.push(`${key} must be an array`);
      continue;
    }
    for (const entry of list as Record<string, unknown>[]) {
      if (typeof entry?.ref !== 'string' || !known.has(entry.ref)) problems.push(`${key}: "${String(entry?.ref)}" is not a ticket on this map`);
      const text = key === 'out_of_scope' ? entry?.line : entry?.reason;
      if (typeof text !== 'string' || text.trim() === '') problems.push(`${key}: "${String(entry?.ref)}" needs its ${key === 'out_of_scope' ? 'line' : 'reason'}`);
    }
  }
  return problems;
}

export function readResolution(artifacts: string): { resolution: Resolution | undefined; problems: string[] } {
  const dir = join(artifacts, 'wayfinder');
  const path = join(dir, 'resolution.json');
  if (!existsSync(path)) return { resolution: undefined, problems: ['wayfinder/resolution.json is missing'] };
  const known = new Set<string>(
    existsSync(join(dir, 'tickets.json')) ? (JSON.parse(readFileSync(join(dir, 'tickets.json'), 'utf8')) as string[]) : [],
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return { resolution: undefined, problems: ['wayfinder/resolution.json is not valid JSON'] };
  }
  const problems = resolutionProblems(parsed, known);
  return { resolution: problems.length === 0 ? (parsed as Resolution) : undefined, problems };
}
