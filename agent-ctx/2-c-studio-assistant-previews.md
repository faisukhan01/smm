# Task 2-c — AI Content Studio, AI Assistant, Platform Previews

Agent: 2-c (studio/assistant/previews)
Status: DONE — all owned files written and type-checked clean (`bunx tsc --noEmit` reports zero errors in the files below; remaining project errors live in other agents' files: `posts.tsx`, `settings/*`, `dashboard.tsx` OverviewView prop typing, plus pre-existing `examples/` and `mini-services/` noise).

## Files written (ownership respected)

Shared previews (`src/components/shared/previews/`):
- `facebook-preview.tsx` — `FacebookPreview` + `FacebookPreviewProps` (props: `{ content, hashtags, mediaUrl, accountName }`)
- `instagram-preview.tsx` — `InstagramPreview` + `InstagramPreviewProps` (#E1306C avatar ring, "Media required to publish to Instagram" empty state)
- `pinterest-preview.tsx` — `PinterestPreview` + `PinterestPreviewProps` (4:5 media, title = first line, #E60023 Save chip)
- `index.ts` — re-exports all three + their prop types

Studio (`src/components/views/studio.tsx` + `src/components/views/studio/`):
- `studio.tsx` — `StudioView({ session })`; lifts composer state (content/hashtags/media) so AI captions, generated images and uploads all attach to one draft; layout `lg:grid-cols-[380px_1fr]`
- `studio/helpers.ts` — `hasPermission(session, perm)` (session.permissions first, roleHas fallback), `aiErrorMessage()` (402 → fixed credits copy, else ApiError.message), `normalizeHashtag()`
- `studio/platform-dots.tsx` — `PlatformDot`, `PLATFORM_DOT_COLOR` (#1877F2 / #E1306C / #E60023 official brand colors)
- `studio/caption-generator.tsx` — `CaptionGenerator({ enabled, onUse })`; POST /ai/caption via mutation, 1-3 variants, Use this / Regenerate
- `studio/image-generator.tsx` — `ImageGenerator({ enabled, attachedIds, onAttach })`; POST /ai/image, aspect classes, Attach to post
- `studio/media-uploader.tsx` — `MediaUploader({ media, onAttach, onRemove })`; client validation 5MB + mime whitelist, FileReader base64 (data: prefix stripped), POST /media
- `studio/composer.tsx` — `Composer({...})`; counter n/5000, hashtag chips (Enter adds, max 30), media strip, target accounts grouped by platform (Demo badge, non-CONNECTED status badge, honest empty state), Tabs with the three previews (mediaUrl = first IMAGE), datetime-local + timezone hint, permission-gated Save draft / Submit for approval / Approve (rendered only with post:approve) / Schedule (future-date + content + target validation), brand tip Alert under the card when GET /brand is null or has no businessName

Assistant (`src/components/views/assistant.tsx`):
- `AssistantView({ session })` — chat card (max-w-3xl, user/assistant bubbles, whitespace-pre-wrap plain text, Thinking… indicator, quick-start chips only when empty, Enter sends / Shift+Enter newline, last 12 messages sent to POST /ai/assistant, session-only-history note) + "Weekly plan generator" card (focus, 3 platform checkboxes with dots, postsPerDay 1-3, POST /ai/plan, success toast "N drafts created", results with status badge + target platform dots)

## Integration notes for other agents
- Composer `onSuccess` invalidates query keys: `['posts']`, `['calendar']`, `['analytics']`. If your view uses different keys, align or accept the extra refetch.
- Previews are self-contained static components; reuse anywhere with `{ content, hashtags, mediaUrl, accountName }`.
- Toast: task spec said `useToast` from `@/components/ui/toast`, but that module does not export it (it lives in `@/hooks/use-toast`, which the mounted Toaster uses). I used `@/hooks/use-toast`.
- lucide-react 0.525 has NO `Send2` export (spec asked for it); I used `Send` (same paper-plane glyph). Verified existing exports: Loader2, Wand2, MoreHorizontal, ImageIcon, ThumbsUp all exist.
- Backend note: /ai and /media endpoints were still `NOT_IMPLEMENTED` placeholders in `mini-services/api` when I finished; the UI is coded strictly against the documented contract (402 handling included), so it lights up as soon as the API agent lands the real handlers.

## Deviations from spec (summary)
1. `useToast` imported from `@/hooks/use-toast` instead of `@/components/ui/toast` (the latter does not export it; editing it is outside my ownership).
2. `Send2` → `Send` icon (not present in installed lucide-react version).
3. Composer media strip thumbnails are display-only; removal lives in the Upload media card thumbnails (per spec) — generated images are removable there too.
4. Work record stored at `/home/z/my-project/agent-ctx/` because the filesystem root `/agent-ctx` is not writable in this sandbox.
