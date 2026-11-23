'use client';

import type { SessionPayload } from '@smm/shared';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BrandProfileSettings } from '@/components/views/settings/settings-brand';
import { AiSettings } from '@/components/views/settings/settings-ai';
import { WorkspaceTeamSettings } from '@/components/views/settings/settings-workspace';
import { BillingSettings } from '@/components/views/settings/settings-billing';
import { AccountSettings } from '@/components/views/settings/settings-account';
import { AuditLogSettings } from '@/components/views/settings/settings-audit';

const TABS = [
  { value: 'brand', label: 'Brand Profile' },
  { value: 'ai', label: 'AI Settings' },
  { value: 'team', label: 'Workspace & Team' },
  { value: 'billing', label: 'Billing' },
  { value: 'account', label: 'Account' },
  { value: 'audit', label: 'Audit Log' },
] as const;

export function SettingsView({ session }: { session: SessionPayload }) {
  return (
    <Tabs defaultValue="brand" className="w-full">
      <TabsList className="grid h-auto w-full grid-cols-3 lg:grid-cols-6">
        {TABS.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className="px-2 py-1.5 text-xs sm:text-[13px]">
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="brand" className="mt-4">
        <BrandProfileSettings session={session} />
      </TabsContent>
      <TabsContent value="ai" className="mt-4">
        <AiSettings session={session} />
      </TabsContent>
      <TabsContent value="team" className="mt-4">
        <WorkspaceTeamSettings session={session} />
      </TabsContent>
      <TabsContent value="billing" className="mt-4">
        <BillingSettings session={session} />
      </TabsContent>
      <TabsContent value="account" className="mt-4">
        <AccountSettings session={session} />
      </TabsContent>
      <TabsContent value="audit" className="mt-4">
        <AuditLogSettings session={session} />
      </TabsContent>
    </Tabs>
  );
}
