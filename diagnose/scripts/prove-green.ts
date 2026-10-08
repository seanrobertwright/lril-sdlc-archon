/**
 * After the fix: the same loop passes every time, the regression test passes (or the
 * missing seam is documented), no [DEBUG-...] instrumentation is left in the diff,
 * and the fix is committed.
 */
import { artifactsDir, emit, run, trimmed } from '../../.shared/io.ts';
import { RUNS, runLoop, TIMEOUT_MS } from '../../.shared/loop.ts';
import { exec, git, shell } from '../../.shared/proc.ts';

run(() => {
  if (trimmed(process.env.INPUTS_FIXED) !== 'true') throw new Error('The fix node did not declare the bug fixed.');
  const command = trimmed(process.env.INPUTS_COMMAND);
  const regression = trimmed(process.env.INPUTS_REGRESSION_TEST);
  const noSeam = trimmed(process.env.INPUTS_NO_SEAM);
  const start = trimmed(process.env.INPUTS_START);
  const extra: string[] = [];
  if (regression !== '') {
    const result = shell(regression, TIMEOUT_MS);
    extra.push(`## Regression test: exit ${result.code}`, '', `\`${regression}\``, '');
    if (result.code !== 0) throw new Error(`The regression test \`${regression}\` fails (exit ${result.code}).`);
  } else if (noSeam === '') {
    throw new Error('No regression test, and no documented reason why no correct seam exists.');
  }
  const seconds = runLoop(command, 'green', artifactsDir(), (result, attempt) => {
    if (result.code !== 0) throw new Error(`Run ${attempt} of \`${command}\` still fails after the fix (exit ${result.code}).`);
  }, extra);
  if (exec(['git', 'status', '--porcelain']).stdout.trim() !== '') throw new Error('Uncommitted changes remain; the fix must be committed.');
  if (Number(git('rev-list', '--count', `${start}..HEAD`)) === 0) throw new Error('Nothing was committed since the run started.');
  const leftovers = git('diff', `${start}..HEAD`).split('\n').filter(line => line.startsWith('+') && line.includes('[DEBUG-'));
  if (leftovers.length > 0) throw new Error(`[DEBUG-...] instrumentation is still in the diff:\n${leftovers.slice(0, 5).join('\n')}`);
  emit({ runs: RUNS, seconds });
});
