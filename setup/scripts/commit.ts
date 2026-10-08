/** Verify the written configuration reads back as the chosen tracker, then commit it. */
import { emit, run, trimmed } from '../../.shared/io.ts';
import { exec, must } from '../../.shared/proc.ts';
import { readTrackerConfig } from '../../.shared/tracker.ts';

run(() => {
  const agentsFile = trimmed(process.env.INPUTS_AGENTS_FILE);
  const tracker = trimmed(process.env.INPUTS_TRACKER);
  const read = readTrackerConfig();
  if (read.kind !== tracker) throw new Error(`docs/agents/issue-tracker.md reads back as ${read.kind}, not ${tracker}.`);
  must(['git', 'add', '--', 'docs/agents', agentsFile]);
  const staged = exec(['git', 'diff', '--cached', '--quiet']).code !== 0;
  if (staged) must(['git', 'commit', '-m', 'chore: configure agent skills (issue tracker, triage labels, domain docs)']);
  emit({
    tracker,
    committed: staged,
    summary:
      `Configured for the ${tracker === 'github' ? 'GitHub' : 'local markdown'} tracker; ${agentsFile} has an Agent skills block. ` +
      'Edit docs/agents/*.md directly later; re-run only to switch trackers.',
  });
});
