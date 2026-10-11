/**
 * Commit the domain docs a session wrote inline (GLOSSARY.md, GLOSSARY-MAP.md,
 * per-context glossaries, ADRs under docs/adr/) plus any extra path prefixes the
 * caller owns, such as a local map or spec directory. Nothing else is staged.
 *
 * Matt's skills before v1.3 named the glossary CONTEXT.md (and CONTEXT-MAP.md). A
 * repo that hasn't renamed them yet still has its terms there, so a session's
 * edits to those files are committed too rather than left behind.
 */
import { exec, must } from './proc.ts';

export function commitDocs(prefixes: readonly string[], message: string): boolean {
  const changed = exec(['git', 'status', '--porcelain', '--untracked-files=all'])
    .stdout.split('\n')
    .map(line => line.slice(3).trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
  const paths = changed.filter(
    path =>
      /(^|\/)(GLOSSARY|CONTEXT)(-MAP)?\.md$/.test(path) ||
      /(^|\/)docs\/adr\//.test(path) ||
      prefixes.some(prefix => prefix !== '' && path.startsWith(prefix)),
  );
  if (paths.length === 0) return false;
  must(['git', 'add', '--', ...paths]);
  if (exec(['git', 'diff', '--cached', '--quiet']).code === 0) return false;
  must(['git', 'commit', '-m', message]);
  return true;
}
