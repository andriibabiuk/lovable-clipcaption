import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Loose type to accept the typed Supabase client from requireSupabaseAuth context.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error("Failed to verify admin");
  if (!data) throw new Error("Forbidden");
}

export const listUsersWithRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: usersRes, error: usersErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (usersErr) throw usersErr;
    const users = usersRes.users ?? [];

    const { data: roles, error: rolesErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    if (rolesErr) throw rolesErr;

    const { data: subs } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id, status");
    const subByUser = new Map<string, string>();
    for (const s of subs ?? []) subByUser.set(s.user_id, s.status);

    const { data: vids } = await supabaseAdmin
      .from("video_metadata")
      .select("user_id");
    const videoCounts = new Map<string, number>();
    for (const v of vids ?? []) videoCounts.set(v.user_id, (videoCounts.get(v.user_id) ?? 0) + 1);

    const rolesByUser = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const list = rolesByUser.get(r.user_id) ?? [];
      list.push(r.role);
      rolesByUser.set(r.user_id, list);
    }

    return users
      .map((u) => {
        const userRoles = rolesByUser.get(u.id) ?? ["free"];
        const tier: "admin" | "premium" | "free" = userRoles.includes("admin")
          ? "admin"
          : userRoles.includes("premium")
            ? "premium"
            : "free";
        return {
          id: u.id,
          email: u.email ?? "",
          created_at: u.created_at,
          tier,
          subscription_status: subByUser.get(u.id) ?? "active",
          videos_processed: videoCounts.get(u.id) ?? 0,
        };
      })
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  });

const roleSchema = z.enum(["free", "premium", "admin"]);

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ userId: z.string().uuid(), role: roleSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Roles are exclusive tiers here: replace whatever the user has.
    const { error: delErr } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId);
    if (delErr) throw delErr;

    const { error: insErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (insErr) throw insErr;

    return { ok: true as const };
  });

export const getPlatformStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ count: totalGenerations }, { count: monthGenerations }] = await Promise.all([
      supabaseAdmin.from("generations").select("*", { count: "exact", head: true }),
      supabaseAdmin
        .from("generations")
        .select("*", { count: "exact", head: true })
        .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    ]);

    const { data: usersRes } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
    const totalUsers = (usersRes as { total?: number } | null)?.total ?? null;

    const { count: totalVideos } = await supabaseAdmin
      .from("video_metadata")
      .select("*", { count: "exact", head: true });

    const { count: premiumActive } = await supabaseAdmin
      .from("subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("plan_type", "premium")
      .eq("status", "active");

    return {
      totalUsers,
      totalGenerations: totalGenerations ?? 0,
      monthGenerations: monthGenerations ?? 0,
      totalVideos: totalVideos ?? 0,
      estimatedMonthlyRevenue: (premiumActive ?? 0) * 10,
    };
  });

export const getTopKeywords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("top_keywords", { _limit: 30 });
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{ keyword: string; uses: number }>;
  });