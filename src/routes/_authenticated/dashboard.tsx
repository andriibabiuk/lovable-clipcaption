import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useUserQuota } from "@/hooks/use-role";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — ClipCaption" },
      { name: "description", content: "Your ClipCaption workspace." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const { data: quota, isLoading } = useUserQuota();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight">ClipCaption</h1>
          <div className="flex items-center gap-4">
            {quota?.tier === "admin" && (
              <Button asChild variant="ghost" size="sm">
                <Link to="/admin">Admin</Link>
              </Button>
            )}
            <span className="text-sm text-muted-foreground">{email}</span>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-12">
        <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your workspace is ready. Upload and metadata tools coming next.
        </p>

        <section className="mt-10 rounded-lg border p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Your plan</h3>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-2xl font-semibold capitalize">
                  {isLoading ? "…" : quota?.tier ?? "free"}
                </span>
                {quota?.tier === "admin" && <Badge variant="secondary">Unlimited</Badge>}
              </div>
            </div>
            <div className="text-right">
              <h3 className="text-sm font-medium text-muted-foreground">This month</h3>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {isLoading
                  ? "…"
                  : quota?.monthly_limit == null
                    ? `${quota?.used ?? 0} used`
                    : `${quota.used} / ${quota.monthly_limit}`}
              </p>
              {quota?.monthly_limit != null && (
                <p className="text-xs text-muted-foreground mt-1">
                  {quota.remaining} generations remaining
                </p>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}