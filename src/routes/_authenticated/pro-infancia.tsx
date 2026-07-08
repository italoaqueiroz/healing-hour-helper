import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Baby, Search, Plus, ChevronRight, Contact } from "lucide-react";
import { format, parseISO, differenceInYears } from "date-fns";
import { pt } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/pro-infancia")({
  head: () => ({ meta: [{ title: "ProInfância · O Fio de Ariana" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    const ok = !!roles?.some((r) => r.role === "admin" || r.role === "pro_infancia");
    if (!ok) throw redirect({ to: "/agenda" });
  },
  component: ProInfanciaPage,
});

type Child = {
  id: string;
  full_name: string;
  birth_date: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  parent_email: string | null;
  school: string | null;
  diagnosis: string | null;
  goals: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
};

function ProInfanciaPage() {
  const navigate = useNavigate();
  void navigate;
  const [rows, setRows] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("pro_infancia_children")
      .select("*").order("full_name");
    if (error) toast.error("Falha a carregar");
    setRows((data as Child[]) || []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((c) => {
      if (!showInactive && !c.active) return false;
      if (!s) return true;
      return c.full_name.toLowerCase().includes(s)
        || (c.parent_name || "").toLowerCase().includes(s)
        || (c.school || "").toLowerCase().includes(s)
        || (c.diagnosis || "").toLowerCase().includes(s);
    });
  }, [rows, q, showInactive]);

  return (
    <AppShell
      title="ProInfância"
      subtitle="Fichas de acompanhamento"
      actions={
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Nova criança</span></Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="font-display text-2xl">Nova ficha</DialogTitle></DialogHeader>
            <ChildForm onSaved={() => { setCreating(false); load(); }} />
          </DialogContent>
        </Dialog>
      }
    >
      <div className="mx-auto max-w-[1400px] px-3 sm:px-6 py-4 sm:py-5 space-y-3">
        <Link to="/contactos-pro-infancia">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Contact className="h-4 w-4" /> Contactos ProInfância
          </Button>
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Nome, encarregado, escola, diagnóstico…" className="pl-9" />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <Switch checked={showInactive} onCheckedChange={setShowInactive} />
            Mostrar arquivadas
          </label>
        </div>

        <div className="text-xs text-muted-foreground">
          {filtered.length} de {rows.length} ficha{rows.length === 1 ? "" : "s"}
        </div>

        {loading ? (
          <div className="text-center text-muted-foreground py-10">A carregar…</div>
        ) : filtered.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">
            <Baby className="h-8 w-8 mx-auto mb-2 opacity-60" />
            Sem fichas {q ? "correspondentes" : "registadas"}.
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((c) => {
              const age = c.birth_date ? differenceInYears(new Date(), parseISO(c.birth_date)) : null;
              return (
                <Link key={c.id} to="/pro-infancia/$childId" params={{ childId: c.id }}
                  className="block">
                  <Card className={`p-4 hover:shadow-md transition-shadow ${!c.active ? "opacity-60" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate flex items-center gap-1.5">
                          <Baby className="h-4 w-4 text-primary shrink-0" />
                          {c.full_name}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {age !== null ? `${age} ano${age === 1 ? "" : "s"}` : "Sem data de nascimento"}
                          {c.school && ` · ${c.school}`}
                        </div>
                        {c.diagnosis && (
                          <div className="mt-1 text-xs line-clamp-2 text-muted-foreground italic">
                            {c.diagnosis}
                          </div>
                        )}
                        {c.parent_name && (
                          <div className="mt-1 text-[11px] text-muted-foreground truncate">
                            Enc.: {c.parent_name}
                          </div>
                        )}
                        {!c.active && <Badge variant="outline" className="mt-2 text-[10px]">Arquivada</Badge>}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

export function ChildForm({ child, onSaved }: { child?: Child; onSaved: () => void }) {
  const [fullName, setFullName] = useState(child?.full_name || "");
  const [birthDate, setBirthDate] = useState(child?.birth_date || "");
  const [parentName, setParentName] = useState(child?.parent_name || "");
  const [parentPhone, setParentPhone] = useState(child?.parent_phone || "");
  const [parentEmail, setParentEmail] = useState(child?.parent_email || "");
  const [school, setSchool] = useState(child?.school || "");
  const [diagnosis, setDiagnosis] = useState(child?.diagnosis || "");
  const [goals, setGoals] = useState(child?.goals || "");
  const [notes, setNotes] = useState(child?.notes || "");
  const [active, setActive] = useState(child?.active ?? true);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return toast.error("Nome obrigatório");
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const payload = {
      full_name: fullName.trim(),
      birth_date: birthDate || null,
      parent_name: parentName.trim() || null,
      parent_phone: parentPhone.trim() || null,
      parent_email: parentEmail.trim() || null,
      school: school.trim() || null,
      diagnosis: diagnosis.trim() || null,
      goals: goals.trim() || null,
      notes: notes.trim() || null,
      active,
      ...(child ? {} : { created_by: auth.user?.id ?? null }),
    };
    const q = child
      ? supabase.from("pro_infancia_children").update(payload).eq("id", child.id)
      : supabase.from("pro_infancia_children").insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(child ? "Ficha atualizada" : "Ficha criada");
    onSaved();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Label htmlFor="c-name">Nome da criança</Label>
          <Input id="c-name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} required autoFocus />
        </div>
        <div>
          <Label htmlFor="c-birth">Nascimento</Label>
          <Input id="c-birth" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
        </div>
      </div>
      <div>
        <Label htmlFor="c-school">Escola / Instituição</Label>
        <Input id="c-school" value={school} onChange={(e) => setSchool(e.target.value)} maxLength={120} />
      </div>
      <div>
        <Label htmlFor="c-diag">Diagnóstico / Encaminhamento</Label>
        <Textarea id="c-diag" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} rows={2} maxLength={500} />
      </div>
      <div>
        <Label htmlFor="c-goals">Objetivos terapêuticos</Label>
        <Textarea id="c-goals" value={goals} onChange={(e) => setGoals(e.target.value)} rows={3} maxLength={1000} />
      </div>

      <div className="rounded-lg border border-border p-3 space-y-3 bg-muted/20">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Encarregado(a) de educação</div>
        <div>
          <Label htmlFor="c-pname">Nome</Label>
          <Input id="c-pname" value={parentName} onChange={(e) => setParentName(e.target.value)} maxLength={120} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="c-pphone">Telefone</Label>
            <Input id="c-pphone" type="tel" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} maxLength={40} placeholder="+351…" />
          </div>
          <div>
            <Label htmlFor="c-pemail">E-mail</Label>
            <Input id="c-pemail" type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} maxLength={120} />
          </div>
        </div>
      </div>

      <div>
        <Label htmlFor="c-notes">Notas gerais</Label>
        <Textarea id="c-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={1000} />
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <Switch checked={active} onCheckedChange={setActive} />
        Ficha ativa
      </label>

      <DialogFooter>
        <Button type="submit" disabled={saving} className="w-full">
          {saving ? "A guardar…" : child ? "Guardar alterações" : "Criar ficha"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// Re-export for child route
export type { Child };
// Suppress unused import warning in prod build
void format; void pt;
