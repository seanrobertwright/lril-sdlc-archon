import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkShape } from '../../.shared/shape.ts';
import { draftProblems, frontier, topoOrder } from '../../.shared/tickets.ts';
import { DISCLAIMER, outcomeProblems } from '../../.shared/triage.ts';
import { mapProblems, replaceSection, appendToSection, renderMap } from '../../.shared/wayfinder.ts';
import { field, readTicket, setField } from '../../.shared/local.ts';

const ticket = (key: string, blocked_by: string[] = []) => ({
  key,
  title: `Ticket ${key}`,
  what_to_build: 'a behaviour',
  acceptance: ['it works'],
  blocked_by,
});

describe('tickets', () => {
  test('a valid breakdown has no problems', () => {
    expect(draftProblems({ feature: { title: 'Saved cards', slug: 'saved-cards' }, tickets: [ticket('A'), ticket('B', ['A'])] })).toEqual([]);
  });

  test('names unknown blockers, duplicates, missing criteria and bad slugs', () => {
    const problems = draftProblems({
      feature: { title: 'X', slug: 'Not Kebab' },
      tickets: [ticket('A', ['Z']), { ...ticket('A'), acceptance: [] }],
    });
    expect(problems.join('\n')).toContain('kebab-case');
    expect(problems.join('\n')).toContain('duplicated');
    expect(problems.join('\n')).toContain('acceptance');
  });

  test('refuses a cycle', () => {
    expect(draftProblems({ feature: { title: 'X', slug: 'x' }, tickets: [ticket('A', ['B']), ticket('B', ['A'])] })).toContain(
      'the blocking edges form a cycle',
    );
  });

  test('orders blockers first and computes the frontier', () => {
    const order = topoOrder([ticket('C', ['B']), ticket('B', ['A']), ticket('A')]);
    expect(order?.map(t => t.key)).toEqual(['A', 'B', 'C']);
    const graph = ['A', 'B', 'C'].map((key, i) => ({ key, ref: key, title: key, blocked_by: i === 0 ? [] : ['A'], done: false }));
    expect(frontier(graph, new Set()).map(t => t.key)).toEqual(['A']);
    expect(frontier(graph, new Set(['A'])).map(t => t.key)).toEqual(['B', 'C']);
  });
});

describe('shape', () => {
  const dir = (): string => {
    const shape = join(mkdtempSync(join(tmpdir(), 'lril-shape-')), 'shape');
    mkdirSync(shape, { recursive: true });
    return shape;
  };
  const spec = [
    '# Saved cards',
    '## Problem Statement', 'p', '## Solution', 's',
    '## User Stories', '1. As a Customer, I want to save a card, so that checkout is faster',
    '## Implementation Decisions', 'i', '## Testing Decisions', 't', '## Out of Scope', 'o', '## Further Notes', 'n',
  ].join('\n\n');

  test('a complete spec and breakdown is publishable', () => {
    const shape = dir();
    writeFileSync(join(shape, 'spec.md'), spec);
    writeFileSync(join(shape, 'tickets.json'), JSON.stringify({ feature: { title: 'Saved cards', slug: 'saved-cards' }, tickets: [ticket('A')] }));
    expect(checkShape(shape).problems).toEqual([]);
  });

  test('a spec missing template sections is not', () => {
    const shape = dir();
    writeFileSync(join(shape, 'spec.md'), '# X\n\n## Solution\n\ns');
    const problems = checkShape(shape).problems.join('\n');
    expect(problems).toContain('Problem Statement');
    expect(problems).toContain('tickets.json is missing');
  });
});

describe('triage outcome', () => {
  const brief = `${DISCLAIMER}\n\n## Agent Brief\n\n**Category:** bug\n**Summary:** s\n\n**Current behavior:**\nc\n\n**Desired behavior:**\nd\n\n**Key interfaces:**\n- k\n\n**Acceptance criteria:**\n- [ ] one\n\n**Out of scope:**\n- o`;
  const base = { category: 'bug', state: 'ready-for-agent', comment: brief, close: false, wontfix_reason: '', out_of_scope: null };

  test('a complete agent brief is applicable', () => {
    expect(outcomeProblems(base)).toEqual([]);
  });

  test('every comment carries the disclaimer', () => {
    expect(outcomeProblems({ ...base, comment: brief.replace(DISCLAIMER, '') }).join()).toContain('must start with');
  });

  test('a rejected enhancement must be recorded out of scope, and only it', () => {
    const wontfix = { ...base, category: 'enhancement', state: 'wontfix', close: true, wontfix_reason: 'rejected', comment: `${DISCLAIMER}\n\nNo.` };
    expect(outcomeProblems(wontfix).join()).toContain('.out-of-scope/');
    expect(outcomeProblems({ ...wontfix, out_of_scope: { file: 'dark-mode.md', content: '# Dark Mode' } })).toEqual([]);
    expect(
      outcomeProblems({ ...wontfix, wontfix_reason: 'already-implemented', out_of_scope: { file: 'dark-mode.md', content: 'x' } }).join(),
    ).toContain('only a rejected enhancement');
  });

  test('needs-info needs the triage notes template', () => {
    expect(outcomeProblems({ ...base, state: 'needs-info', comment: `${DISCLAIMER}\n\nplease give more info` }).join()).toContain('Triage Notes');
  });
});

describe('wayfinder map', () => {
  const draft = {
    title: 'Billing v2',
    slug: 'billing-v2',
    destination: 'A spec for the billing rewrite',
    notes: 'Consult domain-modeling',
    not_yet_specified: 'Something about refunds',
    out_of_scope: [],
    tickets: [{ key: 'Q1', title: 'Which ledger?', type: 'grilling' as const, question: 'Which ledger owns refunds?', blocked_by: [] }],
  };

  test('a valid map has no problems; a bad type is named', () => {
    expect(mapProblems(draft)).toEqual([]);
    expect(mapProblems({ ...draft, tickets: [{ ...draft.tickets[0], type: 'spike' }] }).join()).toContain('type must be one of');
  });

  test('sections are replaced and appended in place', () => {
    let body = renderMap(draft);
    body = appendToSection(body, 'Decisions so far', '- [Which ledger?](#1): the payments ledger');
    body = replaceSection(body, 'Not yet specified', 'Nothing left');
    expect(body).toContain('- [Which ledger?](#1): the payments ledger');
    expect(body).toMatch(/## Not yet specified\n\nNothing left\n\n## Out of scope/);
  });
});

describe('local ticket fields', () => {
  test('reads and rewrites bold and plain fields', () => {
    const root = mkdtempSync(join(tmpdir(), 'lril-ticket-'));
    const path = join(root, '03-saved-cards.md');
    writeFileSync(path, '# 03: Saved cards\n\n**Blocked by:** 01, 02\n\n**Status:** ready-for-agent\n');
    const read = readTicket(path);
    expect(read.blockedBy).toEqual(['01', '02']);
    expect(read.status).toBe('ready-for-agent');
    expect(field(setField(read.body, 'Status', 'done'), 'Status')).toBe('done');
    expect(field(setField('# 01: X\n\nType: research\n', 'Type', 'grilling'), 'Type')).toBe('grilling');
  });
});
