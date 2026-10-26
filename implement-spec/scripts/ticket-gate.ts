/**
 * A ticket counts as done only when its implementer is green, it declared its check
 * commands, and its work is committed. The checks are not re-run here for a green
 * implementer: `verify` re-runs them once on the whole branch. An implementer that met
 * every acceptance criterion but did not report green has them run here (see `gate`). Locally, the ticket file is marked done too, so the
 * tracker agrees with the branch.
 */
import { readFileSync } from 'node:fs';
import { gate, type ImplementerVerdict } from '../../.shared/gate.ts';
import { readGraph, readState, writeState } from '../../.shared/graph.ts';
import { artifactsDir, emit, parseJson, run, trimmed } from '../../.shared/io.ts';
import { setField, write } from '../../.shared/local.ts';
import { must } from '../../.shared/proc.ts';

run(() => {
  const artifacts = artifactsDir();
  const key = trimmed(process.env.INPUTS_KEY);
  const verdict = parseJson<ImplementerVerdict>(`the implementer verdict for ${key}`, trimmed(process.env.INPUTS_VERDICT));
  gate(verdict, trimmed(process.env.INPUTS_HEAD_SHA), artifacts);
  const graph = readGraph(artifacts);
  const ticket = graph.tickets.find(entry => entry.key === key);
  if (ticket === undefined) throw new Error(`Ticket ${key} is not in the graph.`);
  if (graph.tracker === 'local') {
    write(ticket.ref, setField(readFileSync(ticket.ref, 'utf8'), 'Status', 'done'));
    must(['git', 'add', '--', ticket.ref]);
    must(['git', 'commit', '-m', `chore: mark ticket ${key} done`]);
  }
  const done = [...new Set([...readState(artifacts).done, key])];
  writeState(artifacts, { done });
  const remaining = graph.tickets.filter(entry => !done.includes(entry.key)).length;
  emit({ key, remaining });
});
