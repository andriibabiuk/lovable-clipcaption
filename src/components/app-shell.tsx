import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Moon, Sun, Menu, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/components/theme-provider";
import { useUserQuota } from "@/hooks/use-role";
import { toast } from "sonner";

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const { data: quota } = useUserQuota();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [profile, setProfile] = useState<{ name: string | null; email: string | null }>({
    name: null,
    email: null,
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return;
      const { data: p } = await supabase
        .from("profiles")
        .select("display_name, email")
        .eq("id", uid)
        .maybeSingle();
      setProfile({
        name: p?.display_name ?? userData.user?.email?.split("@")[0] ?? null,
        email: p?.email ?? userData.user?.email ?? null,
      });
    })();
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  }

  const isAdmin = quota?.tier === "admin";
  const tabs: Array<{ to: "/home" | "/history" | "/settings" | "/admin"; label: string; show: boolean }> = [
    { to: "/home", label: "Home", show: true },
    { to: "/history", label: "History", show: true },
    { to: "/settings", label: "Settings", show: true },
    { to: "/admin", label: "Admin", show: isAdmin },
  ];

  const initials = (profile.name ?? profile.email ?? "?")
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b sticky top-0 z-40 bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link to="/home" className="text-lg font-semibold tracking-tight">
              ClipCaption
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {tabs.filter((t) => t.show).map((t) => {
                const active = pathname === t.to;
                return (
                  <Link
                    key={t.to}
                    to={t.to}
                    className={
                      "px-3 py-1.5 rounded-md text-sm transition-colors " +
                      (active
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/60")
                    }
                  >
                    {t.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            {quota && (
              <Badge variant="secondary" className="hidden sm:inline-flex capitalize">
                {quota.tier}
              </Badge>
            )}
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <div className="hidden sm:flex items-center gap-2 pl-2 border-l">
              <div className="h-8 w-8 rounded-full bg-secondary text-foreground flex items-center justify-center text-xs font-medium">
                {initials || "U"}
              </div>
              <span className="text-sm text-muted-foreground max-w-[140px] truncate">
                {profile.name ?? profile.email}
              </span>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                Sign out
              </Button>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Menu"
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        {mobileOpen && (
          <div className="md:hidden border-t px-4 py-3 space-y-2">
            {tabs.filter((t) => t.show).map((t) => (
              <Link
                key={t.to}
                to={t.to}
                className="block px-2 py-2 rounded-md text-sm hover:bg-secondary"
                onClick={() => setMobileOpen(false)}
              >
                {t.label}
              </Link>
            ))}
            <div className="pt-2 border-t flex items-center justify-between">
              <span className="text-sm text-muted-foreground truncate">
                {profile.name ?? profile.email}
              </span>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                Sign out
              </Button>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 py-8">{children}</main>

      <footer className="border-t">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} ClipCaption</span>
          <div className="flex gap-4">
            <a href="#" className="hover:text-foreground">Support</a>
            <a href="#" className="hover:text-foreground">Privacy</a>
            <a href="#" className="hover:text-foreground">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}