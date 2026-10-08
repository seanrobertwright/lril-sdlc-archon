/**
 * Record the resolution on the map: the answer on the ticket, the ticket closed, a
 * context pointer in Decisions so far; then the map's changes (new tickets created
 * and wired, fog graduated, tickets ruled out of scope or invalidated); then commit
 * the glossary/ADRs (and a local map).
 */
import { dirname } from 'node:path';
import { commitDocs } from '../../.shared/commit.ts';
import { artifactsDir, emit, run, trimmed } from '../../.shared/io.ts';
import { readResolution } from '../../.shared/resolution.ts';
import { readTrackerConfig } from '../../.shared/tracker.ts';
import { entry } from '../../.shared/pack.ts';
import {
  closeOffRoute,
  createDecisions,
  mapBody,
  mapTickets,
  replaceSection,
  resolveMap,
  resolveTicket,
  setMapBody,
} from '../../.shared/wayfinder.ts';

run(() => {
  const artifacts = artifactsDir();
  const { resolution, problems } = readResolution(artifacts);
  if (resolution === undefined) throw new Error(`The resolution is not recordable:\n${problems.map(p => `- ${p}`).join('\n')}`);
  const map = resolveMap(readTrackerConfig().kind, trimmed(process.env.INPUTS_MAP_REF));
  const ticketRef = trimmed(process.env.INPUTS_TICKET_REF);
  const ticket = mapTickets(map).find(entry => entry.ref === ticketRef);
  if (ticket === undefined) throw new Error(`${ticketRef} is no longer on map ${map.ref}.`);

  resolveTicket(map, ticket, resolution.answer, resolution.gist);
  createDecisions(map, resolution.new_tickets);
  if (resolution.not_yet_specified !== null) {
    setMapBody(map, replaceSection(mapBody(map), 'Not yet specified', resolution.not_yet_specified || '_Nothing yet._'));
  }
  const tickets = mapTickets(map);
  for (const entry of resolution.out_of_scope) {
    const target = tickets.find(t => t.ref === entry.ref);
    if (target?.open) closeOffRoute(map, target, `Ruled out of scope: ${entry.line}`, entry.line);
  }
  for (const entry of resolution.close_tickets) {
    const target = tickets.find(t => t.ref === entry.ref);
    if (target?.open) closeOffRoute(map, target, `Invalidated by ${ticket.title}: ${entry.reason}`, undefined);
  }
  const after = mapTickets(map);
  if (after.find(t => t.ref === ticket.ref)?.open) throw new Error(`${ticket.ref} did not read back resolved.`);
  const openLeft = after.filter(t => t.open).length;
  const committed = commitDocs(map.tracker === 'local' ? [`${dirname(map.ref)}/`] : [], `docs: resolve ${ticket.title} on ${map.ref}`);
  emit({
    resolved: `${ticket.ref} ${ticket.title}`,
    new_tickets: resolution.new_tickets.length,
    closed: resolution.out_of_scope.length + resolution.close_tickets.length,
    open_left: openLeft,
    committed,
    next:
      openLeft === 0
        ? `The map is clear. Hand off: collapse its decisions into a spec with ${entry('idea-to-tickets')}.`
        : `Next decision: archon workflow run ${entry('wayfinder-step')} --input map=${map.ref}`,
  });
});
