import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Bell,
  BellRing,
  CalendarCheck,
  CheckCheck,
  Users,
  FileText,
  LogOut,
  User as UserIcon,
  UserCog,
  Baby,
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

type AppNotification = {
  id: string;
  appointment_id: string | null;
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
};

export function AppShell({
  title,
  subtitle,
  actions,
  children,
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
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [browserPermission, setBrowserPermission] = useState<
    NotificationPermission | "unsupported"
  >(
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "unsupported",
  );

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setUserName(
        (data.user.user_metadata?.full_name as string) ||
          (data.user.user_metadata?.name as string) ||
          data.user.email?.split("@")[0] ||
          "Terapeuta",
      );
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);
      const list = roles?.map((r) => r.role) || [];
      const admin = list.includes("admin");
      setIsAdmin(admin);
      setIsPI(admin || list.includes("pro_infancia"));

      const { data: initialNotifications } = await supabase
        .from("notifications")
        .select("id, appointment_id, title, message, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      setNotifications((initialNotifications as AppNotification[] | null) || []);
    });

    let channel: ReturnType<typeof supabase.channel> | null = null;
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      channel = supabase
        .channel(`notifications:${data.user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `recipient_id=eq.${data.user.id}`,
          },
          (payload) => {
            const notification = payload.new as AppNotification;
            setNotifications((current) => [notification, ...current].slice(0, 20));
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification(notification.title, {
                body: notification.message,
                icon: "/pwa-icon-512.png",
                tag: notification.id,
              });
            }
          },
        )
        .subscribe();
    });

    return () => {
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  const unreadCount = notifications.filter((notification) => !notification.read_at).length;

  async function markNotificationRead(notification: AppNotification) {
    if (!notification.read_at) {
      const readAt = new Date().toISOString();
      setNotifications((current) =>
        current.map((item) => (item.id === notification.id ? { ...item, read_at: readAt } : item)),
      );
      await supabase.from("notifications").update({ read_at: readAt }).eq("id", notification.id);
    }
    navigate({ to: "/agenda" });
  }

  async function markAllNotificationsRead() {
    const unreadIds = notifications
      .filter((notification) => !notification.read_at)
      .map((notification) => notification.id);
    if (!unreadIds.length) return;
    const readAt = new Date().toISOString();
    setNotifications((current) =>
      current.map((item) => ({ ...item, read_at: item.read_at || readAt })),
    );
    await supabase.from("notifications").update({ read_at: readAt }).in("id", unreadIds);
  }

  async function enableBrowserNotifications() {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    setBrowserPermission(permission);
  }

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
            {subtitle && (
              <div className="text-[11px] text-muted-foreground -mt-0.5 truncate">{subtitle}</div>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {actions}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Notificações${unreadCount ? `: ${unreadCount} não lidas` : ""}`}
                  className="relative"
                >
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-1rem))] p-0">
                <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <DropdownMenuLabel className="p-0">Notificações</DropdownMenuLabel>
                  {unreadCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={markAllNotificationsRead}
                    >
                      <CheckCheck className="mr-1 h-3.5 w-3.5" /> Marcar lidas
                    </Button>
                  )}
                </div>
                <DropdownMenuSeparator className="m-0" />
                {browserPermission === "default" && (
                  <>
                    <DropdownMenuItem
                      onSelect={enableBrowserNotifications}
                      className="m-1.5 gap-2 rounded-md bg-muted/60 py-2.5"
                    >
                      <BellRing className="h-4 w-4 shrink-0 text-primary" />
                      <span className="text-xs">Ativar avisos neste dispositivo</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="m-0" />
                  </>
                )}
                <div className="max-h-80 overflow-y-auto p-1.5">
                  {notifications.length === 0 ? (
                    <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                      Sem notificações.
                    </div>
                  ) : (
                    notifications.map((notification) => (
                      <DropdownMenuItem
                        key={notification.id}
                        onSelect={() => markNotificationRead(notification)}
                        className="items-start gap-2 rounded-md px-2.5 py-2.5"
                      >
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.read_at ? "bg-transparent" : "bg-primary"}`}
                        />
                        <span className="min-w-0 flex-1 whitespace-normal">
                          <span className="block text-sm font-medium">{notification.title}</span>
                          <span className="block text-xs leading-relaxed text-muted-foreground">
                            {notification.message}
                          </span>
                          <span className="mt-1 block text-[11px] text-muted-foreground">
                            {formatDistanceToNow(new Date(notification.created_at), {
                              addSuffix: true,
                              locale: pt,
                            })}
                          </span>
                        </span>
                      </DropdownMenuItem>
                    ))
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Conta">
                  <UserIcon className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px]">
                <DropdownMenuLabel className="truncate">{userName}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={signOut}
                  className="text-destructive focus:text-destructive"
                >
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
              <Link
                key={item.to}
                to={item.to}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] transition-colors ${
                  active
                    ? "text-primary font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
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
