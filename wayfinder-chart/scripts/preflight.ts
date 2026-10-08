/** Refuse before charting when the tracker isn't configured; stage the map validator. */
import { join } from 'node:path';
import { artifactsDir, emit, refuse } from '../../.shared/io.ts';
import { stageValidator } from '../../.shared/stage.ts';
import { readTrackerConfig } from '../../.shared/tracker.ts';

try {
  const config = readTrackerConfig();
  await stageValidator(join(import.meta.dir, '..', 'bin', 'validate-map.ts'), artifactsDir(), 'validate-map');
  emit({ tracker: config.kind });
} catch (error) {
  refuse(error instanceof Error ? error.message : String(error));
}
