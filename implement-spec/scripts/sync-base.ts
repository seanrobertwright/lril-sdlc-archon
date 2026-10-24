/** Merge the base branch in before the pull request is written; re-run the checks after a clean merge. */
import { artifactsDir, emit, run, trimmed } from '../../.shared/io.ts';
import { syncBase } from '../../.shared/sync.ts';

run(() => {
  emit(syncBase(trimmed(process.env.BASE_BRANCH), trimmed(process.env.INPUTS_START_SHA), artifactsDir()));
});
