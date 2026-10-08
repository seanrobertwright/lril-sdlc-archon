/**
 * Open (or update) the pull request for this branch. The agent before this node
 * authors the body with Matt Pocock's `/pr` shape; this node performs the one public
 * write and reads it back, so "the write failed" and "it landed" stay distinct.
 */
import { existsSync, readFileSync } from 'node:fs';
import { exec, git, must } from './proc.ts';

export function publishPr(options: {
  title: string;
  bodyPath: string;
  closes: readonly number[];
  base: string;
  draft: boolean;
}): string {
  if (!existsSync(options.bodyPath)) throw new Error(`The PR body was not written to ${options.bodyPath}.`);
  let body = readFileSync(options.bodyPath, 'utf8').trim();
  const closing = options.closes.filter(number => !new RegExp(`(close[sd]?|fix(e[sd])?|resolve[sd]?)\\s+#${number}\\b`, 'i').test(body));
  if (closing.length > 0) body += `\n\n${closing.map(number => `Closes #${number}`).join('\n')}`;

  const branch = git('branch', '--show-current');
  if (branch === '') throw new Error('Detached HEAD: there is no branch to open a pull request from.');
  must(['git', 'push', '--set-upstream', 'origin', `HEAD:refs/heads/${branch}`]);

  const existing = exec(['gh', 'pr', 'view', branch, '--json', 'url,state', '--jq', 'select(.state == "OPEN") | .url']);
  if (existing.code === 0 && existing.stdout.trim() !== '') {
    must(['gh', 'pr', 'edit', branch, '--title', options.title, '--body-file', '-'], { input: body });
  } else {
    const args = ['gh', 'pr', 'create', '--head', branch, '--title', options.title, '--body-file', '-'];
    if (options.base !== '') args.push('--base', options.base);
    if (options.draft) args.push('--draft');
    must(args, { input: body });
  }
  const url = must(['gh', 'pr', 'view', branch, '--json', 'url', '--jq', '.url']).trim();
  if (!url.startsWith('http')) throw new Error('The pull request could not be read back after the write.');
  return url;
}
