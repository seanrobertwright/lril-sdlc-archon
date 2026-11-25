/** Resolve the ticket (or described work) and pin the commit this run starts from. */
import { checkLimitMs } from '../../.shared/checks.ts';
import { artifactsDir, emit, run, trimmed } from '../../.shared/io.ts';
import { git } from '../../.shared/proc.ts';
import { resolveWork } from '../../.shared/work.ts';

run(() => {
  checkLimitMs(); // A bad limit is refused now, not at a gate hours later.
  const ref = trimmed(process.env.INPUTS_TICKET) || trimmed(process.env.ARGUMENTS);
  const work = resolveWork(ref, artifactsDir());
  emit({ ...work, start_sha: git('rev-parse', 'HEAD') });
});
