/**
 * The process contract every script in this pack shares.
 *
 * `with:` bindings arrive as `INPUTS_<UPPER_SNAKE>` environment text. Read each one
 * as a literal `process.env.INPUTS_<NAME>` in the entry script: Archon scans that
 * literal form at load time to prove every binding is provided, and it does not
 * follow imports.
 *
 * Never call `process.exit()`. Bun can leave without draining stdout, which
 * truncates a JSON result. Set `process.exitCode` and return instead.
 */

/** A bound value with surrounding whitespace removed ('' when absent). */
export function trimmed(value: string | undefined): string {
  return (value ?? '').trim();
}

/** This run's artifact directory. The engine always supplies it to exec nodes. */
export function artifactsDir(): string {
  const value = process.env.ARTIFACTS_DIR;
  if (value === undefined || value === '') {
    throw new Error('ARTIFACTS_DIR is not set; Archon supplies it to every exec node.');
  }
  return value;
}

/** The node's certified result: exactly one JSON document on stdout. */
export function emit(value: unknown): void {
  console.log(JSON.stringify(value));
}

/** A plain-text result for a node that declares no output_format. */
export function report(value: string): void {
  console.log(value);
}

/** Refuse: the reason on stderr, a non-zero exit, nothing on stdout. */
export function refuse(message: string): void {
  console.error(message);
  process.exitCode = 1;
}

/** A note the operator sees while the node still succeeds. */
export function note(message: string): void {
  console.error(message);
}

/** Parse a JSON binding, refusing with a named reason when it is not JSON. */
export function parseJson<T>(label: string, text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

/** Run `main`, turning any thrown error into a refusal instead of a stack trace. */
export function run(main: () => void): void {
  try {
    main();
  } catch (error) {
    refuse(error instanceof Error ? error.message : String(error));
  }
}
