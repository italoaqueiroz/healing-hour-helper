import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarCheck, MapPin, MousePointerClick } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Clínica · Agenda de salas terapêuticas" },
      { name: "description", content: "Agenda integrada com Google Calendar, gestão de 11 salas terapêuticas e folha de presença em um clique." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <CalendarCheck className="h-5 w-5" />
            </div>
            <span className="font-semibold tracking-tight">Clínica · Agenda</span>
          </div>
          <Link to="/auth"><Button>Entrar</Button></Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-20">
        <section className="max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">Para sua clínica</p>
          <h1 className="mt-3 text-5xl font-semibold leading-tight tracking-tight md:text-6xl">
            Agenda das salas terapêuticas, sem fricção.
          </h1>
          <p className="mt-5 text-lg text-muted-foreground">
            Sincronize com o Google Calendar, organize as 11 salas da clínica e marque a presença
            do paciente com um único clique.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/auth"><Button size="lg">Começar agora</Button></Link>
            <Link to="/agenda"><Button size="lg" variant="outline">Ver a agenda</Button></Link>
          </div>
        </section>

        <section className="mt-20 grid gap-6 md:grid-cols-3">
          <Feature icon={<CalendarCheck className="h-5 w-5" />} title="Sincronia com Google Calendar"
            text="Cada terapeuta conecta a própria conta e mantém os horários alinhados." />
          <Feature icon={<MapPin className="h-5 w-5" />} title="11 salas, visão única"
            text="Veja a ocupação por sala e por dia, com conflitos sinalizados." />
          <Feature icon={<MousePointerClick className="h-5 w-5" />} title="Presença em um clique"
            text="Compareceu, faltou ou remarcado — marcado direto no card do atendimento." />
        </section>
      </main>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-accent-foreground">{icon}</div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
