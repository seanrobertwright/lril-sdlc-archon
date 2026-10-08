/** Mark a local ticket done and commit that, so the next frontier read sees it. */
import { readFileSync } from 'node:fs';
import { report, run, trimmed } from '../../.shared/io.ts';
import { setField, write } from '../../.shared/local.ts';
import { exec, must } from '../../.shared/proc.ts';

run(() => {
  const path = trimmed(process.env.INPUTS_PATH);
  if (path === '') throw new Error('No local ticket path to resolve.');
  write(path, setField(readFileSync(path, 'utf8'), 'Status', 'done'));
  must(['git', 'add', '--', path]);
  if (exec(['git', 'diff', '--cached', '--quiet']).code !== 0) {
    must(['git', 'commit', '-m', `chore: mark ${path} done`]);
  }
  report(`${path}: Status done`);
});
