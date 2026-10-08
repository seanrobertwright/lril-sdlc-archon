/**
 * Publish the approved map: the map issue (or map.md), then its decision tickets
 * blockers-first, with edges wired in a second pass so every reference is a real id.
 * When the session concluded no map is needed, publish nothing.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { artifactsDir, emit, run } from '../../.shared/io.ts';
import { write } from '../../.shared/local.ts';
import { createIssue, getIssue, readTrackerConfig } from '../../.shared/tracker.ts';
import { createDecisions, localMapPath, mapProblems, mapTickets, renderMap, type DraftMap, type MapRef } from '../../.shared/wayfinder.ts';

run(() => {
  const artifacts = artifactsDir();
  const dir = join(artifacts, 'wayfinder');
  if (existsSync(join(dir, 'no-map.md'))) {
    emit({ has_map: false, map_ref: '', tickets: 0, research: 0 });
    return;
  }
  const draft = JSON.parse(readFileSync(join(dir, 'map.json'), 'utf8')) as DraftMap;
  const problems = mapProblems(draft);
  if (problems.length > 0) throw new Error(`The map is not publishable:\n${problems.map(p => `- ${p}`).join('\n')}`);
  const config = readTrackerConfig();
  let map: MapRef;
  if (config.kind === 'github') {
    const issue = createIssue(draft.title, renderMap(draft), ['wayfinder:map']);
    map = { tracker: 'github', ref: `#${issue.number}`, dir: '' };
  } else {
    const path = localMapPath(draft.slug);
    if (existsSync(path)) throw new Error(`${path} already exists; pick a new effort slug rather than overwrite it.`);
    write(path, `# ${draft.title}\n\n${renderMap(draft)}\n`);
    map = { tracker: 'local', ref: path.replace(/\\/g, '/'), dir: join(path, '..').replace(/\\/g, '/') };
  }
  const created = createDecisions(map, draft.tickets);
  const tickets = mapTickets(map);
  if (tickets.length !== draft.tickets.length) {
    throw new Error(`The map reads back with ${tickets.length} ticket(s), not ${draft.tickets.length}.`);
  }
  if (config.kind === 'github' && !getIssue(Number(map.ref.slice(1))).labels.includes('wayfinder:map')) {
    throw new Error(`${map.ref} did not read back labelled wayfinder:map.`);
  }
  const research = draft.tickets
    .filter(ticket => ticket.type === 'research')
    .map(ticket => ({ key: ticket.key, ref: created.get(ticket.key) ?? '', title: ticket.title, question: ticket.question }));
  write(join(dir, 'published.json'), JSON.stringify({ map: map.ref, tickets: Object.fromEntries(created), research }, null, 2));
  emit({ has_map: true, map_ref: map.ref, tickets: tickets.length, research: research.length });
});
