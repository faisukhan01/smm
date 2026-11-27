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
 * Chat model. Defaults to GLM-4.6; override with AI_MODEL to target any
 * OpenAI-compatible provider (e.g. AI_MODEL=gemini-2.0-flash with
 * ZAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai).
 */
export const AI_MODEL = process.env.AI_MODEL || 'glm-4.6';

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
    messages: [{ role: 'assistant', content: system }, ...history],
    thinking: { type: 'disabled' },
  });
  assertCompletionOk(completion);
  return completion.choices[0]?.message?.content ?? '';
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
