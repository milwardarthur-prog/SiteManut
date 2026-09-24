"use client";

import { useEffect, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// VAPID public key vem em base64url — o navegador espera um Uint8Array.
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Botão pra ativar notificação push — some sozinho quando o navegador não
// suporta ou quando já está inscrito. Não dispara o prompt de permissão
// sozinho: só quando o usuário toca aqui (pedido do navegador do nada tende
// a ser negado sem contexto).
const DARK_CLASS =
  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors w-full";

export default function PushNotificationButton({ dark = false }: { dark?: boolean }) {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(true); // esconde até checar, evita "flash"
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const ok = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
    setSupported(ok);
    if (!ok) return;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
      } catch {
        setSubscribed(false);
      }
    })();
  }, []);

  const activate = async () => {
    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Permissão de notificação negada.");
        return;
      }
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (res.ok) {
        setSubscribed(true);
        toast.success("Notificações ativadas!");
      } else {
        toast.error("Erro ao ativar notificações.");
      }
    } catch {
      toast.error("Erro ao ativar notificações.");
    } finally {
      setLoading(false);
    }
  };

  if (!supported || subscribed) return null;

  if (dark) {
    return (
      <button onClick={activate} disabled={loading} className={DARK_CLASS}>
        {loading ? <Loader2 className="w-5 h-5 shrink-0 animate-spin" /> : <Bell className="w-5 h-5 shrink-0" />} Ativar notificações
      </button>
    );
  }

  return (
    <Button onClick={activate} disabled={loading} variant="outline" className="gap-1.5 text-sm h-9">
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />} Ativar notificações
    </Button>
  );
}
