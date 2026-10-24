/** One terminal record: the spec, how many tickets landed, the review line, any flaky check, the PR. */
import { flakyLine } from '../../.shared/checks.ts';
import { artifactsDir, emit, run, trimmed } from '../../.shared/io.ts';

run(() => {
  const pr = trimmed(process.env.INPUTS_PR_URL);
  const parts = [
    `Implemented ${trimmed(process.env.INPUTS_TITLE)} (${trimmed(process.env.INPUTS_SPEC_REF)}): ${trimmed(process.env.INPUTS_TOTAL)} ticket(s) on this integration branch, each gated green, checks re-run green on the final tree.`,
    `Review: ${trimmed(process.env.INPUTS_REVIEW)}`,
    flakyLine(artifactsDir()),
    pr === '' || pr === 'null' ? 'No pull request opened.' : `PR: ${pr}`,
  ];
  emit({ green: true, summary: parts.filter(part => part !== '').join(' ') });
});
