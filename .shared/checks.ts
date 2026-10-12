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
/**
 * The most one gate spends on all its commands together. Every node that runs a gate
 * declares a `timeout:` above it, so the gate returns a verdict before Archon stops it.
 */
export const CHECK_BUDGET_MS = 55 * 60 * 1000;
/**
 * How often a command runs before the gate calls it failed. A command that fails runs
 * once more, so one flaky test does not cost a run hours old; a command that passes
 * only then is marked flaky wherever the gate's result is shown.
 */
export const ATTEMPTS = 2;

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
      return [`## \`${result.command}\` exited ${result.code}`, '', '```text', result.tail, '```', ''];
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
 * budget, whichever is less; a command stopped at the budget fails, and the commands
 * after it are recorded as not run. A command that fails runs up to `ATTEMPTS` times
 * while budget is left; one that passes on a later attempt counts as passed and is
 * recorded as flaky, here and in `checks/flaky.json`. The record is rewritten before
 * and after each attempt, so a gate stopped part-way still shows which commands
 * finished and which one was running.
 */
export function runChecks(commands: readonly string[], artifacts: string, label: string, budgetMs = CHECK_BUDGET_MS): CheckResult[] {
  const path = join(artifacts, 'checks', `${label}.md`);
  if (commands.length === 0) {
    write(path, `# Checks: ${label}\n\nNo check commands were declared.\n`);
    recordFlaky(artifacts, label, []);
    return [];
  }
  const deadline = Date.now() + budgetMs;
  const minutes = Math.round(budgetMs / 6000) / 10;
  const attempt = (command: string): { code: number; tail: string; isAtDeadline: boolean } => {
    const limit = Math.min(TIMEOUT_MS, deadline - Date.now());
    const result = shell(command, limit);
    const isAtDeadline = result.code !== 0 && limit < TIMEOUT_MS && Date.now() >= deadline;
    const note = isAtDeadline ? `\nStopped at the end of the gate's ${minutes}-minute budget.` : '';
    return { code: result.code, tail: tail(`${result.stdout}\n${result.stderr}`) + note, isAtDeadline };
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
    while (last.code !== 0 && !last.isAtDeadline && tries < ATTEMPTS && deadline - Date.now() > 0) {
      write(path, record(label, results, command, true));
      last = attempt(command);
      tries++;
    }
    if (last.code === 0 && tries > 1) results.push({ command, code: 0, tail: last.tail, flaky: { code: first.code, tail: first.tail } });
    else if (tries > 1) results.push({ command, code: last.code, tail: `${last.tail}\nFailed each time it ran (${tries} attempts).` });
    else results.push({ command, code: last.code, tail: last.tail });
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
