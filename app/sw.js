const CACHE='job-match-shell-v3';
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/','/index.html','/styles.css','/app.js?v=3','/manifest.webmanifest','/icon.svg']))));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request))));
self.addEventListener('push', event => { const payload = event.data?.json() || {}; event.waitUntil(self.registration.showNotification(payload.title || 'Job Match', { body: payload.body || '', icon: '/icon.svg', data: { url: payload.url || '/' } })); });
self.addEventListener('notificationclick', event => { event.notification.close(); event.waitUntil(clients.openWindow(event.notification.data?.url || '/')); });
