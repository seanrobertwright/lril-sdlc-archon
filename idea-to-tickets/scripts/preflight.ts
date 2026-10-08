/**
 * Refuse before the interview when the tracker isn't configured, and stage the
 * shape validator the session and the loop's completion check both run.
 */
import { join } from 'node:path';
import { artifactsDir, emit, refuse } from '../../.shared/io.ts';
import { stageValidator } from '../../.shared/stage.ts';
import { readTrackerConfig } from '../../.shared/tracker.ts';

try {
  const config = readTrackerConfig();
  await stageValidator(join(import.meta.dir, '..', 'bin', 'validate-shape.ts'), artifactsDir(), 'validate-shape');
  emit({ tracker: config.kind, ready_label: config.labels['ready-for-agent'] });
} catch (error) {
  refuse(error instanceof Error ? error.message : String(error));
}
