self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = { body: event.data?.text() || "Há uma nova atualização na agenda." };
  }

  const title = payload.title || "Agenda d'O Fio";
  const options = {
    body: payload.body || "Há uma nova atualização na agenda.",
    icon: "/pwa-icon-512.png",
    badge: "/pwa-icon-512.png",
    tag: payload.tag || "agenda-update",
    renotify: true,
    silent: false,
    vibrate: [250, 100, 250],
    data: { url: payload.url || "/agenda" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/agenda", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url.startsWith(self.location.origin));
      if (existing) {
        existing.navigate(targetUrl);
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
