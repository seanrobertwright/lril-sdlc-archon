/**
 * The deterministic spine of the pack, end to end against a throwaway git repo on
 * the local-markdown tracker: setup → publish a shaped spec and tickets → work the
 * ticket graph through the real gates → triage an issue → chart and step a map.
 * The AI nodes are replaced by the files they would write.
 */
import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PACK = resolve(import.meta.dir, '..', '..');
// Each test spawns a dozen bun and git subprocesses; on Windows that outlasts the 5s default.
setDefaultTimeout(60_000);
let repo = '';

function git(...args: string[]): string {
  const result = Bun.spawnSync(['git', ...args], { cwd: repo, stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr.toString()}`);
  return result.stdout.toString().trim();
}

function script(path: string, env: Record<string, string>, artifacts: string, args: string[] = []): { code: number; out: string; err: string } {
  const result = Bun.spawnSync(['bun', join(PACK, path), ...args], {
    cwd: repo,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, ARTIFACTS_DIR: artifacts, ...env },
  });
  return { code: result.exitCode ?? 1, out: result.stdout.toString(), err: result.stderr.toString() };
}

function ok(path: string, env: Record<string, string>, artifacts: string): any {
  const result = script(path, env, artifacts);
  if (result.code !== 0) throw new Error(`${path} failed: ${result.err}`);
  try {
    return JSON.parse(result.out);
  } catch {
    return result.out.trim();
  }
}

const freshArtifacts = (): string => mkdtempSync(join(tmpdir(), 'lril-artifacts-'));

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'lril-repo-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  writeFileSync(join(repo, 'README.md'), '# Shop\n');
  git('add', '.');
  git('commit', '-q', '-m', 'init');
});

describe('lril-setup', () => {
  test('configures the local tracker and commits it', () => {
    const artifacts = freshArtifacts();
    const configured = ok('setup/scripts/configure.ts', { INPUTS_TRACKER: 'auto', INPUTS_AGENTS_FILE: 'auto', INPUTS_OVERWRITE: 'false', INPUTS_GITHUB_REPO: '' }, artifacts);
    expect(configured.tracker).toBe('local');
    expect(configured.agents_file).toBe('CLAUDE.md');
    expect(readFileSync(join(repo, 'docs/agents/issue-tracker.md'), 'utf8')).toContain('# Issue tracker: Local Markdown');
    expect(readFileSync(join(repo, 'CLAUDE.md'), 'utf8')).toContain('## Agent skills');
    const committed = ok('setup/scripts/commit.ts', { INPUTS_AGENTS_FILE: 'CLAUDE.md', INPUTS_TRACKER: 'local' }, artifacts);
    expect(committed.committed).toBe(true);
  });

  test('names the rename for a glossary still called CONTEXT.md', () => {
    writeFileSync(join(repo, 'CONTEXT.md'), '# Context\n');
    git('add', 'CONTEXT.md');
    git('commit', '-q', '-m', 'legacy glossary');
    const committed = ok('setup/scripts/commit.ts', { INPUTS_AGENTS_FILE: 'CLAUDE.md', INPUTS_TRACKER: 'local' }, freshArtifacts());
    expect(committed.summary).toContain('git mv CONTEXT.md GLOSSARY.md');
    git('rm', '-q', 'CONTEXT.md');
    git('commit', '-q', '-m', 'drop legacy glossary');
  });

  test('re-running keeps existing files and updates the block in place', () => {
    const artifacts = freshArtifacts();
    const again = ok('setup/scripts/configure.ts', { INPUTS_TRACKER: 'local', INPUTS_AGENTS_FILE: 'auto', INPUTS_OVERWRITE: 'false', INPUTS_GITHUB_REPO: '' }, artifacts);
    expect(again.kept).toContain('docs/agents/issue-tracker.md');
    expect(readFileSync(join(repo, 'CLAUDE.md'), 'utf8').match(/## Agent skills/g)?.length).toBe(1);
  });
});

describe('lril-idea-to-tickets publish', () => {
  test('publishes the spec and blockers-first ticket files, then commits them', () => {
    const artifacts = freshArtifacts();
    mkdirSync(join(artifacts, 'shape'), { recursive: true });
    writeFileSync(
      join(artifacts, 'shape', 'spec.md'),
      ['# Saved cards', '## Problem Statement', 'p', '## Solution', 's', '## User Stories', '1. As a Customer, I want to save a card, so that I pay faster',
        '## Implementation Decisions', 'i', '## Testing Decisions', 'the checkout seam', '## Out of Scope', 'o', '## Further Notes', 'n'].join('\n\n'),
    );
    writeFileSync(
      join(artifacts, 'shape', 'tickets.json'),
      JSON.stringify({
        feature: { title: 'Saved cards', slug: 'saved-cards' },
        tickets: [
          { key: 'UI', title: 'Choose a saved card', what_to_build: 'pick one at checkout', acceptance: ['shown'], blocked_by: ['STORE'] },
          { key: 'STORE', title: 'Save a card', what_to_build: 'save after paying', acceptance: ['stored'], blocked_by: [] },
        ],
      }),
    );
    expect(ok('idea-to-tickets/scripts/validate.ts', {}, artifacts)).toEqual({ title: 'Saved cards', slug: 'saved-cards', tickets: 2 });
    const published = ok('idea-to-tickets/scripts/publish.ts', {}, artifacts);
    expect(published.spec_ref).toBe('.scratch/saved-cards/spec.md');
    const files = readdirSync(join(repo, '.scratch/saved-cards/issues')).sort();
    expect(files).toEqual(['01-save-a-card.md', '02-choose-a-saved-card.md']);
    expect(readFileSync(join(repo, '.scratch/saved-cards/issues', files[1]!), 'utf8')).toContain('**Blocked by:** 01');
    const committed = ok('idea-to-tickets/scripts/commit-docs.ts', { INPUTS_SPEC_REF: published.spec_ref, INPUTS_SLUG: 'saved-cards', INPUTS_TRACKER: 'local' }, artifacts);
    expect(committed.committed).toBe(true);
    expect(git('status', '--porcelain')).toBe('');
  });

  test('refuses to overwrite an existing feature', () => {
    const artifacts = freshArtifacts();
    mkdirSync(join(artifacts, 'shape'), { recursive: true });
    writeFileSync(join(artifacts, 'shape', 'spec.md'), readFileSync(join(repo, '.scratch/saved-cards/spec.md'), 'utf8'));
    writeFileSync(join(artifacts, 'shape', 'tickets.json'), JSON.stringify({ feature: { title: 'Saved cards', slug: 'saved-cards' }, tickets: [{ key: 'A', title: 'a', what_to_build: 'a', acceptance: ['a'], blocked_by: [] }] }));
    expect(script('idea-to-tickets/scripts/publish.ts', {}, artifacts).err).toContain('already exists');
  });
});

describe('lril-implement-spec frontier and gates', () => {
  test('works the graph blockers-first, gating each ticket on checks and commits', () => {
    const artifacts = freshArtifacts();
    const loaded = ok('implement-spec/scripts/load-graph.ts', { INPUTS_SPEC: '.scratch/saved-cards/spec.md' }, artifacts);
    expect(loaded.total).toBe(2);
    expect(loaded.open).toBe(2);

    const first = ok('implement-spec/scripts/next-ticket.ts', {}, artifacts);
    expect(first.key).toBe('01');
    const verdict = JSON.stringify({ done: true, green: true, summary: 'built', check_commands: ['true'] });

    // Nothing committed yet: the gate refuses.
    const refused = script('implement-spec/scripts/ticket-gate.ts', { INPUTS_VERDICT: verdict, INPUTS_KEY: '01', INPUTS_HEAD_SHA: first.head_sha }, artifacts);
    expect(refused.code).not.toBe(0);
    expect(refused.err).toContain('Nothing was committed');

    // A failing declared check: the gate refuses.
    writeFileSync(join(repo, 'cards.ts'), 'export const saved = true;\n');
    git('add', 'cards.ts');
    git('commit', '-q', '-m', 'save a card');
    const runId = '94a619b4232946c24775dbf6a62194a5';
    const red = script('implement-spec/scripts/ticket-gate.ts', { INPUTS_VERDICT: JSON.stringify({ done: true, green: true, summary: 'x', check_commands: ['false'] }), INPUTS_KEY: '01', INPUTS_HEAD_SHA: first.head_sha, WORKFLOW_ID: runId }, artifacts);
    expect(red.err).toContain('failed when re-run');
    // `false` fails each time it is run again, and the refusal says how to run the gate again.
    expect(red.err).toContain('Failed each time it ran (2 attempts).');
    expect(red.err).toContain(`archon workflow resume ${runId} --detach`);

    const gated = ok('implement-spec/scripts/ticket-gate.ts', { INPUTS_VERDICT: verdict, INPUTS_KEY: '01', INPUTS_HEAD_SHA: first.head_sha }, artifacts);
    expect(gated.remaining).toBe(1);
    expect(readFileSync(join(repo, '.scratch/saved-cards/issues/01-save-a-card.md'), 'utf8')).toContain('**Status:** done');

    const second = ok('implement-spec/scripts/next-ticket.ts', {}, artifacts);
    expect(second.key).toBe('02');
    writeFileSync(join(repo, 'picker.ts'), 'export const pick = 1;\n');
    git('add', 'picker.ts');
    git('commit', '-q', '-m', 'choose a saved card');
    expect(ok('implement-spec/scripts/ticket-gate.ts', { INPUTS_VERDICT: verdict, INPUTS_KEY: '02', INPUTS_HEAD_SHA: second.head_sha }, artifacts).remaining).toBe(0);
    expect(ok('implement-spec/scripts/next-ticket.ts', {}, artifacts).all_done).toBe(true);
  });

  test('a decline is refused before review spends anything', () => {
    const result = script('implement/scripts/gate.ts', { INPUTS_VERDICT: JSON.stringify({ done: true, green: false, summary: 'blocked: contradicts the order model', check_commands: [] }), INPUTS_START_SHA: git('rev-parse', 'HEAD'), INPUTS_LABEL: 'x' }, freshArtifacts());
    expect(result.err).toContain('did not reach green');
  });
});

describe('lril-implement fetch', () => {
  test('a local ticket path resolves with its parent spec', () => {
    const artifacts = freshArtifacts();
    const work = ok('implement/scripts/fetch-work.ts', { INPUTS_TICKET: '.scratch/saved-cards/issues/02-choose-a-saved-card.md' }, artifacts);
    expect(work.kind).toBe('local');
    expect(work.has_parent_spec).toBe(true);
    expect(readFileSync(work.spec_path, 'utf8')).toContain('# Parent spec');
  });
});

describe('lril-triage apply (local)', () => {
  test('applies an approved agent brief and commits', () => {
    const artifacts = freshArtifacts();
    const issue = '.scratch/inbox/issues/01-card-declined-twice.md';
    mkdirSync(join(repo, '.scratch/inbox/issues'), { recursive: true });
    writeFileSync(join(repo, issue), '# 01: Card declined twice\n\nThe card is charged twice when declined.\n');
    mkdirSync(join(artifacts, 'triage'), { recursive: true });
    writeFileSync(
      join(artifacts, 'triage', 'outcome.json'),
      JSON.stringify({
        category: 'bug',
        state: 'ready-for-agent',
        comment: '> *This was generated by AI during triage.*\n\n## Agent Brief\n\n**Category:** bug\n**Summary:** s\n\n**Current behavior:**\nc\n\n**Desired behavior:**\nd\n\n**Key interfaces:**\n- k\n\n**Acceptance criteria:**\n- [ ] one\n\n**Out of scope:**\n- o',
        close: false,
        wontfix_reason: '',
        out_of_scope: null,
      }),
    );
    // The loop's check: the turn that writes the outcome pauses on it; a bare approve of it, unchanged, applies it.
    const gate = (reply: string) => script('triage/bin/validate-outcome.ts', { LOOP_USER_INPUT: reply }, artifacts, ['--gate']).code;
    expect(script('triage/bin/validate-outcome.ts', {}, artifacts).code).toBe(0);
    expect(gate('move it to ready-for-agent')).toBe(1);
    expect(gate('')).toBe(1);
    expect(gate('Approved')).toBe(0);
    // A term the session sharpened inline is committed with the outcome.
    writeFileSync(join(repo, 'GLOSSARY.md'), '# Glossary\n\n**Decline**: the gateway refusing a charge.\n');
    const applied = ok('triage/scripts/apply.ts', { INPUTS_ITEM: issue }, artifacts);
    expect(applied.state).toBe('ready-for-agent');
    const body = readFileSync(join(repo, issue), 'utf8');
    expect(body).toContain('**Status:** ready-for-agent');
    expect(body).toContain('## Comments');
    expect(git('status', '--porcelain')).toBe('');
    expect(git('log', '-1', '--format=%s', '--', 'GLOSSARY.md')).toBe(`docs: glossary and ADRs from triaging ${issue}`);
  });
});

describe('lril-wayfinder (local)', () => {
  test('charts a map, claims the frontier ticket, and records its resolution', () => {
    const chartArtifacts = freshArtifacts();
    mkdirSync(join(chartArtifacts, 'wayfinder'), { recursive: true });
    writeFileSync(
      join(chartArtifacts, 'wayfinder', 'map.json'),
      JSON.stringify({
        title: 'Billing v2',
        slug: 'billing-v2',
        destination: 'A spec for the billing rewrite',
        notes: 'Consult domain-modeling.',
        not_yet_specified: 'Something about refunds.',
        out_of_scope: ['Tax engines'],
        tickets: [
          { key: 'Q1', title: 'Which ledger owns refunds', type: 'grilling', question: 'Which ledger?', blocked_by: [] },
          { key: 'Q2', title: 'Gateway refund API limits', type: 'research', question: 'What does the API allow?', blocked_by: ['Q1'] },
        ],
      }),
    );
    const published = ok('wayfinder-chart/scripts/publish-map.ts', {}, chartArtifacts);
    expect(published).toMatchObject({ has_map: true, map_ref: '.scratch/billing-v2/map.md', tickets: 2, research: 1 });
    expect(readFileSync(join(repo, '.scratch/billing-v2/issues/02-gateway-refund-api-limits.md'), 'utf8')).toContain('Blocked by: 01');

    const stepArtifacts = freshArtifacts();
    const loaded = ok('wayfinder-step/scripts/load.ts', { INPUTS_MAP: '.scratch/billing-v2/map.md', INPUTS_TICKET: '' }, stepArtifacts);
    expect(loaded).toMatchObject({ ticket_ref: '01', type: 'grilling' });
    expect(readFileSync(join(repo, '.scratch/billing-v2/issues/01-which-ledger-owns-refunds.md'), 'utf8')).toContain('Status: claimed');

    writeFileSync(
      join(stepArtifacts, 'wayfinder', 'resolution.json'),
      JSON.stringify({
        answer: 'The payments ledger owns refunds.',
        gist: 'the payments ledger',
        new_tickets: [{ key: 'N1', title: 'Partial refunds', type: 'grilling', question: 'Do we allow partial refunds?', blocked_by: ['02'] }],
        not_yet_specified: '',
        out_of_scope: [],
        close_tickets: [],
      }),
    );
    expect(script('wayfinder-step/bin/validate-resolution.ts', {}, stepArtifacts).code).toBe(0);
    const recorded = ok('wayfinder-step/scripts/record.ts', { INPUTS_MAP_REF: '.scratch/billing-v2/map.md', INPUTS_TICKET_REF: '01' }, stepArtifacts);
    expect(recorded.new_tickets).toBe(1);
    expect(recorded.open_left).toBe(2);
    const map = readFileSync(join(repo, '.scratch/billing-v2/map.md'), 'utf8');
    expect(map).toContain('- [Which ledger owns refunds](issues/01-which-ledger-owns-refunds.md): the payments ledger');
    expect(map).toMatch(/## Not yet specified\n\n_Nothing yet._/);
    expect(existsSync(join(repo, '.scratch/billing-v2/issues/03-partial-refunds.md'))).toBe(true);
    expect(readFileSync(join(repo, '.scratch/billing-v2/issues/01-which-ledger-owns-refunds.md'), 'utf8')).toContain('## Answer');

    const next = ok('wayfinder-step/scripts/load.ts', { INPUTS_MAP: '.scratch/billing-v2/map.md', INPUTS_TICKET: '' }, freshArtifacts());
    expect(next).toMatchObject({ ticket_ref: '02', type: 'research' });
  });
});
