import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/checkout/return")({
  head: () => ({
    meta: [
      { title: "Payment complete — ClipCaption" },
      { name: "description", content: "Your Premium subscription is active." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { session_id?: string } => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  component: CheckoutReturn,
});

function CheckoutReturn() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    // Webhook may take a moment; poll quota until premium reflects, then bounce home.
    let cancelled = false;
    const start = Date.now();
    const tick = async () => {
      if (cancelled) return;
      await qc.invalidateQueries();
      if (Date.now() - start > 15000) {
        navigate({ to: "/home" });
        return;
      }
      setTimeout(tick, 1500);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [qc, navigate]);

  return (
    <AppShell>
      <div className="max-w-md mx-auto text-center py-16 space-y-4">
        <CheckCircle2 className="h-12 w-12 mx-auto" />
        <h1 className="text-2xl font-semibold tracking-tight">Payment successful</h1>
        <p className="text-sm text-muted-foreground">
          Your Premium subscription is being activated. This usually takes a few seconds.
        </p>
        <div className="flex justify-center gap-2 pt-2">
          <Button asChild>
            <Link to="/home">Go to upload</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/settings">View subscription</Link>
          </Button>
        </div>
      </div>
    </AppShell>
  );
}