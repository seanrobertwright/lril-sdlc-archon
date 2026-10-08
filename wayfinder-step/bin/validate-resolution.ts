/** Standalone check of wayfinder/resolution.json, staged into the run by load. */
import { join } from 'node:path';
import { readResolution } from '../../.shared/resolution.ts';

const artifacts = process.env.ARTIFACTS_DIR || join(import.meta.dir, '..');
const { problems } = readResolution(artifacts);
if (problems.length > 0) {
  console.error(problems.map(problem => `- ${problem}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('the resolution is recordable');
}
