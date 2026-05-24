
(function() {
  var sw = (typeof self !== 'undefined') ? self : undefined;
  if (!sw) {
    // Not running inside a Service Worker context.
    return;
  }

  sw.addEventListener('install', function(event) {
    sw.skipWaiting();
  });

  sw.addEventListener('activate', function(event) {
    event.waitUntil(sw.clients.claim());
  });

  // Handler klik notifikasi
  sw.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
        if (clientList.length > 0) {
          let client = clientList[0];
          if (client.focus) client.focus();
          return client;
        }
        return clients.openWindow('./');
      })
    );
  });

  sw.addEventListener('fetch', function(event) {
    // Network-first: simple behavior (no offline cache by default)
    event.respondWith(fetch(event.request).catch(function() {
      return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    }));
  });
})();
