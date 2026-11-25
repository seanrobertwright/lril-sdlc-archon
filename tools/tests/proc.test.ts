/**
 * Which bash runs the check commands on Windows: Git for Windows' own, found above the
 * `git` on PATH or in its default install folder, never a bare `bash` that may be WSL's.
 * And what a check command that runs past its limit leaves running: nothing.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gitBash, shell } from '../../.shared/proc.ts';

setDefaultTimeout(60_000);

const installed = (...paths: string[]) => (path: string) => paths.includes(path);

describe('gitBash', () => {
  test('finds bin\\bash.exe in the Git install that holds the git on PATH', () => {
    const exists = installed('C:\\Program Files\\Git\\bin\\bash.exe');
    expect(gitBash('C:\\Program Files\\Git\\cmd\\git.exe', [], exists)).toBe('C:\\Program Files\\Git\\bin\\bash.exe');
    expect(gitBash('C:\\Program Files\\Git\\mingw64\\bin\\git.exe', [], exists)).toBe('C:\\Program Files\\Git\\bin\\bash.exe');
  });

  test('prefers the install beside git over the default folder', () => {
    const exists = installed('D:\\Tools\\Git\\bin\\bash.exe', 'C:\\Program Files\\Git\\bin\\bash.exe');
    expect(gitBash('D:\\Tools\\Git\\cmd\\git.exe', ['C:\\Program Files'], exists)).toBe('D:\\Tools\\Git\\bin\\bash.exe');
  });

  test('falls back to the default install folders when git is a shim elsewhere', () => {
    const exists = installed('C:\\Program Files\\Git\\bin\\bash.exe');
    expect(gitBash('C:\\Users\\me\\scoop\\shims\\git.exe', ['C:\\Program Files'], exists)).toBe('C:\\Program Files\\Git\\bin\\bash.exe');
    expect(gitBash(null, ['C:\\Program Files'], exists)).toBe('C:\\Program Files\\Git\\bin\\bash.exe');
  });

  test('is undefined rather than the WSL launcher when Git Bash is not installed', () => {
    const exists = installed('C:\\Windows\\System32\\bash.exe');
    expect(gitBash('C:\\Windows\\System32\\git.exe', ['C:\\Program Files'], exists)).toBeUndefined();
  });
});

describe('a command that runs past its limit', () => {
  /** Long enough for the child to be beating when the limit stops it, even on a loaded machine. */
  const LIMIT_MS = 5000;
  const posix = (path: string) => path.replace(/\\/g, '/');
  const bun = posix(process.execPath);
  const heartbeat = posix(join(import.meta.dir, 'heartbeat.ts'));
  const beats = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8').split('\n').length - 1 : 0);

  function fixture(): { dir: string; log: string; beat: string } {
    const dir = mkdtempSync(join(tmpdir(), 'lril-proc-'));
    const log = posix(join(dir, 'beat.log'));
    return { dir, log, beat: `'${bun}' '${heartbeat}' '${log}'` };
  }

  /** No heartbeat after the call returned; a child still running would add about fifteen. */
  function expectStopped(log: string): void {
    const atReturn = beats(log);
    expect(atReturn).toBeGreaterThan(0);
    Bun.sleepSync(1500);
    expect(beats(log)).toBe(atReturn);
  }

  test('is stopped with a child that outlives its shell', () => {
    const { log, beat } = fixture();
    const result = shell(`${beat} && echo done`, LIMIT_MS);
    expect(result.timedOut).toBe(true);
    expect(result.code).not.toBe(0);
    expectStopped(log);
  });

  test('is stopped with a child whose own parent is gone, through scripts that exec', () => {
    const { dir, log, beat } = fixture();
    const script = join(dir, 'shim.sh');
    writeFileSync(script, `#!/bin/sh\nexec ${beat}\n`);
    expect(shell(`sh -c "sh '${posix(script)}'; true"`, LIMIT_MS).timedOut).toBe(true);
    expectStopped(log);
  });

  test('is stopped with a child it put in the background', () => {
    const { log, beat } = fixture();
    expect(shell(`(${beat} &); sleep 60`, LIMIT_MS).timedOut).toBe(true);
    expectStopped(log);
  });

  test('cannot outstay the limit, or pass, by trapping the signal that stops it', () => {
    const started = Date.now();
    const result = shell("trap 'exit 0' TERM; while :; do sleep 1; done", 1500);
    expect(result.timedOut).toBe(true);
    expect(result.code).not.toBe(0);
    expect(Date.now() - started).toBeLessThan(15_000);
  });

  test('keeps the output it had written', () => {
    expect(shell('echo before; sleep 60', LIMIT_MS).stdout).toContain('before');
  });

  // Archon stops a node on POSIX by killing its process group, which the command is not in.
  test.skipIf(process.platform === 'win32')('is stopped when the process that ran it is killed', async () => {
    const { dir, log, beat } = fixture();
    const script = join(dir, 'gate.ts');
    const proc = JSON.stringify(join(import.meta.dir, '..', '..', '.shared', 'proc.ts'));
    writeFileSync(script, `import { shell } from ${proc};\nshell(${JSON.stringify(`${beat} && echo done`)}, 60_000);\n`);
    const gate = Bun.spawn([process.execPath, script], { stdout: 'ignore', stderr: 'ignore' });
    for (let waited = 0; beats(log) === 0 && waited < 10_000; waited += 100) await Bun.sleep(100);
    gate.kill('SIGKILL');
    await gate.exited;
    await Bun.sleep(3000);
    expectStopped(log);
  });
});

describe('a command that ends within its limit', () => {
  test('keeps its exit code and output, and did not time out', () => {
    const result = shell('echo out; echo err >&2; exit 3', 20_000);
    expect([result.code, result.timedOut, result.stdout, result.stderr]).toEqual([3, false, 'out\n', 'err\n']);
  });

  test('takes its arguments as they are', () => {
    expect(shell(`printf '%s|' "a b" 'c"d' '$HOME'`, 20_000).stdout).toBe('a b|c"d|$HOME|');
  });

  test('did not time out when a process it left running outlives it', () => {
    const { timedOut, code } = shell('sleep 3 >/dev/null 2>&1 & exit 0', 20_000);
    expect([timedOut, code]).toEqual([false, 0]);
  });
});
