# ClipCaption Build Plan

Builds on what already exists: auth, `/auth`, `/reset-password`, `_authenticated` gate, dashboard stub, admin panel (basic), `profiles` + `user_roles` + `generations` tables, quota RPCs.

Payments (Stripe) and real AI calls are out of scope for this pass — the spec asks for a demonstrable app with mock data. I'll wire the Upgrade/Cancel and Generate flows to server functions that flip roles / insert records so everything is navigable end-to-end. Real Stripe + OpenAI/Whisper can be plugged in later without changing the UI.

## 1. Data model additions (one migration)

- `video_metadata` — `user_id`, `video_name`, `thumbnail_url` (nullable), `language`, `topic`, `keywords text[]`, `metadata_json jsonb` (youtube/instagram/tiktok), `subtitle_srt text`, timestamps. RLS: owner + admin read, owner insert/delete.
- Extend `profiles` with `subscription_status text default 'active'`, `renewal_date timestamptz null`.
- Add `subscriptions` table (id, user_id, plan_type, status, stripe_customer_id nullable, timestamps). RLS: owner read, service_role write.
- `record_generation()` already exists — extend to also insert a `video_metadata` row (or add a new RPC `record_video_metadata(...)` that both increments quota and stores the row atomically). Prefer a new RPC to keep `record_generation` reusable.
- Admin stats: add SQL for "most-used keywords" — a view or a server-side aggregation function over `video_metadata.keywords`.
- GRANTs on every new public table per the required pattern.

## 2. Global shell

- New `AppShell` component used by all `_authenticated/*` pages: top nav (logo, Home / History / Settings / Admin-if-admin, plan badge, theme toggle, avatar+name), mobile hamburger under 760px, minimal footer (Support / Privacy / Terms — placeholder routes or `#`).
- Theme toggle: add `next-themes` (or a small local provider) with `class` strategy; extend `styles.css` tokens for the specified monochrome palette in both modes.
- Move current dashboard header/sign-out into `AppShell`.

## 3. Routes

Rename/replace existing `_authenticated/dashboard.tsx` with `_authenticated/home.tsx` (Home & Upload). Redirect `/dashboard` → `/home` for continuity. New routes:

- `_authenticated/home.tsx` — Upload page (see §4).
- `_authenticated/history.tsx` — History list (see §5).
- `_authenticated/settings.tsx` — Settings (see §6).
- `_authenticated/admin.tsx` — expand existing (see §7).

Landing `/` stays public; after sign-in it points users to `/home`.

## 4. Home & Upload

Two-column layout.

Left:
- Drag & drop zone (accept mp4/mov/avi), clickable, drag-over visual state.
- Batch list: each queued file shows generated thumbnail (client-side via `<video>` + canvas frame capture), filename, stage label cycling `Uploading → Transcribing → Analyzing → Ready`, progress bar. Files are never uploaded to storage — we only keep a data-URL thumbnail in memory and send inputs to the generate server fn.
- Metadata input form: Creator (prefilled from profile), Topic, Language (dropdown), Keywords (comma-separated).
- Generate button: disabled until a file is Ready; disabled with inline "limit reached — Upgrade" link to `/settings` when quota exhausted.
- Output panel: tabs YouTube / Instagram / TikTok, inline-editable fields, per-field Copy. Export buttons: Download all (.txt combined), JSON, CSV, SRT. "Saved to History" indicator.

Right:
- Plan usage card (reuse `useUserQuota`).
- Tips card (static content).
- Recent activity: last 5 `video_metadata` rows, link to `/history`.

Server functions (in `src/lib/video.functions.ts`):
- `generateMetadata({ topic, keywords, language, creator, videoName, thumbnailDataUrl })` — mocked GPT output for now (deterministic template using inputs), calls `record_generation` RPC, inserts into `video_metadata`, returns the row incl. mock SRT.
- `deleteMetadata({ id })` and `listMyMetadata({ limit? })`.

## 5. History

- Search bar filters by filename client-side (list is small; server fetches all user rows).
- Collapsed cards → expand to platform-tabbed read-only metadata.
- Per-card actions: Download .txt / JSON / CSV / SRT, Delete (confirmation modal via `AlertDialog`).
- Empty state.

## 6. Settings

Left:
- Account card: editable Name (writes `profiles.display_name`), read-only Email, Save.
- Appearance card: theme toggle (bound to same provider as nav).
- Danger zone: Delete account → confirm modal → server fn using `supabaseAdmin.auth.admin.deleteUser(userId)` after `requireSupabaseAuth` verifies the caller is deleting themselves. Cascades clean up `profiles`, `user_roles`, `generations`, `video_metadata` via FKs (`on delete cascade` — verify existing FKs, add cascade where missing in the migration).

Right:
- Subscription card: plan badge, status, renewal date. Free → "Upgrade to Premium — $10/month" opens a mock Stripe confirmation modal; on confirm calls `mockUpgrade` server fn that sets role=premium + inserts/updates `subscriptions` row + sets `renewal_date = now()+30d`. Premium → "Cancel" downgrades to Free (schedules at renewal — for the mock, immediate role change + toast noting billing-period behavior). Admin → informational note.
- Plan comparison card (Free 3 / Premium 150).

Server fns in `src/lib/billing.functions.ts`: `mockUpgrade`, `mockCancel`, `updateProfileName`, `deleteMyAccount`.

## 7. Admin panel

Extend the existing page:
- Add stat cards: total videos processed (count of `video_metadata`), estimated monthly revenue (count of active premium subs × $10). Keep existing total users + generations.
- Most-used keywords: server fn aggregating `unnest(keywords)` grouped by keyword, ordered by count desc, top 30. Rendered as tag cloud/list.
- User table: add columns for subscription status and videos processed (join count of `video_metadata` per user). Keep tier Select; also add explicit "Upgrade"/"Downgrade" quick buttons per spec.

## 8. Utilities

- `src/lib/export.ts` — pure functions to build the combined .txt, JSON, CSV, and SRT strings + `downloadBlob(name, mime, content)` helper. Used from Home output panel and History cards.
- `src/lib/thumbnail.ts` — client-only helper to grab a frame from a File via `<video>`.

## 9. Not in scope for this pass

- Real Stripe checkout (mocked confirmation modal + role flip; wire real Stripe later via `enable_stripe_payments`).
- Real GPT-4 / Whisper calls (deterministic mocks; swap `generateMetadata` internals later, keeping the same signature).
- Actual video file storage (spec forbids it).
- Support / Privacy / Terms content pages (footer links point to `#` placeholders).

## Order of implementation

1. Migration (schema + RPC + grants).
2. Theme provider + tokens + `AppShell` + nav + footer.
3. Home page + video/export/thumbnail utilities + `generateMetadata` mock server fn.
4. History page + `listMyMetadata` / `deleteMetadata`.
5. Settings page + billing/profile/delete server fns.
6. Admin expansion + keywords aggregation server fn.
7. Redirect `/dashboard` → `/home`, verify build + click-through on each route.
