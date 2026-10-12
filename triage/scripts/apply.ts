/**
 * Apply the approved triage outcome: exactly one category and one state label,
 * the comment, the close, and (for a rejected enhancement only) the
 * .out-of-scope/ record. Every tracker write is read back. Then commit the
 * glossary terms and ADRs the session wrote inline.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { commitDocs } from '../../.shared/commit.ts';
import { artifactsDir, emit, run, trimmed } from '../../.shared/io.ts';
import { appendComment, setField, write } from '../../.shared/local.ts';
import { exec, must } from '../../.shared/proc.ts';
import { CATEGORIES, closeIssue, comment, getIssue, issueNumber, readTrackerConfig, ROLES, setLabels } from '../../.shared/tracker.ts';
import { readOutcome } from '../../.shared/triage.ts';

function commitPaths(paths: string[], message: string): void {
  if (paths.length === 0) return;
  must(['git', 'add', '--', ...paths]);
  if (exec(['git', 'diff', '--cached', '--quiet']).code !== 0) must(['git', 'commit', '-m', message]);
}

run(() => {
  const artifacts = artifactsDir();
  const item = trimmed(process.env.INPUTS_ITEM);
  const { outcome, problems } = readOutcome(artifacts);
  if (outcome === undefined) throw new Error(`The triage outcome is not applicable:\n${problems.map(p => `- ${p}`).join('\n')}`);
  const config = readTrackerConfig();
  const stateLabel = config.labels[outcome.state];
  const repoPaths: string[] = [];

  if (outcome.out_of_scope !== null) {
    const path = join('.out-of-scope', outcome.out_of_scope.file).replace(/\\/g, '/');
    write(path, outcome.out_of_scope.content);
    repoPaths.push(path);
  }

  if (config.kind === 'github') {
    const number = issueNumber(item);
    if (number === undefined) throw new Error(`"${item}" is not an issue reference.`);
    const roleLabels = new Set<string>([...ROLES.map(role => config.labels[role]), ...CATEGORIES]);
    const kept = getIssue(number).labels.filter(label => !roleLabels.has(label));
    setLabels(number, [...kept, outcome.category, stateLabel]);
    if (outcome.comment.trim() !== '') comment(number, outcome.comment.trim());
    commitPaths(repoPaths, `docs: record ${outcome.out_of_scope?.file ?? ''} as out of scope (#${number})`);
    if (outcome.close) closeIssue(number, outcome.wontfix_reason === 'already-implemented' ? 'completed' : 'not_planned');
    const read = getIssue(number);
    if (!read.labels.includes(stateLabel) || !read.labels.includes(outcome.category)) {
      throw new Error(`#${number} did not read back with labels ${outcome.category} + ${stateLabel}.`);
    }
    if (outcome.close && read.state !== 'closed') throw new Error(`#${number} did not read back closed.`);
  } else {
    if (!existsSync(item)) throw new Error(`The local issue ${item} is gone.`);
    let body = setField(readFileSync(item, 'utf8'), 'Status', stateLabel);
    body = setField(body, 'Category', outcome.category);
    write(item, body);
    if (outcome.comment.trim() !== '') appendComment(item, outcome.comment.trim());
    repoPaths.push(item);
    commitPaths(repoPaths, `chore: triage ${item} as ${outcome.category}, ${stateLabel}`);
    if (!readFileSync(item, 'utf8').includes(stateLabel)) throw new Error(`${item} did not read back with ${stateLabel}.`);
  }

  commitDocs([], `docs: glossary and ADRs from triaging ${item}`);
  emit({
    item,
    category: outcome.category,
    state: stateLabel,
    closed: outcome.close,
    summary: `${item} → ${outcome.category}, ${stateLabel}${outcome.close ? ', closed' : ''}${outcome.out_of_scope ? `; recorded .out-of-scope/${outcome.out_of_scope.file}` : ''}.`,
  });
});
