import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format, addDays, startOfDay, isSameDay, parseISO, addWeeks } from "date-fns";
import { ptBR } from "date-fns/locale";
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
import { toast } from "sonner";
import {
  CalendarCheck, ChevronLeft, ChevronRight, LogOut, Plus, RotateCw, Trash2,
  User as UserIcon, Crown, LayoutGrid, Rows3, Star, Ban, FileText,
} from "lucide-react";

type Room = { id: string; name: string; position: number };
type Profile = { id: string; full_name: string | null; email: string | null; color: string | null };
type Patient = { id: string; full_name: string; registration_number: string | null };
type Status =
  | "pending" | "present" | "absent" | "rescheduled" | "cancelled"
  | "absent_therapist" | "absent_unjustified" | "absent_justified";
type Appointment = {
  id: string;
  therapist_id: string;
  room_id: string;
  patient_id: string | null;
  patient_name: string;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  attendance_status: Status;
  attendance_marked_at: string | null;
  recurrence_group_id: string | null;
  profiles?: { full_name: string | null; email: string | null; color: string | null } | null;
};

export const Route = createFileRoute("/_authenticated/agenda")({
  head: () => ({ meta: [{ title: "Agenda · O Fio de Ariana" }] }),
  component: AgendaPage,
});

const HOURS = Array.from({ length: 13 }, (_, i) => 9 + i); // 09–21

// Effective status: auto-mark as 'present' visually if pending and past +1h (cron persists)
function effectiveStatus(a: Pick<Appointment, "attendance_status" | "ends_at">): Status {
  if (a.attendance_status !== "pending") return a.attendance_status;
  const ends = parseISO(a.ends_at).getTime();
  if (ends + 60 * 60 * 1000 < Date.now()) return "present";
  return "pending";
}

function AgendaPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminExists, setAdminExists] = useState<boolean | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [day, setDay] = useState<Date>(startOfDay(new Date()));
  const [openNew, setOpenNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"colunas" | "grade">("grade");
  const [prefill, setPrefill] = useState<{ roomId?: string; hour?: number } | null>(null);

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
      setUserName(
        (data.user.user_metadata?.full_name as string) ||
        (data.user.user_metadata?.name as string) ||
        data.user.email?.split("@")[0] || "Terapeuta"
      );
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
      setIsAdmin(!!roles?.some((r) => r.role === "admin"));
      const { count } = await supabase.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "admin");
      setAdminExists((count ?? 0) > 0);
    });
  }, []);

  useEffect(() => {
    supabase.from("rooms").select("*").order("position").then(({ data }) => {
      if (data) setRooms(data as Room[]);
    });
    supabase.from("profiles").select("id, full_name, email, color").then(({ data }) => {
      if (data) setProfiles(data as Profile[]);
    });
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

  useEffect(() => { loadAppts(day); }, [day]);

  async function claimAdmin() {
    const { data, error } = await supabase.rpc("claim_admin");
    if (error || !data) return toast.error("Não foi possível reivindicar admin");
    setIsAdmin(true); setAdminExists(true);
    toast.success("Agora você é administrador");
  }

  function canEdit(a: Appointment) {
    return isAdmin || a.therapist_id === userId;
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
    } else toast.success(statusLabel(status) + " registrado");
  }

  async function deleteAppt(a: Appointment) {
    if (!canEdit(a)) return;
    if (!confirm(`Excluir o atendimento de ${a.patient_name}?`)) return;
    const { error } = await supabase.from("appointments").delete().eq("id", a.id);
    if (error) return toast.error("Falha ao excluir.");
    setAppts((cur) => cur.filter((x) => x.id !== a.id));
    toast.success("Atendimento removido");
  }

  async function deleteSeries(a: Appointment) {
    if (!a.recurrence_group_id || !canEdit(a)) return;
    if (!confirm(`Excluir toda a série recorrente de ${a.patient_name}?`)) return;
    const { error } = await supabase.from("appointments").delete().eq("recurrence_group_id", a.recurrence_group_id);
    if (error) return toast.error("Falha ao excluir a série.");
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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/70 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground">
              <CalendarCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="font-display text-lg leading-tight">O Fio de Ariana</div>
              <div className="text-xs text-muted-foreground -mt-0.5">Agenda terapêutica</div>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link to="/_authenticated/relatorios" className="hidden sm:inline-flex items-center text-sm text-muted-foreground hover:text-foreground gap-1">
              <FileText className="h-4 w-4" />Relatórios
            </Link>
            {isAdmin && (
              <Badge className="bg-primary text-primary-foreground gap-1">
                <Crown className="h-3 w-3" />Admin
              </Badge>
            )}
            {adminExists === false && !isAdmin && (
              <Button size="sm" variant="outline" onClick={claimAdmin}>
                <Crown className="h-4 w-4 mr-1" />Tornar-me admin
              </Button>
            )}
            <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
              <UserIcon className="h-4 w-4" /> {userName}
            </div>
            <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="h-4 w-4 mr-1" />Sair</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 sm:px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setDay(addDays(day, -1))}><ChevronLeft className="h-4 w-4" /></Button>
            <div className="min-w-[200px] sm:min-w-[240px] text-center">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                {format(day, "EEEE", { locale: ptBR })}
              </div>
              <div className="font-display text-xl sm:text-2xl">
                {format(day, "d 'de' MMMM, yyyy", { locale: ptBR })}
              </div>
            </div>
            <Button variant="outline" size="icon" onClick={() => setDay(addDays(day, 1))}><ChevronRight className="h-4 w-4" /></Button>
            {!isSameDay(day, startOfDay(new Date())) && (
              <Button variant="ghost" size="sm" onClick={() => setDay(startOfDay(new Date()))}>Hoje</Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-border p-0.5">
              <Button size="sm" variant={view === "colunas" ? "default" : "ghost"} onClick={() => setView("colunas")}>
                <LayoutGrid className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Colunas</span>
              </Button>
              <Button size="sm" variant={view === "grade" ? "default" : "ghost"} onClick={() => setView("grade")}>
                <Rows3 className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Grade</span>
              </Button>
            </div>
            <Dialog open={openNew} onOpenChange={(o) => { setOpenNew(o); if (!o) setPrefill(null); }}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Novo atendimento</span></Button>
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
                  onCreated={() => { setOpenNew(false); setPrefill(null); loadAppts(day); loadPatients(); }}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {loading ? (
          <div className="mt-10 text-center text-muted-foreground">Carregando agenda…</div>
        ) : view === "colunas" ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rooms.map((room) => (
              <RoomColumn
                key={room.id} room={room}
                appts={apptsByRoom.get(room.id) || []}
                lead={leadByRoom.get(room.id) || null}
                canEdit={canEdit}
                onMark={markStatus}
                onDelete={deleteAppt}
                onDeleteSeries={deleteSeries}
              />
            ))}
          </div>
        ) : (
          <GridView rooms={rooms} appts={appts} leadByRoom={leadByRoom} canEdit={canEdit} onMark={markStatus} onDelete={deleteAppt} onCreateAt={openCreateAt} onMove={moveAppt} />
        )}
      </main>
    </div>
  );
}

function RoomColumn({
  room, appts, lead, canEdit, onMark, onDelete, onDeleteSeries,
}: {
  room: Room;
  appts: Appointment[];
  lead: { therapist_id: string; name: string; count: number; color: string | null } | null;
  canEdit: (a: Appointment) => boolean;
  onMark: (a: Appointment, s: Status) => void;
  onDelete: (a: Appointment) => void;
  onDeleteSeries: (a: Appointment) => void;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl">{room.name}</h3>
        <Badge variant="secondary">{appts.length}</Badge>
      </div>
      {lead ? (
        <div className="mt-1 flex items-center gap-1.5 text-xs">
          <Star className="h-3 w-3" style={{ color: lead.color || undefined, fill: lead.color || undefined }} />
          <span className="font-medium" style={{ color: lead.color || undefined }}>{lead.name}</span>
          <span className="text-muted-foreground">· {lead.count} sessão{lead.count > 1 ? "s" : ""} hoje</span>
        </div>
      ) : (
        <div className="mt-1 text-xs text-muted-foreground">Sem terapeuta hoje</div>
      )}
      <div className="mt-3 space-y-3">
        {appts.length === 0 && <p className="text-sm text-muted-foreground">Sem atendimentos.</p>}
        {appts.map((a) => (
          <AppointmentCard
            key={a.id} a={a}
            highlighted={!!lead && a.therapist_id === lead.therapist_id}
            canEdit={canEdit(a)}
            onMark={onMark} onDelete={onDelete} onDeleteSeries={onDeleteSeries}
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
  a, highlighted, canEdit, onMark, onDelete, onDeleteSeries,
}: {
  a: Appointment;
  highlighted: boolean;
  canEdit: boolean;
  onMark: (a: Appointment, s: Status) => void;
  onDelete: (a: Appointment) => void;
  onDeleteSeries: (a: Appointment) => void;
}) {
  const therapist = a.profiles?.full_name || a.profiles?.email?.split("@")[0] || "Terapeuta";
  const cancelled = a.attendance_status === "cancelled";
  const eff = effectiveStatus(a);
  const color = a.profiles?.color || undefined;
  return (
    <div className={`rounded-lg p-3 transition-opacity border-l-4 ${
      cancelled
        ? "border border-dashed border-muted-foreground/40 bg-muted/30 opacity-60"
        : highlighted
          ? "border border-primary/30 bg-accent/20"
          : "border border-border bg-background"
    }`} style={!cancelled ? { borderLeftColor: color } : undefined}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={`font-medium truncate ${cancelled ? "line-through" : ""}`}>{a.patient_name}</div>
          <div className={`text-xs text-muted-foreground ${cancelled ? "line-through" : ""}`}>
            {format(parseISO(a.starts_at), "HH:mm")}–{format(parseISO(a.ends_at), "HH:mm")} ·{" "}
            <span style={{ color }}>{therapist}</span>
            {a.recurrence_group_id && <span className="ml-1 inline-flex items-center gap-0.5"><RotateCw className="h-3 w-3" />série</span>}
          </div>
          {a.notes && <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{a.notes}</div>}
        </div>
        <StatusBadge status={eff} auto={a.attendance_status === "pending" && eff === "present"} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {ATTENDANCE_OPTIONS.map((opt) => (
          <Button key={opt.value} size="sm"
            variant={a.attendance_status === opt.value ? "default" : "outline"}
            disabled={!canEdit || cancelled}
            onClick={() => onMark(a, opt.value)}
            title={opt.label}
            className={a.attendance_status === opt.value ? opt.cls : ""}>
            {opt.sigla}
          </Button>
        ))}
        <Button size="sm" variant={cancelled ? "secondary" : "outline"}
          disabled={!canEdit} onClick={() => onMark(a, cancelled ? "pending" : "cancelled")}
          title={cancelled ? "Reativar" : "Cancelar (libera o horário)"}>
          <Ban className="h-3.5 w-3.5 mr-1" />{cancelled ? "Reativar" : "Cancelar"}
        </Button>
        {canEdit && (
          <div className="ml-auto flex gap-1">
            {a.recurrence_group_id && (
              <Button size="sm" variant="ghost" title="Excluir toda a série"
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

function GridView({
  rooms, appts, leadByRoom, canEdit, onMark, onDelete, onCreateAt, onMove,
}: {
  rooms: Room[]; appts: Appointment[];
  leadByRoom: Map<string, { therapist_id: string; name: string; count: number; color: string | null } | null>;
  canEdit: (a: Appointment) => boolean;
  onMark: (a: Appointment, s: Status) => void;
  onDelete: (a: Appointment) => void;
  onCreateAt: (roomId: string, hour: number) => void;
  onMove: (a: Appointment, newRoomId: string, newHour: number) => void;
}) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const apptById = useMemo(() => new Map(appts.map((a) => [a.id, a])), [appts]);

  const cell = new Map<string, Map<number, Appointment[]>>();
  rooms.forEach((r) => cell.set(r.id, new Map()));
  appts.forEach((a) => {
    const h = parseISO(a.starts_at).getHours();
    const m = cell.get(a.room_id)!;
    const arr = m.get(h) || [];
    arr.push(a); m.set(h, arr);
  });

  return (
    <div className="mt-6 overflow-auto rounded-lg border border-border bg-card">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-secondary/60">
          <tr>
            <th className="sticky left-0 z-10 bg-secondary/80 px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Hora</th>
            {rooms.map((r) => {
              const lead = leadByRoom.get(r.id);
              return (
                <th key={r.id} className="border-l border-border px-3 py-2 text-left">
                  <div className="font-display text-base">{r.name}</div>
                  {lead ? (
                    <div className="flex items-center gap-1 text-[11px] font-normal">
                      <Star className="h-3 w-3" style={{ color: lead.color || undefined, fill: lead.color || undefined }} />
                      <span className="font-medium" style={{ color: lead.color || undefined }}>{lead.name}</span>
                      <span className="text-muted-foreground">· {lead.count}</span>
                    </div>
                  ) : <div className="text-[11px] text-muted-foreground font-normal">livre</div>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {HOURS.map((h) => (
            <tr key={h} className="border-t border-border">
              <td className="sticky left-0 z-10 bg-card px-3 py-2 align-top text-xs font-medium text-muted-foreground">
                {String(h).padStart(2, "0")}:00
              </td>
              {rooms.map((r) => {
                const items = cell.get(r.id)?.get(h) || [];
                const key = `${r.id}:${h}`;
                const isOver = dragOver === key;
                return (
                  <td key={r.id}
                    className={`border-l border-border p-1.5 align-top min-w-[160px] cursor-pointer transition-colors ${isOver ? "bg-accent/40" : "hover:bg-muted/40"}`}
                    onClick={(e) => { if (e.target === e.currentTarget) onCreateAt(r.id, h); }}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(key); }}
                    onDragLeave={() => setDragOver((k) => k === key ? null : k)}
                    onDrop={(e) => {
                      e.preventDefault(); setDragOver(null);
                      const id = e.dataTransfer.getData("text/plain");
                      const a = apptById.get(id);
                      if (a && (a.room_id !== r.id || parseISO(a.starts_at).getHours() !== h)) onMove(a, r.id, h);
                    }}
                    title={items.length === 0 ? "Clique para agendar" : undefined}
                  >
                    {items.length === 0 && (
                      <div className="flex h-full min-h-[44px] items-center justify-center text-[10px] text-muted-foreground/0 hover:text-muted-foreground">
                        <Plus className="h-3 w-3 mr-0.5" />novo
                      </div>
                    )}
                    {items.map((a) => {
                      const cancelled = a.attendance_status === "cancelled";
                      const eff = effectiveStatus(a);
                      const color = a.profiles?.color || undefined;
                      return (
                        <div key={a.id}
                          draggable={canEdit(a)}
                          onDragStart={(e) => { e.dataTransfer.setData("text/plain", a.id); e.dataTransfer.effectAllowed = "move"; }}
                          onClick={(e) => e.stopPropagation()}
                          className={`mb-1 rounded-md px-2 py-1.5 text-xs border-l-4 ${canEdit(a) ? "cursor-grab active:cursor-grabbing" : ""} ${
                            cancelled
                              ? "border border-dashed border-muted-foreground/40 bg-muted/30 opacity-60"
                              : "border border-border bg-background"
                          }`}
                          style={!cancelled ? { borderLeftColor: color } : undefined}>
                          <div className="flex items-start justify-between gap-1">
                            <div className="min-w-0">
                              <div className={`font-medium truncate ${cancelled ? "line-through" : ""}`}>{a.patient_name}</div>
                              <div className={`text-[10px] text-muted-foreground ${cancelled ? "line-through" : ""}`}>
                                {format(parseISO(a.starts_at), "HH:mm")}–{format(parseISO(a.ends_at), "HH:mm")}
                              </div>
                              <div className={`text-[10px] truncate ${cancelled ? "text-muted-foreground" : "font-medium"}`}
                                style={!cancelled ? { color } : undefined}>
                                {a.profiles?.full_name || a.profiles?.email?.split("@")[0] || "Terapeuta"}
                              </div>
                            </div>
                            <StatusBadge status={eff} auto={a.attendance_status === "pending" && eff === "present"} />
                          </div>
                          {canEdit(a) && !cancelled && (
                            <div className="mt-1 flex flex-wrap gap-0.5">
                              {ATTENDANCE_OPTIONS.map((opt) => (
                                <button key={opt.value} title={opt.label}
                                  onClick={() => onMark(a, opt.value)}
                                  className={`rounded px-1 py-0.5 text-[10px] font-semibold ${a.attendance_status === opt.value ? opt.cls : "hover:bg-muted"}`}>
                                  {opt.sigla}
                                </button>
                              ))}
                              <button title="Cancelar" onClick={() => onMark(a, "cancelled")}
                                className="rounded p-0.5 hover:bg-muted"><Ban className="h-3 w-3 text-muted-foreground" /></button>
                              <button title="Excluir" onClick={() => onDelete(a)}
                                className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                            </div>
                          )}
                          {canEdit(a) && cancelled && (
                            <button title="Reativar" onClick={() => onMark(a, "pending")}
                              className="mt-1 text-[10px] text-primary hover:underline">Reativar</button>
                          )}
                        </div>
                      );
                    })}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
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
  rooms, profiles, patients, defaultDay, userId, isAdmin, onCreated, prefill,
}: {
  rooms: Room[];
  profiles: Profile[];
  patients: Patient[];
  defaultDay: Date;
  userId: string | null;
  isAdmin: boolean;
  onCreated: () => void;
  prefill?: { roomId?: string; hour?: number } | null;
}) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState<string | null>(null);
  const [regNumber, setRegNumber] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [therapistId, setTherapistId] = useState<string>(userId || "");
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
      toast.error("Não foi possível cadastrar paciente: " + (error?.message || ""));
      return { id: null, name };
    }
    return { id: data.id, name: data.full_name };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !roomId) return;
    if (endTime <= startTime) return toast.error("Hora final deve ser após a inicial.");
    if (!patientQuery.trim()) return toast.error("Informe o paciente.");
    const finalTherapist = isAdmin ? (therapistId || userId) : userId;
    setSaving(true);

    const patient = await ensurePatient();
    if (!patient.name) { setSaving(false); return; }

    const rows: Array<{
      therapist_id: string; room_id: string; patient_id: string | null; patient_name: string;
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
        therapist_id: finalTherapist, room_id: roomId,
        patient_id: patient.id, patient_name: patient.name,
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

    const { error } = await supabase.from("appointments").insert(rows);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(rows.length > 1 ? `${rows.length} sessões agendadas` : "Atendimento agendado");
    onCreated();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 relative">
          <Label htmlFor="patient">Paciente</Label>
          <Input id="patient" value={patientQuery} autoComplete="off"
            onChange={(e) => { setPatientQuery(e.target.value); clearPatientSelection(); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Buscar por nome…" required maxLength={120} />
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
              // Auto-fill name if number matches
              const found = patients.find((p) => p.registration_number === e.target.value.trim());
              if (found) pickPatient(found);
            }}
            placeholder="Opcional" maxLength={40} />
        </div>
      </div>
      {patientId && (
        <p className="text-xs text-muted-foreground">✓ Paciente já cadastrado</p>
      )}
      {!patientId && patientQuery.trim() && (
        <p className="text-xs text-muted-foreground">+ Novo paciente será cadastrado ao salvar</p>
      )}

      {isAdmin && (
        <div>
          <Label>Terapeuta</Label>
          <Select value={therapistId} onValueChange={setTherapistId}>
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
      )}

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
      <Button type="submit" disabled={saving} className="w-full">{saving ? "Salvando…" : "Agendar"}</Button>
    </form>
  );
}
