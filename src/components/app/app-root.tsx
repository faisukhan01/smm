'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SessionPayload } from '@smm/shared';
import { Landing } from '@/components/landing/landing';
import { Dashboard } from '@/components/app/dashboard';

/**
 * Single-route application gate (sandbox constraint: only "/" is user-visible).
 * Unauthenticated visitors see the marketing site; authenticated users get the
 * full product dashboard.
 */
export function AppRoot({ initialSession }: { initialSession: SessionPayload | null }) {
  const [session, setSession] = useState<SessionPayload | null>(initialSession);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {session ? (
        <Dashboard session={session} onSessionChange={setSession} />
      ) : (
        <Landing onAuthed={setSession} />
      )}
    </QueryClientProvider>
  );
}
