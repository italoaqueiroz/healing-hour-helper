import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CalendarCheck, Users, FileText, LogOut, User as UserIcon, UserCog, Baby,
} from "lucide-react";
import { IosInstallBanner } from "./ios-install-banner";

type NavItem = {
  to: "/agenda" | "/contactos" | "/pro-infancia" | "/relatorios" | "/equipa";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requiresAdmin?: boolean;
  requiresPI?: boolean; // admin OR pro_infancia
};

const NAV: NavItem[] = [
  { to: "/agenda", label: "Agenda", icon: CalendarCheck },
  { to: "/contactos", label: "Contactos", icon: Users },
  { to: "/pro-infancia", label: "ProInfância", icon: Baby, requiresPI: true },
  { to: "/relatorios", label: "Relatórios", icon: FileText },
  { to: "/equipa", label: "Equipa", icon: UserCog, requiresAdmin: true },
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
  const [isPI, setIsPI] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setUserName(
        (data.user.user_metadata?.full_name as string) ||
        (data.user.user_metadata?.name as string) ||
        data.user.email?.split("@")[0] || "Terapeuta"
      );
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
      const list = roles?.map((r) => r.role) || [];
      const admin = list.includes("admin");
      setIsAdmin(admin);
      setIsPI(admin || list.includes("pro_infancia"));
    });
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const visibleNav = NAV.filter((i) => {
    if (i.requiresAdmin && !isAdmin) return false;
    if (i.requiresPI && !isPI) return false;
    return true;
  });

  const isActive = (path: string) => currentPath === path || currentPath.startsWith(path + "/");

  return (
    <div className="flex min-h-[100dvh] w-full flex-col bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-border bg-card/80 backdrop-blur">
        <div className="flex items-center gap-3 px-3 sm:px-5 py-2.5">
          {/* Fio logo → home */}
          <Link to="/" className="shrink-0" aria-label="Página inicial">
            <img
              src="/pwa-icon-512.png"
              alt="O Fio de Ariana"
              className="h-9 w-9 rounded-full ring-1 ring-border object-cover"
            />
          </Link>

          <div className="min-w-0 flex-1">
            <div className="font-display text-base sm:text-lg leading-tight truncate">{title}</div>
            {subtitle && <div className="text-[11px] text-muted-foreground -mt-0.5 truncate">{subtitle}</div>}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {actions}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Conta">
                  <UserIcon className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px]">
                <DropdownMenuLabel className="truncate">{userName}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4 mr-2" /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="flex-1 min-w-0 pb-20">{children}</main>

      {/* Bottom nav — always visible */}
      <nav className="fixed bottom-0 inset-x-0 z-30 border-t border-border bg-card/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div
          className="grid mx-auto max-w-3xl"
          style={{ gridTemplateColumns: `repeat(${visibleNav.length}, minmax(0, 1fr))` }}
        >
          {visibleNav.map((item) => {
            const active = isActive(item.to);
            const Icon = item.icon;
            return (
              <Link key={item.to} to={item.to}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] transition-colors ${
                  active ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
                }`}>
                <Icon className={`h-5 w-5 ${active ? "scale-110" : ""} transition-transform`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <IosInstallBanner />
    </div>
  );
}
