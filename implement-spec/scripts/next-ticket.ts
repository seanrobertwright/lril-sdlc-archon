/** Pick the next frontier ticket (every blocker done), or declare the graph finished. */
import { join } from 'node:path';
import { readGraph, readState, ticketText } from '../../.shared/graph.ts';
import { artifactsDir, emit, run } from '../../.shared/io.ts';
import { write } from '../../.shared/local.ts';
import { git } from '../../.shared/proc.ts';
import { frontier } from '../../.shared/tickets.ts';

run(() => {
  const artifacts = artifactsDir();
  const graph = readGraph(artifacts);
  const done = new Set(readState(artifacts).done);
  const head = git('rev-parse', 'HEAD');
  const open = graph.tickets.filter(ticket => !done.has(ticket.key));
  if (open.length === 0) {
    emit({ all_done: true, key: '', ref: '', title: '', head_sha: head });
    return;
  }
  const ready = frontier(graph.tickets, done);
  const next = ready[0];
  if (next === undefined) {
    throw new Error(
      `No ticket is ready: ${open.map(ticket => ticket.key).join(', ')} still wait on blockers that are not done.`,
    );
  }
  write(join(artifacts, 'current', 'ticket.md'), ticketText(graph, next));
  emit({ all_done: false, key: next.key, ref: next.ref, title: next.title, head_sha: head });
});
