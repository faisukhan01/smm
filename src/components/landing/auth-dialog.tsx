'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import type { LoginInput, RegisterInput, SessionPayload } from '@smm/shared';
import { loginSchema, registerSchema } from '@smm/shared';
import { apiPost, ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
// NOTE: this repo exports `useToast` from '@/hooks/use-toast'; '@/components/ui/toast'
// only contains the radix toast primitives.
import { useToast } from '@/hooks/use-toast';
import type { LegalDoc } from './legal-dialog';

export type AuthTab = 'login' | 'register';

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: AuthTab;
  onTabChange: (tab: AuthTab) => void;
  onAuthed: (session: SessionPayload) => void;
  onOpenLegal: (doc: LegalDoc) => void;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

function LoginForm({ onAuthed }: { onAuthed: (session: SessionPayload) => void }) {
  const { toast } = useToast();
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const session = await apiPost<SessionPayload>('/auth/login', values);
      toast({
        title: 'Signed in',
        description: `Welcome back, ${session.user.name}.`,
      });
      onAuthed(session);
    } catch (error) {
      if (error instanceof ApiError) {
        form.setError('root', { message: error.message });
        for (const issue of error.issues ?? []) {
          if (issue.path === 'email' || issue.path === 'password') {
            form.setError(issue.path, { message: issue.message });
          }
        }
        toast({ variant: 'destructive', title: 'Sign in failed', description: error.message });
      } else {
        const message = 'Something went wrong. Please try again.';
        form.setError('root', { message });
        toast({ variant: 'destructive', title: 'Sign in failed', description: message });
      }
    }
  });

  const isSubmitting = form.formState.isSubmitting;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="login-email">Email</Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          aria-invalid={Boolean(form.formState.errors.email)}
          {...form.register('email')}
        />
        <FieldError message={form.formState.errors.email?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="login-password">Password</Label>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          aria-invalid={Boolean(form.formState.errors.password)}
          {...form.register('password')}
        />
        <FieldError message={form.formState.errors.password?.message} />
      </div>
      <FieldError message={form.formState.errors.root?.message} />
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Signing in…
          </>
        ) : (
          'Sign in'
        )}
      </Button>
    </form>
  );
}

function RegisterForm({
  onAuthed,
  onOpenLegal,
}: {
  onAuthed: (session: SessionPayload) => void;
  onOpenLegal: (doc: LegalDoc) => void;
}) {
  const { toast } = useToast();
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const session = await apiPost<SessionPayload>('/auth/register', values);
      toast({
        title: 'Account created',
        description: `Welcome to SMM, ${session.user.name}.`,
      });
      onAuthed(session);
    } catch (error) {
      if (error instanceof ApiError) {
        form.setError('root', { message: error.message });
        for (const issue of error.issues ?? []) {
          if (issue.path === 'name' || issue.path === 'email' || issue.path === 'password') {
            form.setError(issue.path, { message: issue.message });
          }
        }
        toast({
          variant: 'destructive',
          title: 'Could not create account',
          description: error.message,
        });
      } else {
        const message = 'Something went wrong. Please try again.';
        form.setError('root', { message });
        toast({
          variant: 'destructive',
          title: 'Could not create account',
          description: message,
        });
      }
    }
  });

  const isSubmitting = form.formState.isSubmitting;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="register-name">Name</Label>
        <Input
          id="register-name"
          type="text"
          autoComplete="name"
          placeholder="Your name or your business name"
          aria-invalid={Boolean(form.formState.errors.name)}
          {...form.register('name')}
        />
        <FieldError message={form.formState.errors.name?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="register-email">Email</Label>
        <Input
          id="register-email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          aria-invalid={Boolean(form.formState.errors.email)}
          {...form.register('email')}
        />
        <FieldError message={form.formState.errors.email?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="register-password">Password</Label>
        <Input
          id="register-password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          aria-invalid={Boolean(form.formState.errors.password)}
          {...form.register('password')}
        />
        <FieldError message={form.formState.errors.password?.message} />
      </div>
      <FieldError message={form.formState.errors.root?.message} />
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Creating account…
          </>
        ) : (
          'Create account'
        )}
      </Button>
      <p className="text-xs leading-relaxed text-muted-foreground">
        By creating an account you agree to the{' '}
        <button
          type="button"
          className="font-medium text-primary underline underline-offset-2"
          onClick={() => onOpenLegal('terms')}
        >
          Terms of Service
        </button>
        .
      </p>
    </form>
  );
}

export function AuthDialog({
  open,
  onOpenChange,
  tab,
  onTabChange,
  onAuthed,
  onOpenLegal,
}: AuthDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Welcome to SMM</DialogTitle>
          <DialogDescription>
            Sign in to your workspace, or create an account to start publishing.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(value) => onTabChange(value as AuthTab)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Sign in</TabsTrigger>
            <TabsTrigger value="register">Create account</TabsTrigger>
          </TabsList>
          <TabsContent value="login">
            <LoginForm onAuthed={onAuthed} />
          </TabsContent>
          <TabsContent value="register">
            <RegisterForm onAuthed={onAuthed} onOpenLegal={onOpenLegal} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
