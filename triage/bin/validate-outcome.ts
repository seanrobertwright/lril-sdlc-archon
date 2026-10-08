/** Standalone check of triage/outcome.json, staged into the run by preflight. */
import { join } from 'node:path';
import { readOutcome } from '../../.shared/triage.ts';

const artifacts = process.env.ARTIFACTS_DIR || join(import.meta.dir, '..');
const { problems } = readOutcome(artifacts);
if (problems.length > 0) {
  console.error(problems.map(problem => `- ${problem}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('outcome is applicable');
}
