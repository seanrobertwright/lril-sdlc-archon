/**
 * "No red-capable command, no Phase 2." On the unfixed code the loop fails every
 * time, and its output carries the user's symptom: wrong bug, wrong fix.
 */
import { artifactsDir, emit, run, trimmed } from '../../.shared/io.ts';
import { RUNS, runLoop } from '../../.shared/loop.ts';

run(() => {
  const command = trimmed(process.env.INPUTS_COMMAND);
  const symptom = trimmed(process.env.INPUTS_SYMPTOM);
  const seconds = runLoop(command, 'red', artifactsDir(), (result, attempt) => {
    if (result.code === 0) throw new Error(`Run ${attempt} of \`${command}\` passed on the unfixed code: the loop is not red on this bug.`);
    if (symptom !== '' && !result.output.includes(symptom)) {
      throw new Error(`Run ${attempt} failed, but not with the user's symptom ("${symptom}"). Wrong bug, wrong fix.`);
    }
  });
  emit({ runs: RUNS, seconds });
});
