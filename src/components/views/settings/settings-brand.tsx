'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SessionPayload } from '@smm/shared';
import { roleHas } from '@smm/shared';
import { apiGet, apiPut } from '@/lib/api/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { LoadError, PermGateButton, errorMessage } from '@/components/views/settings/ui';

/** Mirrors the nullable BrandProfile record returned by GET /brand. */
type BrandProfile = {
  businessName: string | null;
  description: string | null;
  industry: string | null;
  productsServices: string | null;
  targetAudience: string | null;
  brandVoice: string | null;
  writingStyle: string | null;
  brandColors: string | null;
  contentRestrictions: string | null;
  language: string | null;
  website: string | null;
  links: string | null;
};

type BrandForm = Record<keyof BrandProfile, string>;

const EMPTY_FORM: BrandForm = {
  businessName: '',
  description: '',
  industry: '',
  productsServices: '',
  targetAudience: '',
  brandVoice: '',
  writingStyle: '',
  brandColors: '',
  contentRestrictions: '',
  language: '',
  website: '',
  links: '',
};

function toForm(profile: BrandProfile | null): BrandForm {
  if (!profile) return { ...EMPTY_FORM };
  return {
    businessName: profile.businessName ?? '',
    description: profile.description ?? '',
    industry: profile.industry ?? '',
    productsServices: profile.productsServices ?? '',
    targetAudience: profile.targetAudience ?? '',
    brandVoice: profile.brandVoice ?? '',
    writingStyle: profile.writingStyle ?? '',
    brandColors: profile.brandColors ?? '',
    contentRestrictions: profile.contentRestrictions ?? '',
    language: profile.language ?? '',
    website: profile.website ?? '',
    links: profile.links ?? '',
  };
}

/** Empty string becomes null so the API stores an honest absence, not whitespace. */
function toPayload(form: BrandForm): Partial<BrandProfile> {
  return {
    businessName: form.businessName.trim() || null,
    description: form.description.trim() || null,
    industry: form.industry.trim() || null,
    productsServices: form.productsServices.trim() || null,
    targetAudience: form.targetAudience.trim() || null,
    brandVoice: form.brandVoice.trim() || null,
    writingStyle: form.writingStyle.trim() || null,
    brandColors: form.brandColors.trim() || null,
    contentRestrictions: form.contentRestrictions.trim() || null,
    language: form.language.trim() || null,
    website: form.website.trim() || null,
    links: form.links.trim() || null,
  };
}

export function BrandProfileSettings({ session }: { session: SessionPayload }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BrandForm>(EMPTY_FORM);

  const canWrite = roleHas(session.role, 'brand:write');

  const brandQ = useQuery({
    queryKey: ['brand'],
    queryFn: () => apiGet<BrandProfile | null>('/brand'),
  });

  useEffect(() => {
    if (brandQ.isSuccess) {
      setForm(toForm(brandQ.data ?? null));
    }
  }, [brandQ.isSuccess, brandQ.data]);

  const saveMut = useMutation({
    mutationFn: () => apiPut<BrandProfile>('/brand', toPayload(form)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand'] });
      toast({ title: 'Brand profile saved' });
    },
    onError: (e) => toast({ title: 'Could not save brand profile', description: errorMessage(e), variant: 'destructive' }),
  });

  function set<K extends keyof BrandForm>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  if (brandQ.isLoading) {
    return (
      <Card className="rounded-lg">
        <CardHeader className="gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-72" />
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (brandQ.isError) {
    return <LoadError message={errorMessage(brandQ.error)} onRetry={() => void brandQ.refetch()} />;
  }

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle className="text-sm font-semibold tracking-tight">Brand Profile</CardTitle>
        <CardDescription className="text-xs leading-relaxed">
          Context that grounds every AI generation — what you sell, who you talk to, and how you sound. All fields are
          optional; the more specific the answers, the better the output.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="brand-business-name" className="text-xs">Business name</Label>
            <Input id="brand-business-name" value={form.businessName} onChange={(e) => set('businessName', e.target.value)} className="text-[13px]" placeholder="Acme Studio" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand-industry" className="text-xs">Industry</Label>
            <Input id="brand-industry" value={form.industry} onChange={(e) => set('industry', e.target.value)} className="text-[13px]" placeholder="E-commerce, SaaS, hospitality…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand-website" className="text-xs">Website</Label>
            <Input id="brand-website" value={form.website} onChange={(e) => set('website', e.target.value)} className="text-[13px]" placeholder="https://example.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand-language" className="text-xs">Language</Label>
            <Input id="brand-language" value={form.language} onChange={(e) => set('language', e.target.value)} className="text-[13px]" placeholder="English" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="brand-description" className="text-xs">Description</Label>
          <Textarea id="brand-description" value={form.description} onChange={(e) => set('description', e.target.value)} className="min-h-20 text-[13px]" placeholder="What the business does, in a few sentences" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="brand-products" className="text-xs">Products &amp; services</Label>
          <Textarea id="brand-products" value={form.productsServices} onChange={(e) => set('productsServices', e.target.value)} className="min-h-20 text-[13px]" placeholder="Key products or services AI should know about" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="brand-audience" className="text-xs">Target audience</Label>
          <Input id="brand-audience" value={form.targetAudience} onChange={(e) => set('targetAudience', e.target.value)} className="text-[13px]" placeholder="Who the content is for" />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="brand-voice" className="text-xs">Brand voice</Label>
            <Textarea id="brand-voice" value={form.brandVoice} onChange={(e) => set('brandVoice', e.target.value)} className="min-h-16 text-[13px]" placeholder="e.g. warm, expert, a little playful" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand-style" className="text-xs">Writing style</Label>
            <Textarea id="brand-style" value={form.writingStyle} onChange={(e) => set('writingStyle', e.target.value)} className="min-h-16 text-[13px]" placeholder="e.g. short sentences, second person, no exclamation marks" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand-colors" className="text-xs">Brand colors</Label>
            <Input id="brand-colors" value={form.brandColors} onChange={(e) => set('brandColors', e.target.value)} className="text-[13px]" placeholder="e.g. #0F766E primary, zinc neutrals" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand-links" className="text-xs">Links</Label>
            <Input id="brand-links" value={form.links} onChange={(e) => set('links', e.target.value)} className="text-[13px]" placeholder="Social profiles, press kit, blog" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="brand-restrictions" className="text-xs">Content restrictions</Label>
          <Textarea id="brand-restrictions" value={form.contentRestrictions} onChange={(e) => set('contentRestrictions', e.target.value)} className="min-h-16 text-[13px]" placeholder="Topics or claims AI must avoid" />
        </div>

        <div className="flex justify-end border-t pt-4">
          <PermGateButton
            allowed={canWrite}
            deniedMessage="Editing the brand profile requires the brand:write permission (Manager or above)."
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            aria-label="Save brand profile"
          >
            {saveMut.isPending ? 'Saving…' : 'Save brand profile'}
          </PermGateButton>
        </div>
      </CardContent>
    </Card>
  );
}
