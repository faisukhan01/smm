'use client';

import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/**
 * Inline error state for failed queries — surfaces the server-provided
 * message (ApiError messages are user-facing) and offers an explicit retry.
 */
export function QueryErrorAlert({
  title = 'Something went wrong',
  error,
  onRetry,
  className,
}: {
  title?: string;
  error: unknown;
  onRetry: () => void;
  className?: string;
}) {
  const message =
    error instanceof ApiError
      ? error.message
      : 'Unexpected error while loading data. Please try again.';

  return (
    <Alert variant="destructive" className={className} role="alert">
      <AlertTriangle className="size-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span>{message}</span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 border-destructive/40 bg-transparent px-2.5 text-xs hover:bg-destructive/10 hover:text-destructive"
          onClick={onRetry}
        >
          <RefreshCcw className="size-3.5" />
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  );
}
