/**
 * Standalone check of wayfinder/resolution.json, staged into the run by load. With
 * `--gate` (the loop's until_bash) it also needs the resolution approved as shown.
 */
import { join } from 'node:path';
import { verdict } from '../../.shared/approval.ts';
import { readResolution } from '../../.shared/resolution.ts';

const artifacts = process.env.ARTIFACTS_DIR || join(import.meta.dir, '..');
const dir = join(artifacts, 'wayfinder');
const problems = verdict(readResolution(artifacts).problems, [join(dir, 'resolution.json')], join(dir, 'shown.sha256'), process.argv);
if (problems.length > 0) {
  console.error(problems.map(problem => `- ${problem}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('the resolution is recordable');
}
