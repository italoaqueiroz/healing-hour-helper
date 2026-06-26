import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
  CalendarCheck, ChevronLeft, ChevronRight, LogOut, Plus, Check, X, RotateCw, Trash2,
  User as UserIcon, Crown, LayoutGrid, Rows3, Star, Ban,
} from "lucide-react";

type Room = { id: string; name: string; position: number };
type Status = "pending" | "present" | "absent" | "rescheduled" | "cancelled";
type Appointment = {
  id: string;
  therapist_id: string;
  room_id: string;
  patient_name: string;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  attendance_status: Status;
  attendance_marked_at: string | null;
  recurrence_group_id: string | null;
  profiles?: { full_name: string | null; email: string | null } | null;
};

export const Route = createFileRoute("/_authenticated/agenda")({
  head: () => ({ meta: [{ title: "Agenda · O Fio de Ariana" }] }),
  component: AgendaPage,
});

const HOURS = Array.from({ length: 13 }, (_, i) => 8 + i); // 08–20

function AgendaPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminExists, setAdminExists] = useState<boolean | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [day, setDay] = useState<Date>(startOfDay(new Date()));
  const [openNew, setOpenNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"colunas" | "grade">("colunas");
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
      // Check if any admin exists at all (to show bootstrap button)
      const { count } = await supabase.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "admin");
      setAdminExists((count ?? 0) > 0);
    });
  }, []);

  useEffect(() => {
    supabase.from("rooms").select("*").order("position").then(({ data }) => {
      if (data) setRooms(data as Room[]);
    });
  }, []);

  async function loadAppts(d: Date) {
    setLoading(true);
    const start = startOfDay(d).toISOString();
    const end = addDays(startOfDay(d), 1).toISOString();
    const { data, error } = await supabase
      .from("appointments")
      .select("*, profiles:therapist_id(full_name, email)")
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

  // For each room, compute the therapist with most sessions today (leader)
  const leadByRoom = useMemo(() => {
    const m = new Map<string, { therapist_id: string; name: string; count: number } | null>();
    rooms.forEach((r) => {
      const counts = new Map<string, { name: string; count: number }>();
      (apptsByRoom.get(r.id) || []).forEach((a) => {
        if (a.attendance_status === "cancelled") return;
        const name = a.profiles?.full_name || a.profiles?.email?.split("@")[0] || "Terapeuta";
        const cur = counts.get(a.therapist_id) || { name, count: 0 };
        counts.set(a.therapist_id, { name, count: cur.count + 1 });
      });
      let lead: { therapist_id: string; name: string; count: number } | null = null;
      counts.forEach((v, k) => {
        if (!lead || v.count > lead.count) lead = { therapist_id: k, name: v.name, count: v.count };
      });
      m.set(r.id, lead);
    });
    return m;
  }, [rooms, apptsByRoom]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/70 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground">
              <CalendarCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="font-display text-lg leading-tight">O Fio de Ariana</div>
              <div className="text-xs text-muted-foreground -mt-0.5">Agenda terapêutica</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
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

      <main className="mx-auto max-w-[1400px] px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setDay(addDays(day, -1))}><ChevronLeft className="h-4 w-4" /></Button>
            <div className="min-w-[240px] text-center">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                {format(day, "EEEE", { locale: ptBR })}
              </div>
              <div className="font-display text-2xl">
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
                <LayoutGrid className="h-4 w-4 mr-1" />Colunas
              </Button>
              <Button size="sm" variant={view === "grade" ? "default" : "ghost"} onClick={() => setView("grade")}>
                <Rows3 className="h-4 w-4 mr-1" />Grade
              </Button>
            </div>
            <Dialog open={openNew} onOpenChange={(o) => { setOpenNew(o); if (!o) setPrefill(null); }}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-1" />Novo atendimento</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle className="font-display text-2xl">Novo atendimento</DialogTitle></DialogHeader>
                <NewAppointmentForm
                  rooms={rooms}
                  defaultDay={day}
                  userId={userId}
                  prefill={prefill}
                  onCreated={() => { setOpenNew(false); setPrefill(null); loadAppts(day); }}
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
  lead: { therapist_id: string; name: string; count: number } | null;
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
          <Star className="h-3 w-3 fill-primary text-primary" />
          <span className="font-medium text-primary">{lead.name}</span>
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
  return (
    <div className={`rounded-lg p-3 transition-opacity ${
      cancelled
        ? "border border-dashed border-muted-foreground/40 bg-muted/30 opacity-60"
        : highlighted
          ? "border border-primary/40 bg-accent/30"
          : "border border-border bg-background"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={`font-medium truncate ${cancelled ? "line-through" : ""}`}>{a.patient_name}</div>
          <div className={`text-xs text-muted-foreground ${cancelled ? "line-through" : ""}`}>
            {format(parseISO(a.starts_at), "HH:mm")}–{format(parseISO(a.ends_at), "HH:mm")} ·{" "}
            <span className={highlighted && !cancelled ? "text-primary font-medium" : ""}>{therapist}</span>
            {a.recurrence_group_id && <span className="ml-1 inline-flex items-center gap-0.5"><RotateCw className="h-3 w-3" />série</span>}
          </div>
          {a.notes && <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{a.notes}</div>}
        </div>
        <StatusBadge status={a.attendance_status} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button size="sm" variant={a.attendance_status === "present" ? "default" : "outline"}
          disabled={!canEdit} onClick={() => onMark(a, "present")}>
          <Check className="h-3.5 w-3.5 mr-1" />Compareceu
        </Button>
        <Button size="sm" variant={a.attendance_status === "absent" ? "destructive" : "outline"}
          disabled={!canEdit} onClick={() => onMark(a, "absent")}>
          <X className="h-3.5 w-3.5 mr-1" />Faltou
        </Button>
        <Button size="sm" variant={a.attendance_status === "rescheduled" ? "secondary" : "outline"}
          disabled={!canEdit} onClick={() => onMark(a, "rescheduled")}>
          <RotateCw className="h-3.5 w-3.5 mr-1" />Remarcar
        </Button>
        <Button size="sm" variant={cancelled ? "secondary" : "outline"}
          disabled={!canEdit} onClick={() => onMark(a, cancelled ? "pending" : "cancelled")}
          title={cancelled ? "Reativar" : "Cancelar (mantém visível, libera o horário)"}>
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
  rooms, appts, leadByRoom, canEdit, onMark, onDelete,
}: {
  rooms: Room[]; appts: Appointment[];
  leadByRoom: Map<string, { therapist_id: string; name: string; count: number } | null>;
  canEdit: (a: Appointment) => boolean;
  onMark: (a: Appointment, s: Status) => void;
  onDelete: (a: Appointment) => void;
}) {
  // Build map: roomId -> hour -> appointments
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
                      <Star className="h-3 w-3 fill-primary text-primary" />
                      <span className="text-primary font-medium">{lead.name}</span>
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
                const lead = leadByRoom.get(r.id);
                return (
                  <td key={r.id} className="border-l border-border p-1.5 align-top min-w-[160px]">
                    {items.map((a) => {
                      const highlighted = !!lead && a.therapist_id === lead.therapist_id;
                      const cancelled = a.attendance_status === "cancelled";
                      return (
                        <div key={a.id}
                          className={`mb-1 rounded-md px-2 py-1.5 text-xs ${
                            cancelled
                              ? "border border-dashed border-muted-foreground/40 bg-muted/30 opacity-60"
                              : highlighted
                                ? "border border-primary/40 bg-accent/40"
                                : "border border-border bg-background"
                          }`}>
                          <div className="flex items-start justify-between gap-1">
                            <div className="min-w-0">
                              <div className={`font-medium truncate ${cancelled ? "line-through" : ""}`}>{a.patient_name}</div>
                              <div className={`text-[10px] text-muted-foreground ${cancelled ? "line-through" : ""}`}>
                                {format(parseISO(a.starts_at), "HH:mm")}–{format(parseISO(a.ends_at), "HH:mm")}
                              </div>
                              <div className={`text-[10px] truncate ${highlighted && !cancelled ? "text-primary font-medium" : "text-muted-foreground"}`}>
                                {a.profiles?.full_name || a.profiles?.email?.split("@")[0] || "Terapeuta"}
                              </div>
                            </div>
                            <StatusBadge status={a.attendance_status} />
                          </div>
                          {canEdit(a) && (
                            <div className="mt-1 flex gap-0.5">
                              <button title="Compareceu" onClick={() => onMark(a, "present")}
                                className="rounded p-0.5 hover:bg-[var(--color-success)]/20"><Check className="h-3 w-3 text-[var(--color-success)]" /></button>
                              <button title="Faltou" onClick={() => onMark(a, "absent")}
                                className="rounded p-0.5 hover:bg-destructive/20"><X className="h-3 w-3 text-destructive" /></button>
                              <button title="Remarcar" onClick={() => onMark(a, "rescheduled")}
                                className="rounded p-0.5 hover:bg-[var(--color-warning)]/20"><RotateCw className="h-3 w-3 text-[var(--color-warning)]" /></button>
                              <button title={cancelled ? "Reativar" : "Cancelar"} onClick={() => onMark(a, cancelled ? "pending" : "cancelled")}
                                className="rounded p-0.5 hover:bg-muted"><Ban className="h-3 w-3 text-muted-foreground" /></button>
                              <button title="Excluir" onClick={() => onDelete(a)}
                                className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                            </div>
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

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { label: string; cls: string }> = {
    pending:     { label: "Pendente",   cls: "bg-muted text-muted-foreground" },
    present:     { label: "Compareceu", cls: "bg-[var(--color-success)] text-[var(--color-success-foreground)]" },
    absent:      { label: "Faltou",     cls: "bg-destructive text-destructive-foreground" },
    rescheduled: { label: "Remarcado",  cls: "bg-[var(--color-warning)] text-[var(--color-warning-foreground)]" },
    cancelled:   { label: "Cancelado",  cls: "bg-muted text-muted-foreground line-through" },
  };
  const it = map[status];
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${it.cls}`}>{it.label}</span>;
}

function statusLabel(s: Status) {
  return { pending: "Pendente", present: "Compareceu", absent: "Faltou", rescheduled: "Remarcado", cancelled: "Cancelado" }[s];
}

function NewAppointmentForm({
  rooms, defaultDay, userId, onCreated,
}: {
  rooms: Room[]; defaultDay: Date; userId: string | null;
  onCreated: () => void;
}) {
  const [patient, setPatient] = useState("");
  const [roomId, setRoomId] = useState(rooms[0]?.id || "");
  const [date, setDate] = useState(format(defaultDay, "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [notes, setNotes] = useState("");
  const [repeat, setRepeat] = useState(false);
  const [frequency, setFrequency] = useState<"weekly" | "biweekly">("weekly");
  const [untilDate, setUntilDate] = useState(format(addDays(defaultDay, 7 * 8), "yyyy-MM-dd"));
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (rooms.length && !roomId) setRoomId(rooms[0].id); }, [rooms]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !roomId) return;
    if (endTime <= startTime) return toast.error("Hora final deve ser após a inicial.");
    setSaving(true);

    const rows: Array<{
      therapist_id: string; room_id: string; patient_name: string;
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
        therapist_id: userId, room_id: roomId, patient_name: patient.trim(),
        starts_at: new Date(`${d}T${startTime}:00`).toISOString(),
        ends_at: new Date(`${d}T${endTime}:00`).toISOString(),
        notes: notes.trim() || null,
        recurrence_group_id: groupId,
      });
      if (!repeat) break;
      cursor = addWeeks(cursor, stepWeeks);
      if (cursor > end) break;
      if (rows.length > 60) break; // safety
    }

    const { error } = await supabase.from("appointments").insert(rows);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(rows.length > 1 ? `${rows.length} sessões agendadas` : "Atendimento agendado");
    onCreated();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <Label htmlFor="patient">Nome do paciente</Label>
        <Input id="patient" value={patient} onChange={(e) => setPatient(e.target.value)} required maxLength={120} />
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
      <Button type="submit" disabled={saving} className="w-full">{saving ? "Salvando…" : "Agendar"}</Button>
    </form>
  );
}
