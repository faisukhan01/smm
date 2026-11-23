'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ImageIcon, Loader2, Plus, Wand2 } from 'lucide-react';
import type { ImageInput, MediaDTO } from '@smm/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiPost } from '@/lib/api/client';
import { aiErrorMessage } from './helpers';

interface ImageResponse {
  mediaId: string;
  url: string;
}

interface GeneratedImage {
  mediaId: string;
  url: string;
  aspectRatio: ImageInput['aspectRatio'];
  prompt: string;
}

const ASPECT_OPTIONS: { value: ImageInput['aspectRatio']; label: string }[] = [
  { value: '1:1', label: '1:1 Square' },
  { value: '4:5', label: '4:5 Portrait' },
  { value: '9:16', label: '9:16 Story' },
  { value: '16:9', label: '16:9 Landscape' },
];

const ASPECT_CLASS: Record<ImageInput['aspectRatio'], string> = {
  '1:1': 'aspect-square',
  '4:5': 'aspect-[4/5]',
  '9:16': 'aspect-[9/16]',
  '16:9': 'aspect-video',
};

interface ImageGeneratorProps {
  /** Whether the current role may use AI features (perm ai:use). */
  enabled: boolean;
  /** Media ids already attached to the composer, to reflect the attached state. */
  attachedIds: string[];
  /** Adds the generated image to the composer media list. */
  onAttach: (media: MediaDTO) => void;
}

export function ImageGenerator({ enabled, attachedIds, onAttach }: ImageGeneratorProps) {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<ImageInput['aspectRatio']>('1:1');
  const [result, setResult] = useState<GeneratedImage | null>(null);

  const generate = useMutation({
    mutationFn: (input: ImageInput) => apiPost<ImageResponse>('/ai/image', input),
    onSuccess: (data, variables) => {
      setResult({ ...data, aspectRatio: variables.aspectRatio, prompt: variables.prompt });
      toast({ title: 'Image generated', description: 'Attach it to your post or generate another one.' });
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Image generation failed', description: aiErrorMessage(error) });
    },
  });

  const promptReady = prompt.trim().length >= 3;
  const canGenerate = enabled && promptReady && !generate.isPending;
  const attached = result ? attachedIds.includes(result.mediaId) : false;

  const attach = () => {
    if (!result || attached) return;
    onAttach({
      id: result.mediaId,
      url: result.url,
      type: 'IMAGE',
      aspectRatio: result.aspectRatio,
      altText: null,
      provider: 'GENERATED',
    });
    toast({ title: 'Image attached to the composer' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="size-4 text-primary" aria-hidden />
          AI Image
        </CardTitle>
        <CardDescription>Create original visuals for your post.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="image-prompt">Prompt</Label>
          <Input
            id="image-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="e.g. Flat lay of pastel spring products on linen"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="image-aspect">Aspect ratio</Label>
          <Select value={aspectRatio} onValueChange={(value) => setAspectRatio(value as ImageInput['aspectRatio'])}>
            <SelectTrigger id="image-aspect" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASPECT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          type="button"
          className="w-full"
          onClick={() => canGenerate && generate.mutate({ prompt: prompt.trim(), aspectRatio })}
          disabled={!canGenerate}
          title={!enabled ? 'Requires permission: ai:use' : !promptReady ? 'Write a prompt of at least 3 characters' : undefined}
        >
          {generate.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Wand2 className="size-4" aria-hidden />
          )}
          {generate.isPending ? 'Generating...' : 'Generate image'}
        </Button>

        {result ? (
          <div className="space-y-3 border-t pt-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- media is served by this app under /api/media */}
            <img
              src={result.url}
              alt={`AI generated image for: ${result.prompt}`}
              className={`${ASPECT_CLASS[result.aspectRatio]} w-full rounded-md border object-cover`}
            />
            <Button type="button" variant="secondary" className="w-full" onClick={attach} disabled={attached}>
              <Plus className="size-4" aria-hidden />
              {attached ? 'Attached to post' : 'Attach to post'}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
