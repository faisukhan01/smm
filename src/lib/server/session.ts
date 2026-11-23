import { cookies } from 'next/headers';
import type { SessionPayload } from '@smm/shared';

const API_PORT = process.env.API_PORT || '3001';
// Deployed API origin (e.g. https://smm-api.up.railway.app); falls back to
// the sandbox layout where the API runs on localhost next to the web app.
const API_BASE = process.env.API_BASE_URL || `http://127.0.0.1:${API_PORT}`;

/**
 * Server-side session lookup. Forwards the httpOnly cookie to the NestJS API
 * (server-to-server, direct port, never exposed to the browser).
 */
export async function getServerSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('smm_session')?.value;
  if (!token) return null;

  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/session`, {
      headers: { cookie: `smm_session=${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as SessionPayload;
  } catch {
    return null;
  }
}
