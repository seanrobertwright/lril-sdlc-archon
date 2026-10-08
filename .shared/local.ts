/**
 * The local-markdown issue tracker, exactly as Matt Pocock's
 * `issue-tracker-local.md` defines it:
 *
 * - one feature per directory: `.scratch/<feature-slug>/`
 * - the spec at `.scratch/<feature-slug>/spec.md`
 * - one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`
 * - triage state as a `Status:` line near the top of each issue file
 * - comments appended under a `## Comments` heading
 *
 * Wayfinder maps use the same tree: `.scratch/<effort>/map.md` plus child tickets
 * carrying `Type:`, `Status:` and `Blocked by:` lines.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

export const SCRATCH = '.scratch';

export interface LocalTicket {
  /** Two-digit number from the file name, e.g. "03". */
  readonly number: string;
  readonly path: string;
  readonly title: string;
  readonly status: string;
  readonly type: string;
  readonly blockedBy: readonly string[];
  readonly body: string;
}

export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  return slug === '' ? 'untitled' : slug;
}

export function pad(index: number): string {
  return String(index).padStart(2, '0');
}

/** A `Key: value` or `**Key:** value` line near the top of a file. */
export function field(body: string, key: string): string {
  const pattern = new RegExp(`^\\**${key}:?\\**:?\\s*(.*)$`, 'im');
  return body.match(pattern)?.[1]?.replace(/\*+/g, '').trim() ?? '';
}

/** Replace (or insert under the title) a `**Key:** value` line. */
export function setField(body: string, key: string, value: string): string {
  const pattern = new RegExp(`^(\\**)${key}(:?\\**:?)\\s*.*$`, 'im');
  if (pattern.test(body)) return body.replace(pattern, `$1${key}$2 ${value}`);
  const lines = body.split('\n');
  const titleAt = lines.findIndex(line => line.startsWith('# '));
  lines.splice(titleAt + 1, 0, '', `**${key}:** ${value}`);
  return lines.join('\n');
}

export function readTicket(path: string): LocalTicket {
  const body = readFileSync(path, 'utf8');
  const number = basename(path).match(/^(\d+)/)?.[1] ?? '';
  const title = (body.match(/^#\s+(.+)$/m)?.[1] ?? basename(path, '.md')).replace(/^\d+:\s*/, '').trim();
  const blocked = field(body, 'Blocked by');
  const blockedBy = /none/i.test(blocked) ? [] : [...blocked.matchAll(/\b(\d{1,3})\b/g)].map(match => pad(Number(match[1])));
  return { number, path, title, status: field(body, 'Status'), type: field(body, 'Type'), blockedBy, body };
}

export function listTickets(featureDir: string): LocalTicket[] {
  const issues = join(featureDir, 'issues');
  if (!existsSync(issues)) return [];
  return readdirSync(issues)
    .filter(name => /^\d+.*\.md$/.test(name))
    .sort()
    .map(name => readTicket(join(issues, name)));
}

/** The feature directory a spec or ticket path belongs to. */
export function featureDirOf(path: string): string {
  const dir = dirname(path);
  return basename(dir) === 'issues' ? dirname(dir) : dir;
}

export function write(path: string, content: string): void {
  // Bun on Windows throws EEXIST for mkdirSync('.', { recursive: true }).
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, content.endsWith('\n') ? content : `${content}\n`);
}

export function appendComment(path: string, text: string): void {
  let body = readFileSync(path, 'utf8').trimEnd();
  if (!/^## Comments\s*$/m.test(body)) body += '\n\n## Comments';
  write(path, `${body}\n\n${text.trim()}\n`);
}
