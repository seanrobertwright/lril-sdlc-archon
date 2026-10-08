/**
 * Resolve each research ticket from its findings file: the findings as the
 * resolution, the ticket closed, and a context pointer appended to the map's
 * Decisions so far. A research ticket without findings stays open on the frontier.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { artifactsDir, note, report, run, trimmed } from '../../.shared/io.ts';
import { readTrackerConfig } from '../../.shared/tracker.ts';
import { mapTickets, resolveMap, resolveTicket } from '../../.shared/wayfinder.ts';

interface Resolution {
  key: string;
  gist: string;
}

run(() => {
  const artifacts = artifactsDir();
  const map = resolveMap(readTrackerConfig().kind, trimmed(process.env.INPUTS_MAP_REF));
  const published = JSON.parse(readFileSync(join(artifacts, 'wayfinder', 'published.json'), 'utf8')) as {
    research: { key: string; ref: string }[];
  };
  const resolutionsPath = join(artifacts, 'research', 'resolutions.json');
  if (!existsSync(resolutionsPath)) throw new Error('research/resolutions.json was not written.');
  const resolutions = JSON.parse(readFileSync(resolutionsPath, 'utf8')) as Resolution[];
  const tickets = mapTickets(map);
  const done: string[] = [];
  for (const entry of published.research) {
    const resolution = resolutions.find(r => r.key === entry.key);
    const findings = join(artifacts, 'research', `${entry.key}.md`);
    const ticket = tickets.find(t => t.ref === entry.ref);
    if (resolution === undefined || !existsSync(findings) || ticket === undefined) {
      note(`Research ticket ${entry.ref} has no findings; it stays open on the frontier.`);
      continue;
    }
    resolveTicket(map, ticket, readFileSync(findings, 'utf8'), resolution.gist);
    done.push(entry.ref);
  }
  report(done.length === 0 ? 'No research tickets resolved.' : `Resolved research tickets: ${done.join(', ')}`);
});
