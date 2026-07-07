import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Phone, Mail, School, Target, StickyNote, Plus, Trash2, User } from "lucide-react";
import { format, parseISO, differenceInYears } from "date-fns";
import { pt } from "date-fns/locale";
import { ChildForm, type Child } from "./pro-infancia";

export const Route = createFileRoute("/_authenticated/pro-infancia/$childId")({
  head: () => ({ meta: [{ title: "Ficha · Pró Infância" }] }),
  component: ChildDetailPage,
});

type Note = {
  id: string;
  child_id: string;
  therapist_id: string | null;
  session_date: string;
  content: string;
  created_at: string;
};

function ChildDetailPage() {
  const { childId } = Route.useParams();
  const navigate = useNavigate();
  const [child, setChild] = useState<Child | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [therapistNames, setTherapistNames] = useState<Record<string, string>>({});
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [noteDate, setNoteDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [savingNote, setSavingNote] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
    load();
  }, [childId]);

  async function load() {
    setLoading(true);
    const [{ data: c }, { data: n }] = await Promise.all([
      supabase.from("pro_infancia_children").select("*").eq("id", childId).maybeSingle(),
      supabase.from("pro_infancia_notes").select("*").eq("child_id", childId).order("session_date", { ascending: false }),
    ]);
    setChild((c as Child) || null);
    const list = (n as Note[]) || [];
    setNotes(list);
    const ids = Array.from(new Set(list.map((x) => x.therapist_id).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      const map: Record<string, string> = {};
      (profs || []).forEach((p: { id: string; full_name: string | null; email: string | null }) => {
        map[p.id] = p.full_name || p.email?.split("@")[0] || "Terapeuta";
      });
      setTherapistNames(map);
    }
    setLoading(false);
  }

  async function submitNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteContent.trim()) return;
    setSavingNote(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("pro_infancia_notes").insert({
      child_id: childId,
      therapist_id: auth.user?.id ?? null,
      session_date: noteDate,
      content: noteContent.trim(),
    });
    setSavingNote(false);
    if (error) return toast.error(error.message);
    toast.success("Nota registada");
    setAddingNote(false);
    setNoteContent("");
    setNoteDate(format(new Date(), "yyyy-MM-dd"));
    load();
  }

  async function confirmDeleteNote() {
    if (!noteToDelete) return;
    const { error } = await supabase.from("pro_infancia_notes").delete().eq("id", noteToDelete.id);
    if (error) return toast.error(error.message);
    setNotes((cur) => cur.filter((n) => n.id !== noteToDelete.id));
    setNoteToDelete(null);
    toast.success("Nota removida");
  }

  if (loading) {
    return (
      <AppShell title="Ficha" subtitle="A carregar…">
        <div className="p-6 text-center text-muted-foreground">A carregar…</div>
      </AppShell>
    );
  }

  if (!child) {
    return (
      <AppShell title="Ficha" subtitle="Não encontrada">
        <div className="p-6">
          <Link to="/pro-infancia" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
          <div className="mt-4 text-muted-foreground">Ficha não encontrada.</div>
        </div>
      </AppShell>
    );
  }

  const age = child.birth_date ? differenceInYears(new Date(), parseISO(child.birth_date)) : null;

  return (
    <AppShell
      title={child.full_name}
      subtitle="Pró Infância · Ficha"
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={() => navigate({ to: "/pro-infancia" })}>
            <ArrowLeft className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Voltar</span>
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Editar</span>
          </Button>
        </>
      }
    >
      <div className="mx-auto max-w-[1000px] px-3 sm:px-6 py-4 sm:py-5 space-y-4">
        <Card className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="font-display text-2xl">{child.full_name}</div>
              <div className="text-sm text-muted-foreground mt-0.5">
                {child.birth_date && (
                  <>
                    {format(parseISO(child.birth_date), "d 'de' MMMM 'de' yyyy", { locale: pt })}
                    {age !== null && ` · ${age} ano${age === 1 ? "" : "s"}`}
                  </>
                )}
                {!child.birth_date && "Sem data de nascimento"}
              </div>
            </div>
            {!child.active && <Badge variant="outline">Arquivada</Badge>}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
            {child.school && (
              <div className="flex items-start gap-2">
                <School className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div><div className="text-xs text-muted-foreground">Escola</div>{child.school}</div>
              </div>
            )}
            {child.parent_name && (
              <div className="flex items-start gap-2">
                <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <div className="text-xs text-muted-foreground">Encarregado(a)</div>
                  {child.parent_name}
                </div>
              </div>
            )}
            {child.parent_phone && (
              <a href={`tel:${child.parent_phone}`} className="flex items-start gap-2 hover:text-primary">
                <Phone className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div><div className="text-xs text-muted-foreground">Telefone</div>{child.parent_phone}</div>
              </a>
            )}
            {child.parent_email && (
              <a href={`mailto:${child.parent_email}`} className="flex items-start gap-2 hover:text-primary">
                <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div><div className="text-xs text-muted-foreground">E-mail</div>{child.parent_email}</div>
              </a>
            )}
          </div>

          {child.diagnosis && (
            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Diagnóstico / Encaminhamento</div>
              <div className="mt-1 text-sm whitespace-pre-wrap">{child.diagnosis}</div>
            </div>
          )}
          {child.goals && (
            <div className="mt-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Target className="h-3 w-3" /> Objetivos terapêuticos
              </div>
              <div className="mt-1 text-sm whitespace-pre-wrap">{child.goals}</div>
            </div>
          )}
          {child.notes && (
            <div className="mt-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <StickyNote className="h-3 w-3" /> Notas gerais
              </div>
              <div className="mt-1 text-sm whitespace-pre-wrap">{child.notes}</div>
            </div>
          )}
        </Card>

        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl">Sessões</h2>
          <Dialog open={addingNote} onOpenChange={setAddingNote}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" />Nova nota</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Registar sessão</DialogTitle></DialogHeader>
              <form onSubmit={submitNote} className="space-y-3">
                <div>
                  <Label htmlFor="n-date">Data</Label>
                  <Input id="n-date" type="date" value={noteDate} onChange={(e) => setNoteDate(e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="n-content">Nota da sessão</Label>
                  <Textarea id="n-content" value={noteContent} onChange={(e) => setNoteContent(e.target.value)}
                    rows={6} maxLength={4000} required autoFocus
                    placeholder="Observações, evolução, tarefas para casa…" />
                </div>
                <Button type="submit" disabled={savingNote} className="w-full">
                  {savingNote ? "A guardar…" : "Guardar nota"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {notes.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Ainda não há sessões registadas.
          </Card>
        ) : (
          <div className="space-y-2">
            {notes.map((n) => {
              const who = n.therapist_id ? (therapistNames[n.therapist_id] || "Terapeuta") : "Terapeuta";
              const canDelete = me && n.therapist_id === me;
              return (
                <Card key={n.id} className="p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium">
                        {format(parseISO(n.session_date), "d 'de' MMMM 'de' yyyy", { locale: pt })}
                      </div>
                      <div className="text-xs text-muted-foreground">{who}</div>
                    </div>
                    {canDelete && (
                      <Button size="icon" variant="ghost" onClick={() => setNoteToDelete(n)}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Eliminar nota">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="mt-2 text-sm whitespace-pre-wrap">{n.content}</div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display text-2xl">Editar ficha</DialogTitle></DialogHeader>
          <ChildForm child={child} onSaved={() => { setEditing(false); load(); }} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!noteToDelete} onOpenChange={(o) => !o && setNoteToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar nota?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteNote}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
