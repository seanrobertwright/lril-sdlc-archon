/**
 * Run a diagnosis feedback loop several times and record each run, so "the loop is
 * red" and "the loop is green" are observations, not claims.
 */
import { join } from 'node:path';
import { note } from './io.ts';
import { write } from './local.ts';
import { shell } from './proc.ts';

export const RUNS = 3;
export const TIMEOUT_MS = 10 * 60 * 1000;

export interface LoopRun {
  readonly code: number;
  readonly output: string;
}

/** Run `command` RUNS times, checking each with `judge`; write the record; return seconds per run. */
export function runLoop(
  command: string,
  mode: 'red' | 'green',
  artifacts: string,
  judge: (run: LoopRun, attempt: number) => void,
  extra: string[] = [],
): number {
  if (command === '') throw new Error('No feedback-loop command was declared.');
  const started = Date.now();
  const lines: string[] = [`# Feedback loop, ${mode}`, '', `\`${command}\``, ''];
  try {
    for (let attempt = 1; attempt <= RUNS; attempt++) {
      const result = shell(command, TIMEOUT_MS);
      const output = `${result.stdout}\n${result.stderr}`;
      lines.push(`## Run ${attempt}: exit ${result.code}`, '', '```text', output.trimEnd().split('\n').slice(-30).join('\n'), '```', '');
      judge({ code: result.code, output }, attempt);
    }
  } finally {
    write(join(artifacts, 'loop', `${mode}.md`), [...lines, ...extra].join('\n'));
  }
  const seconds = Math.round((Date.now() - started) / 100 / RUNS) / 10;
  if (seconds > 60) note(`The loop takes ~${seconds}s per run; a tight loop runs in seconds.`);
  return seconds;
}
