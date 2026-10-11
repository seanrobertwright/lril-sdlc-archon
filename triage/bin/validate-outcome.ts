/**
 * Standalone check of triage/outcome.json, staged into the run by preflight. With
 * `--gate` (the loop's until_bash) it also needs the outcome approved as shown.
 */
import { join } from 'node:path';
import { verdict } from '../../.shared/approval.ts';
import { readOutcome } from '../../.shared/triage.ts';

const artifacts = process.env.ARTIFACTS_DIR || join(import.meta.dir, '..');
const dir = join(artifacts, 'triage');
const problems = verdict(readOutcome(artifacts).problems, [join(dir, 'outcome.json')], join(dir, 'shown.sha256'), process.argv);
if (problems.length > 0) {
  console.error(problems.map(problem => `- ${problem}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('outcome is applicable');
}
