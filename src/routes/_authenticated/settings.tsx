import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/components/theme-provider";
import { useUserQuota } from "@/hooks/use-role";
import { useProfile, useInvalidateProfile } from "@/hooks/use-profile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Check } from "lucide-react";
import {
  deleteMyAccount,
  getMySubscription,
  updateProfileName,
} from "@/lib/billing.functions";
import {
  cancelPremiumSubscription,
} from "@/lib/payments.functions";
import { StripeEmbeddedPremiumCheckout } from "@/components/stripe-embedded-checkout";
import { PaymentTestModeBanner } from "@/components/payment-test-mode-banner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — ClipCaption" },
      { name: "description", content: "Account, appearance, and subscription settings." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { data: quota } = useUserQuota();
  const qc = useQueryClient();
  const invalidateProfile = useInvalidateProfile();
  const { data: profile } = useProfile();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    if (profile) {
      setEmail(profile.email ?? "");
      setName(profile.name ?? "");
    }
  }, [profile]);

  const subFn = useServerFn(getMySubscription);
  const sub = useQuery({ queryKey: ["my-subscription"], queryFn: () => subFn() });

  const updateNameFn = useServerFn(updateProfileName);
  const saveName = useMutation({
    mutationFn: (displayName: string) => updateNameFn({ data: { displayName } }),
    onSuccess: () => {
      toast.success("Name updated");
      // Keep the header + any other consumers in sync with the new name.
      invalidateProfile();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const cancelFn = useServerFn(cancelPremiumSubscription);
  const deleteFn = useServerFn(deleteMyAccount);
  const [planOpen, setPlanOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const cancel = useMutation({
    mutationFn: async () => {
      const { getStripeEnvironment } = await import("@/lib/stripe");
      const res = await cancelFn({ data: { environment: getStripeEnvironment() } });
      if ("error" in res) throw new Error(res.error);
      return res;
    },
    onSuccess: () => {
      toast.success("Downgraded to Free");
      qc.invalidateQueries();
      setPlanOpen(false);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const startCheckout = () => {
    setPlanOpen(false);
    setCheckoutOpen(true);
  };

  const del = useMutation({
    mutationFn: () => deleteFn(),
    onSuccess: async () => {
      await supabase.auth.signOut();
      toast.success("Account deleted");
      navigate({ to: "/auth", replace: true });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const tier = quota?.tier ?? "free";

  return (
    <AppShell>
      <div className="max-w-2xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your account and subscription.</p>
        </div>

        <section className="border rounded-lg p-6 space-y-4">
          <h2 className="text-sm font-semibold">Account details</h2>
          <div className="space-y-3">
            <div>
              <Label htmlFor="name">Name</Label>
              <div className="flex gap-2 mt-1">
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
                <Button onClick={() => saveName.mutate(name)} disabled={!name.trim() || saveName.isPending}>
                  Save
                </Button>
              </div>
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={email} disabled className="mt-1" />
            </div>
            <div className="flex items-center justify-between">
              <Label>Role</Label>
              <Badge variant="secondary" className="capitalize">
                {tier}
              </Badge>
            </div>
          </div>
        </section>

        <section className="border rounded-lg p-6 space-y-4">
          <h2 className="text-sm font-semibold">Subscription</h2>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-lg font-semibold capitalize">{tier}</p>
                {sub.data?.status === "active" && tier === "premium" && (
                  <Badge variant="secondary">Active</Badge>
                )}
                {sub.data?.status === "canceled" && <Badge variant="outline">Canceled</Badge>}
              </div>
              {sub.data?.renewal_date && (
                <p className="text-xs text-muted-foreground mt-1">
                  Renews {new Date(sub.data.renewal_date).toLocaleDateString()}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {tier === "free" && "3 generations/month"}
                {tier === "premium" && "150 generations/month"}
                {tier === "admin" && "Unlimited generations"}
              </p>
            </div>
            <Dialog open={planOpen} onOpenChange={setPlanOpen}>
                <DialogTrigger asChild>
                  {tier === "admin" ? (
                    <Button variant="outline">View plans</Button>
                  ) : tier === "free" ? (
                    <Button>Upgrade to Premium — $10/mo</Button>
                  ) : (
                    <Button variant="outline">Change plan</Button>
                  )}
                </DialogTrigger>
                <DialogContent className="sm:max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Choose your plan</DialogTitle>
                    <DialogDescription>
                      Payments are simulated for this preview. Stripe checkout is coming soon.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 sm:grid-cols-2 pt-2">
                    <PlanCard
                      name="Free"
                      price="$0"
                      period="/mo"
                      features={["3 generations / month", "All export formats", "Subtitle download"]}
                      current={tier === "free"}
                      cta={
                        tier === "premium" ? (
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => cancel.mutate()}
                            disabled={cancel.isPending}
                          >
                            {cancel.isPending ? "Downgrading…" : "Downgrade"}
                          </Button>
                        ) : (
                          <Button variant="outline" className="w-full" disabled>
                            Current plan
                          </Button>
                        )
                      }
                    />
                    <PlanCard
                      name="Premium"
                      price="$10"
                      period="/mo"
                      highlight
                      features={[
                        "150 generations / month",
                        "Priority processing",
                        "All Free features",
                      ]}
                      current={tier === "premium"}
                      cta={
                        tier === "free" ? (
                          <Button className="w-full" onClick={startCheckout}>
                            Upgrade
                          </Button>
                        ) : (
                          <Button className="w-full" disabled>
                            Current plan
                          </Button>
                        )
                      }
                    />
                  </div>
                </DialogContent>
            </Dialog>
          </div>
          <p className="text-xs text-muted-foreground border-t pt-3">
            Payments are securely processed by Stripe.
          </p>
        </section>

        <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
          <DialogContent className="sm:max-w-3xl p-0 overflow-hidden">
            <DialogHeader className="px-6 pt-6">
              <DialogTitle>Upgrade to Premium</DialogTitle>
              <DialogDescription>
                Complete your payment to unlock 150 generations per month.
              </DialogDescription>
            </DialogHeader>
            <PaymentTestModeBanner />
            <div className="max-h-[70vh] overflow-y-auto">
              {checkoutOpen && (
                <StripeEmbeddedPremiumCheckout
                  returnUrl={`${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`}
                />
              )}
            </div>
          </DialogContent>
        </Dialog>

        <section className="border rounded-lg p-6 space-y-4">
          <h2 className="text-sm font-semibold">Appearance</h2>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="dark">Dark mode</Label>
              <p className="text-xs text-muted-foreground">Match your system or force dark.</p>
            </div>
            <Switch
              id="dark"
              checked={theme === "dark"}
              onCheckedChange={(v) => setTheme(v ? "dark" : "light")}
            />
          </div>
        </section>

        <section className="border border-destructive/40 rounded-lg p-6 space-y-4">
          <h2 className="text-sm font-semibold text-destructive">Danger zone</h2>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Delete account</p>
              <p className="text-xs text-muted-foreground">Permanently remove your account and all metadata.</p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">Delete account</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This deletes your profile, subscription, saved metadata, and all subtitle exports. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => del.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete account
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function PlanCard({
  name,
  price,
  period,
  features,
  cta,
  current,
  highlight,
}: {
  name: string;
  price: string;
  period: string;
  features: string[];
  cta: React.ReactNode;
  current?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-5 flex flex-col gap-4 ${
        highlight ? "border-foreground" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{name}</h3>
        {current && <Badge variant="secondary">Current</Badge>}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-semibold tracking-tight">{price}</span>
        <span className="text-sm text-muted-foreground">{period}</span>
      </div>
      <ul className="space-y-2 text-sm flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      {cta}
    </div>
  );
}