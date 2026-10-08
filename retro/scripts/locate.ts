/**
 * Find the run to look back on and condense its JSONL transcript into something an
 * agent can read in one pass: node lifecycle, assistant messages, tool calls,
 * exec output and gate decisions, in order. The raw log is copied alongside.
 */
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { artifactsDir, emit, run, trimmed } from '../../.shared/io.ts';
import { write } from '../../.shared/local.ts';

interface Event {
  type?: string;
  step?: string;
  content?: string;
  tool_name?: string;
  tool_input?: unknown;
  exit_code?: number;
  stdout_tail?: string;
  stderr_tail?: string;
  decision?: string;
  workflow_name?: string;
  duration_ms?: number;
  cost_usd?: number;
}

const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max)} …[${text.length - max} more chars]` : text);

/** `<archon home>/workspaces`: this run's artifacts live at workspaces/<owner>/<repo>/artifacts/runs/<id>. */
function workspacesRoot(artifacts: string): string {
  const derived = resolve(artifacts, '..', '..', '..', '..', '..');
  return basename(derived) === 'workspaces' ? derived : join(homedir(), '.archon', 'workspaces');
}

function logs(artifacts: string): { path: string; id: string; mtime: number }[] {
  const root = workspacesRoot(artifacts);
  if (!existsSync(root)) return [];
  const found: { path: string; id: string; mtime: number }[] = [];
  for (const owner of readdirSync(root)) {
    const ownerDir = join(root, owner);
    if (!statSync(ownerDir).isDirectory()) continue;
    for (const repo of readdirSync(ownerDir)) {
      const dir = join(ownerDir, repo, 'logs');
      if (!existsSync(dir)) continue;
      for (const name of readdirSync(dir).filter(n => n.endsWith('.jsonl'))) {
        const path = join(dir, name);
        found.push({ path, id: name.replace(/\.jsonl$/, ''), mtime: statSync(path).mtimeMs });
      }
    }
  }
  return found.sort((a, b) => b.mtime - a.mtime);
}

run(() => {
  const wanted = trimmed(process.env.INPUTS_RUN) || trimmed(process.env.ARGUMENTS);
  const self = trimmed(process.env.WORKFLOW_ID);
  const artifacts = artifactsDir();
  const all = logs(artifacts);
  const target = wanted !== '' ? all.find(log => log.id === wanted || log.id.startsWith(wanted)) : all.find(log => log.id !== self);
  if (target === undefined) {
    throw new Error(wanted !== '' ? `No run log for "${wanted}" under the Archon workspaces.` : 'No earlier Archon run log was found.');
  }
  const events = readFileSync(target.path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line) as Event;
      } catch {
        return {} as Event;
      }
    });
  const workflow = events.find(event => event.type === 'workflow_start')?.workflow_name ?? 'unknown';
  const lines: string[] = [`# Run ${target.id} (${workflow})`, ''];
  for (const event of events) {
    switch (event.type) {
      case 'workflow_start':
        lines.push(`## Request\n\n${clip(event.content ?? '', 4000)}\n`);
        break;
      case 'node_start':
        lines.push(`### ▶ ${event.step}`);
        break;
      case 'node_complete':
        lines.push(`### ✔ ${event.step} (${Math.round((event.duration_ms ?? 0) / 1000)}s${event.cost_usd ? `, $${event.cost_usd.toFixed(2)}` : ''})`);
        break;
      case 'node_error':
      case 'workflow_error':
        lines.push(`### ✘ ${event.step ?? 'workflow'}: ${clip(event.content ?? '', 2000)}`);
        break;
      case 'node_skipped':
        lines.push(`### ⤼ ${event.step} skipped`);
        break;
      case 'assistant':
        lines.push(`**assistant:** ${clip(event.content ?? '', 2500)}`);
        break;
      case 'tool':
        lines.push(`- tool \`${event.tool_name}\`: ${clip(JSON.stringify(event.tool_input ?? {}), 400)}`);
        break;
      case 'exec_output':
        lines.push(`- exec ${event.step} exit ${event.exit_code}: ${clip(`${event.stdout_tail ?? ''}\n${event.stderr_tail ?? ''}`.trim(), 1500)}`);
        break;
      case 'gate_decision':
        lines.push(`- gate ${event.step}: ${event.decision} ${clip(event.content ?? '', 1000)}`);
        break;
      default:
        break;
    }
  }
  write(join(artifacts, 'session', 'transcript.md'), lines.join('\n'));
  copyFileSync(target.path, join(artifacts, 'session', 'log.jsonl'));
  const runArtifacts = join(target.path, '..', '..', 'artifacts', 'runs', target.id);
  emit({
    run_id: target.id,
    workflow,
    log: target.path.replace(/\\/g, '/'),
    artifacts: existsSync(runArtifacts) ? runArtifacts.replace(/\\/g, '/') : '',
  });
});
