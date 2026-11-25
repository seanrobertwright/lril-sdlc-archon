/** A child that outlives its shell: appends its PID to the file named on the command line every 100 ms for a minute. */
import { appendFileSync } from 'node:fs';

const path = process.argv[2];
if (path === undefined) throw new Error('usage: heartbeat.ts <file>');
const end = Date.now() + 60_000;
const timer = setInterval(() => {
  appendFileSync(path, `${process.pid}\n`);
  if (Date.now() > end) clearInterval(timer);
}, 100);
