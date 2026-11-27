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
 * Generates an image and returns the raw image bytes.
 *
 * Production path (ZAI_API_KEY set) calls the OpenAI-compatible images
 * endpoint directly with an explicit model: the SDK's images client neither
 * sends a model (the endpoint answers HTTP 500 without one) nor tolerates
 * error bodies (it crashes on `.data.map(...)`), and it hides upstream
 * messages like error 1113 "Insufficient balance". Sandbox path (no env key)
 * keeps using the config-file SDK client.
 */
export async function generateImage(prompt: string, size: string): Promise<Buffer> {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    const zai = await getZai();
    const response = await zai.images.generations.create({ prompt, size: size as '1024x1024' });
    const base64 = response.data?.[0]?.base64;
    if (!base64) throw new Error('Image generation returned no data — try again');
    return Buffer.from(base64, 'base64');
  }

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
  if (item?.b64_json) return Buffer.from(item.b64_json, 'base64');
  if (item?.url) {
    const img = await fetch(item.url, { signal: AbortSignal.timeout(60_000) });
    if (!img.ok) throw new Error(`Could not download the generated image (HTTP ${img.status})`);
    return Buffer.from(await img.arrayBuffer());
  }
  throw new Error('Image generation returned no image data');
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
