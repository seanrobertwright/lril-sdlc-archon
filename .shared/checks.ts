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
}

const TIMEOUT_MS = 20 * 60 * 1000;

function tail(text: string, lines = 40): string {
  return text.trimEnd().split('\n').slice(-lines).join('\n');
}

function record(label: string, results: readonly CheckResult[], running?: string): string {
  return [
    `# Checks: ${label}`,
    '',
    ...results.flatMap(result => [
      `## \`${result.command}\` exited ${result.code}`,
      '',
      '```text',
      result.tail,
      '```',
      '',
    ]),
    ...(running === undefined ? [] : [`## \`${running}\` is running`, '']),
  ].join('\n');
}

/**
 * Run every command; write a markdown record under `checks/<label>.md`. The record is
 * rewritten before and after each command, so a gate stopped part-way still shows
 * which commands finished and which one was running.
 */
export function runChecks(commands: readonly string[], artifacts: string, label: string): CheckResult[] {
  const path = join(artifacts, 'checks', `${label}.md`);
  if (commands.length === 0) {
    write(path, `# Checks: ${label}\n\nNo check commands were declared.\n`);
    return [];
  }
  const results: CheckResult[] = [];
  for (const command of commands) {
    write(path, record(label, results, command));
    const result = shell(command, TIMEOUT_MS);
    results.push({ command, code: result.code, tail: tail(`${result.stdout}\n${result.stderr}`) });
  }
  write(path, record(label, results));
  return results;
}

/** Normalise an implementer's declared commands: strings only, trimmed, de-duplicated. */
export function declaredCommands(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean))];
}
