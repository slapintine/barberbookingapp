self.addEventListener("push", (event) => {
  const appBaseUrl = self.registration?.scope || new URL("/app/", self.location.origin).toString();
  let data = {
    title: "New notification",
    body: "You have a new alert.",
    url: appBaseUrl,
    tag: "general",
  };

  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch (error) {
    // ignore malformed push payloads
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: new URL("android-chrome-192x192.png", appBaseUrl).toString(),
      badge: new URL("android-chrome-192x192.png", appBaseUrl).toString(),
      tag: data.tag || "general",
      data: {
        url: new URL(data.url || ".", appBaseUrl).toString(),
      },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const appBaseUrl = self.registration?.scope || new URL("/app/", self.location.origin).toString();
  const targetUrl = new URL(event.notification?.data?.url || ".", appBaseUrl).toString();

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }

      return null;
    })
  );
});
