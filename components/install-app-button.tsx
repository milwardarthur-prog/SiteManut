"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// Botão pra instalar o PWA — o Chrome às vezes não mostra (ou esconde bem)
// o aviso automático de instalação, então isso dá um jeito explícito e
// sempre visível de instalar. Só aparece quando o navegador sinaliza que dá
// pra instalar (evento beforeinstallprompt) e some depois de instalado.
export default function InstallAppButton() {
  const [promptEvent, setPromptEvent] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

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
    if (!promptEvent) return;
    promptEvent.prompt();
    try {
      const { outcome } = await promptEvent.userChoice;
      if (outcome === "accepted") toast.success("App instalado!");
    } catch {}
    setPromptEvent(null);
  };

  if (installed || !promptEvent) return null;

  return (
    <Button onClick={install} variant="outline" className="gap-1.5 text-sm h-9">
      <Download className="w-4 h-4" /> Instalar app
    </Button>
  );
}
