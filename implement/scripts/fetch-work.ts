/** Resolve the ticket (or described work) and pin the commit this run starts from. */
import { artifactsDir, emit, run, trimmed } from '../../.shared/io.ts';
import { git } from '../../.shared/proc.ts';
import { resolveWork } from '../../.shared/work.ts';

run(() => {
  const ref = trimmed(process.env.INPUTS_TICKET) || trimmed(process.env.ARGUMENTS);
  const work = resolveWork(ref, artifactsDir());
  emit({ ...work, start_sha: git('rev-parse', 'HEAD') });
});
