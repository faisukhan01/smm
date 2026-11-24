/**
 * Brand-grounded prompt building and AI response post-processing.
 * Mirrors the private helpers of the former NestJS AiController exactly —
 * same prompt strings, same line order, same sanitisation rules.
 */
import { badRequest } from '@/lib/server/api/errors';
import { extractJson } from './zai';

export const MODE_DESCRIPTION: Record<string, string> = {
  MANUAL: 'The user reviews and publishes all content manually.',
  APPROVAL: 'AI-generated content must be approved by the team before publishing.',
  AUTO: 'AI may schedule and publish content according to standing instructions.',
};

interface BrandLike {
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
}

interface SettingsLike {
  restrictedTopics: string | null;
}

/** Builds the shared system prompt: brand context + restrictions + task extras. */
export function brandPrompt(
  brand: BrandLike | null,
  settings: SettingsLike | null,
  extra: string,
): string {
  const lines: string[] = [];
  if (brand) {
    if (brand.businessName) lines.push(`Business: ${brand.businessName}`);
    if (brand.description) lines.push(`About: ${brand.description}`);
    if (brand.industry) lines.push(`Industry: ${brand.industry}`);
    if (brand.productsServices) lines.push(`Products/services: ${brand.productsServices}`);
    if (brand.targetAudience) lines.push(`Target audience: ${brand.targetAudience}`);
    if (brand.brandVoice) lines.push(`Brand voice: ${brand.brandVoice}`);
    if (brand.writingStyle) lines.push(`Writing style: ${brand.writingStyle}`);
    if (brand.brandColors) lines.push(`Brand colors: ${brand.brandColors}`);
    if (brand.language) lines.push(`Preferred language: ${brand.language}`);
  } else {
    lines.push('No brand profile is configured yet — write generically professional content.');
  }
  const restrictions = [brand?.contentRestrictions, settings?.restrictedTopics].filter(Boolean).join('; ');
  if (restrictions) lines.push(`Content restrictions (MUST respect): avoid these topics and claims — ${restrictions}`);
  lines.push(`Automation mode: ${MODE_DESCRIPTION.AUTO}`);
  return [...lines, ...extra].join(' ');
}

/** Sanitises the caption model reply into at most `expected` clean variants. */
export function parseVariants(raw: string, expected: number): { caption: string; hashtags: string[] }[] {
  const data = extractJson(raw);
  let items: unknown[] | null = null;
  if (Array.isArray(data)) items = data;
  else if (data && typeof data === 'object' && Array.isArray((data as { variants?: unknown }).variants)) {
    items = (data as { variants: unknown[] }).variants;
  }
  if (!items?.length) throw badRequest('AI returned an invalid response — try again');
  const variants = items
    .map((item) => {
      const v = item as { caption?: unknown; hashtags?: unknown };
      return {
        caption: typeof v.caption === 'string' ? v.caption.trim() : '',
        hashtags: Array.isArray(v.hashtags)
          ? (v.hashtags as unknown[]).filter((h): h is string => typeof h === 'string').slice(0, 30)
          : [],
      };
    })
    .filter((v) => v.caption.length > 0)
    .map((v) => ({ ...v, hashtags: [...new Set(v.hashtags)] }))
    .slice(0, expected);
  if (!variants.length) throw badRequest('AI returned an invalid response — try again');
  return variants;
}

/** Sanitises the weekly-plan model reply into at most `max` clean items. */
export function parsePlanItems(raw: string, max: number): { content: string; hashtags: string[] }[] {
  const data = extractJson(raw);
  const items = Array.isArray(data) ? data : null;
  if (!items?.length) throw badRequest('AI returned an invalid plan — try again');
  const plan = items
    .map((item) => {
      const v = item as { content?: unknown; hashtags?: unknown };
      return {
        content: typeof v.content === 'string' ? v.content.trim().slice(0, 5000) : '',
        hashtags: Array.isArray(v.hashtags)
          ? (v.hashtags as unknown[]).filter((h): h is string => typeof h === 'string').slice(0, 30)
          : [],
      };
    })
    .filter((v) => v.content.length > 0)
    .slice(0, max);
  if (!plan.length) throw badRequest('AI returned an invalid plan — try again');
  return plan;
}
