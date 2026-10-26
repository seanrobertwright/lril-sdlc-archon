/**
 * Which bash runs the check commands on Windows: Git for Windows' own, found above the
 * `git` on PATH or in its default install folder, never a bare `bash` that may be WSL's.
 */
import { describe, expect, test } from 'bun:test';
import { gitBash } from '../../.shared/proc.ts';

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
