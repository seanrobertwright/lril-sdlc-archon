/**
 * Decide the mode, and for one item snapshot everything the session reads: body,
 * comments, labels, author and dates (and the .out-of-scope/ knowledge base).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { artifactsDir, emit, refuse, trimmed } from '../../.shared/io.ts';
import { readTicket, write } from '../../.shared/local.ts';
import { must } from '../../.shared/proc.ts';
import { stageValidator } from '../../.shared/stage.ts';
import { issueNumber, readTrackerConfig } from '../../.shared/tracker.ts';

try {
  const artifacts = artifactsDir();
  const config = readTrackerConfig();
  const target = trimmed(process.env.INPUTS_TARGET) || trimmed(process.env.ARGUMENTS);
  write(join(artifacts, 'triage', 'labels.json'), JSON.stringify(config.labels, null, 2));
  if (target === '' || /attention|needs my/i.test(target) || /^ready\b|ready for agents/i.test(target)) {
    emit({ tracker: config.kind, mode: /ready/i.test(target) ? 'ready' : 'attention', item: '', title: '' });
  } else {
    let item: string;
    let title: string;
    if (config.kind === 'github') {
      const number = issueNumber(target);
      if (number === undefined) throw new Error(`"${target}" is not an issue number or URL.`);
      const raw = JSON.parse(
        must(['gh', 'issue', 'view', String(number), '--json', 'number,title,body,labels,author,createdAt,updatedAt,state,comments']),
      ) as { title: string };
      write(join(artifacts, 'triage', 'item.json'), JSON.stringify(raw, null, 2));
      item = `#${number}`;
      title = raw.title;
    } else {
      if (!existsSync(target)) throw new Error(`No local issue file at "${target}".`);
      write(join(artifacts, 'triage', 'item.md'), readFileSync(target, 'utf8'));
      item = target.replace(/\\/g, '/');
      title = readTicket(target).title;
    }
    await stageValidator(join(import.meta.dir, '..', 'bin', 'validate-outcome.ts'), artifacts, 'validate-outcome');
    emit({ tracker: config.kind, mode: 'item', item, title });
  }
} catch (error) {
  refuse(error instanceof Error ? error.message : String(error));
}
