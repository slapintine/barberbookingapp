self.addEventListener("push", (event) => {
  let data = {
    title: "New notification",
    body: "You have a new alert.",
    url: "/",
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
      icon: "/logo192.png",
      badge: "/logo192.png",
      tag: data.tag || "general",
      data: {
        url: data.url || "/",
      },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification?.data?.url || "/";

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