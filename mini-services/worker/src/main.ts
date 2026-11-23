/**
 * SMM publishing worker — entry point.
 *
 * Plain Bun TypeScript process (no framework, no decorators):
 *   bun --env-file=../../.env src/main.ts
 *
 * Executes PublishingJob rows created by the NestJS API, independently of any
 * browser. See queue.ts (db/redis execution layers) and processor.ts
 * (publish semantics, retries, idempotency).
 */
import { prisma } from './lib/prisma';
import { workerLog } from './processor';
import { resolveDriver, startQueue, type QueueRuntime } from './queue';

let runtime: QueueRuntime | null = null;
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  workerLog(`${signal} received — draining in-flight jobs…`);
  try {
    if (runtime) await runtime.stop();
    await prisma.$disconnect();
    workerLog('shutdown complete — goodbye');
  } catch (err) {
    workerLog(`shutdown warning: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    process.exit(0);
  }
}

async function main(): Promise<void> {
  const driver = resolveDriver();
  workerLog(`starting publishing worker (pid=${process.pid}, driver=${driver})`);

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    workerLog(`unhandledRejection: ${reason instanceof Error ? reason.message : String(reason)}`);
  });
  process.on('uncaughtException', (err) => {
    workerLog(`uncaughtException: ${err.message} — exiting 1`);
    process.exit(1);
  });

  // startQueue resolves POSTGRES_URL transitively (lib/prisma) — a missing
  // config throws here and we exit loudly instead of idling.
  try {
    runtime = startQueue(driver);
  } catch (err) {
    workerLog(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  workerLog('ready — waiting for due PublishingJobs');
}

void main();
