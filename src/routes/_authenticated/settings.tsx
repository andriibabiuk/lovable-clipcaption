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
import {
  deleteMyAccount,
  getMySubscription,
  mockCancelSubscription,
  mockUpgradeToPremium,
  updateProfileName,
} from "@/lib/billing.functions";

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

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      setEmail(data.user?.email ?? "");
      if (!uid) return;
      const { data: p } = await supabase.from("profiles").select("display_name").eq("id", uid).maybeSingle();
      setName(p?.display_name ?? "");
    })();
  }, []);

  const subFn = useServerFn(getMySubscription);
  const sub = useQuery({ queryKey: ["my-subscription"], queryFn: () => subFn() });

  const updateNameFn = useServerFn(updateProfileName);
  const saveName = useMutation({
    mutationFn: (displayName: string) => updateNameFn({ data: { displayName } }),
    onSuccess: () => toast.success("Name updated"),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const upgradeFn = useServerFn(mockUpgradeToPremium);
  const cancelFn = useServerFn(mockCancelSubscription);
  const deleteFn = useServerFn(deleteMyAccount);

  const upgrade = useMutation({
    mutationFn: () => upgradeFn(),
    onSuccess: () => {
      toast.success("Welcome to Premium!");
      qc.invalidateQueries();
    },
  });

  const cancel = useMutation({
    mutationFn: () => cancelFn(),
    onSuccess: () => {
      toast.success("Subscription canceled");
      qc.invalidateQueries();
    },
  });

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
            {tier === "free" && (
              <Button onClick={() => upgrade.mutate()} disabled={upgrade.isPending}>
                Upgrade to Premium — $10/mo
              </Button>
            )}
            {tier === "premium" && (
              <Button variant="outline" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
                Cancel subscription
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground border-t pt-3">
            Payments are simulated for this preview — no real card required.
          </p>
        </section>

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