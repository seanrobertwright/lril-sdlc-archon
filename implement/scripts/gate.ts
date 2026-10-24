/** Green gate: the implementer's verdict, its declared checks recorded for verify, and committed work. */
import { gate, type ImplementerVerdict } from '../../.shared/gate.ts';
import { artifactsDir, emit, parseJson, run, trimmed } from '../../.shared/io.ts';

run(() => {
  const verdict = parseJson<ImplementerVerdict>('the implementer verdict', trimmed(process.env.INPUTS_VERDICT));
  emit(gate(verdict, trimmed(process.env.INPUTS_START_SHA), artifactsDir()));
});
