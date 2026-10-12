/**
 * Verify the written configuration reads back as the chosen tracker, then commit
 * it. A glossary still under its pre-v1.3 name is named in the summary with the
 * rename Matt's changelog gives, since his skills now read only GLOSSARY.md.
 */
import { existsSync } from 'node:fs';
import { emit, note, run, trimmed } from '../../.shared/io.ts';
import { exec, must } from '../../.shared/proc.ts';
import { readTrackerConfig } from '../../.shared/tracker.ts';

/** `git mv` commands for each root CONTEXT*.md that has no GLOSSARY*.md beside it. */
function legacyGlossaryMoves(): string[] {
  const renames: [string, string][] = [
    ['CONTEXT.md', 'GLOSSARY.md'],
    ['CONTEXT-MAP.md', 'GLOSSARY-MAP.md'],
  ];
  return renames.filter(([from, to]) => existsSync(from) && !existsSync(to)).map(([from, to]) => `git mv ${from} ${to}`);
}

run(() => {
  const agentsFile = trimmed(process.env.INPUTS_AGENTS_FILE);
  const tracker = trimmed(process.env.INPUTS_TRACKER);
  const read = readTrackerConfig();
  if (read.kind !== tracker) throw new Error(`docs/agents/issue-tracker.md reads back as ${read.kind}, not ${tracker}.`);
  must(['git', 'add', '--', 'docs/agents', agentsFile]);
  const staged = exec(['git', 'diff', '--cached', '--quiet']).code !== 0;
  if (staged) must(['git', 'commit', '-m', 'chore: configure agent skills (issue tracker, triage labels, domain docs)']);
  const moves = legacyGlossaryMoves();
  const legacy =
    moves.length === 0
      ? ''
      : ' This repo keeps its glossary under the name Matt\'s skills used before v1.3; they now read only GLOSSARY.md ' +
        `and GLOSSARY-MAP.md. Rename it (${moves.join('; ')}) and update anything that points at the old name. ` +
        'If the map lists per-context CONTEXT.md files, rename those too.';
  if (legacy !== '') note(legacy.trim());
  emit({
    tracker,
    committed: staged,
    summary:
      `Configured for the ${tracker === 'github' ? 'GitHub' : 'local markdown'} tracker; ${agentsFile} has an Agent skills block. ` +
      `Edit docs/agents/*.md directly later; re-run only to switch trackers.${legacy}`,
  });
});
