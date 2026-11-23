'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Wand2 } from 'lucide-react';
import type { CaptionInput, Platform } from '@smm/shared';
import { PLATFORMS } from '@smm/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiPost } from '@/lib/api/client';
import { aiErrorMessage } from './helpers';
import { PlatformDot } from './platform-dots';

export interface CaptionVariant {
  caption: string;
  hashtags: string[];
}

interface CaptionResponse {
  variants: CaptionVariant[];
  creditsUsed: number;
}

const TONES = ['professional', 'friendly', 'enthusiastic', 'informative', 'witty', 'persuasive'] as const;
const GOALS = ['engagement', 'awareness', 'promotion', 'education', 'community'] as const;

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

interface CaptionGeneratorProps {
  /** Whether the current role may use AI features (perm ai:use). */
  enabled: boolean;
  /** Applies a generated variant to the composer. */
  onUse: (variant: CaptionVariant) => void;
}

export function CaptionGenerator({ enabled, onUse }: CaptionGeneratorProps) {
  const { toast } = useToast();
  const [topic, setTopic] = useState('');
  const [platform, setPlatform] = useState<Platform>('FACEBOOK');
  const [tone, setTone] = useState<CaptionInput['tone']>('professional');
  const [goal, setGoal] = useState<CaptionInput['goal']>('engagement');
  const [language, setLanguage] = useState('English');
  const [variants, setVariants] = useState<1 | 2 | 3>(2);
  const [includeHashtags, setIncludeHashtags] = useState(true);
  const [results, setResults] = useState<CaptionVariant[]>([]);

  const generate = useMutation({
    mutationFn: (input: CaptionInput) => apiPost<CaptionResponse>('/ai/caption', input),
    onSuccess: (data) => {
      setResults(data.variants);
      toast({
        title: `${data.variants.length} caption${data.variants.length === 1 ? '' : 's'} generated`,
        description: `${data.creditsUsed} AI credit${data.creditsUsed === 1 ? '' : 's'} used`,
      });
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Caption generation failed', description: aiErrorMessage(error) });
    },
  });

  const topicReady = topic.trim().length >= 3;
  const canGenerate = enabled && topicReady && !generate.isPending;

  const run = () => {
    if (!canGenerate) return;
    generate.mutate({
      topic: topic.trim(),
      platform,
      tone,
      goal,
      language: language.trim() || 'English',
      variants,
      includeHashtags,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wand2 className="size-4 text-primary" aria-hidden />
          AI Content Generator
        </CardTitle>
        <CardDescription>Generate on-brand captions for any platform.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="caption-topic">Topic</Label>
          <Textarea
            id="caption-topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="e.g. Announce our new spring collection..."
            rows={3}
            className="min-h-20"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="caption-platform">Platform</Label>
            <Select value={platform} onValueChange={(value) => setPlatform(value as Platform)}>
              <SelectTrigger id="caption-platform" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((option) => (
                  <SelectItem key={option} value={option}>
                    <span className="flex items-center gap-2">
                      <PlatformDot platform={option} />
                      {option.charAt(0) + option.slice(1).toLowerCase()}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="caption-tone">Tone</Label>
            <Select value={tone} onValueChange={(value) => setTone(value)}>
              <SelectTrigger id="caption-tone" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {capitalize(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="caption-goal">Goal</Label>
            <Select value={goal} onValueChange={(value) => setGoal(value)}>
              <SelectTrigger id="caption-goal" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GOALS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {capitalize(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="caption-language">Language</Label>
            <Input
              id="caption-language"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              placeholder="English"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="caption-variants">Variants</Label>
            <Select value={String(variants)} onValueChange={(value) => setVariants(Number(value) as 1 | 2 | 3)}>
              <SelectTrigger id="caption-variants" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1</SelectItem>
                <SelectItem value="2">2</SelectItem>
                <SelectItem value="3">3</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex h-9 items-center justify-end gap-2">
            <Switch id="caption-hashtags" checked={includeHashtags} onCheckedChange={setIncludeHashtags} />
            <Label htmlFor="caption-hashtags" className="text-[13px] font-normal">
              Include hashtags
            </Label>
          </div>
        </div>

        <Button
          type="button"
          className="w-full"
          onClick={run}
          disabled={!canGenerate}
          title={!enabled ? 'Requires permission: ai:use' : !topicReady ? 'Write a topic of at least 3 characters' : undefined}
        >
          {generate.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wand2 className="size-4" aria-hidden />}
          {generate.isPending ? 'Generating...' : 'Generate captions'}
        </Button>

        {generate.isPending && results.length > 0 ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Generating new variants...
          </p>
        ) : null}

        {results.length > 0 ? (
          <div className="space-y-3 border-t pt-4">
            {results.map((variant, index) => (
              <div key={index} className="rounded-lg border p-3">
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{variant.caption}</p>
                {variant.hashtags.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {variant.hashtags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      onUse(variant);
                      toast({ title: 'Caption added to the composer' });
                    }}
                  >
                    Use this
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={run}
                    disabled={!enabled || generate.isPending || !topicReady}
                  >
                    Regenerate
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
