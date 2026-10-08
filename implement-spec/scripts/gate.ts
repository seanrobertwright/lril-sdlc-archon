/** Green gate: the implementer's verdict, its declared checks re-run, and committed work. */
import { gate, type ImplementerVerdict } from '../../.shared/gate.ts';
import { artifactsDir, emit, parseJson, run, trimmed } from '../../.shared/io.ts';

run(() => {
  const verdict = parseJson<ImplementerVerdict>('the implementer verdict', trimmed(process.env.INPUTS_VERDICT));
  const startSha = trimmed(process.env.INPUTS_START_SHA);
  const label = trimmed(process.env.INPUTS_LABEL) || 'implement';
  emit(gate(verdict, startSha, artifactsDir(), label));
});
