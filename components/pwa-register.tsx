"use client";

import { useEffect } from "react";

// Registra o service worker do PWA em qualquer página — necessário tanto pra
// instalação no Android quanto pra notificação push funcionar com o app fechado.
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return null;
}
