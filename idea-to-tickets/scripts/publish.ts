/**
 * Publish the approved spec and tickets, the way /to-spec and /to-tickets do:
 *
 * - GitHub: the spec as an issue labelled ready-for-agent; each ticket, blockers
 *   first, as a ready-for-agent sub-issue of the spec with native "blocked by"
 *   edges. A repo without sub-issues or dependencies gets the `## Parent` /
 *   `## Blocked by` body sections instead.
 * - Local: `.scratch/<slug>/spec.md` plus one `issues/<NN>-<slug>.md` per ticket,
 *   numbered blockers-first.
 *
 * Every write is read back before this node reports success.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { artifactsDir, emit, note, run } from '../../.shared/io.ts';
import { pad, SCRATCH, slugify, write } from '../../.shared/local.ts';
import { checkShape } from '../../.shared/shape.ts';
import { topoOrder, type DraftTicket } from '../../.shared/tickets.ts';
import {
  addBlockedBy,
  addSubIssue,
  createIssue,
  editIssueBody,
  getIssue,
  readTrackerConfig,
  subIssues,
  type GhIssue,
} from '../../.shared/tracker.ts';

function criteria(ticket: DraftTicket): string {
  return ticket.acceptance.map(item => `- [ ] ${item}`).join('\n');
}

function withTitle(spec: string, title: string): string {
  return /^#\s+/m.test(spec.split('\n')[0] ?? '') ? spec : `# ${title}\n\n${spec}`;
}

run(() => {
  const artifacts = artifactsDir();
  const config = readTrackerConfig();
  const shape = checkShape(join(artifacts, 'shape'));
  if (shape.draft === undefined || shape.problems.length > 0) throw new Error('Nothing publishable in shape/.');
  const { feature, tickets } = shape.draft;
  const ordered = topoOrder(tickets) ?? [];
  const ready = config.labels['ready-for-agent'];
  const published: { key: string; ref: string }[] = [];

  if (config.kind === 'github') {
    const spec = createIssue(feature.title, shape.spec.replace(/^#\s+.+\n+/, ''), [ready]);
    const byKey = new Map<string, GhIssue>();
    let native = true;
    for (const ticket of ordered) {
      const body =
        `## Parent\n\n#${spec.number}\n\n## What to build\n\n${ticket.what_to_build}\n\n` +
        `## Acceptance criteria\n\n${criteria(ticket)}`;
      const issue = createIssue(ticket.title, body, [ready]);
      byKey.set(ticket.key, issue);
      if (!addSubIssue(spec.number, issue)) native = false;
      const blockers = ticket.blocked_by.map(key => byKey.get(key)).filter((b): b is GhIssue => b !== undefined);
      const unlinked = blockers.filter(blocker => !addBlockedBy(issue.number, blocker));
      if (unlinked.length > 0) {
        native = false;
        editIssueBody(issue.number, `${body}\n\n## Blocked by\n\n${unlinked.map(b => `- #${b.number}`).join('\n')}`);
      }
      published.push({ key: ticket.key, ref: `#${issue.number}` });
    }
    if (!native) note('Some sub-issue or blocked-by links fell back to body sections (the repo may not support them).');
    // Read back: the spec and every ticket exist, open and labelled.
    for (const issue of [spec, ...byKey.values()]) {
      const read = getIssue(issue.number);
      if (read.state !== 'open' || !read.labels.includes(ready)) {
        throw new Error(`#${issue.number} did not read back open with the "${ready}" label.`);
      }
    }
    if (native && subIssues(spec.number).length !== byKey.size) {
      throw new Error(`Spec #${spec.number} reads back with the wrong number of sub-issues.`);
    }
    write(join(artifacts, 'published.json'), JSON.stringify({ spec: `#${spec.number}`, url: spec.url, tickets: published }, null, 2));
    emit({ tracker: 'github', spec_ref: `#${spec.number}`, tickets: published.length, native_edges: native });
    return;
  }

  const dir = join(SCRATCH, feature.slug);
  const specPath = join(dir, 'spec.md');
  if (existsSync(specPath)) throw new Error(`${specPath} already exists; pick a new feature slug rather than overwrite it.`);
  write(specPath, withTitle(shape.spec, feature.title));
  const numbers = new Map(ordered.map((ticket, index) => [ticket.key, pad(index + 1)]));
  for (const ticket of ordered) {
    const number = numbers.get(ticket.key) ?? '';
    const blocked = ticket.blocked_by.map(key => numbers.get(key)).filter(Boolean);
    const path = join(dir, 'issues', `${number}-${slugify(ticket.title)}.md`);
    write(
      path,
      `# ${number}: ${ticket.title}\n\n**What to build:** ${ticket.what_to_build}\n\n` +
        `**Blocked by:** ${blocked.length === 0 ? 'None (can start immediately)' : blocked.join(', ')}\n\n` +
        `**Status:** ${ready}\n\n${criteria(ticket)}\n`,
    );
    if (!existsSync(path)) throw new Error(`${path} did not land.`);
    published.push({ key: ticket.key, ref: path.replace(/\\/g, '/') });
  }
  const specRef = specPath.replace(/\\/g, '/');
  write(join(artifacts, 'published.json'), JSON.stringify({ spec: specRef, tickets: published }, null, 2));
  emit({ tracker: 'local', spec_ref: specRef, tickets: published.length, native_edges: true });
});
