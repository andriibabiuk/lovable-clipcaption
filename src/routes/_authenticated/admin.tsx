import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useState } from "react";
import { Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useUserQuota } from "@/hooks/use-role";
import {
  getPlatformStats,
  getTopKeywords,
  listUsersWithRoles,
  setUserRole,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin — ClipCaption" },
      { name: "description", content: "ClipCaption administration panel." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const { data: quota, isLoading: quotaLoading } = useUserQuota();

  useEffect(() => {
    if (!quotaLoading && quota && quota.tier !== "admin") {
      toast.error("Admin access required");
      navigate({ to: "/home", replace: true });
    }
  }, [quota, quotaLoading, navigate]);

  const listFn = useServerFn(listUsersWithRoles);
  const statsFn = useServerFn(getPlatformStats);
  const kwFn = useServerFn(getTopKeywords);
  const updateFn = useServerFn(setUserRole);
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const users = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => listFn(),
    enabled: quota?.tier === "admin",
  });
  const stats = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => statsFn(),
    enabled: quota?.tier === "admin",
  });
  const keywords = useQuery({
    queryKey: ["admin", "keywords"],
    queryFn: () => kwFn(),
    enabled: quota?.tier === "admin",
  });

  const updateRole = useMutation({
    mutationFn: (vars: { userId: string; role: "free" | "premium" | "admin" }) =>
      updateFn({ data: vars }),
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: ["user-quota"] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    },
  });

  if (quotaLoading || quota?.tier !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Checking access…
      </div>
    );
  }

  const filteredUsers = (users.data ?? []).filter((u) =>
    !q.trim() ? true : u.email.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <AppShell>
      <div className="space-y-10">
        <section>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Admin panel</h1>
            <Badge variant="secondary">Admin</Badge>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total users" value={stats.data?.totalUsers ?? "—"} />
            <StatCard label="Videos processed" value={stats.data?.totalVideos ?? 0} />
            <StatCard label="Generations this month" value={stats.data?.monthGenerations ?? 0} />
            <StatCard
              label="Est. monthly revenue"
              value={stats.data ? `$${stats.data.estimatedMonthlyRevenue}` : "—"}
            />
          </div>
        </section>

        <section>
          <h2 className="text-lg font-medium">Most-used keywords</h2>
          <div className="mt-3 border rounded-lg p-5">
            {keywords.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {keywords.data && keywords.data.length === 0 && (
              <p className="text-sm text-muted-foreground">No keywords yet.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {(keywords.data ?? []).map((k) => (
                <span
                  key={k.keyword}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs"
                >
                  {k.keyword}
                  <span className="text-muted-foreground tabular-nums">{k.uses}</span>
                </span>
              ))}
            </div>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium">Users</h2>
              <p className="text-sm text-muted-foreground">
                Change any user's tier. Roles apply immediately.
              </p>
            </div>
            <div className="relative max-w-xs w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by email" className="pl-9" />
            </div>
          </div>
          <div className="mt-4 rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Videos</TableHead>
                  <TableHead className="w-48">Change tier</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.isLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                )}
                {filteredUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.email || u.id}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.tier === "admin" ? "default" : "secondary"} className="capitalize">
                        {u.tier}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs capitalize">
                      {u.subscription_status}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{u.videos_processed}</TableCell>
                    <TableCell>
                      <Select
                        value={u.tier}
                        onValueChange={(role) =>
                          updateRole.mutate({
                            userId: u.id,
                            role: role as "free" | "premium" | "admin",
                          })
                        }
                        disabled={updateRole.isPending}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">Free</SelectItem>
                          <SelectItem value="premium">Premium</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border p-6">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}