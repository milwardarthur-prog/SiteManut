// Service worker do PWA — só o necessário pra instalação no Android e pra
// notificação push funcionar mesmo com o app fechado. Sem cache/offline por
// enquanto.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "BeltLoc", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "BeltLoc";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/os" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Ao tocar na notificação, foca uma aba já aberta na OS (se houver) ou abre uma nova.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/os";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
