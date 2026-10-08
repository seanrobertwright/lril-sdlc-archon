/** The retro is the deliverable: it exists and names at least one candidate. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { artifactsDir, emit, run } from '../../.shared/io.ts';

run(() => {
  const path = join(artifactsDir(), 'retro.md');
  if (!existsSync(path)) throw new Error('retro.md was not written.');
  const text = readFileSync(path, 'utf8');
  const candidates = (text.match(/^##\s+\d+\./gm) ?? []).length;
  if (candidates === 0 && !/no candidates/i.test(text)) {
    throw new Error('retro.md lists no candidates (expected "## 1. <title>" headings, or an explicit "No candidates").');
  }
  emit({ ready: true, candidates, report: path.replace(/\\/g, '/') });
});
