/**
 * The final review of an interactive session's draft, enforced by its loop's
 * completion check rather than by the prompt.
 *
 * Archon v0.11.1 pauses an interactive loop_group after its first iteration even
 * when `until_bash` passes. On every later iteration a passing `until_bash` ends
 * the loop at once, with no gate. A check that passed as soon as the draft was
 * valid would therefore apply the draft before anyone read it. In gate mode a
 * validator passes only when the reply that opened this iteration is a bare
 * approval and the draft is exactly the one the last gate showed. Every other
 * call records the draft as shown and fails, so the run pauses on it.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';

/** The reply Archon records when a gate is approved with no comment. */
export const BARE_APPROVAL = 'Approved';

/** The draft's files, by name and content; a missing file counts as absent. */
export function fingerprint(paths: readonly string[]): string {
  const hash = createHash('sha256');
  for (const path of paths) {
    hash.update(`${basename(path)}\0`);
    hash.update(existsSync(path) ? readFileSync(path) : '\0absent');
    hash.update('\0');
  }
  return hash.digest('hex');
}

/**
 * True when `reply` is a bare approval and the draft is unchanged since the last
 * call. Otherwise records the draft in `marker` as the one this gate shows, and
 * returns false.
 */
export function approvedAsShown(drafts: readonly string[], marker: string, reply: string): boolean {
  const current = fingerprint(drafts);
  const shown = existsSync(marker) ? readFileSync(marker, 'utf8').trim() : '';
  if (reply.trim() === BARE_APPROVAL && shown === current) return true;
  mkdirSync(dirname(marker), { recursive: true });
  writeFileSync(marker, `${current}\n`);
  return false;
}

/**
 * A validator's verdict. Without `--gate` (the session checking its own draft) it
 * is the draft's problems. With `--gate` (the loop's `until_bash`) the draft must
 * also have been approved as shown, read from the reply Archon passes the check
 * as `LOOP_USER_INPUT`.
 */
export function verdict(problems: readonly string[], drafts: readonly string[], marker: string, argv: readonly string[]): string[] {
  if (!argv.includes('--gate')) return [...problems];
  const approved = approvedAsShown(drafts, marker, process.env.LOOP_USER_INPUT ?? '');
  if (problems.length > 0 || approved) return [...problems];
  return ['the draft is ready and waits at the gate: approve it with no comment to apply it as shown'];
}
