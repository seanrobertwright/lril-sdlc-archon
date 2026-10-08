/**
 * Standalone validator for the shape session. preflight bundles this into the run's
 * artifacts so the loop's until_bash and the session itself can run the same check:
 * exit 0 when spec.md and tickets.json are publishable, else the problems on stderr.
 */
import { join } from 'node:path';
import { checkShape } from '../../.shared/shape.ts';

const artifacts = process.env.ARTIFACTS_DIR || join(import.meta.dir, '..');
const { problems } = checkShape(join(artifacts, 'shape'));
if (problems.length > 0) {
  console.error(problems.map(problem => `- ${problem}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('shape is publishable');
}
