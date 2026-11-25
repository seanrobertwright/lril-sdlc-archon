/**
 * Stopping a command together with everything it started.
 *
 * Killing the process that was spawned is not enough: a shell's children outlive it. Nor
 * is a walk of parent PIDs: a child whose own parent has exited is no longer linked to the
 * command, and a script that `exec`s under Git for Windows' bash can leave such a child.
 *
 * On Windows this process joins a job object, so whatever it starts is in the job too, and
 * a stop kills the members that were not there before the command. The job never allows
 * breakaway, so nothing leaves it.
 *
 * On POSIX the command leads its own process group, and a stop kills that group. A process
 * that moves itself to another group (`setsid`) is not found. Archon stops a node by
 * killing the node's group, which the command is no longer in, so a watcher in the
 * command's group kills it once this process is gone.
 */
import { dlopen, FFIType } from 'bun:ffi';

export interface Contained {
  /** What to spawn in place of the command. */
  readonly argv: readonly string[];
  /** Whether to spawn it detached, leading its own process group. */
  readonly detached: boolean;
  /** Kill the command, whose spawned process had `pid`, and all it started; on Windows, throw when a process outlives that. */
  stop(pid: number): void;
}

/** How long a stop waits for what it killed to be gone. */
const STOP_MS = 10_000;
const REAP_MS = 2000;
const POLL_MS = 20;

/** Prepare to run `argv` so it can be stopped. Call it immediately before spawning. */
export function contain(argv: readonly string[]): Contained {
  return process.platform === 'win32' ? containWindows(argv) : containPosix(argv);
}

// $1 is the process to outlive; the rest is the command, run with its own exit code. The
// watcher holds none of the command's streams, so it does not keep them open.
const LIFELINE = [
  '(while kill -0 "$1" 2>/dev/null; do sleep 1; done; kill -KILL 0) </dev/null >/dev/null 2>&1 &',
  'watcher=$!',
  'shift',
  '"$@"',
  'code=$?',
  'kill "$watcher" 2>/dev/null',
  'exit "$code"',
].join('\n');

function containPosix(argv: readonly string[]): Contained {
  return {
    argv: ['sh', '-c', LIFELINE, 'lril-check', String(process.pid), ...argv],
    detached: true,
    stop(pid) {
      // SIGKILL cannot be refused, so a group still there at the deadline runs no more of its
      // own code; most likely it waits to be reaped, as in a container whose init reaps nothing.
      const deadline = Date.now() + REAP_MS;
      for (;;) {
        try {
          process.kill(-pid, 'SIGKILL');
        } catch {
          return;
        }
        if (Date.now() >= deadline) return;
        Bun.sleepSync(POLL_MS);
      }
    },
  };
}

const PROCESS_ID_LIST = 3;
const PROCESS_TERMINATE = 0x0001;
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const ERROR_MORE_DATA = 234;

/** Handles are u64, so GetCurrentProcess's pseudo handle survives as a bigint; a null handle is 0n. */
function openKernel32() {
  return dlopen('kernel32.dll', {
    CreateJobObjectW: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.u64 },
    GetCurrentProcess: { args: [], returns: FFIType.u64 },
    AssignProcessToJobObject: { args: [FFIType.u64, FFIType.u64], returns: FFIType.i32 },
    QueryInformationJobObject: { args: [FFIType.u64, FFIType.i32, FFIType.ptr, FFIType.u32, FFIType.ptr], returns: FFIType.i32 },
    OpenProcess: { args: [FFIType.u32, FFIType.i32, FFIType.u32], returns: FFIType.u64 },
    IsProcessInJob: { args: [FFIType.u64, FFIType.u64, FFIType.ptr], returns: FFIType.i32 },
    TerminateProcess: { args: [FFIType.u64, FFIType.u32], returns: FFIType.i32 },
    CloseHandle: { args: [FFIType.u64], returns: FFIType.i32 },
    GetLastError: { args: [], returns: FFIType.u32 },
  }).symbols;
}

interface Job {
  readonly kernel32: ReturnType<typeof openKernel32>;
  readonly handle: bigint;
}

let job: Job | undefined;

/** The job this process is in, joined on first use and left only when it exits. */
function joinJob(): Job {
  if (job !== undefined) return job;
  const kernel32 = openKernel32();
  const handle = kernel32.CreateJobObjectW(null, null);
  if (handle === 0n) throw new Error('CreateJobObjectW failed');
  if (kernel32.AssignProcessToJobObject(handle, kernel32.GetCurrentProcess()) === 0) {
    kernel32.CloseHandle(handle);
    throw new Error('AssignProcessToJobObject failed');
  }
  job = { kernel32, handle };
  return job;
}

/** The PIDs in the job. The list is two DWORDs, assigned and listed, then one pointer-sized PID each. */
function members({ kernel32, handle }: Job): number[] {
  for (let capacity = 256; capacity <= 65_536; capacity *= 4) {
    const list = Buffer.alloc(8 + 8 * capacity);
    if (kernel32.QueryInformationJobObject(handle, PROCESS_ID_LIST, list, list.length, null) !== 0) {
      return Array.from({ length: list.readUInt32LE(4) }, (_, index) => Number(list.readBigUInt64LE(8 + 8 * index)));
    }
    if (kernel32.GetLastError() !== ERROR_MORE_DATA) break;
  }
  throw new Error('QueryInformationJobObject failed');
}

/** Terminate `pid` if it is in the job: the PID may have passed to an unrelated process since it was listed. */
function terminate({ kernel32, handle }: Job, pid: number): void {
  const target = kernel32.OpenProcess(PROCESS_TERMINATE | PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
  if (target === 0n) return;
  const isMember = Buffer.alloc(4);
  if (kernel32.IsProcessInJob(target, handle, isMember) !== 0 && isMember.readInt32LE(0) !== 0) kernel32.TerminateProcess(target, 1);
  kernel32.CloseHandle(target);
}

function containWindows(argv: readonly string[]): Contained {
  let joined: Job;
  let before: Set<number>;
  try {
    joined = joinJob();
    before = new Set(members(joined));
  } catch (error) {
    // Only a command that times out needs the job, so one that does not still runs without it.
    const reason = error instanceof Error ? error.message : String(error);
    return {
      argv,
      detached: false,
      stop() {
        throw new Error(`What it started could not be stopped (${reason}), and may still be running.`);
      },
    };
  }
  return {
    argv,
    detached: false,
    stop() {
      const deadline = Date.now() + STOP_MS;
      for (;;) {
        // Again each time: a process caught mid-spawn adds one after the list was read.
        const left = members(joined).filter(pid => !before.has(pid));
        if (left.length === 0) return;
        if (Date.now() >= deadline) throw new Error(`Process(es) it started are still running: ${left.join(', ')}.`);
        for (const pid of left) terminate(joined, pid);
        Bun.sleepSync(POLL_MS);
      }
    },
  };
}
