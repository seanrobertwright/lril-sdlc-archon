/**
 * Load the map at low resolution, choose the ticket (the named one, or the first on
 * the frontier), and claim it before any work so concurrent sessions skip it.
 */
import { join } from 'node:path';
import { artifactsDir, emit, refuse, trimmed } from '../../.shared/io.ts';
import { write } from '../../.shared/local.ts';
import { stageValidator } from '../../.shared/stage.ts';
import { readTrackerConfig } from '../../.shared/tracker.ts';
import { claim, mapBody, mapFrontier, mapTickets, resolveMap, ticketBody } from '../../.shared/wayfinder.ts';

try {
  const artifacts = artifactsDir();
  const tracker = readTrackerConfig().kind;
  const mapInput = trimmed(process.env.INPUTS_MAP) || trimmed(process.env.ARGUMENTS);
  if (mapInput === '') throw new Error('No map given: pass --input map=<map issue or .scratch/<effort>/map.md>.');
  const map = resolveMap(tracker, mapInput);
  const tickets = mapTickets(map);
  const dir = join(artifacts, 'wayfinder');
  write(join(dir, 'map.md'), mapBody(map));
  write(join(dir, 'tickets.json'), JSON.stringify(tickets.map(ticket => ticket.ref)));
  write(join(dir, 'tickets-index.md'), tickets.map(t => `- ${t.ref} [${t.type}] ${t.open ? 'open' : 'closed'}${t.claimed ? ', claimed' : ''}${t.blockedBy.length > 0 ? `, blocked by ${t.blockedBy.join(', ')}` : ''}: ${t.title}`).join('\n'));

  const named = trimmed(process.env.INPUTS_TICKET).replace(/^#?/, tracker === 'github' ? '#' : '');
  const open = tickets.filter(ticket => ticket.open);
  if (named === '' && open.length === 0) {
    emit({ tracker, map_ref: map.ref, ticket_ref: '', title: '', type: 'none' });
  } else {
    const frontier = mapFrontier(tickets);
    const chosen = named !== '' && named !== '#' ? tickets.find(ticket => ticket.ref === named || ticket.ref === named.padStart(2, '0')) : frontier[0];
    if (chosen === undefined) {
      throw new Error(
        named !== '' && named !== '#'
          ? `Ticket ${named} is not on map ${map.ref}.`
          : `No ticket is on the frontier: every open ticket is blocked or claimed (${open.map(t => t.ref).join(', ')}).`,
      );
    }
    if (!chosen.open) throw new Error(`${chosen.ref} is already resolved.`);
    if (!['research', 'prototype', 'grilling', 'task'].includes(chosen.type)) {
      throw new Error(`${chosen.ref} has no wayfinder type label (research, prototype, grilling or task).`);
    }
    claim(map, chosen);
    write(join(dir, 'ticket.md'), ticketBody(map, chosen));
    await stageValidator(join(import.meta.dir, '..', 'bin', 'validate-resolution.ts'), artifacts, 'validate-resolution');
    emit({ tracker, map_ref: map.ref, ticket_ref: chosen.ref, title: chosen.title, type: chosen.type });
  }
} catch (error) {
  refuse(error instanceof Error ? error.message : String(error));
}
