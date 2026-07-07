import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Phone, Search, Trash2, UserPlus, Pencil, Mail, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/contactos")({
  head: () => ({ meta: [{ title: "Contactos · O Fio de Ariana" }] }),
  component: ContactosPage,
});

type Patient = {
  id: string;
  full_name: string;
  registration_number: string | null;
  phone: string | null;
  email: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  parent_email: string | null;
  notes: string | null;
  created_at: string;
};

function ContactosPage() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Patient | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<Patient | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { navigate({ to: "/auth" }); return; }
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
      setIsAdmin(!!roles?.some((r) => r.role === "admin"));
    });
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("patients")
      .select("id, full_name, registration_number, phone, email, parent_name, parent_phone, parent_email, notes, created_at")
      .order("full_name");
    if (error) toast.error("Falha a carregar contactos");
    setPatients((data as Patient[]) || []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) =>
      p.full_name.toLowerCase().includes(q) ||
      (p.registration_number || "").toLowerCase().includes(q) ||
      (p.phone || "").toLowerCase().includes(q) ||
      (p.email || "").toLowerCase().includes(q) ||
      (p.parent_name || "").toLowerCase().includes(q) ||
      (p.parent_phone || "").toLowerCase().includes(q)
    );
  }, [query, patients]);

  async function confirmDelete() {
    if (!toDelete) return;
    const { error } = await supabase.from("patients").delete().eq("id", toDelete.id);
    if (error) return toast.error(error.message);
    setPatients((cur) => cur.filter((p) => p.id !== toDelete.id));
    toast.success("Contacto eliminado");
    setToDelete(null);
  }

  return (
    <AppShell
      title="Contactos"
      subtitle="Lista de pacientes"
      actions={
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogTrigger asChild>
            <Button size="sm"><UserPlus className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Novo</span></Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Novo contacto</DialogTitle></DialogHeader>
            <PatientForm onSaved={() => { setCreating(false); load(); }} />
          </DialogContent>
        </Dialog>
      }
    >
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-5">{void navigate}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Procurar por nome, nº, telefone, e-mail…" className="pl-9" />
        </div>

        <div className="mt-4 text-xs text-muted-foreground">
          {filtered.length} de {patients.length} contacto{patients.length === 1 ? "" : "s"}
        </div>

        {loading ? (
          <div className="mt-10 text-center text-muted-foreground">A carregar…</div>
        ) : filtered.length === 0 ? (
          <Card className="mt-6 p-8 text-center text-muted-foreground">
            Sem contactos {query ? "correspondentes" : "registados"}.
          </Card>
        ) : (
          <Card className="mt-4 overflow-hidden">
            <div className="divide-y divide-border">
              {filtered.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{p.full_name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {p.registration_number && <span>Nº {p.registration_number}</span>}
                      {p.phone && (
                        <a href={`tel:${p.phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                          <Phone className="h-3 w-3" />{p.phone}
                        </a>
                      )}
                      {p.email && (
                        <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1 hover:text-foreground">
                          <Mail className="h-3 w-3" />{p.email}
                        </a>
                      )}
                    </div>
                    {(p.parent_name || p.parent_phone || p.parent_email) && (
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />
                          {p.parent_name || "Encarregado(a)"}
                        </span>
                        {p.parent_phone && (
                          <a href={`tel:${p.parent_phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                            <Phone className="h-3 w-3" />{p.parent_phone}
                          </a>
                        )}
                        {p.parent_email && (
                          <a href={`mailto:${p.parent_email}`} className="inline-flex items-center gap-1 hover:text-foreground">
                            <Mail className="h-3 w-3" />{p.parent_email}
                          </a>
                        )}
                      </div>
                    )}
                    {p.notes && <div className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{p.notes}</div>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="icon" variant="ghost" onClick={() => setEditing(p)} title="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {isAdmin && (
                      <Button size="icon" variant="ghost" onClick={() => setToDelete(p)}
                        className="text-muted-foreground hover:text-destructive" title="Eliminar">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar contacto</DialogTitle></DialogHeader>
          {editing && (
            <PatientForm patient={editing} onSaved={() => { setEditing(null); load(); }} />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar contacto?</AlertDialogTitle>
            <AlertDialogDescription>
              Vai apagar permanentemente <strong>{toDelete?.full_name}</strong>. Os atendimentos
              já realizados mantêm-se, mas ficam sem ligação a este paciente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function PatientForm({ patient, onSaved }: { patient?: Patient; onSaved: () => void }) {
  const [fullName, setFullName] = useState(patient?.full_name || "");
  const [reg, setReg] = useState(patient?.registration_number || "");
  const [phone, setPhone] = useState(patient?.phone || "");
  const [email, setEmail] = useState(patient?.email || "");
  const [parentName, setParentName] = useState(patient?.parent_name || "");
  const [parentPhone, setParentPhone] = useState(patient?.parent_phone || "");
  const [parentEmail, setParentEmail] = useState(patient?.parent_email || "");
  const [notes, setNotes] = useState(patient?.notes || "");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return toast.error("Nome obrigatório");
    setSaving(true);
    const payload = {
      full_name: fullName.trim(),
      registration_number: reg.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      parent_name: parentName.trim() || null,
      parent_phone: parentPhone.trim() || null,
      parent_email: parentEmail.trim() || null,
      notes: notes.trim() || null,
    };
    const q = patient
      ? supabase.from("patients").update(payload).eq("id", patient.id)
      : supabase.from("patients").insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(patient ? "Contacto atualizado" : "Contacto criado");
    onSaved();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <Label htmlFor="name">Nome completo</Label>
        <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} required autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="reg">Nº de inscrição</Label>
          <Input id="reg" value={reg} onChange={(e) => setReg(e.target.value)} maxLength={40} />
        </div>
        <div>
          <Label htmlFor="phone">Telefone</Label>
          <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} placeholder="+351…" />
        </div>
      </div>
      <div>
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} placeholder="paciente@exemplo.pt" />
      </div>

      <div className="rounded-lg border border-border p-3 space-y-3 bg-muted/20">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" /> Encarregado(a) de educação
        </div>
        <div>
          <Label htmlFor="parent-name">Nome</Label>
          <Input id="parent-name" value={parentName} onChange={(e) => setParentName(e.target.value)} maxLength={120} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="parent-phone">Telefone</Label>
            <Input id="parent-phone" type="tel" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} maxLength={40} placeholder="+351…" />
          </div>
          <div>
            <Label htmlFor="parent-email">E-mail</Label>
            <Input id="parent-email" type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} maxLength={120} />
          </div>
        </div>
      </div>

      <div>
        <Label htmlFor="notes">Notas</Label>
        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={3} />
      </div>
      <Button type="submit" disabled={saving} className="w-full">
        {saving ? "A guardar…" : "Guardar"}
      </Button>
    </form>
  );
}
