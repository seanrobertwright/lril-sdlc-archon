/**
 * What the repo already has, and whether the skills plugin every AI node loads is
 * installed at a version this pack is written against.
 */
import { emit, note, run } from '../../.shared/io.ts';
import { exec } from '../../.shared/proc.ts';

const PLUGIN = 'mattpocock-skills@mattpocock';
const MINIMUM = [1, 3, 0];

function atLeast(version: string): boolean {
  const parts = version.split('.').map(part => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < MINIMUM.length; i++) {
    const have = parts[i] ?? 0;
    const need = MINIMUM[i] ?? 0;
    if (have !== need) return have > need;
  }
  return true;
}

run(() => {
  const remote = exec(['git', 'remote', 'get-url', 'origin']).stdout.trim();
  // Normalise inside the match, so a token-bearing URL never reaches the output.
  const github = remote.match(/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?$/)?.[1] ?? '';

  const listing = exec(['claude', 'plugin', 'list']);
  let version = '';
  let message = '';
  let ok: boolean;
  if (listing.code !== 0) {
    message = 'Could not run `claude plugin list`, so the plugin version is unverified.';
    note(message);
    ok = true;
  } else {
    const block = (listing.stdout.split(PLUGIN)[1] ?? '').split('❯')[0] ?? '';
    version = block.match(/Version:\s*([0-9][0-9.]*)/)?.[1] ?? '';
    if (version === '') message = `${PLUGIN} is not installed.`;
    else if (!atLeast(version)) message = `${PLUGIN} is v${version}; this pack needs v${MINIMUM.join('.')} or later.`;
    else if (/Status:\s*✘/.test(block)) message = `${PLUGIN} is installed but disabled.`;
    ok = message === '';
    if (!ok) note(message);
  }
  emit({ github_repo: github, plugin_version: version, plugin_ok: ok, plugin_note: message });
});
