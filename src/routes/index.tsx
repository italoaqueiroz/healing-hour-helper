import { createFileRoute, Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import logoAsset from "@/assets/logo-fio-ariana.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Agenda · Fio de Ariana" },
      { name: "description", content: "Agenda interna das salas terapêuticas do Fio de Ariana." },
    ],
  }),
  component: Landing,
});

const QUOTES: { text: string; author: string }[] = [
  { text: "Conhece-te a ti mesmo.", author: "Sócrates" },
  { text: "Só sei que nada sei.", author: "Sócrates" },
  { text: "Não és aquilo que te acontece, és aquilo que escolhes ser.", author: "Carl Jung" },
  { text: "O que não te mata torna-te mais forte.", author: "Friedrich Nietzsche" },
  { text: "A vida é o que fazemos dela. As viagens são os viajantes. O que vemos não é o que vemos, senão o que somos.", author: "Fernando Pessoa" },
  { text: "Penso, logo existo.", author: "René Descartes" },
  { text: "Tudo o que somos é o resultado do que pensamos.", author: "Buda" },
  { text: "A felicidade depende de nós mesmos.", author: "Aristóteles" },
  { text: "Não há vento favorável para o marinheiro que não sabe onde ir.", author: "Séneca" },
  { text: "O homem é a medida de todas as coisas.", author: "Protágoras" },
  { text: "A vida só pode ser compreendida olhando-se para trás, mas só pode ser vivida olhando-se para a frente.", author: "Søren Kierkegaard" },
  { text: "Aquele que tem um porquê para viver pode suportar quase qualquer como.", author: "Friedrich Nietzsche" },
  { text: "A maior glória em viver não está em nunca cair, mas em levantar-se cada vez que caímos.", author: "Nelson Mandela" },
  { text: "Onde há amor, há vida.", author: "Mahatma Gandhi" },
];

function todaysQuote() {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const diff = Date.now() - start.getTime();
  const day = Math.floor(diff / 86400000);
  return QUOTES[day % QUOTES.length];
}

function Landing() {
  const [open, setOpen] = useState(false);
  const quote = todaysQuote();

  const navItems = [
    { label: "Agenda", to: "/agenda" },
    { label: "Entrar", to: "/auth" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <img src={logoAsset.url} alt="Fio de Ariana" className="h-10 w-auto shrink-0" />
            <span className="truncate font-display text-lg font-semibold tracking-tight sm:text-xl">
              Agenda · Fio de Ariana
            </span>
          </Link>

          <nav className="hidden items-center gap-2 sm:flex">
            {navItems.map((i) => (
              <Link key={i.to} to={i.to}>
                <Button variant={i.label === "Entrar" ? "default" : "ghost"}>{i.label}</Button>
              </Link>
            ))}
          </nav>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild className="sm:hidden">
              <Button variant="ghost" size="icon" aria-label="Abrir menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <div className="mt-8 flex flex-col gap-2">
                {navItems.map((i) => (
                  <Link key={i.to} to={i.to} onClick={() => setOpen(false)}>
                    <Button variant="ghost" className="w-full justify-start text-base">
                      {i.label}
                    </Button>
                  </Link>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="mx-auto flex max-w-4xl flex-col items-center px-6 py-24 text-center sm:py-32">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
          Pensamento do dia
        </p>
        <blockquote className="mt-8">
          <p className="font-display text-3xl font-semibold leading-snug text-foreground sm:text-5xl">
            “{quote.text}”
          </p>
          <footer className="mt-6 text-base font-semibold text-muted-foreground sm:text-lg">
            — {quote.author}
          </footer>
        </blockquote>

        <div className="mt-14">
          <Link to="/agenda">
            <Button size="lg" className="font-semibold">Abrir a agenda</Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
