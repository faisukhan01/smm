import { NextResponse } from 'next/server';

/** Liveness endpoint for platform health checks and keep-alive pings. */
export function GET() {
  return NextResponse.json({
    ok: true,
    service: 'smm-api',
    runtime: 'next-fullstack',
    timestamp: new Date().toISOString(),
  });
}
