/**
 * Create every label the pack applies that the GitHub repo lacks: the triage
 * categories and states (using this repo's mapped strings) and the wayfinder
 * labels. Read back afterwards.
 */
import { report, run } from '../../.shared/io.ts';
import { must } from '../../.shared/proc.ts';
import { readTrackerConfig, ROLES } from '../../.shared/tracker.ts';

const WAYFINDER = ['wayfinder:map', 'wayfinder:research', 'wayfinder:prototype', 'wayfinder:grilling', 'wayfinder:task'];

function labels(): Set<string> {
  const listed = JSON.parse(must(['gh', 'label', 'list', '--limit', '500', '--json', 'name'])) as { name: string }[];
  return new Set(listed.map(label => label.name));
}

run(() => {
  const config = readTrackerConfig();
  const wanted = [...new Set(['bug', 'enhancement', ...ROLES.map(role => config.labels[role]), ...WAYFINDER])];
  const existing = labels();
  const created = wanted.filter(label => !existing.has(label));
  for (const label of created) must(['gh', 'label', 'create', label, '--force']);
  const after = labels();
  const missing = wanted.filter(label => !after.has(label));
  if (missing.length > 0) throw new Error(`Labels did not read back: ${missing.join(', ')}`);
  report(created.length === 0 ? 'All labels already existed.' : `Created labels: ${created.join(', ')}`);
});
