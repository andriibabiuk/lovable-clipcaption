# ClipCaption

> Built with [Lovable](https://lovable.dev).

ClipCaption turns a raw video or audio file into ready-to-publish social metadata. Upload a clip, and it automatically transcribes the audio, detects the spoken language, and generates platform-tailored titles, descriptions, hashtags, and subtitles for YouTube, Instagram, and TikTok.

## Features

- **Drag-and-drop upload** — batch upload video (MP4, MOV, AVI) or audio (MP3, WAV, M4A, AAC, FLAC, OGG) files.
- **In-browser audio optimization** — files are normalized to a small, speech-only Opus stream client-side (via `ffmpeg.wasm`) before ever leaving the browser, keeping uploads fast and private. Source video/audio is never stored — only the optimized audio and a single-frame thumbnail are kept.
- **AI transcription** — audio is transcribed with automatic language detection.
- **AI-polished subtitles** — Whisper segments are refined into a properly-timed, readable `.srt` file (natural cue lengths, line wrapping, original spoken language preserved).
- **Platform metadata generation** — one click produces a title, description, and hashtags tailored to YouTube, Instagram, and TikTok, written in the video's detected language.
- **History** — every generation is saved and searchable, with rename, delete, and inline audio playback.
- **Export** — copy fields individually or export combined text and `.srt` subtitle files.
- **Quotas & billing** — free/premium tiers with monthly generation limits, enforced server-side and upgradeable via Stripe Checkout.
- **Admin panel** — manage user roles/tiers and view usage stats (admin role only).
- **Authentication** — email/password auth with password reset, backed by Supabase.

## Tech stack

- [TanStack Start](https://tanstack.com/start) (React 19, file-based routing via TanStack Router, server functions)
- [Vite 8](https://vite.dev/) + [Tailwind CSS 4](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/) components on top of Radix UI
- [Supabase](https://supabase.com/) — Postgres, auth, storage, row-level security
- [Stripe](https://stripe.com/) — subscription billing (embedded checkout)
- [ffmpeg.wasm](https://ffmpegwasm.netlify.app/) — client-side audio extraction/normalization
- Lovable AI Gateway — transcription (`gpt-4o-transcribe`) and metadata/subtitle generation (`gpt-5-mini`)
- [Bun](https://bun.sh/) as the package manager/runtime

## Getting started

### Prerequisites

- [Bun](https://bun.sh/) installed
- A [Supabase](https://supabase.com/) project
- A [Stripe](https://stripe.com/) account (for billing features)
- A Lovable AI Gateway API key (for transcription/metadata generation)

### Installation

```bash
bun install
```

### Environment variables

Create a `.env` file in the project root:

```bash
# Supabase
SUPABASE_URL=
SUPABASE_PROJECT_ID=
SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_URL=
VITE_SUPABASE_PROJECT_ID=
VITE_SUPABASE_PUBLISHABLE_KEY=

# Stripe
VITE_PAYMENTS_CLIENT_TOKEN=      # Stripe publishable key
STRIPE_SECRET_KEY=               # Stripe secret key
STRIPE_WEBHOOK_SECRET=           # Stripe webhook signing secret

# Lovable AI Gateway
LOVABLE_API_KEY=
```

Database schema and migrations live in [supabase/migrations](supabase/migrations); apply them to your Supabase project with the [Supabase CLI](https://supabase.com/docs/guides/cli).

### Development

```bash
bun run dev
```

The app starts on the Vite dev server (default `http://localhost:3000`).

### Other scripts

```bash
bun run build      # production build
bun run preview     # preview a production build
bun run lint        # run ESLint
bun run format       # format with Prettier
```

## Project structure

```
src/
├── routes/                 # File-based routes (TanStack Router)
│   ├── _authenticated/     # Auth-gated pages: home, dashboard, history, settings, admin
│   ├── api/public/         # Public API routes (e.g. Stripe webhook)
│   └── auth.tsx            # Sign in / sign up / password reset
├── lib/                    # Server functions & domain logic (transcription, metadata,
│                            # billing, export, audio extraction)
├── components/              # UI components (app shell, ui/ primitives)
├── hooks/                  # React Query hooks (auth, profile, role/quota)
└── integrations/supabase/  # Supabase clients & auth middleware
supabase/
└── migrations/             # SQL migrations (schema, RLS policies, RPCs)
```

## License

Private project — no license specified.
