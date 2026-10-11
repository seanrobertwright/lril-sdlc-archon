/**
 * Re-run the project checks an implementer said it ran, independently of it.
 *
 * The pack never hardcodes a toolchain: the implementer discovers the project's own
 * type-check, lint and test commands and reports them, and this gate owns their exit
 * codes. "I ran the tests" is a claim; this is the evidence.
 */
import { join } from 'node:path';
import { write } from './local.ts';
import { shell } from './proc.ts';

export interface CheckResult {
  readonly command: string;
  readonly code: number;
  readonly tail: string;
  /** The gate's budget was spent before this command could start. */
  readonly notRun?: true;
}

const TIMEOUT_MS = 20 * 60 * 1000;
/**
 * The most one gate spends on all its commands together. Every node that runs a gate
 * declares a `timeout:` above it, so the gate returns a verdict before Archon stops it.
 */
export const CHECK_BUDGET_MS = 55 * 60 * 1000;

function tail(text: string, lines = 40): string {
  return text.trimEnd().split('\n').slice(-lines).join('\n');
}

function record(label: string, results: readonly CheckResult[], running?: string): string {
  return [
    `# Checks: ${label}`,
    '',
    ...results.flatMap(result =>
      result.notRun
        ? [`## \`${result.command}\` was not run`, '', result.tail, '']
        : [`## \`${result.command}\` exited ${result.code}`, '', '```text', result.tail, '```', ''],
    ),
    ...(running === undefined ? [] : [`## \`${running}\` is running`, '']),
  ].join('\n');
}

/**
 * Run every command within `budgetMs` in total; write a markdown record under
 * `checks/<label>.md`. Each command gets the per-command limit or what is left of the
 * budget, whichever is less; a command stopped at the budget fails, and the commands
 * after it are recorded as not run. The record is rewritten before and after each
 * command, so a gate stopped part-way still shows which commands finished and which
 * one was running.
 */
export function runChecks(commands: readonly string[], artifacts: string, label: string, budgetMs = CHECK_BUDGET_MS): CheckResult[] {
  const path = join(artifacts, 'checks', `${label}.md`);
  if (commands.length === 0) {
    write(path, `# Checks: ${label}\n\nNo check commands were declared.\n`);
    return [];
  }
  const deadline = Date.now() + budgetMs;
  const minutes = Math.round(budgetMs / 6000) / 10;
  const results: CheckResult[] = [];
  for (const command of commands) {
    const left = deadline - Date.now();
    if (left <= 0) {
      results.push({ command, code: 1, tail: `The gate's ${minutes}-minute budget was spent before it started.`, notRun: true });
      continue;
    }
    write(path, record(label, results, command));
    const limit = Math.min(TIMEOUT_MS, left);
    const result = shell(command, limit);
    const atDeadline = result.code !== 0 && limit < TIMEOUT_MS && Date.now() >= deadline;
    const note = atDeadline ? `\nStopped at the end of the gate's ${minutes}-minute budget.` : '';
    results.push({ command, code: result.code, tail: tail(`${result.stdout}\n${result.stderr}`) + note });
  }
  write(path, record(label, results));
  return results;
}

/** Normalise an implementer's declared commands: strings only, trimmed, de-duplicated. */
export function declaredCommands(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean))];
}
