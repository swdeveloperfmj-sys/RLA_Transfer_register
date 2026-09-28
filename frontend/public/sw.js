const CACHE_NAME = 'rla-operations-v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Cache the application shell and static Vite assets after they are first loaded.
// API requests are deliberately excluded so operational data is always current.
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    } catch {
      return (await cache.match(request)) || (request.mode === 'navigate' ? await cache.match('/') : Response.error());
    }
  })());
});

self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(self.registration.showNotification(data.title || 'RLA Operations', {
    body: data.body || 'You have a new update.',
    icon: '/logo.png',
    badge: '/logo.png',
    data: { url: data.url || '/' }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
    const appWindow = windows[0];
    if (appWindow) { await appWindow.navigate(target); return appWindow.focus(); }
    return clients.openWindow(target);
  }));
});
