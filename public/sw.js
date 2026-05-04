// BuildMind Service Worker — v3
// Handles: push notifications (Android Chrome, iOS Safari 16.4+, desktop),
//          offline cache, background sync

const CACHE_NAME = "buildmind-v3";
const OFFLINE_URLS = ["/today", "/reflect", "/dashboard", "/offline.html"];

// ── Install ─────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(OFFLINE_URLS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  if (
    event.request.method !== "GET" ||
    !event.request.url.startsWith(self.location.origin)
  )
    return;

  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/"))
    return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
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

// ── Push ──────────────────────────────────────────────────────────────────────
// Cross-device behaviour:
//
// Android Chrome/Samsung/Edge: Full support. icon MUST be PNG (SVG silently drops notification).
// iOS Safari 16.4+: Requires PWA installed to home screen. No badge/actions/vibrate (silently ignored).
// macOS Safari 16+: Works from browser tab. No badge/actions (ignored).
// Desktop Chrome/Firefox/Edge: Full support including action buttons.

self.addEventListener("push", (event) => {
  let data = {
    title: "BuildMind",
    body: "Your next action is ready.",
    icon: "/logo/icon-192.png",
    badge: "/logo/icon-96.png",
    url: "/today",
    tag: "buildmind-action",
  };

  if (event.data) {
    try {
      const incoming = event.data.json();
      data = { ...data, ...incoming };
      // Force PNG — SVG icons silently kill the notification on Android Chrome
      if (data.icon && data.icon.endsWith(".svg")) data.icon = "/logo/icon-192.png";
      if (data.badge && data.badge.endsWith(".svg")) data.badge = "/logo/icon-96.png";
    } catch {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,       // Android status bar; iOS ignores silently
      tag: data.tag,
      renotify: true,
      requireInteraction: false,
      silent: false,
      vibrate: [200, 100, 200], // Android only; iOS ignores silently
      data: { url: data.url },
      actions: [               // Android/desktop; iOS ignores silently
        { action: "open", title: "Open \u2192" },
        { action: "dismiss", title: "Later" },
      ],
    })
  );
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;

  const targetUrl = event.notification.data?.url || "/today";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.focus();
            client.navigate(targetUrl);
            return;
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      })
  );
});

// ── Message ───────────────────────────────────────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
