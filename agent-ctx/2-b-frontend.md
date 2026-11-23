# Task 2-b — Dashboard modules: Overview, Posts, Content Calendar

## Summary

Implemented the three content-facing dashboard modules for SMM against the live NestJS
API contract (no mock data). All files are inside the granted ownership
(`src/components/views/{overview,posts,calendar}.tsx` + subfolders `posts/*`, `calendar/*`).
No file outside ownership was modified.

## Files created / replaced

| File | Purpose |
|---|---|
| `src/components/views/overview.tsx` | OverviewView — stat tiles, Next up, AI activity + quick actions, Recent activity |
| `src/components/views/posts.tsx` | PostsView — status tabs w/ counts, search, platform filter, table, row actions, pagination |
| `src/components/views/calendar.tsx` | CalendarView — month grid (custom, weekStartsOn 1), day dialog, create-from-day flow |
| `src/components/views/posts/status-badge.tsx` | StatusBadge + STATUS_BADGE_CLASS / STATUS_BORDER_CLASS / STATUS_LABEL, PlatformDot, PlatformLabel(s), postPlatforms(), PLATFORM_DOT_COLOR |
| `src/components/views/posts/query-error.tsx` | QueryErrorAlert — inline destructive alert + retry, surfaces ApiError.message |
| `src/components/views/posts/hashtag-input.tsx` | HashtagInput — chip editor (Enter/comma add, Backspace removes last, max 30) |
| `src/components/views/posts/target-accounts-picker.tsx` | TargetAccountsPicker — checkbox list grouped by platform, Demo badge, non-CONNECTED accounts disabled |
| `src/components/views/posts/post-editor-dialog.tsx` | PostEditorDialog — PATCH /posts/:id (content 5000 + counter, hashtags, targets, remove-only media) |
| `src/components/views/posts/schedule-dialog.tsx` | ScheduleDialog — datetime-local → POST /posts/:id/schedule (ISO) |
| `src/components/views/calendar/day-cell.tsx` | CalendarDayCell — up to 3 posts, HH:mm + dots + status left border, +N more |
| `src/components/views/calendar/create-post-dialog.tsx` | CreatePostDialog — POST /posts (DRAFT, scheduledAt=day 09:00 local) then /schedule if `post:schedule` |

Exported component names: `OverviewView`, `PostsView`, `CalendarView`,
`StatusBadge`, `PlatformDot`, `PlatformLabel`, `PlatformLabels`, `postPlatforms`,
`QueryErrorAlert`, `HashtagInput`, `TargetAccountsPicker`, `PostEditorDialog`,
`ScheduleDialog`, `CalendarDayCell`, `CreatePostDialog`.

## Data / keys

- `['analytics','summary',from,to]` — GET /analytics/summary, from = subDays(now,30)
- `['posts','upcoming']` — GET /posts?pageSize=100, client-filter SCHEDULED or APPROVED+scheduledAt, sort asc, max 5
- `['posts','counts']` — GET /posts?pageSize=1 → `counts` for tabs + `total` for "All"
- `['posts','list',status]` — useInfiniteQuery, pageSize 20, "Load more"
- `['posts','calendar',gridStartIso,gridEndIso]` — GET /posts?from&to&pageSize=100
- `['accounts']` — GET /accounts (shared key, reused by picker and other views)

Every mutation invalidates `['posts']` **and** `['analytics']` (the latter keeps the
Overview tiles honest after status changes — slight extension of the spec, noted below).

## Deviations / judgment calls (for review)

1. `useToast` is imported from `@/hooks/use-toast` — the task text said
   `@/components/ui/toast`, but that module does not export `useToast`; the hook lives
   in hooks (and the Toaster is already mounted in `src/app/layout.tsx`).
2. Permission gating beyond the explicit list: Duplicate → `post:draft`, Cancel/Retry/
   Schedule/Publish → `post:schedule`, Delete → `post:delete`. Items stay visible but
   disabled with `title="Requires permission \"...\""` so the gap is discoverable.
3. Media thumbnails use plain `<img>` (per task). ESLint may warn
   `@next/next/no-img-element` — intentional: media URLs are external S3/provider URLs
   and no remotePatterns are configured for `next/image`.
4. Calendar query range uses the **visible grid** bounds (first/last shown day) rather
   than strict monthStart/monthEnd so leading/trailing other-month cells resolve
   correctly. Still just `from`/`to` ISO params, contract-compatible.
5. Calendar excludes CANCELLED posts from day cells/dialog (they carry no publish
   intent). Failed posts with scheduledAt ARE shown (red border = visible failure).
6. PostsView/CalendarView have no `onNavigate` prop in the shell, so their empty states
   are text-only ("create your first post in Content Studio — open it from the sidebar").
   Overview empty states do navigate. If the shell later passes `onNavigate` to these
   two views, wire it in the two empty states for parity.
7. "Schedule/Published" column shows a tiny contextual label (xl screens only) and a
   full timestamp in the `title` tooltip.
8. datetime-local value uses `yyyy-MM-ddTHH:mm` (what the input type requires); the
   spec's `yyyy-MM-dd HH:mm` string is not a valid datetime-local value.

## Backend notes / contract observations

- `GET /posts` currently returns the placeholder `{ status: 'NOT_IMPLEMENTED', module: 'posts' }`
  from `mini-services/api/src/modules/posts/posts.module.ts`. The UI will show honest
  empty/error states until the real implementation lands; once implemented it must
  return `{ items: PostDTO[], total, counts: Record<PostStatus, number> }` with `counts`
  containing **every** status key (tabs read `counts[status]` directly).
- `PATCH /posts/:id` must accept `mediaIds` (removal-only editing is implemented client-side).
- `POST /posts/:id/schedule` must accept ISO strings in the past gracefully (400 with a
  user-facing message is fine — surfaced via toast).
- `counts` + `total` should reflect the whole workspace regardless of pagination.
- 402/403 messages are surfaced verbatim in toasts — keep them user-facing.

## Verification

- `bunx tsc --noEmit` — zero errors in `src/**` (remaining output is pre-existing NestJS
  decorator noise under `mini-services/` from the shared web tsconfig).
- Dev server compiles; remaining dev.log module-not-found errors belong to another
  agent's concurrently-edited `settings.tsx`, not this task.
