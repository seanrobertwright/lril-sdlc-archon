/** Commit the glossary/ADR changes (and a local map), then point at the next step. */
import { dirname } from 'node:path';
import { commitDocs } from '../../.shared/commit.ts';
import { emit, run, trimmed } from '../../.shared/io.ts';
import { entry } from '../../.shared/pack.ts';

run(() => {
  const mapRef = trimmed(process.env.INPUTS_MAP_REF);
  const hasMap = trimmed(process.env.INPUTS_HAS_MAP) === 'true';
  const localDir = hasMap && !mapRef.startsWith('#') ? `${dirname(mapRef).replace(/\\/g, '/')}/` : '';
  const committed = commitDocs([localDir], hasMap ? `docs: chart wayfinder map ${mapRef}` : 'docs: glossary and ADRs from wayfinding');
  emit({
    has_map: hasMap,
    map_ref: mapRef,
    committed,
    next: hasMap
      ? `Work the map one decision at a time: archon workflow run ${entry('wayfinder-step')} --input map=${mapRef}`
      : `No map needed: the way is already clear. Shape it with ${entry('idea-to-tickets')}.`,
  });
});
