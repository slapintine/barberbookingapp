importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

const params = new URL(self.location.href).searchParams;
const firebaseConfig = {
  apiKey: params.get("apiKey") || "",
  authDomain: params.get("authDomain") || "",
  projectId: params.get("projectId") || "",
  storageBucket: params.get("storageBucket") || "",
  messagingSenderId: params.get("messagingSenderId") || "",
  appId: params.get("appId") || "",
  measurementId: params.get("measurementId") || "",
};

if (firebaseConfig.apiKey && firebaseConfig.messagingSenderId && firebaseConfig.appId) {
  try {
    firebase.initializeApp(firebaseConfig);
  } catch (error) {
    // Keep the worker alive so notificationclick handling still works.
  }

  const messaging = firebase.apps.length ? firebase.messaging() : null;

  messaging?.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || payload.data?.title || "Queless notification";
    const body = payload.notification?.body || payload.data?.body || "";
    const appBaseUrl = self.registration?.scope || new URL("/app/", self.location.origin).toString();
    const route = new URL(payload.data?.route || ".", appBaseUrl).toString();

    self.registration.showNotification(title, {
      body,
      icon: new URL("android-chrome-192x192.png", appBaseUrl).toString(),
      badge: new URL("android-chrome-192x192.png", appBaseUrl).toString(),
      tag: payload.data?.tag || payload.data?.type || "queless",
      data: { url: route },
    });
  });
}

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
      return clients.openWindow ? clients.openWindow(targetUrl) : null;
    })
  );
});
