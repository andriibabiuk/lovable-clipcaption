import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
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
import { toast } from "sonner";
import { useUserQuota } from "@/hooks/use-role";
import {
  getPlatformStats,
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
      navigate({ to: "/dashboard", replace: true });
    }
  }, [quota, quotaLoading, navigate]);

  const listFn = useServerFn(listUsersWithRoles);
  const statsFn = useServerFn(getPlatformStats);
  const updateFn = useServerFn(setUserRole);
  const qc = useQueryClient();

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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="text-lg font-semibold tracking-tight">
              ClipCaption
            </Link>
            <Badge variant="secondary">Admin</Badge>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10 space-y-10">
        <section>
          <h1 className="text-2xl font-semibold tracking-tight">Platform overview</h1>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <StatCard label="Total users" value={stats.data?.totalUsers ?? "—"} />
            <StatCard label="Generations (all time)" value={stats.data?.totalGenerations ?? 0} />
            <StatCard label="Generations this month" value={stats.data?.monthGenerations ?? 0} />
          </div>
        </section>

        <section>
          <h2 className="text-lg font-medium">Users</h2>
          <p className="text-sm text-muted-foreground">
            Change any user's tier. Roles apply immediately.
          </p>
          <div className="mt-4 rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Current tier</TableHead>
                  <TableHead className="w-48">Change tier</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.isLoading && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                )}
                {users.data?.map((u) => (
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
      </main>
    </div>
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