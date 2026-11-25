/**
 * Re-run the project checks an implementer said it ran, independently of it.
 *
 * The pack never hardcodes a toolchain: the implementer discovers the project's own
 * type-check, lint and test commands and reports them, and this gate owns their exit
 * codes. "I ran the tests" is a claim; this is the evidence.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { write } from './local.ts';
import { shell } from './proc.ts';

export interface CheckResult {
  readonly command: string;
  readonly code: number;
  readonly tail: string;
  /** It ran past this limit, in milliseconds, and was stopped with everything it started. */
  readonly timedOutMs?: number;
  /** The gate's budget was spent before this command could start. */
  readonly notRun?: true;
  /** It failed, then passed when run again: the failed attempt's exit code and output. */
  readonly flaky?: { readonly code: number; readonly tail: string };
}

/** A check that passed only when run again, as `checks/flaky.json` lists it. */
export interface FlakyCheck {
  readonly label: string;
  readonly command: string;
  /** The failed attempt's exit code. */
  readonly code: number;
}

const TIMEOUT_MS = 20 * 60 * 1000;
/** Sets the per-command limit, in minutes, for a project or a run (see `checkLimitMs`). */
const LIMIT_SETTING = 'LRIL_CHECK_TIMEOUT_MINUTES';
/**
 * The most one gate spends on all its commands together. Every node that runs a gate
 * declares a `timeout:` above it, so the gate returns a verdict before Archon stops it.
 */
export const CHECK_BUDGET_MS = 55 * 60 * 1000;
/**
 * How often a command runs before the gate calls it failed. A command that fails runs
 * once more, so one flaky test does not cost a run hours old; a command that passes
 * only then is marked flaky wherever the gate's result is shown. A command that times
 * out is not run again.
 */
export const ATTEMPTS = 2;

/**
 * How long one check command may run: `value`, the text of LRIL_CHECK_TIMEOUT_MINUTES, or
 * 20 minutes when that is not set. Refuses text that is not a positive decimal number of
 * minutes, at most the gate's budget.
 */
export function checkLimitMs(value: string | undefined = process.env[LIMIT_SETTING]): number {
  if (value === undefined) return TIMEOUT_MS;
  const text = value.trim();
  const ms = /^\d+(\.\d+)?$/.test(text) ? Math.round(Number(text) * 60_000) : Number.NaN;
  if (!(ms >= 1 && ms <= CHECK_BUDGET_MS)) {
    throw new Error(`${LIMIT_SETTING} must be a number of minutes above 0 and at most ${CHECK_BUDGET_MS / 60_000}, the gate's whole budget (got "${value}").`);
  }
  return ms;
}

/** "20 min", or seconds below a minute. */
function duration(ms: number): string {
  return ms < 60_000 ? `${Math.round(ms / 100) / 10} s` : `${Math.round(ms / 6000) / 10} min`;
}

/** How a command ended, as a gate's message names it. */
export function describeResult(result: CheckResult): string {
  if (result.notRun) return 'not run';
  return result.timedOutMs === undefined ? `exit ${result.code}` : `timed out after ${duration(result.timedOutMs)}`;
}

function tail(text: string, lines = 40): string {
  return text.trimEnd().split('\n').slice(-lines).join('\n');
}

function record(label: string, results: readonly CheckResult[], running?: string, isAgain = false): string {
  return [
    `# Checks: ${label}`,
    '',
    ...results.flatMap(result => {
      if (result.notRun) return [`## \`${result.command}\` was not run`, '', result.tail, ''];
      if (result.flaky !== undefined) {
        return [
          `## \`${result.command}\` passed when run again (flaky)`,
          '',
          `The first attempt exited ${result.flaky.code}:`,
          '',
          '```text',
          result.flaky.tail,
          '```',
          '',
        ];
      }
      const ending = result.timedOutMs === undefined ? `exited ${result.code}` : describeResult(result);
      return [`## \`${result.command}\` ${ending}`, '', '```text', result.tail, '```', ''];
    }),
    ...(running === undefined ? [] : [isAgain ? `## \`${running}\` failed and is running again` : `## \`${running}\` is running`, '']),
  ].join('\n');
}

/** Replaces this label's entries in `checks/flaky.json`, keeping every other gate's. */
function recordFlaky(artifacts: string, label: string, results: readonly CheckResult[]): void {
  const path = join(artifacts, 'checks', 'flaky.json');
  const kept = flakyChecks(artifacts).filter(entry => entry.label !== label);
  const mine = results.flatMap(result => (result.flaky === undefined ? [] : [{ label, command: result.command, code: result.flaky.code }]));
  // A gate run again that is no longer flaky must clear its old entries, so an existing file is always rewritten.
  if (kept.length === 0 && mine.length === 0 && !existsSync(path)) return;
  write(path, JSON.stringify([...kept, ...mine], null, 2));
}

/** Every check this run's gates saw pass only when run again; empty when none did. */
export function flakyChecks(artifacts: string): FlakyCheck[] {
  const path = join(artifacts, 'checks', 'flaky.json');
  if (!existsSync(path)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((entry): FlakyCheck[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const { label, command, code } = entry as Record<string, unknown>;
    return typeof label === 'string' && typeof command === 'string' && typeof code === 'number' ? [{ label, command, code }] : [];
  });
}

/**
 * Run every command within `budgetMs` in total; write a markdown record under
 * `checks/<label>.md`. Each command gets the per-command limit or what is left of the
 * budget, whichever is less; a command stopped at either fails, timed out, and is not run
 * again. The commands after one stopped at the budget are recorded as not run. A command
 * that fails by itself runs up to `ATTEMPTS` times while budget is left; one that passes
 * on a later attempt counts as passed and is recorded as flaky, here and in
 * `checks/flaky.json`. The record is rewritten before each attempt and at the end, so a
 * gate stopped part-way still shows which commands finished and which one was running.
 */
export function runChecks(
  commands: readonly string[],
  artifacts: string,
  label: string,
  { budgetMs = CHECK_BUDGET_MS, limitMs = checkLimitMs() }: { readonly budgetMs?: number; readonly limitMs?: number } = {},
): CheckResult[] {
  const path = join(artifacts, 'checks', `${label}.md`);
  if (commands.length === 0) {
    write(path, `# Checks: ${label}\n\nNo check commands were declared.\n`);
    recordFlaky(artifacts, label, []);
    return [];
  }
  const deadline = Date.now() + budgetMs;
  const minutes = Math.round(budgetMs / 6000) / 10;
  const attempt = (command: string): { code: number; tail: string; timedOutMs?: number } => {
    // At least 1: a timeout of 0 is no limit.
    const limit = Math.max(1, Math.min(limitMs, deadline - Date.now()));
    const result = shell(command, limit);
    const output = tail(`${result.stdout}\n${result.stderr}`);
    if (!result.timedOut) return { code: result.code, tail: output };
    const note = limit < limitMs ? `\nStopped at the end of the gate's ${minutes}-minute budget.` : `\nStopped at the ${duration(limit)} limit on one command, which ${LIMIT_SETTING} sets.`;
    return { code: result.code, tail: output + note, timedOutMs: limit };
  };
  const results: CheckResult[] = [];
  for (const command of commands) {
    if (deadline - Date.now() <= 0) {
      results.push({ command, code: 1, tail: `The gate's ${minutes}-minute budget was spent before it started.`, notRun: true });
      continue;
    }
    write(path, record(label, results, command));
    const first = attempt(command);
    let tries = 1;
    let last = first;
    while (last.code !== 0 && last.timedOutMs === undefined && tries < ATTEMPTS && deadline - Date.now() > 0) {
      write(path, record(label, results, command, true));
      last = attempt(command);
      tries++;
    }
    if (last.code === 0 && tries > 1) results.push({ command, code: 0, tail: last.tail, flaky: { code: first.code, tail: first.tail } });
    else if (tries > 1) results.push({ ...last, command, tail: `${last.tail}\nFailed each time it ran (${tries} attempts).` });
    else results.push({ ...last, command });
  }
  write(path, record(label, results));
  recordFlaky(artifacts, label, results);
  return results;
}

/** Normalise an implementer's declared commands: strings only, trimmed, de-duplicated. */
export function declaredCommands(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean))];
}

/** The outcome's sentence on checks that passed only when run again; '' when none did. */
export function flakyLine(artifacts: string): string {
  const flaky = flakyChecks(artifacts);
  if (flaky.length === 0) return '';
  const named = flaky.map(entry => `\`${entry.command}\` (${entry.label}, first exit ${entry.code})`).join(', ');
  return `Flaky: ${named} failed, then passed when run again; see checks/.`;
}
