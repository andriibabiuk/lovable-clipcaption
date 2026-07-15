import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <span className="text-lg font-semibold tracking-tight">ClipCaption</span>
          <nav className="flex items-center gap-2">
            {signedIn ? (
              <Button asChild size="sm">
                <Link to="/dashboard">Open app</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
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
      <main className="flex-1 flex items-center">
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">
            AI subtitles &amp; metadata for every clip.
          </h1>
          <p className="mt-6 text-base text-muted-foreground">
            Upload a video, get accurate transcripts, platform-ready titles, descriptions, and
            hashtags — in minutes.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            {signedIn ? (
              <Button asChild size="lg">
                <Link to="/dashboard">Go to dashboard</Link>
              </Button>
            ) : (
              <Button asChild size="lg">
                <Link to="/auth">Create free account</Link>
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
