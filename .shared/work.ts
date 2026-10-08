/**
 * Resolve the work an implementer builds from: a GitHub issue, a local ticket file,
 * or a plain description. The ticket and any parent spec are copied into the run's
 * artifacts so every later node (implementer, reviewer, PR writer) reads the same
 * snapshot.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { featureDirOf, readTicket, write } from './local.ts';
import { getIssue, issueComments, issueNumber, parentIssue, readTrackerConfig } from './tracker.ts';

export interface Work {
  readonly kind: 'github' | 'local' | 'inline';
  readonly ref: string;
  readonly number: number;
  readonly title: string;
  /** The local ticket file, or ''. */
  readonly path: string;
  /** Absolute path of ticket + parent spec, the contract the Spec reviewer reads. */
  readonly spec_path: string;
  readonly has_parent_spec: boolean;
}

function issueText(number: number): { title: string; text: string } {
  const issue = getIssue(number);
  const comments = issueComments(number)
    .map(entry => `### Comment by ${entry.author} (${entry.created_at})\n\n${entry.body}`)
    .join('\n\n');
  return { title: issue.title, text: `# #${issue.number}: ${issue.title}\n\n${issue.body}\n\n${comments}`.trim() };
}

export function resolveWork(ref: string, artifacts: string): Work {
  const dir = join(artifacts, 'work');
  const ticketPath = join(dir, 'ticket.md');
  const parentPath = join(dir, 'spec.md');
  const combinedPath = join(dir, 'work-spec.md');
  const combine = (ticket: string, parent: string | undefined): string =>
    parent === undefined ? ticket : `${ticket}\n\n---\n\n# Parent spec\n\n${parent}`;

  if (ref === '') throw new Error('No work given: pass a ticket (issue number, URL, or file path) or describe the work.');

  if (existsSync(ref)) {
    const ticket = readTicket(ref);
    const specFile = join(featureDirOf(ref), 'spec.md');
    const parent = existsSync(specFile) && resolve(specFile) !== resolve(ref) ? readFileSync(specFile, 'utf8') : undefined;
    write(ticketPath, ticket.body);
    if (parent !== undefined) write(parentPath, parent);
    write(combinedPath, combine(ticket.body, parent));
    return {
      kind: 'local',
      ref: ref.replace(/\\/g, '/'),
      number: 0,
      title: ticket.title,
      path: ref.replace(/\\/g, '/'),
      spec_path: resolve(combinedPath),
      has_parent_spec: parent !== undefined,
    };
  }

  const number = issueNumber(ref);
  if (number !== undefined) {
    if (readTrackerConfig().kind !== 'github') {
      throw new Error(`"${ref}" looks like an issue number, but this repo's tracker is local markdown. Pass the ticket file path.`);
    }
    const ticket = issueText(number);
    const fromApi = parentIssue(number)?.number;
    const fromBody = getIssue(number).body.match(/##\s*Parent\s*\n[\s\S]*?#(\d+)/i)?.[1];
    const parentNumber = fromApi ?? (fromBody === undefined ? undefined : Number(fromBody));
    const parent = parentNumber === undefined ? undefined : issueText(parentNumber).text;
    write(ticketPath, ticket.text);
    if (parent !== undefined) write(parentPath, parent);
    write(combinedPath, combine(ticket.text, parent));
    return {
      kind: 'github',
      ref: `#${number}`,
      number,
      title: ticket.title,
      path: '',
      spec_path: resolve(combinedPath),
      has_parent_spec: parent !== undefined,
    };
  }

  const text = `# Work\n\n${ref}`;
  write(ticketPath, text);
  write(combinedPath, text);
  return {
    kind: 'inline',
    ref: 'inline description',
    number: 0,
    title: ref.split('\n')[0]?.slice(0, 72) ?? 'inline work',
    path: '',
    spec_path: resolve(combinedPath),
    has_parent_spec: false,
  };
}
