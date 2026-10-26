import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkShape } from '../../.shared/shape.ts';
import { draftProblems, frontier, topoOrder } from '../../.shared/tickets.ts';
import { DISCLAIMER, outcomeProblems } from '../../.shared/triage.ts';
import { mapProblems, replaceSection, appendToSection, renderMap } from '../../.shared/wayfinder.ts';
import { field, readTicket, setField } from '../../.shared/local.ts';
import { ATTEMPTS, CHECK_BUDGET_MS, flakyChecks, flakyLine, runChecks } from '../../.shared/checks.ts';
import { RUNS, TIMEOUT_MS as LOOP_TIMEOUT_MS } from '../../.shared/loop.ts';
import { approvedAsShown, BARE_APPROVAL } from '../../.shared/approval.ts';

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

describe('interactive replies', () => {
  // Archon substitutes $LOOP_USER_INPUT into a loop_group body node's YAML, but not
  // into the command file it loads, so a reply read there is always empty. Commands
  // read the reply as $INPUTS.reply, bound with `with: { reply: "$LOOP_USER_INPUT" }`.
  const { readdirSync, readFileSync, existsSync } = require('node:fs') as typeof import('node:fs');
  const root = join(import.meta.dir, '..', '..');
  const folders = readdirSync(root).filter(name => existsSync(join(root, name, 'commands')));

  test('no command file reads $LOOP_USER_INPUT directly', () => {
    const offenders = folders.flatMap(folder =>
      readdirSync(join(root, folder, 'commands'))
        .filter(file => readFileSync(join(root, folder, 'commands', file), 'utf8').includes('$LOOP_USER_INPUT'))
        .map(file => `${folder}/commands/${file}`),
    );
    expect(offenders).toEqual([]);
  });

  test('every command that reads $INPUTS.reply is bound to the gate reply', () => {
    for (const folder of folders) {
      const yaml = readdirSync(join(root, folder)).find(name => name.endsWith('.yaml'));
      if (yaml === undefined) continue;
      const source = readFileSync(join(root, folder, yaml), 'utf8');
      for (const file of readdirSync(join(root, folder, 'commands'))) {
        if (!readFileSync(join(root, folder, 'commands', file), 'utf8').includes('$INPUTS.reply')) continue;
        const name = file.replace(/\.md$/, '');
        const at = source.indexOf(`command: ${name}\n`);
        expect(at).toBeGreaterThan(-1);
        const node = source.slice(at, source.indexOf('\n        - id:', at) === -1 ? undefined : source.indexOf('\n        - id:', at));
        expect(node).toContain('reply: "$LOOP_USER_INPUT"');
      }
    }
  });
});

describe('output references in command files', () => {
  // Archon v0.12.1 reads a run of dots after `$node.output.field` as part of the
  // reference, so `$load.output.start_sha..HEAD` fails the node before it starts.
  // Name the value with a placeholder in the git range and give the reference apart.
  const { readdirSync, readFileSync, existsSync } = require('node:fs') as typeof import('node:fs');
  const root = join(import.meta.dir, '..', '..');
  const folders = readdirSync(root).filter(name => existsSync(join(root, name, 'commands')));

  test('no output reference is followed by `..`', () => {
    const offenders = folders.flatMap(folder =>
      readdirSync(join(root, folder, 'commands'))
        .filter(file => /\$[A-Za-z_-]+\.output(\.[A-Za-z_]+)*\.\./.test(readFileSync(join(root, folder, 'commands', file), 'utf8')))
        .map(file => `${folder}/commands/${file}`),
    );
    expect(offenders).toEqual([]);
  });
});

describe('declaring output', () => {
  // Declaring structured output ends the agent's session. A file write or commit sent in
  // the same turn can still be running, and is lost: a pr-body agent once wrote its body
  // and declared its title in parallel, and publish-pr found no body. Every command whose
  // node declares output says to declare only after every other tool call has returned.
  const { readdirSync, readFileSync, statSync } = require('node:fs') as typeof import('node:fs');
  const root = join(import.meta.dir, '..', '..');
  type Node = { id?: string; command?: string; output_format?: unknown; loop_group?: { nodes?: Node[] } };
  const walk = (nodes: Node[] = []): Node[] => nodes.flatMap(node => [node, ...walk(node.loop_group?.nodes)]);
  const commands = readdirSync(root)
    .filter(folder => !folder.startsWith('.') && statSync(join(root, folder)).isDirectory())
    .flatMap(folder => {
      const yaml = readdirSync(join(root, folder)).find(name => /^lril-.*\.yaml$/.test(name));
      if (yaml === undefined) return [];
      const workflow = Bun.YAML.parse(readFileSync(join(root, folder, yaml), 'utf8')) as { nodes?: Node[] };
      return walk(workflow.nodes)
        .filter(node => node.command !== undefined && node.output_format !== undefined)
        .map(node => `${folder}/commands/${node.command}.md`);
    });

  test('the pack has agent nodes that declare output', () => {
    expect(commands.length).toBeGreaterThan(0);
  });

  test('every such command says to declare only after its other tool calls return', () => {
    const offenders = [...new Set(commands)].filter(
      path => !readFileSync(join(root, path), 'utf8').includes('Declare only after every other tool call has returned.'),
    );
    expect(offenders).toEqual([]);
  });
});

describe('approval at the gate', () => {
  // After an interactive loop's first iteration, a passing until_bash ends the loop
  // with no gate. A draft is applied only on a bare approve of the draft last shown.
  const setup = () => {
    const dir = mkdtempSync(join(tmpdir(), 'lril-approval-'));
    const draft = join(dir, 'outcome.json');
    const marker = join(dir, 'shown.sha256');
    writeFileSync(draft, '{"state":"ready-for-agent"}');
    return { draft, marker };
  };

  test('a draft is never approved on the turn that first shows it', () => {
    const { draft, marker } = setup();
    expect(approvedAsShown([draft], marker, BARE_APPROVAL)).toBe(false);
    expect(approvedAsShown([draft], marker, BARE_APPROVAL)).toBe(true);
  });

  test('only a bare approval of the unchanged draft approves it', () => {
    const { draft, marker } = setup();
    expect(approvedAsShown([draft], marker, 'move it to ready-for-agent')).toBe(false);
    expect(approvedAsShown([draft], marker, '')).toBe(false);
    expect(approvedAsShown([draft], marker, 'yes')).toBe(false);
    writeFileSync(draft, '{"state":"needs-info"}');
    expect(approvedAsShown([draft], marker, BARE_APPROVAL)).toBe(false);
    expect(approvedAsShown([draft], marker, BARE_APPROVAL)).toBe(true);
  });

  test('a draft file that appears or disappears counts as a change', () => {
    const { draft, marker } = setup();
    const second = join(draft, '..', 'no-map.md');
    expect(approvedAsShown([draft, second], marker, '')).toBe(false);
    writeFileSync(second, 'No map needed.');
    expect(approvedAsShown([draft, second], marker, BARE_APPROVAL)).toBe(false);
  });

  test('every interactive loop completes only through its validator in gate mode', () => {
    const { readdirSync, readFileSync, statSync } = require('node:fs') as typeof import('node:fs');
    const root = join(import.meta.dir, '..', '..');
    type Group = { interactive?: boolean; until_bash?: string; nodes?: Node[] };
    type Node = { id?: string; loop_group?: Group };
    const walk = (nodes: Node[] = []): Node[] => nodes.flatMap(node => [node, ...walk(node.loop_group?.nodes)]);
    const groups = readdirSync(root)
      .filter(folder => !folder.startsWith('.') && statSync(join(root, folder)).isDirectory())
      .flatMap(folder => {
        const yaml = readdirSync(join(root, folder)).find(name => /^lril-.*\.yaml$/.test(name));
        if (yaml === undefined) return [];
        const workflow = Bun.YAML.parse(readFileSync(join(root, folder, yaml), 'utf8')) as { nodes?: Node[] };
        return walk(workflow.nodes)
          .filter(node => node.loop_group?.interactive === true)
          .map(node => ({ where: `${yaml} ${node.id}`, until: node.loop_group?.until_bash ?? '' }));
      });
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.filter(group => !/\/bin\/validate-[a-z-]+\.ts" --gate /.test(group.until)).map(group => group.where)).toEqual([]);
  });
});

describe('check timeouts', () => {
  // A script node without `timeout:` gets Archon's 120 s default, which stops a gate
  // with no verdict. Every node that re-runs project checks (verify, and the gates, which
  // run them for an implementer that met its criteria but did not report green) declares more than
  // the gate's total budget, and every feedback-loop node more than its worst case: RUNS
  // runs plus the regression test, each at the loop's per-run limit.
  const { readdirSync, readFileSync, statSync } = require('node:fs') as typeof import('node:fs');
  const root = join(import.meta.dir, '..', '..');
  const MINIMUM_MS: Readonly<Record<string, number>> = {
    verify: CHECK_BUDGET_MS,
    gate: CHECK_BUDGET_MS,
    'ticket-gate': CHECK_BUDGET_MS,
    'prove-red': RUNS * LOOP_TIMEOUT_MS,
    'prove-green': (RUNS + 1) * LOOP_TIMEOUT_MS,
  };
  const CHECK_SCRIPTS = new Set(Object.keys(MINIMUM_MS));
  type Node = { id?: string; script?: string; timeout?: number; loop_group?: { nodes?: Node[] } };
  const walk = (nodes: Node[] = []): Node[] => nodes.flatMap(node => [node, ...walk(node.loop_group?.nodes)]);
  const checkNodes = readdirSync(root)
    .filter(folder => !folder.startsWith('.') && statSync(join(root, folder)).isDirectory())
    .flatMap(folder => {
      const dir = join(root, folder);
      const yaml = readdirSync(dir).find(name => /^lril-.*\.yaml$/.test(name));
      if (yaml === undefined) return [];
      const workflow = Bun.YAML.parse(readFileSync(join(dir, yaml), 'utf8')) as { nodes?: Node[] };
      return walk(workflow.nodes)
        .filter(node => CHECK_SCRIPTS.has(node.script ?? ''))
        .map(node => ({ where: `${yaml} ${node.id}`, timeout: node.timeout, minimum: MINIMUM_MS[node.script ?? ''] ?? 0 }));
    });

  test('the pack has check-running nodes to guard', () => {
    expect(checkNodes.length).toBeGreaterThan(0);
  });

  test('every check-running node declares a timeout above what its script can spend', () => {
    expect(checkNodes.filter(node => typeof node.timeout !== 'number' || node.timeout <= node.minimum).map(node => node.where)).toEqual([]);
  });
});

describe('runChecks', () => {
  test('the record names finished commands and the running one while a gate is still going', () => {
    const artifacts = mkdtempSync(join(tmpdir(), 'lril-checks-'));
    const record = join(artifacts, 'checks', 'gate.md').replace(/\\/g, '/');
    const reader = `cat '${record}'`;
    const results = runChecks(['true', reader], artifacts, 'gate');
    expect(results.map(result => result.code)).toEqual([0, 0]);
    expect(results[1]?.tail).toContain('## `true` exited 0');
    expect(results[1]?.tail).toContain(`## \`${reader}\` is running`);
  });

  test('a gate whose budget runs out stops the running command and records the rest as not run', () => {
    const artifacts = mkdtempSync(join(tmpdir(), 'lril-checks-'));
    const started = Date.now();
    const results = runChecks(['true', 'sleep 5', 'true'], artifacts, 'gate', 1500);
    expect(Date.now() - started).toBeLessThan(4500);
    expect(results.map(result => [result.code === 0, result.notRun === true])).toEqual([[true, false], [false, false], [false, true]]);
    expect(results[1]?.tail).toContain('Stopped at the end of the gate');
    const record = require('node:fs').readFileSync(join(artifacts, 'checks', 'gate.md'), 'utf8') as string;
    expect(record).toContain('## `sleep 5` exited');
    expect(record).toContain('## `true` was not run');
  });

  test('a command that fails, then passes when run again, passes and is recorded as flaky', () => {
    const artifacts = mkdtempSync(join(tmpdir(), 'lril-checks-'));
    const marker = join(artifacts, 'ran-once').replace(/\\/g, '/');
    // Fails the first time (and says which test), passes every time after.
    const flaky = `test -f '${marker}' || { touch '${marker}'; echo 'not ok 3 - inserted commands run in order'; exit 1; }`;
    const results = runChecks(['true', flaky], artifacts, 'implement');
    expect(results.map(result => result.code)).toEqual([0, 0]);
    expect(results[1]?.flaky?.code).toBe(1);
    expect(results[1]?.flaky?.tail).toContain('not ok 3 - inserted commands run in order');
    const record = require('node:fs').readFileSync(join(artifacts, 'checks', 'implement.md'), 'utf8') as string;
    expect(record).toContain(`passed when run again (flaky)`);
    expect(record).toContain('The first attempt exited 1:');
    expect(flakyChecks(artifacts)).toEqual([{ label: 'implement', command: flaky, code: 1 }]);
    expect(flakyLine(artifacts)).toContain('(implement, first exit 1) failed, then passed when run again');
  });

  test('a command that fails each time it runs fails, and is not called flaky', () => {
    const artifacts = mkdtempSync(join(tmpdir(), 'lril-checks-'));
    const counter = join(artifacts, 'runs').replace(/\\/g, '/');
    const results = runChecks([`echo x >> '${counter}'; exit 3`], artifacts, 'after-review');
    expect(results[0]?.code).toBe(3);
    expect(results[0]?.flaky).toBeUndefined();
    expect(results[0]?.tail).toContain(`Failed each time it ran (${ATTEMPTS} attempts).`);
    expect((require('node:fs').readFileSync(counter, 'utf8') as string).trim().split('\n')).toHaveLength(ATTEMPTS);
    expect(flakyChecks(artifacts)).toEqual([]);
    expect(flakyLine(artifacts)).toBe('');
  });

  test('a gate run again keeps the other gates\' flaky checks and replaces its own', () => {
    const artifacts = mkdtempSync(join(tmpdir(), 'lril-checks-'));
    const marker = join(artifacts, 'ran-once').replace(/\\/g, '/');
    const flaky = `test -f '${marker}' || { touch '${marker}'; exit 1; }`;
    runChecks([flaky], artifacts, 'implement');
    runChecks(['true'], artifacts, 'after-review');
    expect(flakyChecks(artifacts).map(entry => entry.label)).toEqual(['implement']);
    // The same gate resumed: its command passes first time now, so it is no longer flaky.
    runChecks([flaky], artifacts, 'implement');
    expect(flakyChecks(artifacts)).toEqual([]);
  });
});
