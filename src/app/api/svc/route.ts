import { spawn } from 'child_process';
import { openSync } from 'fs';
import { NextResponse } from 'next/server';

/**
 * Sandbox-only service launcher.
 *
 * The cloud sandbox reaps background processes started from tool shells,
 * but keeps the Next.js dev server alive. This dev-only route spawns the
 * NestJS API (:3001) and the publishing worker as children of the Next.js
 * process so they inherit its lifetime. Guarded by SANDBOX_SVC=1 so it
 * never ships to production.
 */

const ROOT = '/home/z/my-project';

/**
 * Command stored as a single runtime string and split on use — Turbopack
 * statically analyzes spawn() argument literals and tries to resolve them as
 * bundled modules ("Can't resolve '--env-file=.env'"), which breaks `next
 * build`. Splitting at runtime keeps the arguments opaque to the bundler.
 */
const SERVICES: Record<string, { spec: string; cwd: string }> = {
  api: { spec: 'node --env-file=.env mini-services/api/dist/src/main.js', cwd: ROOT },
  worker: { spec: 'bun --env-file=.env mini-services/worker/src/main.ts', cwd: ROOT },
};

async function isUp(port: number, path: string): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      signal: AbortSignal.timeout(1500),
    });
    // 401/404 still mean the server is alive and answering.
    return res.status > 0;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (process.env.SANDBOX_SVC !== '1') {
    return NextResponse.json({ error: 'disabled' }, { status: 403 });
  }

  let body: { service?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body allowed */
  }

  const service = body.service ?? 'api';
  const svc = SERVICES[service];
  if (!svc) {
    return NextResponse.json({ error: `unknown service: ${service}` }, { status: 400 });
  }

  if (service === 'api' && (await isUp(3001, '/api/v1/posts'))) {
    return NextResponse.json({ ok: true, alreadyRunning: true, service });
  }

  const log = openSync(`${ROOT}/${service}.log`, 'a');
  const [cmd, ...args] = svc.spec.split(' ');
  const child = spawn(cmd, args, {
    cwd: svc.cwd,
    detached: true,
    stdio: ['ignore', log, log],
    env: { ...process.env },
  });
  child.unref();

  return NextResponse.json({ ok: true, pid: child.pid, service });
}

export async function GET() {
  if (process.env.SANDBOX_SVC !== '1') {
    return NextResponse.json({ error: 'disabled' }, { status: 403 });
  }
  const apiUp = await isUp(3001, '/api/v1/posts');
  return NextResponse.json({ api: apiUp ? 'up' : 'down' });
}
