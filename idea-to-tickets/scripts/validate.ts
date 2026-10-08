/** Certify the approved shape once more before anything is published. */
import { join } from 'node:path';
import { artifactsDir, emit, run } from '../../.shared/io.ts';
import { checkShape } from '../../.shared/shape.ts';

run(() => {
  const shape = checkShape(join(artifactsDir(), 'shape'));
  if (shape.problems.length > 0 || shape.draft === undefined) {
    throw new Error(`The shaped spec and tickets are not publishable:\n${shape.problems.map(p => `- ${p}`).join('\n')}`);
  }
  emit({ title: shape.draft.feature.title, slug: shape.draft.feature.slug, tickets: shape.draft.tickets.length });
});
