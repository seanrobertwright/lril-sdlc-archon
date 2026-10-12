/**
 * Standalone validator for the shape session. preflight bundles this into the run's
 * artifacts so the loop's until_bash and the session itself can run the same check:
 * exit 0 when spec.md and tickets.json are publishable, else the problems on stderr.
 * With `--gate` (the until_bash) both files must also have been approved as shown.
 */
import { join } from 'node:path';
import { verdict } from '../../.shared/approval.ts';
import { checkShape } from '../../.shared/shape.ts';

const artifacts = process.env.ARTIFACTS_DIR || join(import.meta.dir, '..');
const dir = join(artifacts, 'shape');
const problems = verdict(
  checkShape(dir).problems,
  [join(dir, 'spec.md'), join(dir, 'tickets.json')],
  join(dir, 'shown.sha256'),
  process.argv,
);
if (problems.length > 0) {
  console.error(problems.map(problem => `- ${problem}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('shape is publishable');
}
