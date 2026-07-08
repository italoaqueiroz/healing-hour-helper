import { createFileRoute, Link, redirect } from "@tanstack/react-router";
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
import { Phone, Search, Trash2, UserPlus, Pencil, Mail, Users, ArrowLeft, Baby } from "lucide-react";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/contactos-pro-infancia")({
  head: () => ({ meta: [{ title: "Contactos ProInfância · O Fio de Ariana" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    const ok = !!roles?.some((r) => r.role === "admin" || r.role === "pro_infancia");
    if (!ok) throw redirect({ to: "/agenda" });
  },
  component: ContactosPiPage,
});

type PiContact = {
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

function ContactosPiPage() {
  const [rows, setRows] = useState<PiContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<PiContact | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<PiContact | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("pro_infancia_contacts")
      .select("id, full_name, registration_number, phone, email, parent_name, parent_phone, parent_email, notes, created_at")
      .order("full_name");
    if (error) toast.error("Falha a carregar contactos");
    setRows((data as PiContact[]) || []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((p) =>
      p.full_name.toLowerCase().includes(q) ||
      (p.registration_number || "").toLowerCase().includes(q) ||
      (p.phone || "").toLowerCase().includes(q) ||
      (p.email || "").toLowerCase().includes(q) ||
      (p.parent_name || "").toLowerCase().includes(q) ||
      (p.parent_phone || "").toLowerCase().includes(q)
    );
  }, [query, rows]);

  async function confirmDelete() {
    if (!toDelete) return;
    const { error } = await supabase.from("pro_infancia_contacts").delete().eq("id", toDelete.id);
    if (error) return toast.error(error.message);
    setRows((cur) => cur.filter((p) => p.id !== toDelete.id));
    toast.success("Contacto eliminado");
    setToDelete(null);
  }

  return (
    <AppShell
      title="Contactos ProInfância"
      subtitle="Lista independente"
      actions={
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogTrigger asChild>
            <Button size="sm"><UserPlus className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Novo</span></Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Novo contacto ProInfância</DialogTitle></DialogHeader>
            <PiContactForm onSaved={() => { setCreating(false); load(); }} />
          </DialogContent>
        </Dialog>
      }
    >
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-5 space-y-4">
        <Link to="/pro-infancia" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Voltar ao ProInfância
        </Link>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Procurar por nome, nº, telefone, e-mail…" className="pl-9" />
        </div>

        <div className="text-xs text-muted-foreground">
          {filtered.length} de {rows.length} contacto{rows.length === 1 ? "" : "s"}
        </div>

        {loading ? (
          <div className="mt-10 text-center text-muted-foreground">A carregar…</div>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <Baby className="h-8 w-8 mx-auto mb-2 opacity-60" />
            Sem contactos {query ? "correspondentes" : "registados"}.
          </Card>
        ) : (
          <Card className="overflow-hidden">
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
                    <Button size="icon" variant="ghost" onClick={() => setToDelete(p)}
                      className="text-muted-foreground hover:text-destructive" title="Eliminar">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar contacto ProInfância</DialogTitle></DialogHeader>
          {editing && (
            <PiContactForm contact={editing} onSaved={() => { setEditing(null); load(); }} />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar contacto?</AlertDialogTitle>
            <AlertDialogDescription>
              Vai apagar permanentemente <strong>{toDelete?.full_name}</strong>.
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

function PiContactForm({ contact, onSaved }: { contact?: PiContact; onSaved: () => void }) {
  const [fullName, setFullName] = useState(contact?.full_name || "");
  const [reg, setReg] = useState(contact?.registration_number || "");
  const [phone, setPhone] = useState(contact?.phone || "");
  const [email, setEmail] = useState(contact?.email || "");
  const [parentName, setParentName] = useState(contact?.parent_name || "");
  const [parentPhone, setParentPhone] = useState(contact?.parent_phone || "");
  const [parentEmail, setParentEmail] = useState(contact?.parent_email || "");
  const [notes, setNotes] = useState(contact?.notes || "");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return toast.error("Nome obrigatório");
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const payload = {
      full_name: fullName.trim(),
      registration_number: reg.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      parent_name: parentName.trim() || null,
      parent_phone: parentPhone.trim() || null,
      parent_email: parentEmail.trim() || null,
      notes: notes.trim() || null,
      ...(contact ? {} : { created_by: auth.user?.id ?? null }),
    };
    const q = contact
      ? supabase.from("pro_infancia_contacts").update(payload).eq("id", contact.id)
      : supabase.from("pro_infancia_contacts").insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(contact ? "Contacto atualizado" : "Contacto criado");
    onSaved();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <Label htmlFor="pn">Nome completo</Label>
        <Input id="pn" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} required autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="preg">Nº de inscrição</Label>
          <Input id="preg" value={reg} onChange={(e) => setReg(e.target.value)} maxLength={40} />
        </div>
        <div>
          <Label htmlFor="pph">Telefone</Label>
          <Input id="pph" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} placeholder="+351…" />
        </div>
      </div>
      <div>
        <Label htmlFor="pem">E-mail</Label>
        <Input id="pem" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} />
      </div>

      <div className="rounded-lg border border-border p-3 space-y-3 bg-muted/20">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" /> Encarregado(a) de educação
        </div>
        <div>
          <Label htmlFor="ppn">Nome</Label>
          <Input id="ppn" value={parentName} onChange={(e) => setParentName(e.target.value)} maxLength={120} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="pppn">Telefone</Label>
            <Input id="pppn" type="tel" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} maxLength={40} placeholder="+351…" />
          </div>
          <div>
            <Label htmlFor="ppem">E-mail</Label>
            <Input id="ppem" type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} maxLength={120} />
          </div>
        </div>
      </div>

      <div>
        <Label htmlFor="pnotes">Notas</Label>
        <Textarea id="pnotes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={3} />
      </div>
      <Button type="submit" disabled={saving} className="w-full">
        {saving ? "A guardar…" : "Guardar"}
      </Button>
    </form>
  );
}
