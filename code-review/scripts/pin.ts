/**
 * Pin the review: resolve the fixed point, prove the diff is non-empty, find the
 * originating spec and every file that documents how code should be written.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { artifactsDir, emit, run, trimmed } from '../../.shared/io.ts';
import { write } from '../../.shared/local.ts';
import { git, tryGit } from '../../.shared/proc.ts';
import { getIssue, issueComments, issueNumber, readTrackerConfig } from '../../.shared/tracker.ts';

const STANDARD_NAMES = /^(coding[-_]standards|contributing|engineering|conventions?|style[-_]?guide)\.md$/i;

function standardsSources(): string[] {
  const found: string[] = [];
  const consider = (dir: string, depth: number): void => {
    if (!existsSync(dir) || depth > 3) return;
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '.git' || name === '.scratch') continue;
      const path = dir === '.' ? name : join(dir, name);
      if (statSync(path).isDirectory()) {
        if (dir === '.' && !['docs', '.archon', '.github'].includes(name)) continue;
        consider(path, depth + 1);
      } else if (STANDARD_NAMES.test(name) || (dir !== '.' && /standard|convention/i.test(name) && name.endsWith('.md'))) {
        found.push(path.replace(/\\/g, '/'));
      }
    }
  };
  consider('.', 0);
  return found.sort();
}

function fetchIssueAsSpec(number: number, target: string): void {
  const issue = getIssue(number);
  const comments = issueComments(number)
    .map(entry => `### Comment by ${entry.author} (${entry.created_at})\n\n${entry.body}`)
    .join('\n\n');
  write(target, `# #${issue.number}: ${issue.title}\n\n${issue.body}\n\n${comments}`);
}

function findSpec(explicit: string, fixed: string, target: string): { path: string; source: string } {
  if (explicit !== '') {
    if (existsSync(explicit)) {
      write(target, readFileSync(explicit, 'utf8'));
      return { path: target, source: `file ${explicit}` };
    }
    const number = issueNumber(explicit);
    if (number === undefined) throw new Error(`spec "${explicit}" is neither a file nor an issue reference.`);
    fetchIssueAsSpec(number, target);
    return { path: target, source: `issue #${number}` };
  }
  const messages = git('log', '--format=%B', `${fixed}..HEAD`);
  const referenced = messages.match(/(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|refs?)?\s*#(\d+)/i)?.[1];
  if (referenced !== undefined) {
    let github = false;
    try {
      github = readTrackerConfig().kind === 'github';
    } catch {
      github = false;
    }
    if (github) {
      fetchIssueAsSpec(Number(referenced), target);
      return { path: target, source: `issue #${referenced} (from commit messages)` };
    }
  }
  const branch = tryGit('branch', '--show-current') ?? '';
  if (existsSync('.scratch')) {
    for (const feature of readdirSync('.scratch')) {
      const spec = join('.scratch', feature, 'spec.md');
      if (existsSync(spec) && branch !== '' && branch.includes(feature)) {
        write(target, readFileSync(spec, 'utf8'));
        return { path: target, source: `file ${spec.replace(/\\/g, '/')} (matches branch)` };
      }
    }
  }
  return { path: '', source: 'no spec available' };
}

run(() => {
  const base = trimmed(process.env.INPUTS_BASE) || trimmed(process.env.BASE_BRANCH);
  const explicitSpec = trimmed(process.env.INPUTS_SPEC);
  if (base === '') throw new Error('No fixed point: pass --input base=<ref>, or configure a base branch.');
  const candidates = base.startsWith('origin/') || /^[0-9a-f]{7,40}$/.test(base) ? [base] : [`origin/${base}`, base];
  const fixed = candidates.find(ref => tryGit('rev-parse', '--verify', '--quiet', `${ref}^{commit}`) !== undefined);
  if (fixed === undefined) throw new Error(`The fixed point "${base}" does not resolve to a commit.`);
  const diffCommand = `git diff ${fixed}...HEAD`;
  const diff = git('diff', `${fixed}...HEAD`);
  if (diff === '') throw new Error(`Nothing to review: ${diffCommand} is empty.`);
  const commits = git('log', '--oneline', `${fixed}..HEAD`);
  const artifacts = artifactsDir();
  write(join(artifacts, 'review', 'diff.patch'), diff);
  write(join(artifacts, 'review', 'commits.txt'), commits);
  const spec = findSpec(explicitSpec, fixed, join(artifacts, 'review', 'spec-source.md'));
  const standards = standardsSources();
  write(join(artifacts, 'review', 'standards-sources.txt'), standards.length === 0 ? '(none documented)' : standards.join('\n'));
  emit({
    fixed_point: fixed,
    diff_command: diffCommand,
    commit_count: commits === '' ? 0 : commits.split('\n').length,
    spec_path: spec.path.replace(/\\/g, '/'),
    spec_source: spec.source,
    standards,
  });
});
