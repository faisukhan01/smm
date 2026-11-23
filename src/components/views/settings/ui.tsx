'use client';

import type { ComponentProps, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle, Info } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Shared building blocks for the Settings suite: permission-gated buttons,
 * muted informational alerts and query-error alerts with retry.
 */

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong. Please try again.';
}

interface PermGateButtonProps extends Omit<ComponentProps<typeof Button>, 'disabled'> {
  /** Whether the current session role holds the required permission. */
  allowed: boolean;
  /** Shown in a tooltip when the permission is missing. */
  deniedMessage: string;
  /** Regular disabled state (still honored when the permission is present). */
  disabled?: boolean;
}

/**
 * Button that is disabled with an explanatory tooltip when the session lacks
 * the permission required by the underlying mutation.
 */
export function PermGateButton({ allowed, deniedMessage, disabled, children, ...props }: PermGateButtonProps) {
  if (allowed && !disabled) {
    return <Button {...props}>{children}</Button>;
  }

  const button = <Button disabled {...props}>{children}</Button>;

  if (allowed && disabled) return button;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-not-allowed">{button}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-56 text-xs">{deniedMessage}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface MutedAlertProps {
  icon?: LucideIcon;
  title?: string;
  children: ReactNode;
  className?: string;
}

/** Muted, dashed-border alert for honest notices (API limits, pending providers, etc.). */
export function MutedAlert({ icon: Icon = Info, title, children, className }: MutedAlertProps) {
  return (
    <Alert className={cn('border-dashed bg-muted/40', className)}>
      <Icon className="size-4 shrink-0" />
      {title ? <AlertTitle className="text-[13px]">{title}</AlertTitle> : null}
      <AlertDescription className="text-xs leading-relaxed text-muted-foreground">
        {children}
      </AlertDescription>
    </Alert>
  );
}

interface LoadErrorProps {
  message: string;
  onRetry: () => void;
  className?: string;
}

/** Destructive alert with a retry action for failed queries. */
export function LoadError({ message, onRetry, className }: LoadErrorProps) {
  return (
    <Alert variant="destructive" className={className}>
      <AlertCircle className="size-4 shrink-0" />
      <AlertTitle className="text-[13px]">Something went wrong</AlertTitle>
      <AlertDescription className="text-xs">
        <p>{message}</p>
        <Button variant="outline" size="sm" className="mt-2 h-7 border-destructive/40 text-xs" onClick={onRetry}>
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}
