/**
 * Child processes: git, gh, and the project's own check commands.
 *
 * Output that might carry a credential (a remote URL, a token in an error) never
 * reaches stdout from here; failures name the command, not its secrets.
 */
import { existsSync } from 'node:fs';
import { win32 } from 'node:path';

export interface Result {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export function exec(argv: readonly string[], options: { input?: string; cwd?: string; timeoutMs?: number } = {}): Result {
  const result = Bun.spawnSync([...argv], {
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: options.input === undefined ? 'ignore' : new TextEncoder().encode(options.input),
    cwd: options.cwd,
    timeout: options.timeoutMs,
    env: childEnv(),
  });
  return {
    code: result.exitCode ?? 1,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

/**
 * What every child runs with. On Windows, PSModulePath is dropped: under an Archon started
 * from PowerShell 7 it names PowerShell 7's modules, so a check that runs Windows
 * PowerShell 5.1 loads those, fails to load its own, and loses drives such as `Cert:`.
 * Unset, each PowerShell builds its own default.
 */
function childEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env, GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0', NO_COLOR: '1' };
  if (process.platform === 'win32') {
    for (const key of Object.keys(env)) if (key.toLowerCase() === 'psmodulepath') delete env[key];
  }
  return env;
}

/** Run a command whose failure is a broken assumption; throw with its stderr. */
export function must(argv: readonly string[], options: { input?: string; cwd?: string } = {}): string {
  const result = exec(argv, options);
  if (result.code !== 0) {
    throw new Error(`${argv.slice(0, 3).join(' ')} failed (exit ${result.code}): ${result.stderr.trim()}`);
  }
  return result.stdout;
}

export function git(...args: string[]): string {
  return must(['git', ...args]).trim();
}

/** `undefined` when git says no, which is an answer rather than a fault. */
export function tryGit(...args: string[]): string | undefined {
  const result = exec(['git', ...args]);
  return result.code === 0 ? result.stdout.trim() : undefined;
}

/**
 * Git for Windows' bash: the first `bin\bash.exe` above the `git` on PATH, else in Git's
 * default install folders under `roots`. `undefined` when there is none.
 */
export function gitBash(git: string | null, roots: readonly string[], exists: (path: string) => boolean = existsSync): string | undefined {
  const candidates: string[] = [];
  if (git !== null) {
    for (let dir = win32.dirname(git); win32.dirname(dir) !== dir; dir = win32.dirname(dir)) candidates.push(win32.join(dir, 'bin', 'bash.exe'));
  }
  for (const root of roots) candidates.push(win32.join(root, 'Git', 'bin', 'bash.exe'));
  return candidates.find(path => exists(path));
}

let windowsBash: string | undefined;

/**
 * The bash that runs check commands. On Windows a bare `bash` is not good enough: when
 * System32 comes before Git on PATH it is the WSL launcher, and the checks run on Linux
 * against a Windows checkout, where native modules built for Windows fail to load.
 */
function bash(): string {
  if (process.platform !== 'win32') return 'bash';
  const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && win32.join(process.env.LOCALAPPDATA, 'Programs')];
  windowsBash ??= gitBash(Bun.which('git'), roots.filter((root): root is string => typeof root === 'string' && root !== ''));
  if (windowsBash === undefined) {
    throw new Error("Git for Windows' bash was not found beside git or under Program Files; the checks are not run through another bash, such as WSL's.");
  }
  return windowsBash;
}

/** Run one project check command through bash: Git for Windows' bash on Windows. */
export function shell(command: string, timeoutMs: number): Result {
  return exec([bash(), '-c', command], { timeoutMs });
}
