import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    // Replace role: single tier.
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    const { error: rErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "premium" });
    if (rErr) throw new Error(rErr.message);

    const renewal = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error: sErr } = await supabaseAdmin
      .from("subscriptions")
      .upsert(
        { user_id: userId, plan_type: "premium", status: "active", renewal_date: renewal },
        { onConflict: "user_id" },
      );
    if (sErr) throw new Error(sErr.message);

    await supabaseAdmin
      .from("profiles")
      .update({ subscription_status: "active", renewal_date: renewal })
      .eq("id", userId);

    return { ok: true as const, renewalDate: renewal };
  });

export const mockCancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    const { error: rErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "free" });
    if (rErr) throw new Error(rErr.message);

    await supabaseAdmin
      .from("subscriptions")
      .upsert(
        { user_id: userId, plan_type: "free", status: "canceled", renewal_date: null },
        { onConflict: "user_id" },
      );

    await supabaseAdmin
      .from("profiles")
      .update({ subscription_status: "canceled", renewal_date: null })
      .eq("id", userId);

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