/**
 * The shaped output of a grill → spec → tickets session, checked by code:
 * `shape/spec.md` follows Matt Pocock's /to-spec template, and `shape/tickets.json`
 * is a valid tracer-bullet breakdown (keys unique, blockers real, no cycles, every
 * ticket with acceptance criteria).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { draftProblems, type DraftTickets } from './tickets.ts';

export const SPEC_SECTIONS = [
  'Problem Statement',
  'Solution',
  'User Stories',
  'Implementation Decisions',
  'Testing Decisions',
  'Out of Scope',
  'Further Notes',
] as const;

export interface Shape {
  readonly problems: string[];
  readonly spec: string;
  readonly draft: DraftTickets | undefined;
}

export function checkShape(shapeDir: string): Shape {
  const problems: string[] = [];
  const specPath = join(shapeDir, 'spec.md');
  const ticketsPath = join(shapeDir, 'tickets.json');
  const spec = existsSync(specPath) ? readFileSync(specPath, 'utf8') : '';
  if (spec === '') problems.push('shape/spec.md is missing');
  for (const section of SPEC_SECTIONS) {
    if (spec !== '' && !new RegExp(`^##\\s+${section}\\s*$`, 'im').test(spec)) {
      problems.push(`shape/spec.md has no "## ${section}" section`);
    }
  }
  const stories = spec.match(/^##\s+User Stories\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/im)?.[1] ?? '';
  if (spec !== '' && !/^\s*1\.\s+As an? /im.test(stories)) {
    problems.push('shape/spec.md: User Stories must be a numbered list of "As a/an <actor>, I want ..., so that ..."');
  }
  let draft: DraftTickets | undefined;
  if (!existsSync(ticketsPath)) {
    problems.push('shape/tickets.json is missing');
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(ticketsPath, 'utf8'));
    } catch {
      problems.push('shape/tickets.json is not valid JSON');
    }
    if (parsed !== undefined) {
      const ticketProblems = draftProblems(parsed);
      problems.push(...ticketProblems.map(problem => `shape/tickets.json: ${problem}`));
      if (ticketProblems.length === 0) draft = parsed as DraftTickets;
    }
  }
  return { problems, spec, draft };
}
