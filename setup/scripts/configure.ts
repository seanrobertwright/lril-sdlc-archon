/**
 * Write the per-repo configuration Matt Pocock's engineering skills (and this pack)
 * read: docs/agents/issue-tracker.md, triage-labels.md and domain.md from his seed
 * templates, and the `## Agent skills` block in CLAUDE.md or AGENTS.md.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { emit, run, trimmed } from '../../.shared/io.ts';
import { write } from '../../.shared/local.ts';

const TEMPLATES = join(import.meta.dir, '..', 'templates');

/**
 * A seed template as written to the repo: verbatim, except that a code fence opened
 * with no language gets `text`. Markdownlint's MD040 rejects a bare fence, so a repo
 * whose pre-commit hook lints markdown refused setup's commit.
 */
function template(name: string): string {
  let inFence = false;
  return readFileSync(join(TEMPLATES, name), 'utf8')
    .split('\n')
    .map(line => {
      const fence = /^(\s*)```(.*)$/.exec(line);
      if (fence === null) return line;
      inFence = !inFence;
      return inFence && fence[2]!.trim() === '' ? `${fence[1]}\`\`\`text` : line;
    })
    .join('\n');
}

function block(tracker: 'github' | 'local'): string {
  const where =
    tracker === 'github' ? 'Issues live in GitHub Issues (uses `gh`)' : 'Issues live as markdown files under `.scratch/`';
  return [
    '## Agent skills',
    '',
    '### Issue tracker',
    '',
    `${where}. See \`docs/agents/issue-tracker.md\`.`,
    '',
    '### Triage labels',
    '',
    'The five canonical triage roles, each label string equal to its name. See `docs/agents/triage-labels.md`.',
    '',
    '### Domain docs',
    '',
    'Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.',
    '',
  ].join('\n');
}

/**
 * Replace an existing `## Agent skills` section in place, or append one. A new file opens
 * with a top-level heading, which markdownlint's MD041 requires of a file's first line.
 */
function withBlock(existing: string, section: string): string {
  const start = existing.search(/^## Agent skills\s*$/m);
  if (start === -1) return existing.trim() === '' ? `# Agent instructions\n\n${section}` : `${existing.trimEnd()}\n\n${section}`;
  const after = existing.slice(start + 1);
  const next = after.search(/^## /m);
  const rest = next === -1 ? '' : existing.slice(start + 1 + next);
  return `${existing.slice(0, start)}${section.trimEnd()}\n${rest === '' ? '' : `\n${rest}`}`;
}

run(() => {
  const requested = trimmed(process.env.INPUTS_TRACKER) || 'auto';
  const agentsInput = trimmed(process.env.INPUTS_AGENTS_FILE) || 'auto';
  const overwrite = trimmed(process.env.INPUTS_OVERWRITE) === 'true';
  const githubRepo = trimmed(process.env.INPUTS_GITHUB_REPO);
  if (!['auto', 'github', 'local'].includes(requested)) {
    throw new Error(`tracker must be auto, github or local (got "${requested}").`);
  }
  if (requested === 'github' && githubRepo === '') throw new Error('tracker=github, but origin is not a GitHub remote.');
  const tracker: 'github' | 'local' = requested === 'auto' ? (githubRepo === '' ? 'local' : 'github') : requested === 'github' ? 'github' : 'local';

  const written: string[] = [];
  const kept: string[] = [];
  const files: [string, string][] = [
    ['docs/agents/issue-tracker.md', template(tracker === 'github' ? 'issue-tracker-github.md' : 'issue-tracker-local.md')],
    ['docs/agents/triage-labels.md', template('triage-labels.md')],
    ['docs/agents/domain.md', template('domain.md')],
  ];
  for (const [path, content] of files) {
    if (existsSync(path) && !overwrite) {
      kept.push(path);
      continue;
    }
    write(path, content);
    written.push(path);
  }

  let agentsFile: string;
  if (agentsInput === 'auto') {
    agentsFile = existsSync('CLAUDE.md') ? 'CLAUDE.md' : existsSync('AGENTS.md') ? 'AGENTS.md' : 'CLAUDE.md';
  } else if (agentsInput === 'CLAUDE.md' || agentsInput === 'AGENTS.md') {
    agentsFile = agentsInput;
    const other = agentsFile === 'CLAUDE.md' ? 'AGENTS.md' : 'CLAUDE.md';
    if (!existsSync(agentsFile) && existsSync(other)) {
      throw new Error(`${other} already exists; edit that one rather than creating ${agentsFile}.`);
    }
  } else {
    throw new Error(`agents_file must be auto, CLAUDE.md or AGENTS.md (got "${agentsInput}").`);
  }
  const before = existsSync(agentsFile) ? readFileSync(agentsFile, 'utf8') : '';
  write(agentsFile, withBlock(before, block(tracker)));
  written.push(agentsFile);
  emit({ tracker, agents_file: agentsFile, written, kept });
});
