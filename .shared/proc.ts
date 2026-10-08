/**
 * Child processes: git, gh, and the project's own check commands.
 *
 * Output that might carry a credential (a remote URL, a token in an error) never
 * reaches stdout from here; failures name the command, not its secrets.
 */

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
    env: { ...process.env, GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0', NO_COLOR: '1' },
  });
  return {
    code: result.exitCode ?? 1,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
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

/** Run one project check command through bash, the shell Archon's bash nodes use. */
export function shell(command: string, timeoutMs: number): Result {
  return exec(['bash', '-c', command], { timeoutMs });
}
