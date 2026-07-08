import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";

const DISMISS_KEY = "ios_install_dismissed_v1";

export function IosInstallBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Already installed / standalone
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS Safari
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const ua = window.navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
    if (!isIOS) return;

    if (localStorage.getItem(DISMISS_KEY)) return;
    // slight delay so it doesn't compete with page load
    const t = setTimeout(() => setShow(true), 1200);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-16 z-40 mx-auto max-w-md px-3 pb-[env(safe-area-inset-bottom)]">
      <div className="rounded-xl border border-border bg-card shadow-lg p-3 flex items-start gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary shrink-0">
          <Share className="h-4 w-4" />
        </div>
        <div className="text-xs leading-snug flex-1 min-w-0">
          <div className="font-medium mb-0.5">Instalar na ecrã principal</div>
          <div className="text-muted-foreground">
            Toca em <Share className="inline h-3 w-3 align-[-2px]" /> <span className="font-medium">Partilhar</span> e depois em <span className="font-medium">"Adicionar à Ecrã Principal"</span>.
          </div>
        </div>
        <button
          onClick={() => { localStorage.setItem(DISMISS_KEY, "1"); setShow(false); }}
          className="text-muted-foreground hover:text-foreground shrink-0"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
