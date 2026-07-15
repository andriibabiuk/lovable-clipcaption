import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AuthCtx = Parameters<
  Parameters<ReturnType<typeof requireSupabaseAuth>["server"]>[0]
>[0]["context"];

async function assertAdmin(context: AuthCtx) {
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

    return {
      totalUsers,
      totalGenerations: totalGenerations ?? 0,
      monthGenerations: monthGenerations ?? 0,
    };
  });