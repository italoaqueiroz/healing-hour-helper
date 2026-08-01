import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, CalendarCheck, CircleAlert, Loader2, MailCheck } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar · Clínica Agenda" }] }),
  component: AuthPage,
});

type AuthMode = "signin" | "signup" | "forgot" | "update-password";
type PendingAction = "email" | "google" | "reset" | null;
type Notice = { kind: "success" | "error"; message: string } | null;

async function withAuthTimeout<T>(request: Promise<T>, timeoutMs = 15000): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("O serviço de autenticação demorou demasiado. Tente novamente."));
    }, timeoutMs);
  });

  try {
    return await Promise.race([request, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function authErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (normalized.includes("email not confirmed")) return "Confirme o seu e-mail antes de entrar.";
  if (normalized.includes("user already registered")) return "Já existe uma conta com este e-mail.";
  if (normalized.includes("missing oauth secret")) {
    return "O acesso com Google ainda precisa ser concluído no Supabase.";
  }
  if (normalized.includes("rate limit")) return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";

  return message || "Não foi possível concluir. Tente novamente.";
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [pending, setPending] = useState<PendingAction>(null);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    const isRecovery =
      window.location.search.includes("recovery=1") ||
      window.location.hash.includes("type=recovery");

    if (isRecovery) setMode("update-password");

    supabase.auth.getSession().then(({ data }) => {
      if (data.session && !isRecovery) navigate({ to: "/agenda", replace: true });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("update-password");
        setNotice(null);
        return;
      }
      if (session) navigate({ to: "/agenda", replace: true });
    });

    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setPassword("");
    setConfirmPassword("");
    setNotice(null);
  }

  async function handleEmailSubmit(event: React.FormEvent) {
    event.preventDefault();
    setNotice(null);

    if (mode === "signup" && password !== confirmPassword) {
      setNotice({ kind: "error", message: "As senhas não coincidem." });
      return;
    }

    setPending("email");
    try {
      if (mode === "signup") {
        const { data, error } = await withAuthTimeout(
          supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/auth`,
              data: { full_name: fullName.trim() },
            },
          }),
        );
        if (error) throw error;

        if (data.session) {
          navigate({ to: "/agenda", replace: true });
          return;
        }

        setNotice({
          kind: "success",
          message: "Conta criada. Enviámos um e-mail para confirmar o endereço.",
        });
        return;
      }

      const { data, error } = await withAuthTimeout(
        supabase.auth.signInWithPassword({ email, password }),
      );
      if (error) throw error;
      if (data.session) navigate({ to: "/agenda", replace: true });
    } catch (error) {
      setNotice({ kind: "error", message: authErrorMessage(error) });
    } finally {
      setPending(null);
    }
  }

  async function handleGoogle() {
    setNotice(null);
    setPending("google");

    try {
      const { data, error } = await withAuthTimeout(
        supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${window.location.origin}/agenda` },
        }),
      );
      if (error) throw error;
      if (!data.url) throw new Error("Não foi possível iniciar o acesso com Google.");
      window.location.assign(data.url);
    } catch (error) {
      setNotice({ kind: "error", message: authErrorMessage(error) });
    } finally {
      setPending(null);
    }
  }

  async function handleResetRequest(event: React.FormEvent) {
    event.preventDefault();
    setNotice(null);
    setPending("reset");

    try {
      const { error } = await withAuthTimeout(
        supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth?recovery=1`,
        }),
      );
      if (error) throw error;

      setNotice({
        kind: "success",
        message: "Enviámos um link para redefinir a senha. Verifique também a pasta de spam.",
      });
    } catch (error) {
      setNotice({ kind: "error", message: authErrorMessage(error) });
    } finally {
      setPending(null);
    }
  }

  async function handlePasswordUpdate(event: React.FormEvent) {
    event.preventDefault();
    setNotice(null);

    if (password !== confirmPassword) {
      setNotice({ kind: "error", message: "As senhas não coincidem." });
      return;
    }

    setPending("reset");
    try {
      const { error } = await withAuthTimeout(supabase.auth.updateUser({ password }));
      if (error) throw error;

      window.history.replaceState(null, "", "/auth");
      navigate({ to: "/agenda", replace: true });
    } catch (error) {
      setNotice({ kind: "error", message: authErrorMessage(error) });
    } finally {
      setPending(null);
    }
  }

  const isBusy = pending !== null;
  const isPrimaryMode = mode === "signin" || mode === "signup";

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 py-8">
      <Card className="w-full max-w-md p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground">
            <CalendarCheck className="h-5 w-5" />
          </div>
          <span className="font-semibold tracking-tight">Clínica · Agenda</span>
        </div>

        {isPrimaryMode ? (
          <>
            <h1 className="text-2xl font-semibold">Aceder à agenda</h1>
            <p className="mt-1 text-sm text-muted-foreground">Entre ou crie a sua conta profissional.</p>

            <Tabs value={mode} onValueChange={(value) => changeMode(value as AuthMode)} className="mt-6">
              <TabsList className="grid w-full grid-cols-2 rounded-md">
                <TabsTrigger value="signin">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar conta</TabsTrigger>
              </TabsList>
            </Tabs>

            <Button
              type="button"
              variant="outline"
              className="mt-5 w-full"
              onClick={handleGoogle}
              disabled={isBusy}
            >
              {pending === "google" ? <Loader2 className="animate-spin" /> : <span aria-hidden="true">G</span>}
              Continuar com Google
            </Button>

            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" /> ou <div className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-4">
              {mode === "signup" && (
                <div className="space-y-2">
                  <Label htmlFor="name">Nome completo</Label>
                  <Input
                    id="name"
                    autoComplete="name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    required
                    maxLength={120}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  maxLength={255}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="password">Senha</Label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      className="text-xs font-medium text-primary hover:underline"
                      onClick={() => changeMode("forgot")}
                    >
                      Esqueci a senha
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={6}
                  maxLength={72}
                />
              </div>

              {mode === "signup" && (
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirmar senha</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                    minLength={6}
                    maxLength={72}
                  />
                </div>
              )}

              {notice && <AuthNotice notice={notice} />}

              <Button type="submit" disabled={isBusy} className="w-full">
                {pending === "email" && <Loader2 className="animate-spin" />}
                {mode === "signin" ? "Entrar" : "Criar conta"}
              </Button>
            </form>
          </>
        ) : mode === "forgot" ? (
          <>
            <BackButton onClick={() => changeMode("signin")} />
            <h1 className="mt-5 text-2xl font-semibold">Recuperar senha</h1>
            <p className="mt-1 text-sm text-muted-foreground">Receba um link seguro no seu e-mail.</p>

            <form onSubmit={handleResetRequest} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">E-mail</Label>
                <Input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  maxLength={255}
                />
              </div>
              {notice && <AuthNotice notice={notice} />}
              <Button type="submit" disabled={isBusy} className="w-full">
                {pending === "reset" ? <Loader2 className="animate-spin" /> : <MailCheck />}
                Enviar link
              </Button>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">Definir nova senha</h1>
            <p className="mt-1 text-sm text-muted-foreground">Escolha uma nova senha para a sua conta.</p>

            <form onSubmit={handlePasswordUpdate} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova senha</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={6}
                  maxLength={72}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password-confirmation">Confirmar nova senha</Label>
                <Input
                  id="new-password-confirmation"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  minLength={6}
                  maxLength={72}
                />
              </div>
              {notice && <AuthNotice notice={notice} />}
              <Button type="submit" disabled={isBusy} className="w-full">
                {pending === "reset" && <Loader2 className="animate-spin" />}
                Guardar nova senha
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}

function AuthNotice({ notice }: { notice: Exclude<Notice, null> }) {
  return (
    <Alert variant={notice.kind === "error" ? "destructive" : "default"} aria-live="polite">
      {notice.kind === "error" ? <CircleAlert /> : <MailCheck />}
      <AlertDescription>{notice.message}</AlertDescription>
    </Alert>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" className="-ml-3" onClick={onClick}>
      <ArrowLeft />
      Voltar
    </Button>
  );
}
