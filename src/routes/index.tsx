import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Captions,
  Check,
  Download,
  History,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  UploadCloud,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/components/theme-provider";

export const Route = createFileRoute("/")({
  component: Index,
});

const FEATURES = [
  {
    icon: UploadCloud,
    title: "Drag-and-drop upload",
    description:
      "Batch upload video (MP4, MOV, AVI) or audio (MP3, WAV, M4A, AAC, FLAC, OGG) files and let ClipCaption handle the rest.",
  },
  {
    icon: ShieldCheck,
    title: "Private by design",
    description:
      "Audio is normalized to a small, speech-only stream right in your browser. Source video is never uploaded or stored.",
  },
  {
    icon: Captions,
    title: "AI transcription & subtitles",
    description:
      "Automatic transcription with language detection, refined into a properly timed, readable .srt file.",
  },
  {
    icon: Sparkles,
    title: "Platform metadata",
    description:
      "One click produces a title, description, and hashtags tailored to YouTube, Instagram, and TikTok.",
  },
  {
    icon: History,
    title: "Searchable history",
    description:
      "Every generation is saved and searchable, with rename, delete, and inline audio playback.",
  },
  {
    icon: Download,
    title: "Export anywhere",
    description:
      "Copy fields individually, or export combined text and .srt subtitle files in one click.",
  },
] as const;

const STEPS = [
  {
    step: "01",
    title: "Upload your clip",
    description: "Drag in a video or audio file — it's optimized locally before anything leaves your browser.",
  },
  {
    step: "02",
    title: "AI does the work",
    description: "Transcription, subtitle polishing, and platform metadata generation all run automatically.",
  },
  {
    step: "03",
    title: "Publish everywhere",
    description: "Copy your captions and metadata, or export files straight into your editor of choice.",
  },
] as const;

function Index() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const { theme, toggle } = useTheme();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b sticky top-0 z-40 bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <span className="text-lg font-semibold tracking-tight">ClipCaption</span>
          <nav className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            {signedIn ? (
              <Button asChild size="sm">
                <Link to="/home">Open app</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                  <Link to="/auth">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/auth">Get started</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-40 flex justify-center"
          >
            <div className="h-128 w-lg rounded-full bg-foreground/5 blur-3xl" />
          </div>
          <div className="relative mx-auto max-w-4xl px-6 pt-20 pb-16 sm:pt-28 sm:pb-24 text-center">
            <Badge variant="secondary" className="rounded-full px-3 py-1 font-medium">
              <Sparkles className="mr-1.5 h-3 w-3" />
              AI captions & metadata, in minutes
            </Badge>
            <h1 className="mt-6 text-4xl sm:text-6xl font-semibold tracking-tight text-balance">
              AI subtitles &amp; metadata for every clip.
            </h1>
            <p className="mt-6 text-base sm:text-lg text-muted-foreground text-balance">
              Upload a video, get accurate transcripts, platform-ready titles, descriptions, and
              hashtags — for YouTube, Instagram, and TikTok, in minutes.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
              {signedIn ? (
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <Link to="/home">
                    Open app
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              ) : (
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <Link to="/auth">
                    Create free account
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              )}
              <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
                <a href="#how-it-works">See how it works</a>
              </Button>
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4" />
                No credit card required
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4" />
                Processed in your browser
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4" />
                Free tier included
              </span>
            </div>
          </div>
        </section>

        {/* Feature grid */}
        <section className="border-t bg-secondary/30">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="max-w-2xl">
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                Everything you need to publish faster.
              </h2>
              <p className="mt-3 text-muted-foreground">
                From raw footage to platform-ready copy, without leaving your browser.
              </p>
            </div>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="rounded-xl border bg-card p-6 transition-colors hover:border-foreground/20"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground text-background">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-semibold tracking-tight">{title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-t">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="max-w-2xl">
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">How it works</h2>
              <p className="mt-3 text-muted-foreground">
                Three steps between your raw clip and ready-to-publish captions.
              </p>
            </div>
            <div className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-6">
              {STEPS.map(({ step, title, description }, i) => (
                <div key={step} className="relative">
                  <span className="text-sm font-mono text-muted-foreground">{step}</span>
                  <h3 className="mt-3 font-semibold tracking-tight text-lg">{title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{description}</p>
                  {i < STEPS.length - 1 && (
                    <div className="hidden sm:block absolute top-1.5 left-[calc(100%+0.75rem)] -right-3">
                      <div className="h-px w-full bg-border" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing teaser */}
        <section className="border-t bg-secondary/30">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="max-w-2xl">
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                Simple, generous pricing.
              </h2>
              <p className="mt-3 text-muted-foreground">
                Start free. Upgrade any time your workload grows.
              </p>
            </div>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 max-w-3xl">
              <div className="rounded-xl border bg-card p-6">
                <h3 className="font-semibold tracking-tight">Free</h3>
                <p className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold tracking-tight">$0</span>
                  <span className="text-sm text-muted-foreground">/mo</span>
                </p>
                <ul className="mt-6 space-y-3 text-sm">
                  {["3 generations / month", "All export formats", "Subtitle download"].map(
                    (f) => (
                      <li key={f} className="flex items-center gap-2 text-muted-foreground">
                        <Check className="h-4 w-4 shrink-0 text-foreground" />
                        {f}
                      </li>
                    ),
                  )}
                </ul>
                <Button asChild variant="outline" className="mt-6 w-full">
                  <Link to="/auth">Get started</Link>
                </Button>
              </div>
              <div className="relative rounded-xl border-2 border-foreground bg-card p-6">
                <Badge className="absolute -top-3 right-6 rounded-full px-3">Popular</Badge>
                <h3 className="font-semibold tracking-tight">Premium</h3>
                <p className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold tracking-tight">$10</span>
                  <span className="text-sm text-muted-foreground">/mo</span>
                </p>
                <ul className="mt-6 space-y-3 text-sm">
                  {["150 generations / month", "Priority processing", "All Free features"].map(
                    (f) => (
                      <li key={f} className="flex items-center gap-2 text-muted-foreground">
                        <Check className="h-4 w-4 shrink-0 text-foreground" />
                        {f}
                      </li>
                    ),
                  )}
                </ul>
                <Button asChild className="mt-6 w-full">
                  <Link to="/auth">Get started</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t">
          <div className="mx-auto max-w-4xl px-6 py-20 text-center">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-balance">
              Ready to caption your next upload?
            </h2>
            <p className="mt-3 text-muted-foreground">
              Free to start, no credit card required.
            </p>
            <div className="mt-8">
              {signedIn ? (
                <Button asChild size="lg">
                  <Link to="/home">
                    Open app
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              ) : (
                <Button asChild size="lg">
                  <Link to="/auth">
                    Create free account
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} ClipCaption</span>
          <div className="flex gap-4">
            <a href="#" className="hover:text-foreground">Support</a>
            <a href="#" className="hover:text-foreground">Privacy</a>
            <a href="#" className="hover:text-foreground">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
