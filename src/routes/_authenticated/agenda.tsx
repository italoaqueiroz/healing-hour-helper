import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format, addDays, startOfDay, isSameDay, parseISO } from "date-fns";
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
import { toast } from "sonner";
import {
  CalendarCheck, ChevronLeft, ChevronRight, LogOut, Plus, Check, X, RotateCw, Trash2, User as UserIcon,
} from "lucide-react";

type Room = { id: string; name: string; position: number };
type Status = "pending" | "present" | "absent" | "rescheduled";
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
  profiles?: { full_name: string | null; email: string | null } | null;
};

export const Route = createFileRoute("/_authenticated/agenda")({
  head: () => ({ meta: [{ title: "Agenda · Clínica" }] }),
  component: AgendaPage,
});

function AgendaPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [day, setDay] = useState<Date>(startOfDay(new Date()));
  const [openNew, setOpenNew] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      setUserId(data.user.id);
      setUserName(
        (data.user.user_metadata?.full_name as string) ||
        (data.user.user_metadata?.name as string) ||
        data.user.email?.split("@")[0] || "Terapeuta"
      );
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

  async function markStatus(a: Appointment, status: Status) {
    const previous = a.attendance_status;
    setAppts((cur) => cur.map((x) => x.id === a.id ? { ...x, attendance_status: status, attendance_marked_at: new Date().toISOString() } : x));
    const { error } = await supabase
      .from("appointments")
      .update({ attendance_status: status, attendance_marked_at: new Date().toISOString() })
      .eq("id", a.id);
    if (error) {
      setAppts((cur) => cur.map((x) => x.id === a.id ? { ...x, attendance_status: previous } : x));
      toast.error("Não foi possível atualizar (somente o terapeuta dono pode marcar)");
    } else {
      toast.success(statusLabel(status) + " registrado");
    }
  }

  async function deleteAppt(a: Appointment) {
    if (!confirm(`Excluir o atendimento de ${a.patient_name}?`)) return;
    const { error } = await supabase.from("appointments").delete().eq("id", a.id);
    if (error) return toast.error("Apenas o terapeuta dono pode excluir.");
    setAppts((cur) => cur.filter((x) => x.id !== a.id));
    toast.success("Atendimento removido");
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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <CalendarCheck className="h-5 w-5" />
            </div>
            <span className="font-semibold">Clínica · Agenda</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
              <UserIcon className="h-4 w-4" /> {userName}
            </div>
            <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="h-4 w-4 mr-1" />Sair</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setDay(addDays(day, -1))}><ChevronLeft className="h-4 w-4" /></Button>
            <div className="min-w-[220px] text-center">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                {format(day, "EEEE", { locale: ptBR })}
              </div>
              <div className="text-lg font-semibold">
                {format(day, "d 'de' MMMM, yyyy", { locale: ptBR })}
              </div>
            </div>
            <Button variant="outline" size="icon" onClick={() => setDay(addDays(day, 1))}><ChevronRight className="h-4 w-4" /></Button>
            {!isSameDay(day, startOfDay(new Date())) && (
              <Button variant="ghost" size="sm" onClick={() => setDay(startOfDay(new Date()))}>Hoje</Button>
            )}
          </div>

          <Dialog open={openNew} onOpenChange={setOpenNew}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" />Novo atendimento</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo atendimento</DialogTitle></DialogHeader>
              <NewAppointmentForm
                rooms={rooms}
                defaultDay={day}
                userId={userId}
                onCreated={(a) => { setAppts((cur) => [...cur, a].sort((x,y) => x.starts_at.localeCompare(y.starts_at))); setOpenNew(false); }}
              />
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="mt-10 text-center text-muted-foreground">Carregando agenda…</div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rooms.map((room) => (
              <RoomColumn
                key={room.id}
                room={room}
                appts={apptsByRoom.get(room.id) || []}
                currentUserId={userId}
                onMark={markStatus}
                onDelete={deleteAppt}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function RoomColumn({
  room, appts, currentUserId, onMark, onDelete,
}: {
  room: Room;
  appts: Appointment[];
  currentUserId: string | null;
  onMark: (a: Appointment, s: Status) => void;
  onDelete: (a: Appointment) => void;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{room.name}</h3>
        <Badge variant="secondary">{appts.length}</Badge>
      </div>
      <div className="mt-3 space-y-3">
        {appts.length === 0 && <p className="text-sm text-muted-foreground">Sem atendimentos.</p>}
        {appts.map((a) => (
          <AppointmentCard
            key={a.id} a={a}
            isOwner={currentUserId === a.therapist_id}
            onMark={onMark} onDelete={onDelete}
          />
        ))}
      </div>
    </Card>
  );
}

function AppointmentCard({
  a, isOwner, onMark, onDelete,
}: {
  a: Appointment; isOwner: boolean;
  onMark: (a: Appointment, s: Status) => void;
  onDelete: (a: Appointment) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium">{a.patient_name}</div>
          <div className="text-xs text-muted-foreground">
            {format(parseISO(a.starts_at), "HH:mm")}–{format(parseISO(a.ends_at), "HH:mm")} ·{" "}
            {a.profiles?.full_name || a.profiles?.email || "Terapeuta"}
          </div>
          {a.notes && <div className="mt-1 text-xs text-muted-foreground">{a.notes}</div>}
        </div>
        <StatusBadge status={a.attendance_status} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button size="sm" variant={a.attendance_status === "present" ? "default" : "outline"}
          disabled={!isOwner} onClick={() => onMark(a, "present")}>
          <Check className="h-3.5 w-3.5 mr-1" />Compareceu
        </Button>
        <Button size="sm" variant={a.attendance_status === "absent" ? "destructive" : "outline"}
          disabled={!isOwner} onClick={() => onMark(a, "absent")}>
          <X className="h-3.5 w-3.5 mr-1" />Faltou
        </Button>
        <Button size="sm" variant={a.attendance_status === "rescheduled" ? "secondary" : "outline"}
          disabled={!isOwner} onClick={() => onMark(a, "rescheduled")}>
          <RotateCw className="h-3.5 w-3.5 mr-1" />Remarcar
        </Button>
        {isOwner && (
          <Button size="sm" variant="ghost" onClick={() => onDelete(a)} className="ml-auto text-muted-foreground hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { label: string; cls: string }> = {
    pending:     { label: "Pendente",   cls: "bg-muted text-muted-foreground" },
    present:     { label: "Compareceu", cls: "bg-[var(--color-success)] text-[var(--color-success-foreground)]" },
    absent:      { label: "Faltou",     cls: "bg-destructive text-destructive-foreground" },
    rescheduled: { label: "Remarcado",  cls: "bg-[var(--color-warning)] text-[var(--color-warning-foreground)]" },
  };
  const it = map[status];
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${it.cls}`}>{it.label}</span>;
}

function statusLabel(s: Status) {
  return { pending: "Pendente", present: "Compareceu", absent: "Faltou", rescheduled: "Remarcado" }[s];
}

function NewAppointmentForm({
  rooms, defaultDay, userId, onCreated,
}: {
  rooms: Room[]; defaultDay: Date; userId: string | null;
  onCreated: (a: Appointment) => void;
}) {
  const [patient, setPatient] = useState("");
  const [roomId, setRoomId] = useState(rooms[0]?.id || "");
  const [date, setDate] = useState(format(defaultDay, "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !roomId) return;
    if (endTime <= startTime) return toast.error("Hora final deve ser após a inicial.");
    setSaving(true);
    const starts_at = new Date(`${date}T${startTime}:00`).toISOString();
    const ends_at = new Date(`${date}T${endTime}:00`).toISOString();
    const { data, error } = await supabase.from("appointments").insert({
      therapist_id: userId, room_id: roomId, patient_name: patient.trim(),
      starts_at, ends_at, notes: notes.trim() || null,
    }).select("*, profiles:therapist_id(full_name, email)").single();
    setSaving(false);
    if (error || !data) return toast.error(error?.message || "Erro ao criar");
    toast.success("Atendimento agendado");
    onCreated(data as unknown as Appointment);
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
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-3">
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
      <div>
        <Label htmlFor="notes">Notas (opcional)</Label>
        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
      </div>
      <Button type="submit" disabled={saving} className="w-full">{saving ? "Salvando…" : "Agendar"}</Button>
    </form>
  );
}
