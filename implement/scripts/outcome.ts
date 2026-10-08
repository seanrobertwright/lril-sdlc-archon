/** One terminal record for the run: what was built, the review line, and the PR if any. */
import { emit, run, trimmed } from '../../.shared/io.ts';

run(() => {
  const pr = trimmed(process.env.INPUTS_PR_URL);
  const parts = [
    `Built ${trimmed(process.env.INPUTS_TITLE)} (${trimmed(process.env.INPUTS_REF)}); checks re-run green and committed.`,
    `Review: ${trimmed(process.env.INPUTS_REVIEW)}`,
    pr === '' || pr === 'null' ? 'No pull request opened (pass --input pr=true to open one).' : `PR: ${pr}`,
  ];
  emit({ green: true, summary: parts.join(' ') });
});
