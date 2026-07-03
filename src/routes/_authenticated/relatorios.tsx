import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth, parseISO, eachDayOfInterval } from "date-fns";
import { pt } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ChevronLeft, Download, FileText } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios · O Fio de Ariana" }] }),
  component: ReportsPage,
});

type Profile = { id: string; full_name: string | null; email: string | null; color: string | null };
type Status =
  | "pending" | "present" | "absent" | "rescheduled" | "cancelled"
  | "absent_therapist" | "absent_unjustified" | "absent_justified";
type Appt = {
  id: string;
  therapist_id: string;
  patient_id: string | null;
  patient_name: string;
  starts_at: string;
  ends_at: string;
  attendance_status: Status;
  profiles?: { full_name: string | null; email: string | null } | null;
  patients?: { registration_number: string | null } | null;
};

function sigla(s: Status): string {
  if (s === "present") return "P";
  if (s === "absent_therapist") return "FT";
  if (s === "absent_unjustified" || s === "absent") return "FI";
  if (s === "absent_justified") return "FJ";
  if (s === "cancelled") return "C";
  if (s === "rescheduled") return "R";
  return "—";
}

function effective(s: Status, endsAt: string): Status {
  if (s !== "pending") return s;
  return parseISO(endsAt).getTime() + 60 * 60 * 1000 < Date.now() ? "present" : "pending";
}

function ReportsPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [therapistFilter, setTherapistFilter] = useState<string>("self");
  const [month, setMonth] = useState<Date>(startOfMonth(new Date()));
  const [appts, setAppts] = useState<Appt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { navigate({ to: "/auth" }); return; }
      setUserId(data.user.id);
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
      const admin = !!roles?.some((r) => r.role === "admin");
      setIsAdmin(admin);
      if (admin) {
        const { data: p } = await supabase.from("profiles").select("id, full_name, email, color");
        if (p) setProfiles(p as Profile[]);
      }
    });
  }, []);

  useEffect(() => {
    if (!userId) return;
    load();
  }, [userId, isAdmin, therapistFilter, month]);

  async function load() {
    setLoading(true);
    const start = startOfMonth(month).toISOString();
    const end = endOfMonth(month).toISOString();
    let q = supabase
      .from("appointments")
      .select("id, therapist_id, patient_id, patient_name, starts_at, ends_at, attendance_status, profiles:therapist_id(full_name, email), patients:patient_id(registration_number)")
      .gte("starts_at", start).lte("starts_at", end)
      .order("starts_at");
    // Non-admin sees only own (RLS allows view-all of authenticated, but filter UX-wise)
    const tFilter = isAdmin ? therapistFilter : "self";
    if (tFilter === "self") q = q.eq("therapist_id", userId!);
    else if (tFilter !== "all") q = q.eq("therapist_id", tFilter);
    const { data, error } = await q;
    if (error) toast.error("Falha ao carregar relatório");
    setAppts((data as unknown as Appt[]) || []);
    setLoading(false);
  }

  // Group by patient
  const byPatient = useMemo(() => {
    const m = new Map<string, { name: string; rows: Appt[] }>();
    appts.forEach((a) => {
      const key = a.patient_id || a.patient_name;
      const cur = m.get(key) || { name: a.patient_name, rows: [] };
      cur.rows.push(a); m.set(key, cur);
    });
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [appts]);

  // Summary counts
  const summary = useMemo(() => {
    const c = { P: 0, FT: 0, FI: 0, FJ: 0, C: 0, total: 0 };
    appts.forEach((a) => {
      const e = effective(a.attendance_status, a.ends_at);
      const s = sigla(e);
      if (s === "P") c.P++; else if (s === "FT") c.FT++;
      else if (s === "FI") c.FI++; else if (s === "FJ") c.FJ++;
      else if (s === "C") c.C++;
      c.total++;
    });
    return c;
  }, [appts]);

  function downloadPdf() {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const w = doc.internal.pageSize.getWidth();
    const tFilter = isAdmin ? therapistFilter : "self";
    const therapistName = tFilter === "all"
      ? "Todos os terapeutas"
      : tFilter === "self"
        ? (profiles.find((p) => p.id === userId)?.full_name || "Meu relatório")
        : (profiles.find((p) => p.id === tFilter)?.full_name || "Terapeuta");

    doc.setFont("helvetica", "bold"); doc.setFontSize(16);
    doc.text("O Fio de Ariana — Relatório mensal de presenças", 40, 50);
    doc.setFont("helvetica", "normal"); doc.setFontSize(11);
    doc.text(`${format(month, "MMMM 'de' yyyy", { locale: pt })}`, 40, 70);
    doc.text(`Terapeuta: ${therapistName}`, 40, 86);
    doc.text(
      `Total: ${summary.total}   |   P: ${summary.P}   FT: ${summary.FT}   FI: ${summary.FI}   FJ: ${summary.FJ}   Cancelados: ${summary.C}`,
      40, 102
    );
    doc.setFontSize(9); doc.setTextColor(120);
    doc.text("P=Presente · FT=Falta do técnico · FI=Falta injustificada · FJ=Falta justificada · C=Cancelado", 40, 116);
    doc.setTextColor(0);

    const body = appts
      .slice()
      .sort((a, b) => {
        const ta = a.profiles?.full_name || a.profiles?.email || "";
        const tb = b.profiles?.full_name || b.profiles?.email || "";
        const cmp = ta.localeCompare(tb, "pt");
        if (cmp !== 0) return cmp;
        return a.starts_at.localeCompare(b.starts_at);
      })
      .map((a) => [
        format(parseISO(a.starts_at), "dd/MM"),
        format(parseISO(a.starts_at), "HH:mm"),
        a.patient_name,
        a.patients?.registration_number || "—",
        a.profiles?.full_name || a.profiles?.email?.split("@")[0] || "—",
        sigla(effective(a.attendance_status, a.ends_at)),
      ]);

    autoTable(doc, {
      startY: 134,
      head: [["Data", "Hora", "Paciente", "Nº", "Terapeuta", "Estado"]],
      body,
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [139, 46, 46] },
      columnStyles: { 3: { halign: "center" }, 5: { halign: "center", fontStyle: "bold" } },
    });

    const file = `presencas_${format(month, "yyyy-MM")}_${therapistName.replace(/\s+/g, "_")}.pdf`;
    doc.save(file);
    void w;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/70 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3">
            <Link to="/agenda" className="text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <div>
              <div className="font-display text-lg leading-tight">Relatórios mensais</div>
              <div className="text-xs text-muted-foreground -mt-0.5">Folha de presenças</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/contactos" className="text-sm text-muted-foreground hover:text-foreground hidden sm:inline">Contactos</Link>
            <Button onClick={downloadPdf} disabled={appts.length === 0}>
              <Download className="h-4 w-4 mr-1.5" />PDF
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 sm:px-6 py-6">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Mês</label>
            <input type="month" className="block h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={format(month, "yyyy-MM")}
              onChange={(e) => { const [y, m] = e.target.value.split("-"); setMonth(new Date(Number(y), Number(m) - 1, 1)); }} />
          </div>
          {isAdmin && (
            <div className="min-w-[240px]">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Terapeuta</label>
              <Select value={therapistFilter} onValueChange={setTherapistFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os terapeutas</SelectItem>
                  <SelectItem value="self">Apenas eu</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name || p.email?.split("@")[0]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="mt-6 grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card className="p-3"><div className="text-xs text-muted-foreground">Total</div><div className="font-display text-2xl">{summary.total}</div></Card>
          <Card className="p-3"><div className="text-xs text-muted-foreground">P · Presentes</div><div className="font-display text-2xl text-[var(--color-success)]">{summary.P}</div></Card>
          <Card className="p-3"><div className="text-xs text-muted-foreground">FT · Falta téc.</div><div className="font-display text-2xl text-[var(--color-warning)]">{summary.FT}</div></Card>
          <Card className="p-3"><div className="text-xs text-muted-foreground">FI · Injustif.</div><div className="font-display text-2xl text-destructive">{summary.FI}</div></Card>
          <Card className="p-3"><div className="text-xs text-muted-foreground">FJ · Justif.</div><div className="font-display text-2xl">{summary.FJ}</div></Card>
        </div>

        {loading ? (
          <div className="mt-10 text-center text-muted-foreground">A carregar…</div>
        ) : byPatient.length === 0 ? (
          <Card className="mt-6 p-8 text-center text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            Sem atendimentos neste período.
          </Card>
        ) : (
          <Card className="mt-6 p-4 overflow-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3">Paciente</th>
                  <th className="py-2 pr-3">Sessões</th>
                  <th className="py-2">Histórico</th>
                </tr>
              </thead>
              <tbody>
                {byPatient.map((g) => (
                  <tr key={g.name} className="border-b border-border/40 last:border-0">
                    <td className="py-2 pr-3 font-medium align-top">{g.name}</td>
                    <td className="py-2 pr-3 align-top">{g.rows.length}</td>
                    <td className="py-2 align-top">
                      <div className="flex flex-wrap gap-1">
                        {g.rows.map((a) => {
                          const s = sigla(effective(a.attendance_status, a.ends_at));
                          const cls =
                            s === "P" ? "bg-[var(--color-success)]/20 text-[var(--color-success)]" :
                            s === "FT" ? "bg-[var(--color-warning)]/20 text-[var(--color-warning)]" :
                            s === "FI" ? "bg-destructive/20 text-destructive" :
                            s === "FJ" ? "bg-secondary text-secondary-foreground" :
                            "bg-muted text-muted-foreground";
                          return (
                            <Badge key={a.id} variant="outline"
                              className={`text-[10px] font-bold ${cls} border-transparent`}
                              title={`${format(parseISO(a.starts_at), "dd/MM HH:mm")} — ${a.profiles?.full_name || ""}`}>
                              {format(parseISO(a.starts_at), "dd/MM")} {s}
                            </Badge>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </main>
    </div>
  );
}

// Suppress unused import warning
void eachDayOfInterval;
