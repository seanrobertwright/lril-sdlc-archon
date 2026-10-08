/**
 * Standalone check for the charting session, staged into the run by preflight.
 * Exit 0 when either a valid map.json exists, or the session concluded no map is
 * needed (wayfinder/no-map.md).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mapProblems } from '../../.shared/wayfinder.ts';

const dir = join(process.env.ARTIFACTS_DIR || join(import.meta.dir, '..'), 'wayfinder');
let problems: string[];
if (existsSync(join(dir, 'no-map.md'))) {
  problems = [];
} else if (!existsSync(join(dir, 'map.json'))) {
  problems = ['wayfinder/map.json is missing'];
} else {
  try {
    problems = mapProblems(JSON.parse(readFileSync(join(dir, 'map.json'), 'utf8')));
  } catch {
    problems = ['wayfinder/map.json is not valid JSON'];
  }
}
if (problems.length > 0) {
  console.error(problems.map(problem => `- ${problem}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('the map is publishable');
}
