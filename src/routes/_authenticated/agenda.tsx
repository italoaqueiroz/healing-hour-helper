import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format, addDays, startOfDay, isSameDay, parseISO, addWeeks, addMonths } from "date-fns";
import { pt } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import {
  ChevronLeft, ChevronRight, Plus, RotateCw, Trash2,
  Crown, LayoutGrid, Rows3, Star, Ban, CalendarIcon,
  BellRing, Clock, Settings2,
} from "lucide-react";

type Room = { id: string; name: string; position: number };
type Profile = { id: string; full_name: string | null; email: string | null; color: string | null; default_session_minutes?: number | null };
type Patient = { id: string; full_name: string; registration_number: string | null };
type Status =
  | "pending" | "present" | "absent" | "rescheduled" | "cancelled"
  | "absent_therapist" | "absent_unjustified" | "absent_justified";
type EventType = "session" | "meeting" | "online" | "block" | "vacation" | "other";
type Appointment = {
  id: string;
  therapist_id: string;
  co_therapist_id: string | null;
  additional_therapist_ids: string[];
  room_id: string;
  patient_id: string | null;
  patient_name: string | null;
  title: string | null;
  event_type: EventType;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  attendance_status: Status;
  attendance_marked_at: string | null;
  check_in_at: string | null;
  check_in_by: string | null;
  recurrence_group_id: string | null;
  profiles?: { full_name: string | null; email: string | null; color: string | null } | null;
};

export const Route = createFileRoute("/_authenticated/agenda")({
  head: () => ({ meta: [{ title: "Agenda · O Fio de Ariana" }] }),
  component: AgendaPage,
});

const HOURS = Array.from({ length: 13 }, (_, i) => 9 + i); // 09–21

const EVENT_TYPES: Array<{ value: EventType; label: string; icon: string }> = [
  { value: "session",  label: "Sessão terapêutica", icon: "🧶" },
  { value: "meeting",  label: "Reunião",            icon: "👥" },
  { value: "online",   label: "Consulta online",    icon: "💻" },
  { value: "block",    label: "Bloqueio / Indisponível", icon: "⛔" },
  { value: "vacation", label: "Férias",             icon: "🌴" },
  { value: "other",    label: "Outro",              icon: "✦" },
];

function eventLabel(a: Pick<Appointment, "patient_name" | "title" | "event_type">) {
  if (a.event_type === "session") return a.patient_name || "—";
  return a.title || EVENT_TYPES.find((e) => e.value === a.event_type)?.label || "Evento";
}

// Effective status: auto-mark as 'present' visually if pending and past +1h (cron persists)
function effectiveStatus(a: Pick<Appointment, "attendance_status" | "ends_at">): Status {
  if (a.attendance_status !== "pending") return a.attendance_status;
  const ends = parseISO(a.ends_at).getTime();
  if (ends + 60 * 60 * 1000 < Date.now()) return "present";
  return "pending";
}

type Unavail = { id: string; therapist_id: string; starts_at: string; ends_at: string; reason: string | null };

function AgendaPage() {
  const navigate = useNavigate();
  void navigate;
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminExists, setAdminExists] = useState<boolean | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [unavail, setUnavail] = useState<Unavail[]>([]);
  const [day, setDay] = useState<Date>(startOfDay(new Date()));
  const [openNew, setOpenNew] = useState(false);
  const [openUnavail, setOpenUnavail] = useState(false);
  const [openDuration, setOpenDuration] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"colunas" | "grade">("grade");
  const [prefill, setPrefill] = useState<{ roomId?: string; hour?: number } | null>(null);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);




  function openCreateAt(roomId: string, hour: number) {
    setPrefill({ roomId, hour });
    setOpenNew(true);
  }

  async function moveAppt(a: Appointment, newRoomId: string, newHour: number) {
    if (!canEdit(a)) return toast.error("Sem permissão para mover");
    const start = parseISO(a.starts_at);
    const end = parseISO(a.ends_at);
    const durationMs = end.getTime() - start.getTime();
    const newStart = new Date(start);
    newStart.setHours(newHour, 0, 0, 0);
    const newEnd = new Date(newStart.getTime() + durationMs);
    const prev = { room_id: a.room_id, starts_at: a.starts_at, ends_at: a.ends_at };
    setAppts((cur) => cur.map((x) => x.id === a.id ? { ...x, room_id: newRoomId, starts_at: newStart.toISOString(), ends_at: newEnd.toISOString() } : x));
    const { error } = await supabase.from("appointments")
      .update({ room_id: newRoomId, starts_at: newStart.toISOString(), ends_at: newEnd.toISOString() })
      .eq("id", a.id);
    if (error) {
      setAppts((cur) => cur.map((x) => x.id === a.id ? { ...x, ...prev } : x));
      toast.error("Não foi possível mover");
    } else toast.success("Atendimento movido");
  }

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setUserId(data.user.id);
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
      setIsAdmin(!!roles?.some((r) => r.role === "admin"));
      const { count } = await supabase.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "admin");
      setAdminExists((count ?? 0) > 0);
    });
  }, []);

  async function loadProfiles() {
    const { data } = await supabase.from("profiles").select("id, full_name, email, color, default_session_minutes");
    if (data) setProfiles(data as Profile[]);
  }

  useEffect(() => {
    supabase.from("rooms").select("*").order("position").then(({ data }) => {
      if (data) setRooms(data as Room[]);
    });
    loadProfiles();
    loadPatients();
  }, []);

  async function loadPatients() {
    const { data } = await supabase.from("patients").select("id, full_name, registration_number").order("full_name");
    if (data) setPatients(data as Patient[]);
  }

  async function loadAppts(d: Date) {
    setLoading(true);
    const start = startOfDay(d).toISOString();
    const end = addDays(startOfDay(d), 1).toISOString();
    const { data, error } = await supabase
      .from("appointments")
      .select("*, profiles:therapist_id(full_name, email, color)")
      .gte("starts_at", start)
      .lt("starts_at", end)
      .order("starts_at");
    if (error) toast.error("Erro ao carregar agenda");
    setAppts((data as unknown as Appointment[]) || []);
    setLoading(false);
  }

  async function loadUnavail(d: Date) {
    const start = startOfDay(d).toISOString();
    const end = addDays(startOfDay(d), 1).toISOString();
    const { data } = await supabase.from("therapist_unavailability")
      .select("id, therapist_id, starts_at, ends_at, reason")
      .lt("starts_at", end).gt("ends_at", start);
    setUnavail((data as Unavail[]) || []);
  }

  useEffect(() => { loadAppts(day); loadUnavail(day); }, [day]);


  async function claimAdmin() {
    const { data, error } = await supabase.rpc("claim_admin");
    if (error || !data) return toast.error("Não foi possível reivindicar admin");
    setIsAdmin(true); setAdminExists(true);
    toast.success("És agora administrador");
  }

  function canEdit(a: Appointment) {
    return isAdmin || a.therapist_id === userId || a.co_therapist_id === userId || (a.additional_therapist_ids || []).includes(userId || "");
  }

  async function toggleCheckIn(a: Appointment) {
    const checking = !a.check_in_at;
    const newVal = checking ? new Date().toISOString() : null;
    const newBy  = checking ? userId : null;
    setAppts((cur) => cur.map((x) => x.id === a.id ? { ...x, check_in_at: newVal, check_in_by: newBy } : x));
    const { error } = await supabase.from("appointments")
      .update({ check_in_at: newVal, check_in_by: newBy }).eq("id", a.id);
    if (error) {
      setAppts((cur) => cur.map((x) => x.id === a.id ? { ...x, check_in_at: a.check_in_at, check_in_by: a.check_in_by } : x));
      return toast.error("Não foi possível registar check-in");
    }
    toast.success(checking
      ? `${eventLabel(a)} chegou. Terapeuta(s) notificado(s).`
      : "Check-in removido");
  }

  async function markStatus(a: Appointment, status: Status) {
    if (!canEdit(a)) return;
    const previous = a.attendance_status;
    setAppts((cur) => cur.map((x) => x.id === a.id ? { ...x, attendance_status: status, attendance_marked_at: new Date().toISOString() } : x));
    const { error } = await supabase
      .from("appointments")
      .update({ attendance_status: status, attendance_marked_at: new Date().toISOString() })
      .eq("id", a.id);
    if (error) {
      setAppts((cur) => cur.map((x) => x.id === a.id ? { ...x, attendance_status: previous } : x));
      toast.error("Não foi possível atualizar");
    } else toast.success(statusLabel(status) + " registado");
  }

  async function deleteAppt(a: Appointment) {
    if (!canEdit(a)) return;
    if (!confirm(`Eliminar "${eventLabel(a)}"?`)) return;
    const { error } = await supabase.from("appointments").delete().eq("id", a.id);
    if (error) return toast.error("Falha ao eliminar.");
    setAppts((cur) => cur.filter((x) => x.id !== a.id));
    toast.success("Removido");
  }

  async function deleteSeries(a: Appointment) {
    if (!a.recurrence_group_id || !canEdit(a)) return;
    if (!confirm(`Eliminar toda a série recorrente de "${eventLabel(a)}"?`)) return;
    const { error } = await supabase.from("appointments").delete().eq("recurrence_group_id", a.recurrence_group_id);
    if (error) return toast.error("Falha ao eliminar a série.");
    setAppts((cur) => cur.filter((x) => x.recurrence_group_id !== a.recurrence_group_id));
    toast.success("Série removida");
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const apptsByRoom = useMemo(() => {
    const m = new Map<string, Appointment[]>();
    rooms.forEach((r) => m.set(r.id, []));
    appts.forEach((a) => { const arr = m.get(a.room_id); if (arr) arr.push(a); });
    return m;
  }, [rooms, appts]);

  const leadByRoom = useMemo(() => {
    const m = new Map<string, { therapist_id: string; name: string; count: number; color: string | null } | null>();
    rooms.forEach((r) => {
      const counts = new Map<string, { name: string; count: number; color: string | null }>();
      (apptsByRoom.get(r.id) || []).forEach((a) => {
        if (a.attendance_status === "cancelled") return;
        const name = a.profiles?.full_name || a.profiles?.email?.split("@")[0] || "Terapeuta";
        const cur = counts.get(a.therapist_id) || { name, count: 0, color: a.profiles?.color || null };
        counts.set(a.therapist_id, { name, count: cur.count + 1, color: a.profiles?.color || null });
      });
      let lead: { therapist_id: string; name: string; count: number; color: string | null } | null = null;
      counts.forEach((v, k) => {
        if (!lead || v.count > lead.count) lead = { therapist_id: k, name: v.name, count: v.count, color: v.color };
      });
      m.set(r.id, lead);
    });
    return m;
  }, [rooms, apptsByRoom]);

  const myProfile = profiles.find((p) => p.id === userId);

  return (
    <AppShell
      title="Agenda"
      subtitle={format(day, "EEEE, d 'de' MMMM", { locale: pt })}
      actions={
        <>
          {adminExists === false && !isAdmin && (
            <Button size="sm" variant="outline" onClick={claimAdmin}>
              <span className="hidden sm:inline">Tornar-me admin</span>
              <span className="sm:hidden">Admin</span>
            </Button>
          )}
          <Dialog open={openNew} onOpenChange={(o) => { setOpenNew(o); if (!o) setPrefill(null); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Novo</span></Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle className="font-display text-2xl">Novo atendimento</DialogTitle></DialogHeader>
              <NewAppointmentForm
                rooms={rooms}
                profiles={profiles}
                patients={patients}
                defaultDay={day}
                userId={userId}
                isAdmin={isAdmin}
                prefill={prefill}
                unavail={unavail}
                onCreated={() => { setOpenNew(false); setPrefill(null); loadAppts(day); loadPatients(); loadUnavail(day); }}
              />
            </DialogContent>
          </Dialog>
        </>
      }
    >
      <div className="mx-auto max-w-[1400px] px-3 sm:px-6 py-4 sm:py-5">
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" onClick={() => setDay(addDays(day, -7))} title="Semana anterior"><ChevronLeft className="h-4 w-4" /><ChevronLeft className="h-4 w-4 -ml-2.5" /></Button>
              <Button variant="outline" size="icon" onClick={() => setDay(addDays(day, -1))} title="Dia anterior"><ChevronLeft className="h-4 w-4" /></Button>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="min-w-[180px] sm:min-w-[240px] justify-start gap-2 px-2.5 sm:px-3">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="text-left leading-tight min-w-0">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground truncate">
                      {format(day, "EEEE", { locale: pt })}
                    </div>
                    <div className="font-display text-sm sm:text-base truncate">
                      {format(day, "d 'de' MMMM, yyyy", { locale: pt })}
                    </div>
                  </div>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <div className="flex items-center justify-between gap-2 border-b border-border p-2">
                  <Button size="sm" variant="ghost" onClick={() => setDay(startOfDay(new Date()))}>Hoje</Button>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setDay(addMonths(day, -1))}>−1 mês</Button>
                    <Button size="sm" variant="ghost" onClick={() => setDay(addMonths(day, 1))}>+1 mês</Button>
                  </div>
                </div>
                <Calendar mode="single" selected={day} onSelect={(d) => d && setDay(startOfDay(d))} locale={pt} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" onClick={() => setDay(addDays(day, 1))} title="Próximo dia"><ChevronRight className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" onClick={() => setDay(addDays(day, 7))} title="Próxima semana"><ChevronRight className="h-4 w-4" /><ChevronRight className="h-4 w-4 -ml-2.5" /></Button>
            </div>
            {!isSameDay(day, startOfDay(new Date())) && (
              <Button variant="ghost" size="sm" onClick={() => setDay(startOfDay(new Date()))}>Hoje</Button>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button size="sm" variant="outline" onClick={() => setOpenUnavail(true)} title="Gerir indisponibilidades">
              <Ban className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Indisponível</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpenDuration(true)} title="Duração padrão da minha sessão">
              <Settings2 className="h-4 w-4" />
            </Button>
            <div className="flex rounded-md border border-border p-0.5">
              <Button size="sm" variant={view === "colunas" ? "default" : "ghost"} onClick={() => setView("colunas")}>
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button size="sm" variant={view === "grade" ? "default" : "ghost"} onClick={() => setView("grade")}>
                <Rows3 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {unavail.length > 0 && (() => {
          const groups = new Map<string, typeof unavail>();
          unavail.forEach((u) => {
            const arr = groups.get(u.therapist_id) || [];
            arr.push(u);
            groups.set(u.therapist_id, arr);
          });
          return (
            <div className="mt-3 flex items-stretch gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              <div className="flex shrink-0 items-center gap-1.5 rounded-lg bg-muted/50 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground">
                <Ban className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Indisponíveis hoje</span>
                <span className="sm:hidden">Off</span>
                <span className="tabular-nums">· {unavail.length}</span>
              </div>
              {Array.from(groups.entries()).map(([tid, items]) => {
                const p = profiles.find((x) => x.id === tid);
                const color = p?.color || "#999";
                return (
                  <div key={tid}
                    className="shrink-0 rounded-lg border bg-card px-2.5 py-1.5 shadow-sm"
                    style={{ borderColor: color + "55", background: `linear-gradient(90deg, ${color}12, transparent 60%)` }}>
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color }}>
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
                      <span className="truncate max-w-[10rem]">{p?.full_name || p?.email?.split("@")[0] || "Terapeuta"}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      {items.map((u) => (
                        <span key={u.id}
                          className="group inline-flex items-center gap-1 rounded-md bg-background/70 px-1.5 py-0.5 text-[11px] tabular-nums"
                          title={u.reason || undefined}>
                          <Clock className="h-2.5 w-2.5 text-muted-foreground" />
                          {format(parseISO(u.starts_at), "HH:mm")}–{format(parseISO(u.ends_at), "HH:mm")}
                          {u.reason && <span className="text-muted-foreground italic truncate max-w-[6rem]">· {u.reason}</span>}
                          {(isAdmin || u.therapist_id === userId) && (
                            <button className="ml-0.5 opacity-60 hover:opacity-100 hover:text-destructive"
                              onClick={async () => {
                                const label = `${format(parseISO(u.starts_at), "HH:mm")}–${format(parseISO(u.ends_at), "HH:mm")}`;
                                if (!window.confirm(`Remover a indisponibilidade das ${label}?`)) return;
                                const { error } = await supabase.from("therapist_unavailability").delete().eq("id", u.id);
                                if (error) return toast.error("Não foi possível remover");
                                setUnavail((cur) => cur.filter((x) => x.id !== u.id));
                                toast.success("Indisponibilidade removida");
                              }} title="Remover">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {loading ? (
          <div className="mt-10 text-center text-muted-foreground">A carregar agenda…</div>
        ) : view === "colunas" ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
            {rooms.map((room) => (
              <RoomColumn
                key={room.id} room={room}
                appts={apptsByRoom.get(room.id) || []}
                lead={leadByRoom.get(room.id) || null}
                canEdit={canEdit}
                onMark={markStatus}
                onCheckIn={toggleCheckIn}
                onDelete={deleteAppt}
                onDeleteSeries={deleteSeries}
                onCreate={() => openCreateAt(room.id, 9)}
                onOpen={(a) => setEditing(a)}
              />
            ))}
          </div>
        ) : (
          <GridView rooms={rooms} appts={appts} leadByRoom={leadByRoom} unavail={unavail} profiles={profiles} canEdit={canEdit} onMark={markStatus} onCheckIn={toggleCheckIn} onDelete={deleteAppt} onCreateAt={openCreateAt} onMove={moveAppt} onOpen={(a) => setEditing(a)} now={now} day={day} />
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display text-2xl">Editar atendimento</DialogTitle></DialogHeader>
          {editing && (
            <EditAppointmentForm
              appt={editing}
              rooms={rooms}
              profiles={profiles}
              isAdmin={isAdmin}
              canEdit={canEdit(editing)}
              onSaved={() => { setEditing(null); loadAppts(day); }}
              onCancel={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={openUnavail} onOpenChange={setOpenUnavail}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Marcar indisponibilidade</DialogTitle></DialogHeader>
          <UnavailabilityForm
            profiles={profiles}
            userId={userId}
            isAdmin={isAdmin}
            defaultDay={day}
            appts={appts}
            onSaved={() => { setOpenUnavail(false); loadUnavail(day); }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={openDuration} onOpenChange={setOpenDuration}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Duração padrão da sessão</DialogTitle></DialogHeader>
          <DurationForm
            profile={myProfile}
            onSaved={() => { setOpenDuration(false); loadProfiles(); }}
          />
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function RoomColumn({
  room, appts, lead, canEdit, onMark, onCheckIn, onDelete, onDeleteSeries, onCreate, onOpen,
}: {
  room: Room;
  appts: Appointment[];
  lead: { therapist_id: string; name: string; count: number; color: string | null } | null;
  canEdit: (a: Appointment) => boolean;
  onMark: (a: Appointment, s: Status) => void;
  onCheckIn: (a: Appointment) => void;
  onDelete: (a: Appointment) => void;
  onDeleteSeries: (a: Appointment) => void;
  onCreate: () => void;
  onOpen: (a: Appointment) => void;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl">{room.name}</h3>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{appts.length}</Badge>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onCreate} title="Agendar nesta sala"><Plus className="h-4 w-4" /></Button>
        </div>
      </div>
      {lead ? (
        <div className="mt-1 flex items-center gap-1.5 text-xs">
          <Star className="h-3 w-3" style={{ color: lead.color || undefined, fill: lead.color || undefined }} />
          <span className="font-medium" style={{ color: lead.color || undefined }}>{lead.name}</span>
          <span className="text-muted-foreground">· {lead.count} {lead.count === 1 ? "sessão" : "sessões"} hoje</span>
        </div>
      ) : (
        <div className="mt-1 text-xs text-muted-foreground">Sala livre — clique em + para agendar</div>
      )}
      <div className="mt-3 space-y-3">
        {appts.length === 0 && (
          <button onClick={onCreate} className="w-full rounded-md border border-dashed border-border py-6 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors">
            <Plus className="inline h-4 w-4 mr-1" />Novo agendamento
          </button>
        )}
        {appts.map((a) => (
          <AppointmentCard
            key={a.id} a={a}
            highlighted={!!lead && a.therapist_id === lead.therapist_id}
            canEdit={canEdit(a)}
            onMark={onMark} onCheckIn={onCheckIn} onDelete={onDelete} onDeleteSeries={onDeleteSeries}
            onOpen={onOpen}
          />
        ))}
      </div>
    </Card>
  );
}

const ATTENDANCE_OPTIONS: Array<{ value: Status; sigla: string; label: string; cls: string }> = [
  { value: "present",            sigla: "P",  label: "Presente",            cls: "bg-[var(--color-success)] text-[var(--color-success-foreground)]" },
  { value: "absent_therapist",   sigla: "FT", label: "Falta do técnico",    cls: "bg-[var(--color-warning)] text-[var(--color-warning-foreground)]" },
  { value: "absent_unjustified", sigla: "FI", label: "Falta injustificada", cls: "bg-destructive text-destructive-foreground" },
  { value: "absent_justified",   sigla: "FJ", label: "Falta justificada",   cls: "bg-secondary text-secondary-foreground" },
];

function AppointmentCard({
  a, highlighted, canEdit, onMark, onCheckIn, onDelete, onDeleteSeries, onOpen,
}: {
  a: Appointment;
  highlighted: boolean;
  canEdit: boolean;
  onMark: (a: Appointment, s: Status) => void;
  onCheckIn: (a: Appointment) => void;
  onDelete: (a: Appointment) => void;
  onDeleteSeries: (a: Appointment) => void;
  onOpen: (a: Appointment) => void;
}) {
  const therapist = a.profiles?.full_name || a.profiles?.email?.split("@")[0] || "Terapeuta";
  const cancelled = a.attendance_status === "cancelled";
  const eff = effectiveStatus(a);
  const color = a.profiles?.color || undefined;
  const isSession = a.event_type === "session";
  const evt = EVENT_TYPES.find((e) => e.value === a.event_type);
  const checkedIn = !!a.check_in_at;
  const strikeInfo = strikeStyleFor(a.attendance_status);
  return (
    <div
      onClick={(e) => { if (!(e.target as HTMLElement).closest("button")) onOpen(a); }}
      className={`cursor-pointer rounded-lg p-3 transition-opacity border-l-4 hover:ring-1 hover:ring-primary/30 ${
      cancelled
        ? "border border-dashed border-muted-foreground/40 bg-muted/30 opacity-60"
        : highlighted
          ? "border border-primary/30 bg-accent/20"
          : "border border-border bg-background"
    } ${strikeInfo ? "status-strike" : ""}`}
      style={{
        ...(cancelled ? {} : { borderLeftColor: color }),
        ...(strikeInfo ? { ["--strike-color" as string]: strikeInfo.color } : {}),
      }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={`font-medium truncate flex items-center gap-1.5 ${cancelled ? "line-through" : ""}`}>
            {!isSession && <span title={evt?.label}>{evt?.icon}</span>}
            {eventLabel(a)}
            {checkedIn && (
              <Badge className="bg-[var(--color-success)] text-[var(--color-success-foreground)] gap-1 px-1.5 py-0 text-[10px]">
                <BellRing className="h-2.5 w-2.5" />na recepção
              </Badge>
            )}
          </div>
          <div className={`text-xs text-muted-foreground ${cancelled ? "line-through" : ""}`}>
            {format(parseISO(a.starts_at), "HH:mm")}–{format(parseISO(a.ends_at), "HH:mm")} ·{" "}
            <span style={{ color }}>{therapist}</span>
            {a.recurrence_group_id && <span className="ml-1 inline-flex items-center gap-0.5"><RotateCw className="h-3 w-3" />série</span>}
          </div>
          {a.notes && <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{a.notes}</div>}
        </div>
        {isSession && <StatusBadge status={eff} auto={a.attendance_status === "pending" && eff === "present"} />}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {isSession && !cancelled && (
          <Button size="sm" variant={checkedIn ? "default" : "outline"}
            onClick={() => onCheckIn(a)}
            className={checkedIn ? "bg-[var(--color-success)] text-[var(--color-success-foreground)] hover:opacity-90" : ""}
            title={checkedIn ? "Desfazer check-in" : "Marcar que o cliente chegou na receção"}>
            <BellRing className="h-3.5 w-3.5 mr-1" />{checkedIn ? "Chegou" : "Check-in"}
          </Button>
        )}
        {isSession && ATTENDANCE_OPTIONS.map((opt) => (
          <Button key={opt.value} size="sm"
            variant={a.attendance_status === opt.value ? "default" : "outline"}
            disabled={!canEdit || cancelled}
            onClick={() => onMark(a, opt.value)}
            title={opt.label}
            className={a.attendance_status === opt.value ? opt.cls : ""}>
            {opt.sigla}
          </Button>
        ))}
        {canEdit && (
          <div className="ml-auto flex gap-1">
            {a.recurrence_group_id && (
              <Button size="sm" variant="ghost" title="Eliminar toda a série"
                onClick={() => onDeleteSeries(a)}
                className="text-muted-foreground hover:text-destructive">
                <RotateCw className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => onDelete(a)} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function strikeStyleFor(s: Status): { color: string } | null {
  if (s === "absent_therapist") return { color: "var(--color-warning)" };
  if (s === "absent_unjustified" || s === "absent") return { color: "var(--color-destructive)" };
  if (s === "absent_justified") return { color: "var(--color-muted-foreground)" };
  return null;
}

const PX_PER_MIN = 1; // 60px per hour
const GRID_START_HOUR = HOURS[0];
const GRID_END_HOUR = HOURS[HOURS.length - 1] + 1;
const TOTAL_MINUTES = (GRID_END_HOUR - GRID_START_HOUR) * 60;

function layoutLanes(items: Appointment[]) {
  // Returns [appt, laneIndex, laneCount] per item using simple lane packing.
  const sorted = [...items].sort((a, b) => parseISO(a.starts_at).getTime() - parseISO(b.starts_at).getTime());
  const lanes: Appointment[][] = [];
  const placement = new Map<string, number>();
  for (const a of sorted) {
    const s = parseISO(a.starts_at).getTime();
    let placed = false;
    for (let i = 0; i < lanes.length; i++) {
      const last = lanes[i][lanes[i].length - 1];
      if (parseISO(last.ends_at).getTime() <= s) {
        lanes[i].push(a); placement.set(a.id, i); placed = true; break;
      }
    }
    if (!placed) { lanes.push([a]); placement.set(a.id, lanes.length - 1); }
  }
  // Compute overlap group size per item: for each item, count lanes that overlap it.
  const result: Array<{ a: Appointment; lane: number; total: number }> = [];
  for (const a of sorted) {
    const s = parseISO(a.starts_at).getTime();
    const e = parseISO(a.ends_at).getTime();
    let total = 0;
    for (const lane of lanes) {
      if (lane.some((x) => parseISO(x.starts_at).getTime() < e && parseISO(x.ends_at).getTime() > s)) total++;
    }
    result.push({ a, lane: placement.get(a.id)!, total: Math.max(total, 1) });
  }
  return result;
}

function GridView({
  rooms, appts, leadByRoom, unavail, profiles, canEdit, onMark, onCheckIn, onDelete, onCreateAt, onMove, onOpen,
  now, day,
}: {
  rooms: Room[]; appts: Appointment[];
  leadByRoom: Map<string, { therapist_id: string; name: string; count: number; color: string | null } | null>;
  unavail: Unavail[];
  profiles: Profile[];
  canEdit: (a: Appointment) => boolean;
  onMark: (a: Appointment, s: Status) => void;
  onCheckIn: (a: Appointment) => void;
  onDelete: (a: Appointment) => void;
  onCreateAt: (roomId: string, hour: number) => void;
  onMove: (a: Appointment, newRoomId: string, newHour: number) => void;
  onOpen: (a: Appointment) => void;
  now: Date;
  day: Date;
}) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const apptById = useMemo(() => new Map(appts.map((a) => [a.id, a])), [appts]);

  const byRoom = useMemo(() => {
    const m = new Map<string, Appointment[]>();
    rooms.forEach((r) => m.set(r.id, []));
    appts.forEach((a) => { const arr = m.get(a.room_id); if (arr) arr.push(a); });
    return m;
  }, [rooms, appts]);

  const totalHeight = TOTAL_MINUTES * PX_PER_MIN;
  const isToday = isSameDay(now, day);
  const nowMin = (now.getHours() - GRID_START_HOUR) * 60 + now.getMinutes();
  const showNowLine = isToday && nowMin >= 0 && nowMin <= TOTAL_MINUTES;
  const nowTop = nowMin * PX_PER_MIN;

  const unavailBands = unavail.map((u) => {
    const s = parseISO(u.starts_at);
    const e = parseISO(u.ends_at);
    const startMin = Math.max(0, (s.getHours() - GRID_START_HOUR) * 60 + s.getMinutes());
    const endMin = Math.min(TOTAL_MINUTES, (e.getHours() - GRID_START_HOUR) * 60 + e.getMinutes());
    const p = profiles.find((pp) => pp.id === u.therapist_id);
    return { u, top: startMin * PX_PER_MIN, height: Math.max(8, (endMin - startMin) * PX_PER_MIN), color: p?.color || "#999", name: p?.full_name || "Terapeuta" };
  });

  return (
    <div className="mt-4 space-y-3">
    <div className="overflow-auto rounded-lg border border-border bg-card">
      <div className="flex min-w-max relative">
        {/* Hour gutter */}
        <div className="shrink-0 border-r border-border bg-secondary/40">
          <div className="h-14 border-b border-border" />
          <div className="relative" style={{ height: totalHeight }}>
            {HOURS.map((h, i) => (
              <div key={h} className="absolute left-0 right-0 flex items-start justify-end pr-2 text-[11px] font-medium text-muted-foreground"
                style={{ top: i * 60 * PX_PER_MIN - 6, width: 56 }}>
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>
        </div>

        {/* Room columns */}
        <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${rooms.length}, minmax(140px, 1fr))` }}>
          {rooms.map((r) => {
            const lead = leadByRoom.get(r.id);
            return (
              <div key={r.id} className="border-l border-border">
                <div className="h-14 border-b border-border bg-secondary/60 px-2 py-1 sticky top-0 z-10">
                  <div className="font-display text-sm truncate">{r.name}</div>
                  {lead ? (
                    <div className="flex items-center gap-1 text-[10px]">
                      <Star className="h-2.5 w-2.5" style={{ color: lead.color || undefined, fill: lead.color || undefined }} />
                      <span className="font-medium truncate" style={{ color: lead.color || undefined }}>{lead.name}</span>
                      <span className="text-muted-foreground">· {lead.count}</span>
                    </div>
                  ) : <div className="text-[10px] text-muted-foreground">livre</div>}
                </div>
                <div className="relative" style={{ height: totalHeight }}>
                  {/* Hour bands (click to create, drop target) */}
                  {HOURS.map((h, i) => {
                    const key = `${r.id}:${h}`;
                    const isOver = dragOver === key;
                    return (
                      <div key={h}
                        className={`absolute left-0 right-0 border-t border-border/60 cursor-pointer transition-colors ${isOver ? "bg-accent/40" : "hover:bg-muted/40"}`}
                        style={{ top: i * 60 * PX_PER_MIN, height: 60 * PX_PER_MIN }}
                        onClick={() => onCreateAt(r.id, h)}
                        onDragOver={(e) => { e.preventDefault(); setDragOver(key); }}
                        onDragLeave={() => setDragOver((k) => k === key ? null : k)}
                        onDrop={(e) => {
                          e.preventDefault(); setDragOver(null);
                          const id = e.dataTransfer.getData("text/plain");
                          const a = apptById.get(id);
                          if (a && (a.room_id !== r.id || parseISO(a.starts_at).getHours() !== h)) onMove(a, r.id, h);
                        }}
                      />
                    );
                  })}

                  {/* Unavailability bands (per therapist, shown in every room column) */}
                  {unavailBands.map((b) => (
                    <div key={`unav-${b.u.id}-${r.id}`}
                      title={`${b.name} indisponível ${format(parseISO(b.u.starts_at), "HH:mm")}–${format(parseISO(b.u.ends_at), "HH:mm")}${b.u.reason ? " · " + b.u.reason : ""}`}
                      className="pointer-events-none absolute left-0 right-0"
                      style={{
                        top: b.top, height: b.height,
                        background: "repeating-linear-gradient(45deg, rgba(100,116,139,0.18) 0 6px, transparent 6px 12px)",
                        borderTop: "1px dashed rgba(100,116,139,0.55)",
                        borderBottom: "1px dashed rgba(100,116,139,0.55)",
                      }} />
                  ))}

                  {HOURS.map((h, i) => (
                    <div key={`half-${h}`} className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-border/30"
                      style={{ top: (i * 60 + 30) * PX_PER_MIN }} />
                  ))}

                  {/* Cards */}
                  {layoutLanes(byRoom.get(r.id) || []).map(({ a, lane, total }) => {
                    const startD = parseISO(a.starts_at);
                    const endD = parseISO(a.ends_at);
                    const startMin = (startD.getHours() - GRID_START_HOUR) * 60 + startD.getMinutes();
                    const durMin = Math.max(15, (endD.getTime() - startD.getTime()) / 60000);
                    const top = Math.max(0, startMin * PX_PER_MIN);
                    const height = durMin * PX_PER_MIN;
                    const widthPct = 100 / total;
                    const leftPct = lane * widthPct;
                    const cancelled = a.attendance_status === "cancelled";
                    const eff = effectiveStatus(a);
                    const color = a.profiles?.color || undefined;
                    const compact = height < 44;
                    const isPast = endD.getTime() < now.getTime();
                    return (
                      <div key={a.id}
                        draggable={canEdit(a)}
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", a.id); e.dataTransfer.effectAllowed = "move"; e.stopPropagation(); }}
                        onClick={(e) => { e.stopPropagation(); if (!(e.target as HTMLElement).closest("button")) onOpen(a); }}
                        className={`absolute overflow-hidden rounded-md px-1.5 py-1 text-[11px] shadow-sm border-l-[3px] hover:ring-1 hover:ring-primary/40 cursor-pointer ${
                          cancelled
                            ? "border border-dashed border-muted-foreground/40 bg-muted/40 opacity-60"
                            : isPast
                              ? "border border-border bg-muted/40 grayscale opacity-70"
                              : "border border-border bg-background"
                        }`}
                        style={{
                          top, height, left: `calc(${leftPct}% + 2px)`, width: `calc(${widthPct}% - 4px)`,
                          ...(cancelled || isPast ? { borderLeftColor: color } : { borderLeftColor: color, background: `color-mix(in oklab, ${color || "var(--color-primary)"} 8%, var(--color-background))` }),
                        }}
                        title={`${format(startD, "HH:mm")}–${format(endD, "HH:mm")} · ${eventLabel(a)}`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className={`min-w-0 ${cancelled ? "line-through" : ""}`}>
                            <div className="font-semibold truncate flex items-center gap-1">
                              {a.event_type !== "session" && <span>{EVENT_TYPES.find(e => e.value === a.event_type)?.icon}</span>}
                              <span className="truncate">{eventLabel(a)}</span>
                              {a.check_in_at && <BellRing className="h-2.5 w-2.5 shrink-0 text-[var(--color-success)]" />}
                            </div>
                            {!compact && (
                              <div className="text-[10px] text-muted-foreground">
                                {format(startD, "HH:mm")}–{format(endD, "HH:mm")}
                              </div>
                            )}
                            {!compact && (
                              <div className="text-[10px] truncate font-medium" style={!cancelled ? { color } : undefined}>
                                {a.profiles?.full_name || a.profiles?.email?.split("@")[0] || "Terapeuta"}
                              </div>
                            )}
                          </div>
                          {a.event_type === "session" && !compact && (
                            <StatusBadge status={eff} auto={a.attendance_status === "pending" && eff === "present"} />
                          )}
                        </div>
                        {canEdit(a) && !cancelled && height >= 72 && (
                          <div className="mt-1 flex flex-wrap gap-0.5">
                            {a.event_type === "session" && (
                              <button title={a.check_in_at ? "Desfazer check-in" : "Check-in"}
                                onClick={(e) => { e.stopPropagation(); onCheckIn(a); }}
                                className={`rounded px-1 py-0.5 text-[10px] font-semibold ${a.check_in_at ? "bg-[var(--color-success)] text-[var(--color-success-foreground)]" : "hover:bg-muted"}`}>
                                <BellRing className="inline h-3 w-3" />
                              </button>
                            )}
                            {a.event_type === "session" && ATTENDANCE_OPTIONS.map((opt) => (
                              <button key={opt.value} title={opt.label}
                                onClick={(e) => { e.stopPropagation(); onMark(a, opt.value); }}
                                className={`rounded px-1 py-0.5 text-[10px] font-semibold ${a.attendance_status === opt.value ? opt.cls : "hover:bg-muted"}`}>
                                {opt.sigla}
                              </button>
                            ))}
                            <button title="Cancelar" onClick={(e) => { e.stopPropagation(); onMark(a, "cancelled"); }}
                              className="rounded p-0.5 hover:bg-muted"><Ban className="h-3 w-3 text-muted-foreground" /></button>
                            <button title="Eliminar" onClick={(e) => { e.stopPropagation(); onDelete(a); }}
                              className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                          </div>
                        )}
                        {canEdit(a) && cancelled && (
                          <button title="Reativar" onClick={(e) => { e.stopPropagation(); onMark(a, "pending"); }}
                            className="mt-1 text-[10px] text-primary hover:underline">Reativar</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {showNowLine && (
          <div className="pointer-events-none absolute left-0 right-0 z-20"
            style={{ top: 56 + nowTop }}>
            <div className="relative h-0 border-t-2 border-[hsl(var(--destructive))]">
              <div className="absolute -left-1 -top-1.5 h-3 w-3 rounded-full bg-[hsl(var(--destructive))] shadow" />
              <div className="absolute right-1 -top-4 rounded bg-[hsl(var(--destructive))] px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">
                {format(now, "HH:mm")}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}

function StatusBadge({ status, auto }: { status: Status; auto?: boolean }) {
  const map: Record<Status, { label: string; cls: string }> = {
    pending:             { label: "—",   cls: "bg-muted text-muted-foreground" },
    present:             { label: "P",   cls: "bg-[var(--color-success)] text-[var(--color-success-foreground)]" },
    absent:              { label: "FI",  cls: "bg-destructive text-destructive-foreground" },
    absent_therapist:    { label: "FT",  cls: "bg-[var(--color-warning)] text-[var(--color-warning-foreground)]" },
    absent_unjustified:  { label: "FI",  cls: "bg-destructive text-destructive-foreground" },
    absent_justified:    { label: "FJ",  cls: "bg-secondary text-secondary-foreground" },
    rescheduled:         { label: "R",   cls: "bg-[var(--color-warning)] text-[var(--color-warning-foreground)]" },
    cancelled:           { label: "Canc.", cls: "bg-muted text-muted-foreground line-through" },
  };
  const it = map[status];
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap ${it.cls}`} title={auto ? "Marcado automaticamente" : undefined}>
      {it.label}{auto && status === "present" ? "*" : ""}
    </span>
  );
}

function statusLabel(s: Status) {
  return {
    pending: "Pendente", present: "Presente", absent: "Falta",
    absent_therapist: "Falta do técnico", absent_unjustified: "Falta injustificada",
    absent_justified: "Falta justificada", rescheduled: "Remarcado", cancelled: "Cancelado",
  }[s];
}

function NewAppointmentForm({
  rooms, profiles, patients, defaultDay, userId, isAdmin, onCreated, prefill, unavail,
}: {
  rooms: Room[];
  profiles: Profile[];
  patients: Patient[];
  defaultDay: Date;
  userId: string | null;
  isAdmin: boolean;
  onCreated: () => void;
  prefill?: { roomId?: string; hour?: number } | null;
  unavail: Unavail[];
}) {
  const [eventType, setEventType] = useState<EventType>("session");
  const [title, setTitle] = useState("");
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState<string | null>(null);
  const [regNumber, setRegNumber] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [therapistId, setTherapistId] = useState<string>(userId || "");
  const [coTherapistId, setCoTherapistId] = useState<string>("none");
  const [extraTherapists, setExtraTherapists] = useState<string[]>([""]);
  const [roomId, setRoomId] = useState(prefill?.roomId || rooms[0]?.id || "");
  const [date, setDate] = useState(format(defaultDay, "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState(prefill?.hour != null ? `${String(prefill.hour).padStart(2, "0")}:00` : "09:00");
  const [endTime, setEndTime] = useState(prefill?.hour != null ? `${String(prefill.hour + 1).padStart(2, "0")}:00` : "10:00");
  const [notes, setNotes] = useState("");
  const [repeat, setRepeat] = useState(false);
  const [frequency, setFrequency] = useState<"weekly" | "biweekly">("weekly");
  const [untilDate, setUntilDate] = useState(format(addDays(defaultDay, 7 * 8), "yyyy-MM-dd"));
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (rooms.length && !roomId) setRoomId(rooms[0].id); }, [rooms]);
  useEffect(() => { if (!therapistId && userId) setTherapistId(userId); }, [userId]);

  // Auto-fill end time based on selected therapist's default_session_minutes
  useEffect(() => {
    const tid = therapistId || userId;
    const prof = profiles.find((p) => p.id === tid);
    const mins = prof?.default_session_minutes ?? 60;
    const [h, m] = startTime.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    const total = h * 60 + m + mins;
    const eh = Math.min(23, Math.floor(total / 60));
    const em = total % 60;
    setEndTime(`${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`);
  }, [therapistId, startTime, profiles, userId]);

  const filteredPatients = useMemo(() => {
    const q = patientQuery.trim().toLowerCase();
    if (!q) return patients.slice(0, 8);
    return patients.filter((p) =>
      p.full_name.toLowerCase().includes(q) ||
      (p.registration_number || "").toLowerCase().includes(q)
    ).slice(0, 8);
  }, [patientQuery, patients]);

  function pickPatient(p: Patient) {
    setPatientId(p.id);
    setPatientQuery(p.full_name);
    setRegNumber(p.registration_number || "");
    setShowSuggestions(false);
  }

  function clearPatientSelection() {
    setPatientId(null);
  }

  async function ensurePatient(): Promise<{ id: string | null; name: string }> {
    const name = patientQuery.trim();
    if (!name) return { id: null, name: "" };
    if (patientId) return { id: patientId, name };
    // Try to find existing by reg number or exact name
    const reg = regNumber.trim();
    if (reg) {
      const existing = patients.find((p) => p.registration_number === reg);
      if (existing) return { id: existing.id, name: existing.full_name };
    }
    const byName = patients.find((p) => p.full_name.toLowerCase() === name.toLowerCase());
    if (byName) return { id: byName.id, name: byName.full_name };
    // Create new
    const { data, error } = await supabase.from("patients").insert({
      full_name: name,
      registration_number: reg || null,
      created_by: userId,
    }).select("id, full_name").single();
    if (error || !data) {
      toast.error("Não foi possível registar paciente: " + (error?.message || ""));
      return { id: null, name };
    }
    return { id: data.id, name: data.full_name };
  }

  const needsPatient = eventType === "session" || eventType === "online";

  async function checkConflicts(
    items: Array<{ starts_at: string; ends_at: string; room_id: string; therapist_id: string; co_therapist_id: string | null; additional_therapist_ids: string[] }>
  ): Promise<string[]> {
    const warnings: string[] = [];
    for (const it of items) {
      const { data } = await supabase
        .from("appointments")
        .select("id, starts_at, ends_at, room_id, therapist_id, co_therapist_id, additional_therapist_ids, patient_name, title, event_type")
        .lt("starts_at", it.ends_at)
        .gt("ends_at", it.starts_at)
        .neq("attendance_status", "cancelled");
      if (!data) continue;
      for (const c of data) {
        const when = format(parseISO(c.starts_at), "dd/MM HH:mm");
        const who = c.patient_name || c.title || EVENT_TYPES.find((e) => e.value === c.event_type)?.label || "evento";
        if (c.room_id === it.room_id) warnings.push(`Sala já ocupada às ${when} (${who}).`);
        const mine = [it.therapist_id, it.co_therapist_id, ...it.additional_therapist_ids].filter(Boolean);
        const theirs = [c.therapist_id, c.co_therapist_id, ...((c as { additional_therapist_ids?: string[] }).additional_therapist_ids || [])].filter(Boolean);
        if (mine.some((t) => theirs.includes(t!))) warnings.push(`Terapeuta já tem evento às ${when} (${who}).`);
      }
    }
    return Array.from(new Set(warnings)).slice(0, 5);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !roomId) return;
    if (endTime <= startTime) return toast.error("Hora final deve ser após a inicial.");
    if (needsPatient && !patientQuery.trim()) return toast.error("Informe o paciente.");
    if (!needsPatient && !title.trim()) return toast.error("Informe um título para o evento.");
    const finalTherapist = isAdmin ? (therapistId || userId) : userId;
    const finalCoTherapist = needsPatient && coTherapistId !== "none" && coTherapistId !== finalTherapist ? coTherapistId : null;
    const finalExtras = !needsPatient
      ? Array.from(new Set(extraTherapists.filter((id) => id && id !== finalTherapist)))
      : [];
    setSaving(true);

    const patient = needsPatient ? await ensurePatient() : { id: null, name: "" };
    if (needsPatient && !patient.name) { setSaving(false); return; }

    const rows: Array<{
      therapist_id: string; co_therapist_id: string | null; additional_therapist_ids: string[]; room_id: string;
      patient_id: string | null; patient_name: string | null;
      title: string | null; event_type: EventType;
      starts_at: string; ends_at: string; notes: string | null;
      recurrence_group_id: string | null;
    }> = [];

    const stepWeeks = frequency === "weekly" ? 1 : 2;
    let cursor = new Date(`${date}T00:00:00`);
    const end = new Date(`${untilDate}T23:59:59`);
    const groupId = repeat ? crypto.randomUUID() : null;

    while (true) {
      const d = format(cursor, "yyyy-MM-dd");
      rows.push({
        therapist_id: finalTherapist,
        co_therapist_id: finalCoTherapist,
        additional_therapist_ids: finalExtras,
        room_id: roomId,
        patient_id: patient.id,
        patient_name: needsPatient ? patient.name : null,
        title: !needsPatient ? title.trim() : null,
        event_type: eventType,
        starts_at: new Date(`${d}T${startTime}:00`).toISOString(),
        ends_at: new Date(`${d}T${endTime}:00`).toISOString(),
        notes: notes.trim() || null,
        recurrence_group_id: groupId,
      });
      if (!repeat) break;
      cursor = addWeeks(cursor, stepWeeks);
      if (cursor > end) break;
      if (rows.length > 60) break;
    }

    // Unavailability conflicts (block/vacation not needed to warn against itself)
    const relevantTherapists = new Set(
      [finalTherapist, finalCoTherapist, ...finalExtras].filter(Boolean) as string[]
    );
    const unavailWarnings: string[] = [];
    for (const row of rows) {
      const rS = new Date(row.starts_at).getTime();
      const rE = new Date(row.ends_at).getTime();
      for (const u of unavail) {
        if (!relevantTherapists.has(u.therapist_id)) continue;
        const uS = new Date(u.starts_at).getTime();
        const uE = new Date(u.ends_at).getTime();
        if (uS < rE && uE > rS) {
          const p = profiles.find((x) => x.id === u.therapist_id);
          const who = p?.full_name || p?.email?.split("@")[0] || "Terapeuta";
          const when = format(parseISO(u.starts_at), "dd/MM HH:mm") + "–" + format(parseISO(u.ends_at), "HH:mm");
          unavailWarnings.push(`⛔ ${who} indisponível ${when}${u.reason ? " (" + u.reason + ")" : ""}`);
        }
      }
    }
    // Conflict check
    const conflicts = await checkConflicts(rows);
    const allWarnings = [...Array.from(new Set(unavailWarnings)).slice(0, 5), ...conflicts];
    if (allWarnings.length) {
      const proceed = window.confirm(
        "⚠️ Conflito(s) detectado(s):\n\n" + allWarnings.join("\n") + "\n\nDeseja agendar mesmo assim?"
      );
      if (!proceed) { setSaving(false); return; }
    }

    const { data: inserted, error } = await supabase.from("appointments").insert(rows).select("id");
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(rows.length > 1 ? `${rows.length} eventos agendados` : "Evento agendado");

    if (inserted?.length) {
      supabase.functions.invoke("notify-appointment", {
        body: { appointmentIds: inserted.map((r) => r.id) },
      }).catch(() => {});
    }
    onCreated();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <Label>Tipo de evento</Label>
        <Select value={eventType} onValueChange={(v) => setEventType(v as EventType)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {EVENT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                <span className="inline-flex items-center gap-2">{t.icon} {t.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {needsPatient ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 relative">
              <Label htmlFor="patient">Paciente</Label>
              <Input id="patient" value={patientQuery} autoComplete="off"
                onChange={(e) => { setPatientQuery(e.target.value); clearPatientSelection(); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Buscar por nome…" maxLength={120} />
              {showSuggestions && filteredPatients.length > 0 && (
                <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-md max-h-56 overflow-auto">
                  {filteredPatients.map((p) => (
                    <button key={p.id} type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickPatient(p)}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-accent">
                      <div className="font-medium">{p.full_name}</div>
                      {p.registration_number && <div className="text-xs text-muted-foreground">N.º {p.registration_number}</div>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="reg">N.º inscrição</Label>
              <Input id="reg" value={regNumber} autoComplete="off"
                onChange={(e) => {
                  setRegNumber(e.target.value); clearPatientSelection();
                  const found = patients.find((p) => p.registration_number === e.target.value.trim());
                  if (found) pickPatient(found);
                }}
                placeholder="Opcional" maxLength={40} />
            </div>
          </div>
          {patientId && <p className="text-xs text-muted-foreground">✓ Paciente já registado</p>}
          {!patientId && patientQuery.trim() && <p className="text-xs text-muted-foreground">+ Novo paciente será registado ao guardar</p>}
        </>
      ) : (
        <div>
          <Label htmlFor="title">Título do evento</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex.: Reunião semanal de equipa" maxLength={120} required />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        <div>
          <Label>Terapeuta principal</Label>
          <Select value={therapistId || userId || ""} onValueChange={setTherapistId} disabled={!isAdmin}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color || "#999" }} />
                    {p.full_name || p.email?.split("@")[0] || "Terapeuta"}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {needsPatient ? (
          <div>
            <Label>Co-terapeuta (opcional)</Label>
            <Select value={coTherapistId} onValueChange={setCoTherapistId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Nenhum —</SelectItem>
                {profiles.filter((p) => p.id !== (therapistId || userId)).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color || "#999" }} />
                      {p.full_name || p.email?.split("@")[0] || "Terapeuta"}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Outros terapeutas (opcional)</Label>
            {extraTherapists.map((val, idx) => {
              const taken = new Set([therapistId || userId || "", ...extraTherapists.filter((_, i) => i !== idx)].filter(Boolean));
              const options = profiles.filter((p) => !taken.has(p.id));
              return (
                <div key={idx} className="flex items-center gap-2">
                  <Select
                    value={val || "none"}
                    onValueChange={(v) => {
                      setExtraTherapists((cur) => {
                        const next = [...cur];
                        next[idx] = v === "none" ? "" : v;
                        const cleaned = next.filter((x, i) => x || i === next.length - 1);
                        const last = cleaned[cleaned.length - 1];
                        if (last && options.length > 1) cleaned.push("");
                        return cleaned.length ? cleaned : [""];
                      });
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder={idx === 0 ? "Adicionar terapeuta…" : "Adicionar mais…"} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Nenhum —</SelectItem>
                      {options.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="inline-flex items-center gap-2">
                            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color || "#999" }} />
                            {p.full_name || p.email?.split("@")[0] || "Terapeuta"}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {val && (
                    <Button type="button" variant="ghost" size="sm"
                      onClick={() => setExtraTherapists((cur) => {
                        const next = cur.filter((_, i) => i !== idx);
                        return next.length ? next : [""];
                      })}>
                      ✕
                    </Button>
                  )}
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground">
              {extraTherapists.filter(Boolean).length} terapeuta(s) adicionado(s). Um novo campo aparece automaticamente ao selecionar.
            </p>
          </div>
        )}
      </div>

      <div>
        <Label>Sala</Label>
        <Select value={roomId} onValueChange={setRoomId}>
          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label htmlFor="date">Data</Label>
          <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="start">Início</Label>
          <Input id="start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="end">Fim</Label>
          <Input id="end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
        </div>
      </div>

      <div className="rounded-lg border border-border p-3 space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="repeat" className="cursor-pointer">Repetir periodicamente</Label>
          <Switch id="repeat" checked={repeat} onCheckedChange={setRepeat} />
        </div>
        {repeat && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Frequência</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as "weekly" | "biweekly")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="biweekly">Quinzenal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="until">Até</Label>
              <Input id="until" type="date" value={untilDate} min={date} onChange={(e) => setUntilDate(e.target.value)} required />
            </div>
          </div>
        )}
      </div>

      <div>
        <Label htmlFor="notes">Notas (opcional)</Label>
        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
      </div>
      <Button type="submit" disabled={saving} className="w-full">{saving ? "A guardar…" : "Agendar"}</Button>
    </form>
  );
}

function EditAppointmentForm({
  appt, rooms, profiles, isAdmin, canEdit, onSaved, onCancel,
}: {
  appt: Appointment;
  rooms: Room[];
  profiles: Profile[];
  isAdmin: boolean;
  canEdit: boolean;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const startD = parseISO(appt.starts_at);
  const endD = parseISO(appt.ends_at);
  const [roomId, setRoomId] = useState(appt.room_id);
  const [date, setDate] = useState(format(startD, "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState(format(startD, "HH:mm"));
  const [endTime, setEndTime] = useState(format(endD, "HH:mm"));
  const [therapistId, setTherapistId] = useState(appt.therapist_id);
  const [coTherapistId, setCoTherapistId] = useState<string>(appt.co_therapist_id || "none");
  const [patientName, setPatientName] = useState(appt.patient_name || "");
  const [title, setTitle] = useState(appt.title || "");
  const [notes, setNotes] = useState(appt.notes || "");
  const [saving, setSaving] = useState(false);
  const isSession = appt.event_type === "session";
  const needsPatient = isSession || appt.event_type === "online";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return toast.error("Sem permissão");
    if (endTime <= startTime) return toast.error("Hora final deve ser após a inicial.");
    setSaving(true);
    const { error } = await supabase.from("appointments").update({
      room_id: roomId,
      therapist_id: isAdmin ? therapistId : appt.therapist_id,
      co_therapist_id: coTherapistId === "none" ? null : coTherapistId,
      starts_at: new Date(`${date}T${startTime}:00`).toISOString(),
      ends_at: new Date(`${date}T${endTime}:00`).toISOString(),
      patient_name: needsPatient ? patientName.trim() || null : null,
      title: !needsPatient ? title.trim() || null : null,
      notes: notes.trim() || null,
    }).eq("id", appt.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Atendimento atualizado");
    onSaved();
  }

  return (
    <form onSubmit={save} className="space-y-3">
      {!canEdit && (
        <div className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
          Tu está a visualizar. Só o técnico responsável ou um admin pode editar.
        </div>
      )}
      {needsPatient ? (
        <div>
          <Label>Paciente</Label>
          <Input value={patientName} onChange={(e) => setPatientName(e.target.value)} disabled={!canEdit} />
        </div>
      ) : (
        <div>
          <Label>Título</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canEdit} />
        </div>
      )}

      <div>
        <Label>Sala</Label>
        <Select value={roomId} onValueChange={setRoomId} disabled={!canEdit}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label>Data</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={!canEdit} />
        </div>
        <div>
          <Label>Início</Label>
          <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} disabled={!canEdit} />
        </div>
        <div>
          <Label>Fim</Label>
          <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} disabled={!canEdit} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div>
          <Label>Terapeuta principal</Label>
          <Select value={therapistId} onValueChange={setTherapistId} disabled={!isAdmin}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color || "#999" }} />
                    {p.full_name || p.email?.split("@")[0] || "Terapeuta"}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Co-terapeuta</Label>
          <Select value={coTherapistId} onValueChange={setCoTherapistId} disabled={!canEdit}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Nenhum —</SelectItem>
              {profiles.filter((p) => p.id !== therapistId).map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.full_name || p.email?.split("@")[0] || "Terapeuta"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label>Notas</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} disabled={!canEdit} />
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">Fechar</Button>
        {canEdit && <Button type="submit" disabled={saving} className="flex-1">{saving ? "A guardar…" : "Guardar alterações"}</Button>}
      </div>
    </form>
  );
}

function UnavailabilityForm({
  profiles, userId, isAdmin, defaultDay, appts, onSaved,
}: {
  profiles: Profile[]; userId: string | null; isAdmin: boolean; defaultDay: Date; appts: Appointment[]; onSaved: () => void;
}) {
  const [therapistId, setTherapistId] = useState(userId || "");
  const [date, setDate] = useState(format(defaultDay, "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("13:00");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!therapistId && userId) setTherapistId(userId); }, [userId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (endTime <= startTime) return toast.error("Hora final deve ser após a inicial.");
    const tid = isAdmin ? therapistId : (userId || "");
    const startISO = new Date(`${date}T${startTime}:00`).toISOString();
    const endISO = new Date(`${date}T${endTime}:00`).toISOString();
    const startMs = new Date(startISO).getTime();
    const endMs = new Date(endISO).getTime();
    const conflicts = appts.filter((a) => {
      const involves = a.therapist_id === tid
        || a.co_therapist_id === tid
        || (a.additional_therapist_ids || []).includes(tid);
      if (!involves) return false;
      const aS = new Date(a.starts_at).getTime();
      const aE = new Date(a.ends_at).getTime();
      return aS < endMs && aE > startMs;
    });
    if (conflicts.length > 0) {
      const list = conflicts.slice(0, 3).map((a) =>
        `• ${format(parseISO(a.starts_at), "HH:mm")}–${format(parseISO(a.ends_at), "HH:mm")} ${eventLabel(a)}`
      ).join("\n");
      const extra = conflicts.length > 3 ? `\n… e mais ${conflicts.length - 3}` : "";
      const ok = window.confirm(
        `Este período tem ${conflicts.length} atendimento(s) marcado(s):\n\n${list}${extra}\n\nTem a certeza que quer marcar indisponibilidade?`
      );
      if (!ok) return;
    } else {
      const ok = window.confirm(
        `Confirmar indisponibilidade de ${startTime} às ${endTime} em ${format(new Date(date), "d 'de' MMMM", { locale: pt })}?`
      );
      if (!ok) return;
    }
    setSaving(true);
    const { error } = await supabase.from("therapist_unavailability").insert({
      therapist_id: tid,
      starts_at: startISO,
      ends_at: endISO,
      reason: reason.trim() || null,
      created_by: userId,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Indisponibilidade registada");
    onSaved();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <Label>Terapeuta</Label>
        <Select value={therapistId} onValueChange={setTherapistId} disabled={!isAdmin}>
          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color || "#999" }} />
                  {p.full_name || p.email?.split("@")[0] || "Terapeuta"}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="unav-date">Data</Label>
        <Input id="unav-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="unav-start">Início</Label>
          <Input id="unav-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="unav-end">Fim</Label>
          <Input id="unav-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
        </div>
      </div>
      <div>
        <Label htmlFor="unav-reason">Motivo (opcional)</Label>
        <Input id="unav-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={120} placeholder="Ex.: consulta médica, formação…" />
      </div>
      <Button type="submit" disabled={saving} className="w-full">
        {saving ? "A guardar…" : "Marcar indisponibilidade"}
      </Button>
    </form>
  );
}

function DurationForm({ profile, onSaved }: { profile?: Profile; onSaved: () => void }) {
  const [mins, setMins] = useState<number>(profile?.default_session_minutes ?? 60);
  const [saving, setSaving] = useState(false);
  if (!profile) return <div className="text-sm text-muted-foreground">Perfil não encontrado.</div>;

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ default_session_minutes: mins }).eq("id", profile!.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Duração atualizada");
    onSaved();
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Ao criar um atendimento, a hora final é pré-preenchida com esta duração. Podes sempre alterar manualmente.
      </p>
      <div className="flex items-center gap-2">
        {[45, 60, 75, 90].map((m) => (
          <Button key={m} type="button" size="sm"
            variant={mins === m ? "default" : "outline"} onClick={() => setMins(m)}>
            {m} min
          </Button>
        ))}
      </div>
      <div>
        <Label htmlFor="dur-custom">Personalizada (minutos)</Label>
        <Input id="dur-custom" type="number" min={15} max={240} step={5}
          value={mins} onChange={(e) => setMins(Math.max(15, Math.min(240, Number(e.target.value) || 60)))} />
      </div>
      <Button onClick={save} disabled={saving} className="w-full">
        {saving ? "A guardar…" : "Guardar"}
      </Button>
    </div>
  );
}
