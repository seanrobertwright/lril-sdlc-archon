/** The terminal record, plus where the flow goes next. */
import { emit, run, trimmed } from '../../.shared/io.ts';

run(() => {
  const noSeam = trimmed(process.env.INPUTS_NO_SEAM);
  const next = [
    'Run lril-retro on this run: what would have prevented this bug?',
    noSeam === '' ? '' : `No correct seam existed (${noSeam}); that is a job for lril-architecture.`,
  ].filter(Boolean).join(' ');
  emit({ fixed: true, summary: `Root cause: ${trimmed(process.env.INPUTS_HYPOTHESIS)}. ${trimmed(process.env.INPUTS_SUMMARY)}`, next });
});
