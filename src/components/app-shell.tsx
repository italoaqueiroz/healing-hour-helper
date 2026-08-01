import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { registerPushSubscription } from "@/lib/push.functions";
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
  History,
  ArrowRight,
} from "lucide-react";
import { IosInstallBanner } from "./ios-install-banner";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

type NavItem = {
  to: "/agenda" | "/contactos" | "/pro-infancia" | "/relatorios" | "/equipa" | "/historico";
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
  { to: "/historico", label: "Histórico", icon: History, requiresAdmin: true },
  { to: "/equipa", label: "Equipa", icon: UserCog, requiresAdmin: true },
];

type OnboardingProfile = {
  id: string;
  default_session_minutes: number;
  session_duration_selected_at: string | null;
  tutorial_step: number;
  tutorial_completed_at: string | null;
};

const THERAPIST_TUTORIAL = [
  {
    title: "Agenda e salas",
    text: "Na Agenda, altere o dia pelas setas ou pelo calendário. Use a vista em cartões ou a grade por horário e arraste sessões em intervalos de 15 minutos.",
  },
  {
    title: "Criar e editar atendimentos",
    text: "Em Novo, crie uma sessão presencial, consulta online, reunião ou outro evento. Escolha paciente, sala e todos os terapeutas envolvidos. Abra o cartão para corrigir os dados.",
  },
  {
    title: "Check-in, presença e faltas",
    text: "Check-in confirma que o paciente chegou e registra presença. P, FT, FI e FJ registram o resultado da sessão. Até uma hora após o fim é possível corrigir; depois o cartão fica congelado.",
  },
  {
    title: "Indisponibilidade",
    text: "Use Indisponível para bloqueios de horário, férias e outras ausências. O sistema avisa quando o período entra em conflito com atendimentos marcados.",
  },
  {
    title: "Contactos e relatórios",
    text: "Contactos reúne os dados dos pacientes. Relatórios mostra apenas a atividade correspondente ao terapeuta, incluindo sessões feitas em conjunto.",
  },
  {
    title: "Notificações e segurança",
    text: "Ative o sino para receber avisos de check-in no celular. Não compartilhe a sua conta e encerre a sessão em dispositivos de terceiros. Alterações na agenda ficam registradas para a administração.",
  },
];

type AppNotification = {
  id: string;
  appointment_id: string | null;
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
};

const VAPID_PUBLIC_KEY =
  "BI0MZj97iGBmVM0rHDxM5QpGFxNbYQcR-40sQxk2XzQLjuc4iMXAQEOFyU2AkiCQVjMbEZq3oGCUlBQtiG1kMFw";

function vapidKeyBytes(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

function isIosWithoutInstalledApp() {
  if (typeof window === "undefined") return false;
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return isIos && !standalone;
}

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
  const savePushSubscription = useServerFn(registerPushSubscription);
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const [userName, setUserName] = useState("Terapeuta");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPI, setIsPI] = useState(false);
  const [isTherapist, setIsTherapist] = useState(false);
  const [onboardingProfile, setOnboardingProfile] = useState<OnboardingProfile | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [browserPermission, setBrowserPermission] = useState<
    NotificationPermission | "unsupported"
  >(
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "unsupported",
  );

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let reloading = false;
    const reloadForNewVersion = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", reloadForNewVersion);
    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((registration) => {
      void registration.update();
    });
    return () => navigator.serviceWorker.removeEventListener("controllerchange", reloadForNewVersion);
  }, []);

  const subscribeDevice = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      throw new Error("Este dispositivo não suporta notificações push.");
    }
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKeyBytes(VAPID_PUBLIC_KEY),
      }));
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
      throw new Error("Não foi possível registar este dispositivo.");
    }
    await savePushSubscription({
      data: {
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        userAgent: navigator.userAgent,
      },
    });
  }, [savePushSubscription]);

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
      setIsTherapist(list.includes("therapist"));

      const { data: onboarding } = await supabase
        .from("profiles")
        .select("id, default_session_minutes, session_duration_selected_at, tutorial_step, tutorial_completed_at")
        .eq("id", data.user.id)
        .maybeSingle();
      setOnboardingProfile(onboarding as OnboardingProfile | null);

      const { data: initialNotifications } = await supabase
        .from("notifications")
        .select("id, appointment_id, title, message, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      setNotifications((initialNotifications as AppNotification[] | null) || []);

      if ("Notification" in window && Notification.permission === "granted") {
        void subscribeDevice().catch(() => {});
      }
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
          },
        )
        .subscribe();
    });

    return () => {
      if (channel) void supabase.removeChannel(channel);
    };
  }, [subscribeDevice]);

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
    if (isIosWithoutInstalledApp()) {
      toast.info("No iPhone, adicione primeiro a Agenda à tela inicial e abra pelo novo ícone.");
      return;
    }
    if (!("Notification" in window)) {
      toast.error("Este dispositivo não suporta notificações.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setBrowserPermission(permission);
      if (permission !== "granted") {
        toast.error("Permissão de notificações não concedida.");
        return;
      }
      await subscribeDevice();
      toast.success("Notificações ativadas neste dispositivo.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ativar notificações.");
    }
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
            <img src="/logo-fio.png" alt="O Fio de Ariana" className="h-9 w-9 object-contain" />
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
                {(browserPermission === "default" || browserPermission === "unsupported") && (
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
                {browserPermission === "granted" && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    Avisos push ativos neste dispositivo.
                  </div>
                )}
                {browserPermission === "denied" && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    Avisos bloqueados nas definições do dispositivo.
                  </div>
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
      {isTherapist && onboardingProfile && (
        <RequiredOnboarding
          profile={onboardingProfile}
          onProfileChange={setOnboardingProfile}
        />
      )}
    </div>
  );
}

function RequiredOnboarding({
  profile,
  onProfileChange,
}: {
  profile: OnboardingProfile;
  onProfileChange: (profile: OnboardingProfile) => void;
}) {
  const [minutes, setMinutes] = useState(profile.default_session_minutes || 60);
  const [saving, setSaving] = useState(false);
  const choosingDuration = !profile.session_duration_selected_at;
  const tutorialOpen = !profile.tutorial_completed_at;
  const open = choosingDuration || tutorialOpen;
  const step = Math.min(profile.tutorial_step, THERAPIST_TUTORIAL.length - 1);
  const item = THERAPIST_TUTORIAL[step];

  async function saveDuration() {
    setSaving(true);
    const { data, error } = await supabase.rpc("complete_duration_setup", { _minutes: minutes });
    setSaving(false);
    if (error) return toast.error("Não foi possível guardar a duração.");
    onProfileChange(data as OnboardingProfile);
  }

  async function continueTutorial() {
    setSaving(true);
    const { data, error } = await supabase.rpc("advance_tutorial");
    setSaving(false);
    if (error) return toast.error("Não foi possível guardar o progresso.");
    onProfileChange(data as OnboardingProfile);
  }

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-md"
        hideClose
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        {choosingDuration ? (
          <>
            <DialogHeader>
              <DialogTitle>Duração habitual das suas sessões</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Esta escolha preenche automaticamente o horário final ao criar um atendimento.
            </p>
            <div className="grid grid-cols-4 gap-2">
              {[45, 60, 75, 90].map((value) => (
                <Button key={value} variant={minutes === value ? "default" : "outline"} onClick={() => setMinutes(value)}>
                  {value} min
                </Button>
              ))}
            </div>
            <div>
              <Label htmlFor="required-duration">Outra duração</Label>
              <Input id="required-duration" type="number" min={15} max={240} step={5} value={minutes}
                onChange={(event) => setMinutes(Math.max(15, Math.min(240, Number(event.target.value) || 60)))} />
            </div>
            <Button onClick={saveDuration} disabled={saving} className="w-full">
              Guardar e iniciar tutorial <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="text-xs font-medium text-muted-foreground">PASSO {step + 1} DE {THERAPIST_TUTORIAL.length}</div>
              <DialogTitle>{item.title}</DialogTitle>
            </DialogHeader>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${((step + 1) / THERAPIST_TUTORIAL.length) * 100}%` }} />
            </div>
            <p className="min-h-24 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
            <Button onClick={continueTutorial} disabled={saving} className="w-full">
              {step === THERAPIST_TUTORIAL.length - 1 ? "Concluir tutorial" : "Entendi, continuar"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
