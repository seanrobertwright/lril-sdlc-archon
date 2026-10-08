/** Load the spec's task graph, snapshot the spec, and pin the integration branch's start. */
import { join, resolve } from 'node:path';
import { loadGraph, readState, specText, statePaths, writeState } from '../../.shared/graph.ts';
import { artifactsDir, emit, run, trimmed } from '../../.shared/io.ts';
import { write } from '../../.shared/local.ts';
import { exec, git } from '../../.shared/proc.ts';

run(() => {
  const artifacts = artifactsDir();
  const ref = trimmed(process.env.INPUTS_SPEC) || trimmed(process.env.ARGUMENTS);
  const graph = loadGraph(ref);
  const paths = statePaths(artifacts);
  write(paths.graph, JSON.stringify(graph, null, 2));
  // Resume-safe: keep what an earlier attempt of this run already finished.
  const prior = readState(artifacts).done;
  const done = [...new Set([...prior, ...graph.tickets.filter(ticket => ticket.done).map(ticket => ticket.key)])];
  writeState(artifacts, { done });
  const specPath = join(artifacts, 'work', 'spec.md');
  write(specPath, specText(graph));
  if (exec(['git', 'status', '--porcelain']).stdout.trim() !== '') {
    throw new Error('The integration branch has uncommitted changes. Start from a clean checkout.');
  }
  emit({
    tracker: graph.tracker,
    spec_ref: graph.spec.ref,
    spec_number: graph.spec.number,
    title: graph.spec.title,
    spec_path: resolve(specPath),
    start_sha: git('rev-parse', 'HEAD'),
    total: graph.tickets.length,
    open: graph.tickets.length - done.length,
  });
});
