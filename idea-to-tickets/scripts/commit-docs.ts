/**
 * Commit what the session left in the repo: glossary terms and ADRs written inline
 * by /domain-modeling, plus the local spec and tickets when the tracker is local.
 * Nothing else is staged.
 */
import { commitDocs } from '../../.shared/commit.ts';
import { emit, run, trimmed } from '../../.shared/io.ts';
import { SCRATCH } from '../../.shared/local.ts';
import { git } from '../../.shared/proc.ts';
import { entry } from '../../.shared/pack.ts';

run(() => {
  const specRef = trimmed(process.env.INPUTS_SPEC_REF);
  const slug = trimmed(process.env.INPUTS_SLUG);
  const tracker = trimmed(process.env.INPUTS_TRACKER);
  const committed = commitDocs(
    tracker === 'local' ? [`${SCRATCH}/${slug}/`] : [],
    `docs: shape ${slug} (glossary, ADRs${tracker === 'local' ? ', spec and tickets' : ''})`,
  );
  const branch = git('branch', '--show-current');
  const next =
    `Build it on this branch: archon workflow run ${entry('implement-spec')} ` +
    `--branch ${branch || '<branch>'} --input spec=${specRef} (or one ticket at a time with :implement).`;
  emit({ published: true, spec_ref: specRef, committed, next });
});
