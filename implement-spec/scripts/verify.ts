/** The one independent check run: the recorded check commands, re-run on the final tree. */
import { type AgentVerdict, verify } from '../../.shared/gate.ts';
import { artifactsDir, emit, parseJson, run, trimmed } from '../../.shared/io.ts';

/** A skipped agent's verdict arrives as '' or 'null'. */
function optional(label: string, text: string): AgentVerdict | null {
  return text === '' || text === 'null' ? null : parseJson<AgentVerdict>(label, text);
}

run(() => {
  emit(
    verify({
      startSha: trimmed(process.env.INPUTS_START_SHA),
      artifacts: artifactsDir(),
      fixer: optional('the review fixer verdict', trimmed(process.env.INPUTS_FIXER)),
      resolver: optional('the merge resolver verdict', trimmed(process.env.INPUTS_RESOLVER)),
    }),
  );
});
