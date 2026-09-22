// Service Worker for Web Push notifications
// Registered from the app to handle push events and notification clicks

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = { title: "알림", body: "새 알림이 있습니다", url: "/" };
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch {
    try {
      data = { title: "알림", body: event.data ? event.data.text() : "새 알림", url: "/" };
    } catch {
      // keep defaults
    }
  }

  const notification = data.notification ?? data;
  const title = notification.title ?? "알림";
  const options = {
    body: notification.body ?? "",
    icon: notification.icon ?? "/icon.webp",
    badge: notification.badge ?? "/icon.webp",
    data: notification.data ?? { url: "/" },
    vibrate: notification.vibrate ?? [200, 100, 200],
    requireInteraction: notification.requireInteraction ?? false,
    silent: notification.silent ?? false,
  };

  event.waitUntil(
    self.registration.showNotification(title, options),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus existing tab if one is already open
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      // Open a new tab
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return Promise.resolve();
    }),
  );
});
