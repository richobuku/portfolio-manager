/* PRUDEV II Portfolio Management System — Service Worker */

const CACHE_NAME = 'prudev2-v1';
const OFFLINE_PAGE = '/offline.html';

// Assets to pre-cache for offline use
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/giz-logo.png',
  '/gopa-logo.png',
];

// ── Install ────────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate ───────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch (network-first, cache fallback) ──────────────────────────────────────
self.addEventListener('fetch', (event) => {
  // Skip non-GET and API calls (always go to network)
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        // Cache a copy of successful HTML/JS/CSS responses
        if (res.ok && ['document', 'script', 'style'].includes(event.request.destination)) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/index.html')))
  );
});

// ── Push Notifications ─────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'PRUDEV II', body: 'You have a new notification.', url: '/' };
  try {
    data = event.data ? event.data.json() : data;
  } catch (_) {}

  const options = {
    body: data.body || '',
    icon: '/giz-logo.png',
    badge: '/giz-logo.png',
    tag: 'prudev2-notification',
    renotify: true,
    data: { url: data.url || '/' },
    actions: [{ action: 'open', title: 'Open Dashboard' }],
  };

  event.waitUntil(self.registration.showNotification(data.title || 'PRUDEV II', options));
});

// ── Notification click ─────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(targetUrl);
          return;
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
