/**
 * Stage a standalone validator into the run's artifacts as one bundled file.
 *
 * An interactive session must not end on its own say-so: its loop completes only
 * when a deterministic check passes. That check runs from `until_bash`, which
 * cannot address a pack script by name, so the preflight node bundles the
 * validator to `$ARTIFACTS_DIR/bin/<name>.ts`, where both `until_bash` and the
 * session itself can run it.
 */
import { join } from 'node:path';

export async function stageValidator(entry: string, artifacts: string, name: string): Promise<string> {
  const built = await Bun.build({ entrypoints: [entry], outdir: join(artifacts, 'bin'), target: 'bun', naming: `${name}.ts` });
  if (!built.success) throw new Error(`Could not stage ${name}: ${built.logs.map(String).join('; ')}`);
  return join(artifacts, 'bin', `${name}.ts`);
}
