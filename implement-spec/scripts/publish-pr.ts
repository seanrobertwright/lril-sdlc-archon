/** Push the integration branch and open or update its PR, closing the spec and every ticket. */
import { join } from 'node:path';
import { readGraph } from '../../.shared/graph.ts';
import { artifactsDir, emit, run, trimmed } from '../../.shared/io.ts';
import { publishPr } from '../../.shared/pr.ts';

run(() => {
  const artifacts = artifactsDir();
  const graph = readGraph(artifacts);
  const closes =
    graph.tracker === 'github' ? [graph.spec.number, ...graph.tickets.map(ticket => Number(ticket.key.slice(1)))] : [];
  const title = trimmed(process.env.INPUTS_TITLE) || graph.spec.title;
  emit({
    pr_url: publishPr({ title, bodyPath: join(artifacts, 'pr', 'body.md'), closes, base: trimmed(process.env.INPUTS_BASE), draft: false }),
  });
});
