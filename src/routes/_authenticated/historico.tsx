import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { History, Search, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/historico")({
  head: () => ({ meta: [{ title: "Histórico · O Fio de Ariana" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "admin");
    if (!roles?.length) throw redirect({ to: "/agenda" });
  },
  component: HistoryPage,
});

type AuditRow = {
  id: string;
  appointment_id: string | null;
  action: "created" | "updated" | "deleted";
  actor_id: string | null;
  patient_name: string | null;
  event_type: string | null;
  changed_fields: string[];
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
  actor?: { full_name: string | null; email: string | null } | null;
};

const FIELD_LABELS: Record<string, string> = {
  attendance_status: "presença/falta",
  check_in_at: "check-in",
  starts_at: "início",
  ends_at: "fim",
  room_id: "sala",
  therapist_id: "terapeuta principal",
  co_therapist_id: "segundo terapeuta",
  additional_therapist_ids: "terapeutas adicionais",
  patient_name: "paciente",
  patient_id: "paciente",
  notes: "notas",
  event_type: "tipo de evento",
  title: "título",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  present: "Presença",
  absent: "Falta",
  absent_therapist: "Falta do terapeuta",
  absent_unjustified: "Falta injustificada",
  absent_justified: "Falta justificada",
  cancelled: "Cancelada",
  rescheduled: "Remarcada",
};

function displayValue(field: string, value: unknown) {
  if (value == null || value === "") return "vazio";
  if (field === "attendance_status") return STATUS_LABELS[String(value)] || String(value);
  if ((field === "starts_at" || field === "ends_at" || field === "check_in_at") && typeof value === "string") {
    return format(new Date(value), "dd/MM/yyyy HH:mm");
  }
  if (Array.isArray(value)) return value.length ? `${value.length} selecionado(s)` : "nenhum";
  if (typeof value === "object") return "alterado";
  return String(value);
}

function HistoryPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("all");

  useEffect(() => {
    supabase
      .from("appointment_audit_logs")
      .select("*, actor:actor_id(full_name, email)")
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data }) => {
        setRows((data as AuditRow[] | null) || []);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (action !== "all" && row.action !== action) return false;
      if (!needle) return true;
      const actor = row.actor?.full_name || row.actor?.email || "sistema";
      return `${row.patient_name || ""} ${actor} ${row.changed_fields.join(" ")}`.toLowerCase().includes(needle);
    });
  }, [rows, search, action]);

  return (
    <AppShell title="Histórico" subtitle="Auditoria administrativa da agenda">
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Pesquisar paciente ou utilizador" />
          </div>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as mudanças</SelectItem>
              <SelectItem value="created">Criações</SelectItem>
              <SelectItem value="updated">Alterações</SelectItem>
              <SelectItem value="deleted">Exclusões</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4" /> Visível apenas para administradores · últimos 500 registros
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">A carregar histórico…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Nenhuma mudança encontrada.</div>
        ) : (
          <div className="space-y-2">
            {filtered.map((row) => {
              const actor = row.actor?.full_name || row.actor?.email || "Sistema";
              const actionLabel = row.action === "created" ? "Criou" : row.action === "deleted" ? "Excluiu" : "Alterou";
              const importantFields = row.changed_fields.filter((field) => FIELD_LABELS[field]);
              return (
                <Card key={row.id} className="p-3 sm:p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-muted">
                      <History className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{actor}</span>
                        <Badge variant={row.action === "deleted" ? "destructive" : "secondary"}>{actionLabel}</Badge>
                        <span className="font-medium">{row.patient_name || "evento sem paciente"}</span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {format(new Date(row.created_at), "d 'de' MMMM 'de' yyyy, HH:mm:ss", { locale: pt })}
                      </div>
                      {row.action === "updated" && importantFields.length > 0 && (
                        <div className="mt-3 grid gap-1.5 text-sm">
                          {importantFields.map((field) => (
                            <div key={field} className="rounded-md bg-muted/50 px-2.5 py-1.5">
                              <span className="font-medium">{FIELD_LABELS[field]}:</span>{" "}
                              <span className="text-muted-foreground line-through">{displayValue(field, row.old_data?.[field])}</span>{" → "}
                              <span>{displayValue(field, row.new_data?.[field])}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
