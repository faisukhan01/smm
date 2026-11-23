'use client';

import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Upload, X } from 'lucide-react';
import type { MediaDTO } from '@smm/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { ApiError, apiPost } from '@/lib/api/client';

/** Client-side upload caps, mirrored from the API contract. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'video/mp4']);
const ACCEPTED_FILES = 'image/png,image/jpeg,image/webp,video/mp4';

interface MediaUploaderProps {
  /** Attached media (uploads and generated images) shown as thumbnails. */
  media: MediaDTO[];
  onAttach: (media: MediaDTO) => void;
  onRemove: (id: string) => void;
}

/**
 * Reads a file as raw base64 (without the data: prefix) so it can be posted
 * straight to POST /media.
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      const commaIndex = dataUrl.indexOf(',');
      resolve(commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the selected file'));
    reader.readAsDataURL(file);
  });
}

export function MediaUploader({ media, onAttach, onRemove }: MediaUploaderProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pendingFile, setPendingFile] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: (payload: { base64: string; mimeType: string; altText?: string }) =>
      apiPost<MediaDTO>('/media', payload),
    onSuccess: (uploaded) => {
      onAttach(uploaded);
      toast({ title: 'Media uploaded', description: 'It is now attached to your post.' });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
      });
    },
    onSettled: () => setPendingFile(null),
  });

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      toast({
        variant: 'destructive',
        title: 'Unsupported file type',
        description: 'Allowed files: PNG, JPEG and WebP images, plus MP4 video.',
      });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast({
        variant: 'destructive',
        title: 'File is too large',
        description: 'Maximum upload size is 5 MB.',
      });
      return;
    }
    setPendingFile(file.name);
    try {
      const base64 = await fileToBase64(file);
      upload.mutate({ base64, mimeType: file.type, altText: file.name });
    } catch {
      setPendingFile(null);
      toast({ variant: 'destructive', title: 'Upload failed', description: 'The selected file could not be read.' });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="size-4 text-primary" aria-hidden />
          Upload media
        </CardTitle>
        <CardDescription>PNG, JPEG and WebP images, plus MP4 video, up to 5 MB.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_FILES}
          className="sr-only"
          aria-label="Upload media file"
          onChange={(event) => {
            void handleFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
        >
          {upload.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Upload className="size-4" aria-hidden />
          )}
          {upload.isPending ? `Uploading ${pendingFile ?? 'file'}...` : 'Choose a file'}
        </Button>

        {media.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {media.map((item) => (
              <div key={item.id} className="group relative">
                {item.type === 'IMAGE' ? (
                  // eslint-disable-next-line @next/next/no-img-element -- media is served by this app under /api/media
                  <img
                    src={item.url}
                    alt={item.altText ?? 'Attached media'}
                    className="size-16 rounded-md border object-cover"
                  />
                ) : (
                  <video
                    src={item.url}
                    muted
                    playsInline
                    preload="metadata"
                    className="size-16 rounded-md border object-cover"
                    aria-label={item.altText ?? 'Attached video'}
                  />
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute -right-1.5 -top-1.5 size-5 rounded-full shadow-sm"
                  onClick={() => onRemove(item.id)}
                  aria-label={`Remove ${item.altText ?? 'media'}`}
                >
                  <X className="size-3" aria-hidden />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Nothing attached yet — uploads and generated images land here and in the composer.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
