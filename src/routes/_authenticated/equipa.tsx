import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Trash2,
  ShieldCheck,
  ShieldOff,
  UserPlus,
  Mail,
  Pencil,
  Baby,
  UserCheck,
  UserX,
} from "lucide-react";
import {
  listTeam,
  deleteTeamMember,
  setAdminRole,
  setPiRole,
  inviteTeamMember,
  updateTeamMemberName,
  type TeamMember,
  setTeamMemberApproval,
} from "@/lib/team.functions";

export const Route = createFileRoute("/_authenticated/equipa")({
  head: () => ({ meta: [{ title: "Equipa · O Fio de Ariana" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .eq("role", "admin");
    if (!roles || roles.length === 0) throw redirect({ to: "/agenda" });
  },
  component: EquipaPage,
});

function EquipaPage() {
  const fetchList = useServerFn(listTeam);
  const doDelete = useServerFn(deleteTeamMember);
  const doSetAdmin = useServerFn(setAdminRole);
  const doSetPi = useServerFn(setPiRole);
  const doInvite = useServerFn(inviteTeamMember);
  const doRename = useServerFn(updateTeamMemberName);
  const doSetApproval = useServerFn(setTeamMemberApproval);

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<TeamMember | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const rows = await fetchList();
      setMembers(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha a carregar equipa");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
    load();
  }, []);

  async function toggleAdmin(m: TeamMember) {
    setBusy(true);
    try {
      await doSetAdmin({ data: { userId: m.id, makeAdmin: !m.is_admin } });
      toast.success(m.is_admin ? "Cargo Admin removido" : "Agora é Admin (Secretaria)");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha a alterar cargo");
    } finally {
      setBusy(false);
    }
  }

  async function toggleApproval(m: TeamMember) {
    setBusy(true);
    try {
      await doSetApproval({ data: { userId: m.id, approved: !m.approved } });
      toast.success(m.approved ? "Acesso suspenso" : "Acesso aprovado");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao alterar aprovação");
    } finally {
      setBusy(false);
    }
  }

  async function togglePi(m: TeamMember) {
    setBusy(true);
    try {
      await doSetPi({ data: { userId: m.id, enable: !m.is_pi } });
      toast.success(m.is_pi ? "Acesso ProInfância removido" : "Acesso ProInfância dado");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha a alterar cargo");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setBusy(true);
    try {
      const result = await doDelete({ data: { userId: toDelete.id } });
      if (!result.ok) throw new Error(result.error || "Não foi possível remover o acesso.");
      toast.success("Utilizador removido");
      setToDelete(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha a eliminar");
    } finally {
      setBusy(false);
    }
  }

  async function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await doInvite({
        data: { email: inviteEmail.trim(), fullName: inviteName.trim() || undefined },
      });
      if (!result.ok) throw new Error(result.error || "Não foi possível enviar o convite.");
      toast.success("Convite do site enviado por e-mail");
      setInviteOpen(false);
      setInviteEmail("");
      setInviteName("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao convidar");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(m: TeamMember) {
    setEditing(m);
    setEditName(m.full_name || "");
  }

  async function submitRename(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      await doRename({ data: { userId: editing.id, fullName: editName.trim() } });
      toast.success("Nome atualizado");
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha a renomear");
    } finally {
      setBusy(false);
    }
  }

  function roleLabel(m: TeamMember): string {
    if (m.is_admin) return "Secretaria (Admin)";
    if (m.is_pi) return "Terapeuta + ProInfância";
    return "Terapeuta";
  }

  return (
    <AppShell
      title="Equipa"
      subtitle="Gerir acessos e cargos"
      actions={
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <UserPlus className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Convidar</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">Convidar terapeuta</DialogTitle>
            </DialogHeader>
            <form onSubmit={submitInvite} className="space-y-3">
              <div>
                <Label htmlFor="inv-email">E-mail</Label>
                <Input
                  id="inv-email"
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="pessoa@exemplo.pt"
                />
              </div>
              <div>
                <Label htmlFor="inv-name">Nome (opcional)</Label>
                <Input
                  id="inv-name"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  maxLength={120}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                A pessoa recebe um convite para a Agenda e já entra aprovada. Depois, atribui-lhe os
                cargos aqui.
              </p>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setInviteOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "A enviar..." : "Enviar convite"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="p-3 sm:p-5 max-w-3xl mx-auto space-y-3">
        <Card className="p-3 text-xs text-muted-foreground bg-muted/30">
          <div className="font-semibold text-foreground mb-1">Cargos disponíveis</div>
          <ul className="space-y-0.5">
            <li>
              • <strong className="text-foreground">Terapeuta</strong> — vê agenda e contactos.
            </li>
            <li>
              • <strong className="text-foreground">Terapeuta + ProInfância</strong> — vê também o
              módulo ProInfância e os contactos ProInfância.
            </li>
            <li>
              • <strong className="text-foreground">Secretaria (Admin)</strong> — vê e gere tudo
              (inclui esta página).
            </li>
          </ul>
        </Card>

        {loading && <div className="text-sm text-muted-foreground">A carregar…</div>}
        {!loading && members.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">Sem membros ainda.</Card>
        )}
        <div className="space-y-2">
          {members.map((m) => (
            <Card key={m.id} className="p-3 sm:p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-medium truncate">
                      {m.full_name || m.email || "Sem nome"}
                    </div>
                    {m.id === me && (
                      <Badge variant="outline" className="text-[10px]">
                        Tu
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                    <Mail className="h-3 w-3 shrink-0" />
                    {m.email || "—"}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                    <Badge variant={m.is_admin ? "default" : "secondary"} className="text-[10px]">
                      {roleLabel(m)}
                    </Badge>
                    <Badge variant={m.approved ? "outline" : "destructive"} className="text-[10px]">
                      {m.approved ? "Aprovado" : "Aguardando aprovação"}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {m.last_sign_in_at
                      ? `Último acesso: ${new Date(m.last_sign_in_at).toLocaleDateString("pt-PT")}`
                      : "Ainda não entrou"}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => toggleApproval(m)}
                    title={m.approved ? "Suspender acesso" : "Aprovar acesso"}
                  >
                    {m.approved ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => startEdit(m)}
                    title="Editar nome"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => togglePi(m)}
                    title={m.is_pi ? "Remover acesso ProInfância" : "Dar acesso ProInfância"}
                    className={m.is_pi ? "text-primary" : ""}
                  >
                    <Baby className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy || m.id === me}
                    onClick={() => toggleAdmin(m)}
                    title={m.is_admin ? "Remover Admin" : "Tornar Admin (Secretaria)"}
                  >
                    {m.is_admin ? (
                      <ShieldOff className="h-4 w-4" />
                    ) : (
                      <ShieldCheck className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy || m.id === me}
                    onClick={() => setToDelete(m)}
                    title="Remover acesso"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar nome</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitRename} className="space-y-3">
            <div>
              <Label htmlFor="edit-name">Nome completo</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={120}
                required
                autoFocus
              />
            </div>
            <div className="text-xs text-muted-foreground">
              O nome aparece na agenda, relatórios e cartões desta pessoa.
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "A guardar…" : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover acesso?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete?.full_name || toDelete?.email} deixará de conseguir entrar. Os dados criados
              por esta pessoa permanecem. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? "A remover..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
