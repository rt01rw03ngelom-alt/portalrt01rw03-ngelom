// Minimal service worker for PWA shell.
// Note: Apps Script deployments may not support full SW scope/caching.
// Ensure SW context is available
// Avoid referencing `self` directly at parse-time (some runtimes may not define it).
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

  // Handler untuk menerima pesan "Push" dari server saat HP terkunci
  sw.addEventListener('push', function(event) {
    let data = { 
      title: 'Portal RT Ngelom', 
      body: 'Ada informasi terbaru untuk warga.',
      url: './'
    };

    if (event.data) {
      try {
        data = event.data.json();
      } catch (e) {
        data.body = event.data.text();
      }
    }

    const options = {
      body: data.body,
      icon: 'https://drive.google.com/thumbnail?id=11fh_T74_ljF_WPq7EJddDvAuFFMpiRXz&sz=w128',
      badge: 'https://drive.google.com/thumbnail?id=11fh_T74_ljF_WPq7EJddDvAuFFMpiRXz&sz=w128',
      vibrate: [200, 100, 200],
      data: { url: data.url || './' },
      tag: 'portal-rt-push', // Mencegah penumpukan notifikasi yang sama
      renotify: true
    };

    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  });

  // Handler klik notifikasi
  sw.addEventListener('notificationclick', function(event) {
    event.notification.close();
    // Ambil data targetPage jika ada
    const targetPage = (event.notification.data && event.notification.data.targetPage) ? event.notification.data.targetPage : '';
    
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
        if (clientList.length > 0) {
          let client = clientList[0];
          if (client.focus) client.focus();
          // Kirim pesan ke Index.html untuk navigasi ke halaman spesifik
          if (targetPage) client.postMessage({ action: 'navigate', page: targetPage });
          return;
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
