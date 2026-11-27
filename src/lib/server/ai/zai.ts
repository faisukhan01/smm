/**
 * z-ai-web-dev-sdk access — mirrors the former NestJS API's common/zai.ts:
 * one SDK instance per process, fixed model, assistant-role system prompt,
 * thinking disabled, and robust JSON extraction from model replies.
 *
 * Client resolution:
 * - ZAI_API_KEY set (production, e.g. Vercel): constructs the client directly
 *   with the public Z.ai OpenAI-compatible endpoint — no config file needed.
 *   ZAI_BASE_URL overrides the endpoint (defaults to api.z.ai/api/paas/v4).
 * - Otherwise (sandbox/dev): ZAI.create() reads the local .z-ai-config file.
 *
 * The SDK is Node-only and has no import-time side effects, so a top-level
 * import mirrors the Nest code.
 */
import ZAI from 'z-ai-web-dev-sdk';

type ZaiClient = Awaited<ReturnType<typeof ZAI.create>>;

let cached: ZaiClient | null = null;

/** One SDK instance per process. */
export async function getZai(): Promise<ZaiClient> {
  if (cached) return cached;
  if (process.env.ZAI_API_KEY) {
    const config = {
      baseUrl: process.env.ZAI_BASE_URL || 'https://api.z.ai/api/paas/v4',
      apiKey: process.env.ZAI_API_KEY,
    };
    // The SDK only ships a config-file loader; constructing the class directly
    // with an equivalent config object keeps the wire behavior identical.
    const Ctor = ZAI as unknown as new (cfg: typeof config) => ZaiClient;
    cached = new Ctor(config);
  } else {
    cached = await ZAI.create();
  }
  return cached;
}

/**
 * Chat model. Defaults to glm-4.5-flash — Z.ai's free-tier model, so caption
 * generation works on any key even before any balance/resource package is
 * purchased (glm-4.6 and other paid models answer error 1113 on a
 * zero-balance key). Override with AI_MODEL to target any OpenAI-compatible
 * model (e.g. AI_MODEL=gemini-2.0-flash with
 * ZAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai).
 */
export const AI_MODEL = process.env.AI_MODEL || 'glm-4.5-flash';

/**
 * Image model. The OpenAI-compatible images endpoint requires an explicit
 * model (it 500s without one) and currently accepts cogview-4-250304;
 * override with ZAI_IMAGE_MODEL.
 */
export const AI_IMAGE_MODEL = process.env.ZAI_IMAGE_MODEL || 'cogview-4-250304';

/**
 * Gemini image models tried in order. gemini-2.5-flash-image ("Nano Banana")
 * is Google's free-tier capable image generator (Google AI Studio keys work
 * without billing); the 2.0 preview is a legacy fallback for older keys.
 * Override with GEMINI_IMAGE_MODEL.
 */
const GEMINI_IMAGE_MODELS = [
  process.env.GEMINI_IMAGE_MODEL,
  'gemini-2.5-flash-image',
  'gemini-2.0-flash-preview-image-generation',
].filter((m): m is string => Boolean(m));

/**
 * Guards against upstream error bodies: the OpenAI-compatible endpoint answers
 * failures as { error: { code, message } } (no `choices`), which used to crash
 * callers with a cryptic "Cannot read properties of undefined (reading '0')".
 */
export function assertCompletionOk(completion: unknown): void {
  const body = completion as { choices?: unknown; error?: { message?: string; code?: string | number } } | null;
  if (body && typeof body === 'object' && body.error) {
    const { message, code } = body.error;
    const detail = typeof message === 'string' ? message : 'unknown error';
    throw new Error(`AI provider error${code !== undefined ? ` (code ${code})` : ''}: ${detail}`);
  }
  if (!body || !Array.isArray(body.choices) || body.choices.length === 0) {
    throw new Error('AI provider returned no completion choices');
  }
}

/** Runs a chat completion with the system prompt sent under the 'assistant' role. */
export async function chatCompletion(zai: ZaiClient, system: string, user: string): Promise<string> {
  const completion = await zai.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: 'assistant', content: system },
      { role: 'user', content: user },
    ],
    thinking: { type: 'disabled' },
  });
  assertCompletionOk(completion);
  return completion.choices[0]?.message?.content ?? '';
}

/** Runs a chat completion over an existing message history (system prompt first). */
export async function chatCompletionWithHistory(
  zai: ZaiClient,
  system: string,
  history: { role: 'user' | 'assistant'; content: string }[],
): Promise<string> {
  const completion = await zai.chat.completions.create({
    model: AI_MODEL,
    messages: [{ role: 'assistant', content: system }, ...history],
    thinking: { type: 'disabled' },
  });
  assertCompletionOk(completion);
  return completion.choices[0]?.message?.content ?? '';
}

/**
 * Generates an image and returns the raw bytes plus the provider model that
 * produced them.
 *
 * Order of attempts (first success wins):
 * 1. Gemini (when GEMINI_API_KEY is set) — free-tier image generation via
 *    gemini-2.5-flash-image; Google AI Studio keys work without billing.
 * 2. Z.ai OpenAI-compatible images endpoint (when ZAI_API_KEY is set) with an
 *    explicit model — the SDK's images client neither sends a model (the
 *    endpoint answers HTTP 500 without one) nor tolerates error bodies (it
 *    crashes on `.data.map(...)`), and it hides upstream messages like error
 *    1113 "Insufficient balance".
 * 3. Pollinations.ai (free, keyless community image API) — automatic last
 *    fallback so Studio image generation keeps working on keys without
 *    balance. Sandbox path (no env keys) uses the config-file SDK client
 *    before it, same as before.
 *
 * Every provider failure is collected so the final error shows the full chain.
 */
export async function generateImage(
  prompt: string,
  size: string,
): Promise<{ buffer: Buffer; model: string; mimeType: string }> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const zaiKey = process.env.ZAI_API_KEY;
  const failures: string[] = [];

  if (geminiKey) {
    try {
      return await generateImageViaGemini(geminiKey, prompt, size);
    } catch (err) {
      failures.push(`Gemini: ${errMessage(err)}`);
    }
  }

  if (zaiKey) {
    try {
      return await generateImageViaZai(zaiKey, prompt, size);
    } catch (err) {
      failures.push(`Z.ai: ${errMessage(err)}`);
    }
  } else if (!geminiKey) {
    // No env keys at all (sandbox/dev): keep the config-file SDK client path.
    try {
      const zai = await getZai();
      const response = await zai.images.generations.create({ prompt, size: size as '1024x1024' });
      const base64 = response.data?.[0]?.base64;
      if (base64) {
        return { buffer: Buffer.from(base64, 'base64'), model: 'sdk', mimeType: 'image/png' };
      }
      failures.push('SDK: returned no image data');
    } catch (err) {
      failures.push(`SDK: ${errMessage(err)}`);
    }
  }

  try {
    return await generateImageViaPollinations(prompt, size);
  } catch (err) {
    const chain = failures.length > 0 ? ` Attempted: ${failures.join(' | ')}.` : '';
    throw new Error(`Image generation failed on every provider.${chain} Free fallback: ${errMessage(err)}`);
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Gemini generateContent image generation. Tries the model list in order and,
 * per model, retries once without imageConfig when the aspect-ratio option is
 * rejected (400/404 are config problems worth a retry; auth/quota errors fail
 * fast so the caller can move to the next provider).
 */
async function generateImageViaGemini(
  apiKey: string,
  prompt: string,
  size: string,
): Promise<{ buffer: Buffer; model: string; mimeType: string }> {
  let lastError: Error = new Error('Gemini image generation failed');
  for (const model of GEMINI_IMAGE_MODELS) {
    for (const withAspect of [true, false]) {
      try {
        return await geminiImageRequest(apiKey, model, prompt, withAspect ? aspectFromSize(size) : undefined);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const retriable = /\(HTTP (400|404)\)|\(code (400|404)\)/.test(lastError.message);
        if (!retriable) throw lastError;
        if (!withAspect) break; // aspect-off also rejected -> try the next model
      }
    }
  }
  throw lastError;
}

/** Maps a "WIDTHxHEIGHT" size onto the closest aspect ratio Gemini supports. */
function aspectFromSize(size: string): string | undefined {
  const [w, h] = size.split('x').map((n) => Number.parseInt(n, 10));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return undefined;
  const known: Array<[number, string]> = [
    [1, '1:1'],
    [4 / 5, '4:5'],
    [3 / 4, '3:4'],
    [9 / 16, '9:16'],
    [16 / 9, '16:9'],
  ];
  let best: string | undefined;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const [ratio, label] of known) {
    const diff = Math.abs(w / h - ratio);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = label;
    }
  }
  return bestDiff < 0.15 ? best : undefined;
}

type GeminiResponse = {
  error?: { code?: number | string; message?: string; status?: string };
  candidates?: Array<{
    finishReason?: string;
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: { mimeType?: string; data?: string };
        inline_data?: { mime_type?: string; data?: string };
      }>;
    };
  }>;
};

async function geminiImageRequest(
  apiKey: string,
  model: string,
  prompt: string,
  aspect: string | undefined,
): Promise<{ buffer: Buffer; model: string; mimeType: string }> {
  const generationConfig: Record<string, unknown> = { responseModalities: ['TEXT', 'IMAGE'] };
  if (aspect) generationConfig.imageConfig = { aspectRatio: aspect };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt.slice(0, 4000) }] }],
        generationConfig,
      }),
      signal: AbortSignal.timeout(50_000),
    },
  );
  const json = (await res.json().catch(() => null)) as GeminiResponse | null;
  if (json?.error) {
    const { message, code } = json.error;
    throw new Error(`Gemini error${code !== undefined ? ` (code ${code})` : ''}: ${message ?? 'unknown error'}`);
  }
  if (!res.ok) throw new Error(`Gemini image request failed (HTTP ${res.status})`);
  const candidate = json?.candidates?.[0];
  for (const part of candidate?.content?.parts ?? []) {
    const inline = part.inlineData ?? part.inline_data;
    const data = inline?.data;
    if (data) {
      const mime = part.inlineData?.mimeType ?? part.inline_data?.mime_type ?? 'image/png';
      return { buffer: Buffer.from(data, 'base64'), model, mimeType: mime };
    }
  }
  const finish = candidate?.finishReason;
  throw new Error(`Gemini returned no image data${finish ? ` (finishReason: ${finish})` : ''}`);
}

/**
 * Z.ai images endpoint with explicit model + honest upstream errors.
 */
async function generateImageViaZai(
  apiKey: string,
  prompt: string,
  size: string,
): Promise<{ buffer: Buffer; model: string; mimeType: string }> {
  const base = (process.env.ZAI_BASE_URL || 'https://api.z.ai/api/paas/v4').replace(/\/+$/, '');
  const res = await fetch(`${base}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: AI_IMAGE_MODEL, prompt, size }),
    signal: AbortSignal.timeout(110_000),
  });
  const json = (await res.json().catch(() => null)) as
    | { data?: Array<{ url?: string; b64_json?: string }>; error?: { code?: string | number; message?: string } }
    | null;
  if (json?.error) {
    const { message, code } = json.error;
    throw new Error(`AI provider error${code !== undefined ? ` (code ${code})` : ''}: ${message ?? 'unknown error'}`);
  }
  if (!res.ok) throw new Error(`AI provider image request failed (HTTP ${res.status})`);
  const item = json?.data?.[0];
  if (item?.b64_json) return { buffer: Buffer.from(item.b64_json, 'base64'), model: AI_IMAGE_MODEL, mimeType: 'image/png' };
  if (item?.url) {
    const img = await fetch(item.url, { signal: AbortSignal.timeout(60_000) });
    if (!img.ok) throw new Error(`Could not download the generated image (HTTP ${img.status})`);
    const mime = img.headers.get('content-type') || 'image/png';
    return { buffer: Buffer.from(await img.arrayBuffer()), model: AI_IMAGE_MODEL, mimeType: mime };
  }
  throw new Error('Image generation returned no image data');
}

/**
 * Pollinations.ai — free keyless image generation. Returns JPEG bytes.
 * Used as the automatic last-resort fallback so Studio image generation keeps
 * working even when every keyed provider is unavailable.
 */
async function generateImageViaPollinations(
  prompt: string,
  size: string,
): Promise<{ buffer: Buffer; model: string; mimeType: string }> {
  const [w, h] = size.split('x').map((n) => Number.parseInt(n, 10));
  const width = Number.isFinite(w) && w > 0 ? w : 1024;
  const height = Number.isFinite(h) && h > 0 ? h : 1024;
  const seed = Math.floor(Math.random() * 1_000_000);
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 900))}` +
    `?width=${width}&height=${height}&nologo=true&seed=${seed}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(110_000) });
  if (!res.ok) throw new Error(`Pollinations HTTP ${res.status}`);
  const mime = res.headers.get('content-type') || 'image/jpeg';
  const buffer = Buffer.from(await res.arrayBuffer());
  if (!buffer.length) throw new Error('Pollinations returned an empty image');
  return { buffer, model: 'pollinations-free', mimeType: mime.startsWith('image/') ? mime : 'image/jpeg' };
}

/**
 * Robustly extracts JSON from a model reply: tries fenced blocks first,
 * then the widest bracket-delimited slice of the raw text.
 */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  for (const candidate of [fenced?.[1], text.trim()]) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // fall through to slicing
    }
  }
  const start = text.search(/[[{]/);
  if (start === -1) return null;
  const end = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'));
  if (end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}
