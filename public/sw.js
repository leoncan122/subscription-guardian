/* eslint-disable no-undef */
const CACHE_NAME = "subscription-guardian-v1";
const DATA_CACHE = "api-cache-v1";
const RUNTIME_CACHE = "runtime-v1";

// Install event — cache essential shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        "/",
        "/manifest.json",
        "/sw.js",
      ]);
    })
  );
  self.skipWaiting();
});

// Activate event — clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== DATA_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch event — network first for API, cache first for static
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API routes: network first with stale-while-revalidate
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(DATA_CACHE).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Static assets: cache first, then network
  event.respondWith(
    caches.match(request).then((cached) => {
      return (
        cached ||
        fetch(request).then((response) => {
          if (response.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
      );
    })
  );
});

// Push notification handler
self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    data = event.data.json();
  }

  const title = data.title || "Subscription Guardian";
  const options = {
    body: data.body || "You have a new reminder!",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [200, 100, 200],
    data: data.data || { url: "/" },
    actions: data.actions || [
      { action: "view", title: "View" },
      { action: "close", title: "Dismiss" },
    ],
    tag: data.tag || "subscription-reminder",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click handler
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "close") return;

  const urlToOpen = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus existing window
      for (const client of clientList) {
        if ("focus" in client && client.url.includes(urlToOpen)) {
          return client.focus();
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
