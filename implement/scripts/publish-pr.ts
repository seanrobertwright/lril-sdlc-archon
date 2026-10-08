/** Push the branch and open or update its pull request, closing the GitHub ticket. */
import { join } from 'node:path';
import { artifactsDir, emit, run, trimmed } from '../../.shared/io.ts';
import { publishPr } from '../../.shared/pr.ts';

run(() => {
  const number = Number(trimmed(process.env.INPUTS_NUMBER) || '0');
  const url = publishPr({
    title: trimmed(process.env.INPUTS_TITLE),
    bodyPath: join(artifactsDir(), 'pr', 'body.md'),
    closes: number > 0 ? [number] : [],
    base: trimmed(process.env.BASE_BRANCH),
    draft: false,
  });
  emit({ pr_url: url });
});
