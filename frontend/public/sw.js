// BuildMind Service Worker — v1
// Handles: push notifications, offline cache, background sync
// Drop this file at: frontend/public/sw.js

const CACHE_NAME = "buildmind-v1";
const OFFLINE_URLS = ["/today", "/reflect", "/dashboard", "/offline.html"];

// ── Install: pre-cache key pages ───────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(OFFLINE_URLS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ─────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch: network-first with offline fallback ─────────────────────────────
self.addEventListener("fetch", (event) => {
  // Only handle GET requests for same-origin pages
  if (
    event.request.method !== "GET" ||
    !event.request.url.startsWith(self.location.origin)
  )
    return;

  // Skip API calls and Next.js internals
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/"))
    return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful navigation responses
        if (response.ok && event.request.mode === "navigate") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches
          .match(event.request)
          .then((cached) => cached || caches.match("/offline.html"))
      )
  );
});

// ── Push: receive server push and show notification ────────────────────────
self.addEventListener("push", (event) => {
  let data = {
    title: "BuildMind",
    body: "Your next action is ready.",
    icon: "/logo/buildmind-favicon.svg",
    badge: "/logo/buildmind-favicon.svg",
    url: "/today",
    tag: "buildmind-action",
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    renotify: true,
    requireInteraction: false,
    silent: false,
    vibrate: [200, 100, 200],
    data: { url: data.url },
    actions: [
      { action: "open", title: "Open →" },
      { action: "dismiss", title: "Later" },
    ],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// ── Notification click: focus or open the app ─────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const targetUrl =
    event.notification.data?.url || "/today";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Focus existing window if open
        for (const client of clients) {
          if (
            client.url.includes(self.location.origin) &&
            "focus" in client
          ) {
            client.focus();
            client.navigate(targetUrl);
            return;
          }
        }
        // Otherwise open new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

// ── Message: allow page to trigger push permission re-prompt ──────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
