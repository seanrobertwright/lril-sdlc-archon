/**
 * The report is the deliverable, so prove it: the HTML exists, loads Tailwind and
 * Mermaid, renders every candidate in candidates.json with a valid strength badge,
 * and ends with a top recommendation.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { artifactsDir, emit, run } from '../../.shared/io.ts';
import { entry } from '../../.shared/pack.ts';

const STRENGTHS = ['Strong', 'Worth exploring', 'Speculative'];

interface Candidate {
  title: string;
  strength: string;
}

run(() => {
  const artifacts = artifactsDir();
  const htmlPath = join(artifacts, 'architecture-review.html');
  const jsonPath = join(artifacts, 'candidates.json');
  const problems: string[] = [];
  if (!existsSync(htmlPath)) problems.push('architecture-review.html was not written');
  if (!existsSync(jsonPath)) problems.push('candidates.json was not written');
  if (problems.length > 0) throw new Error(problems.join('; '));
  const html = readFileSync(htmlPath, 'utf8');
  const data = JSON.parse(readFileSync(jsonPath, 'utf8')) as { candidates: Candidate[]; top_recommendation: string };
  if (!Array.isArray(data.candidates) || data.candidates.length === 0) problems.push('candidates.json lists no candidates');
  if (!html.includes('cdn.tailwindcss.com')) problems.push('the report does not load Tailwind from its CDN');
  if (!/mermaid/i.test(html)) problems.push('the report does not load Mermaid');
  if (!/id=["']top-recommendation["']/.test(html)) problems.push('the report has no #top-recommendation section');
  if (typeof data.top_recommendation !== 'string' || data.top_recommendation.trim() === '') problems.push('no top recommendation named');
  for (const candidate of data.candidates ?? []) {
    if (!STRENGTHS.includes(candidate.strength)) problems.push(`"${candidate.title}" has strength "${candidate.strength}"`);
    if (!html.includes(candidate.title)) problems.push(`"${candidate.title}" is not rendered in the report`);
  }
  if (problems.length > 0) throw new Error(`The architecture report is incomplete:\n${problems.map(p => `- ${p}`).join('\n')}`);
  emit({
    ready: true,
    report: htmlPath.replace(/\\/g, '/'),
    candidates: data.candidates.length,
    next:
      `Open ${htmlPath.replace(/\\/g, '/')}, pick a candidate, then grill and plan it: ` +
      `archon workflow run ${entry('idea-to-tickets')} --branch <branch> "Deepen <candidate>, from ${htmlPath.replace(/\\/g, '/')}"`,
  });
});
