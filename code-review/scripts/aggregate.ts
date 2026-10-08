/**
 * Present the two axes side by side, verbatim. Never merge or rerank: a change can
 * pass Standards and fail Spec, or the reverse, and one axis must not mask the other.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { artifactsDir, emit, parseJson, run, trimmed } from '../../.shared/io.ts';
import { write } from '../../.shared/local.ts';

interface StandardsVerdict {
  hard_violations: number;
  judgement_calls: number;
  worst: string;
}

interface SpecVerdict {
  missing: number;
  scope_creep: number;
  wrong: number;
  worst: string;
}

function section(path: string, fallback: string): string {
  return existsSync(path) ? readFileSync(path, 'utf8').trim() : fallback;
}

run(() => {
  const artifacts = artifactsDir();
  const standards = parseJson<StandardsVerdict>('the Standards verdict', trimmed(process.env.INPUTS_STANDARDS));
  const specText = trimmed(process.env.INPUTS_SPEC);
  const spec = specText === '' || specText === 'null' ? null : parseJson<SpecVerdict>('the Spec verdict', specText);

  const standardsFindings = standards.hard_violations + standards.judgement_calls;
  const specFindings = spec === null ? 0 : spec.missing + spec.scope_creep + spec.wrong;
  const standardsReport = section(join(artifacts, 'review', 'standards.md'), '_The Standards reviewer wrote no report._');
  const specReport =
    spec === null
      ? 'No spec was found (no path given, no issue refs in the commits, no matching .scratch spec), so the Spec axis was skipped.'
      : section(join(artifacts, 'review', 'spec.md'), '_The Spec reviewer wrote no report._');

  const worstStandards = standards.worst.trim() === '' ? 'none' : standards.worst.trim();
  const worstSpec = spec === null ? 'skipped' : spec.worst.trim() === '' ? 'none' : spec.worst.trim();
  const summary =
    `Standards: ${standardsFindings} finding(s) (${standards.hard_violations} hard), worst: ${worstStandards}. ` +
    `Spec: ${spec === null ? 'skipped, no spec available' : `${specFindings} finding(s)`}, worst: ${worstSpec}.`;

  write(join(artifacts, 'code-review.md'), `## Standards\n\n${standardsReport}\n\n## Spec\n\n${specReport}\n\n---\n\n${summary}\n`);
  emit({
    has_findings: standardsFindings + specFindings > 0,
    blocking: standards.hard_violations > 0 || (spec !== null && spec.missing + spec.wrong > 0),
    standards_findings: standardsFindings,
    spec_findings: specFindings,
    summary,
  });
});
