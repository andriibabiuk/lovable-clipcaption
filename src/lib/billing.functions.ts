import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type TierChange = {
  role: "free" | "premium" | "admin";
  planType: "free" | "premium";
  status: "active" | "canceled";
  renewalDate: string | null;
};

// Centralized "change a user's tier" mutation used by both upgrade and cancel
// flows (and mirrors the delete+insert pattern in admin.functions.setUserRole).
// Keeping the three-table write in one place ensures they can't drift apart.
async function setUserTier(userId: string, change: TierChange) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
  const { error: rErr } = await supabaseAdmin
    .from("user_roles")
    .insert({ user_id: userId, role: change.role });
  if (rErr) throw new Error(rErr.message);

  const { error: sErr } = await supabaseAdmin
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        plan_type: change.planType,
        status: change.status,
        renewal_date: change.renewalDate,
      },
      { onConflict: "user_id" },
    );
  if (sErr) throw new Error(sErr.message);

  const { error: pErr } = await supabaseAdmin
    .from("profiles")
    .update({ subscription_status: change.status, renewal_date: change.renewalDate })
    .eq("id", userId);
  if (pErr) throw new Error(pErr.message);
}

export const getMySubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const updateProfileName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ displayName: z.string().min(1).max(80) }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ display_name: data.displayName })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const mockUpgradeToPremium = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const renewal = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await setUserTier(context.userId, {
      role: "premium",
      planType: "premium",
      status: "active",
      renewalDate: renewal,
    });
    return { ok: true as const, renewalDate: renewal };
  });

export const mockCancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await setUserTier(context.userId, {
      role: "free",
      planType: "free",
      status: "canceled",
      renewalDate: null,
    });
    return { ok: true as const };
  });

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });