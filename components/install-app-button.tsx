"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

// Botão pra instalar o PWA — sempre visível (exceto se já instalado), pra não
// depender do Chrome decidir sozinho quando oferecer o aviso automático
// (isso varia por aparelho e nem sempre acontece). Se o navegador já sinalizou
// que dá pra instalar (evento beforeinstallprompt), instala direto; senão,
// mostra o caminho manual pelo menu do Chrome.
const DARK_CLASS =
  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors w-full";

export default function InstallAppButton({ dark = false }: { dark?: boolean }) {
  const [promptEvent, setPromptEvent] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (promptEvent) {
      promptEvent.prompt();
      try {
        const { outcome } = await promptEvent.userChoice;
        if (outcome === "accepted") toast.success("App instalado!");
      } catch {}
      setPromptEvent(null);
      return;
    }
    // O Chrome ainda não sinalizou instalação automática — orienta o caminho manual.
    setShowHelp(true);
  };

  if (installed) return null;

  return (
    <>
      {dark ? (
        <button onClick={install} className={DARK_CLASS}>
          <Download className="w-5 h-5 shrink-0" /> Instalar app
        </button>
      ) : (
        <Button onClick={install} variant="outline" className="gap-1.5 text-sm h-9">
          <Download className="w-4 h-4" /> Instalar app
        </Button>
      )}

      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Como instalar</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-gray-700 space-y-3">
            <p>Toque no menu <strong>⋮</strong> no canto superior direito do Chrome.</p>
            <p>
              Escolha a opção <strong>"Instalar aplicativo"</strong> (ou{" "}
              <strong>"Adicionar à tela inicial"</strong>, dependendo do aparelho).
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
