/**
 * What needs the maintainer's attention, oldest first: never triaged, needs-triage,
 * and needs-info with reporter activity since the last triage notes. Or, in
 * "ready" mode, what agents can pick up.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { artifactsDir, report, run, trimmed } from '../../.shared/io.ts';
import { readTicket, SCRATCH, write } from '../../.shared/local.ts';
import { must } from '../../.shared/proc.ts';
import { issueComments, readTrackerConfig, ROLES } from '../../.shared/tracker.ts';

interface Line {
  readonly ref: string;
  readonly title: string;
  readonly created: string;
}

function render(buckets: [string, Line[]][]): string {
  return buckets
    .map(([name, lines]) =>
      [`## ${name} (${lines.length})`, '', ...(lines.length === 0 ? ['_none_'] : lines.map(l => `- ${l.ref}: ${l.title} (${l.created.slice(0, 10)})`))].join('\n'),
    )
    .join('\n\n');
}

run(() => {
  const config = readTrackerConfig();
  const mode = trimmed(process.env.INPUTS_MODE);
  const stateLabels = new Set(ROLES.map(role => config.labels[role]));
  let buckets: [string, Line[]][];

  if (config.kind === 'github') {
    const issues = JSON.parse(
      must(['gh', 'issue', 'list', '--state', 'open', '--limit', '500', '--json', 'number,title,labels,createdAt,author']),
    ) as { number: number; title: string; labels: { name: string }[]; createdAt: string; author: { login: string } }[];
    const line = (issue: (typeof issues)[number]): Line => ({ ref: `#${issue.number}`, title: issue.title, created: issue.createdAt });
    const has = (issue: (typeof issues)[number], label: string): boolean => issue.labels.some(l => l.name === label);
    const oldest = (list: typeof issues): typeof issues => [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (mode === 'ready') {
      buckets = [['ready-for-agent', oldest(issues.filter(i => has(i, config.labels['ready-for-agent']))).map(line)]];
    } else {
      const needsInfo = oldest(issues.filter(i => has(i, config.labels['needs-info']))).filter(issue => {
        const comments = issueComments(issue.number);
        const lastNotes = comments.map(c => c.body.includes('## Triage Notes')).lastIndexOf(true);
        return comments.slice(lastNotes + 1).some(c => c.author === issue.author.login);
      });
      buckets = [
        ['Unlabeled (never triaged)', oldest(issues.filter(i => !i.labels.some(l => stateLabels.has(l.name)))).map(line)],
        ['needs-triage', oldest(issues.filter(i => has(i, config.labels['needs-triage']))).map(line)],
        ['needs-info with reporter activity', needsInfo.map(line)],
      ];
    }
  } else {
    const files = existsSync(SCRATCH)
      ? readdirSync(SCRATCH, { recursive: true, encoding: 'utf8' })
          .map(path => join(SCRATCH, path))
          .filter(path => /[\\/]issues[\\/]\d+.*\.md$/.test(path) && !readFileSync(path, 'utf8').includes('Type:'))
      : [];
    const tickets = files.map(path => readTicket(path));
    const line = (t: (typeof tickets)[number]): Line => ({ ref: t.path.replace(/\\/g, '/'), title: t.title, created: '' });
    buckets =
      mode === 'ready'
        ? [['ready-for-agent', tickets.filter(t => t.status === config.labels['ready-for-agent']).map(line)]]
        : [
            ['Unlabeled (never triaged)', tickets.filter(t => !stateLabels.has(t.status) && !/^done$/i.test(t.status)).map(line)],
            ['needs-triage', tickets.filter(t => t.status === config.labels['needs-triage']).map(line)],
            ['needs-info', tickets.filter(t => t.status === config.labels['needs-info']).map(line)],
          ];
  }
  const text = `# ${mode === 'ready' ? 'Ready for agents' : 'Needs your attention'}\n\n${render(buckets)}\n\nTriage one with: --input target=<issue>`;
  write(join(artifactsDir(), 'triage', 'attention.md'), text);
  report(text);
});
