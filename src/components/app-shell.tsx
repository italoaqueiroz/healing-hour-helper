import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  CalendarCheck, Users, FileText, LogOut, Menu, User as UserIcon, X, UserCog,
} from "lucide-react";

type NavItem = { to: "/agenda" | "/contactos" | "/relatorios" | "/equipa"; label: string; icon: React.ComponentType<{ className?: string }>; adminOnly?: boolean };

const NAV: NavItem[] = [
  { to: "/agenda", label: "Agenda", icon: CalendarCheck },
  { to: "/contactos", label: "Contactos", icon: Users },
  { to: "/relatorios", label: "Relatórios", icon: FileText },
  { to: "/equipa", label: "Equipa", icon: UserCog, adminOnly: true },
];

export function AppShell({
  title, subtitle, actions, children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const [userName, setUserName] = useState("Terapeuta");
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setUserName(
        (data.user.user_metadata?.full_name as string) ||
        (data.user.user_metadata?.name as string) ||
        data.user.email?.split("@")[0] || "Terapeuta"
      );
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
      setIsAdmin(!!roles?.some((r) => r.role === "admin"));
    });
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const isActive = (path: string) => currentPath === path;

  const NavLinks = ({ onClick }: { onClick?: () => void }) => (
    <nav className="flex flex-col gap-1">
      {NAV.filter((i) => !i.adminOnly || isAdmin).map((item) => {
        const active = isActive(item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onClick}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-foreground/80 hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span className="font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  const Brand = () => (
    <div className="flex items-center gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
        <CalendarCheck className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="font-display text-lg leading-tight truncate">O Fio de Ariana</div>
        <div className="text-[11px] text-muted-foreground -mt-0.5">Agenda terapêutica</div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-[100dvh] w-full bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-border bg-sidebar/60 backdrop-blur px-4 py-5">
        <Brand />
        <div className="mt-6 flex-1">
          <NavLinks />
        </div>
        <div className="border-t border-sidebar-border pt-3 space-y-2">
          <div className="flex items-center gap-2 px-3 text-sm text-muted-foreground">
            <UserIcon className="h-4 w-4 shrink-0" />
            <span className="truncate">{userName}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start">
            <LogOut className="h-4 w-4 mr-2" />Sair
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-border bg-card/80 backdrop-blur">
          <div className="flex items-center gap-2 px-3 sm:px-5 py-2.5">
            {/* Mobile menu */}
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden shrink-0">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0 flex flex-col">
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <Brand />
                  <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="h-8 w-8">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex-1 p-3">
                  <NavLinks onClick={() => setOpen(false)} />
                </div>
                <div className="border-t border-border p-3 space-y-2">
                  <div className="flex items-center gap-2 px-2 text-sm text-muted-foreground">
                    <UserIcon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{userName}</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start">
                    <LogOut className="h-4 w-4 mr-2" />Sair
                  </Button>
                </div>
              </SheetContent>
            </Sheet>

            <div className="lg:hidden shrink-0">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground">
                <CalendarCheck className="h-4 w-4" />
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="font-display text-base sm:text-lg leading-tight truncate">{title}</div>
              {subtitle && <div className="text-[11px] text-muted-foreground -mt-0.5 truncate">{subtitle}</div>}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">{actions}</div>
          </div>
        </header>

        <main className="flex-1 min-w-0 pb-20 lg:pb-6">{children}</main>

        {/* Mobile bottom nav (app-like) */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-card/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
          <div className={`grid ${isAdmin ? "grid-cols-4" : "grid-cols-3"}`}>
            {NAV.filter((i) => !i.adminOnly || isAdmin).map((item) => {
              const active = isActive(item.to);
              const Icon = item.icon;
              return (
                <Link key={item.to} to={item.to}
                  className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] transition-colors ${
                    active ? "text-primary font-semibold" : "text-muted-foreground"
                  }`}>
                  <Icon className={`h-5 w-5 ${active ? "scale-110" : ""} transition-transform`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
