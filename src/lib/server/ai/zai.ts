/**
 * z-ai-web-dev-sdk access — mirrors the former NestJS API's common/zai.ts:
 * one SDK instance per process, fixed model, assistant-role system prompt,
 * thinking disabled, and robust JSON extraction from model replies.
 *
 * The SDK is Node-only (reads .z-ai-config from disk inside ZAI.create()) and
 * has no import-time side effects, so a top-level import mirrors the Nest code.
 */
import ZAI from 'z-ai-web-dev-sdk';

type ZaiClient = Awaited<ReturnType<typeof ZAI.create>>;

let cached: ZaiClient | null = null;

/** One SDK instance per process. */
export async function getZai(): Promise<ZaiClient> {
  if (!cached) cached = await ZAI.create();
  return cached;
}

export const AI_MODEL = 'glm-4.6';

/** Runs a chat completion with the system prompt sent under the 'assistant' role. */
export async function chatCompletion(zai: ZaiClient, system: string, user: string): Promise<string> {
  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'assistant', content: system },
      { role: 'user', content: user },
    ],
    thinking: { type: 'disabled' },
  });
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
