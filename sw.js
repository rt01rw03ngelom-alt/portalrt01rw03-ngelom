// Minimal service worker for PWA shell.
// Note: Apps Script deployments may not support full SW scope/caching.
// Ensure SW context is available
// Avoid referencing `self` directly at parse-time (some runtimes may not define it).
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handler untuk menerima sinyal "Push" dari server (Bekerja saat aplikasi ditutup)
self.addEventListener('push', (event) => {
  let data = {
    title: 'Portal RT Ngelom',
    body: 'Ada informasi terbaru untuk warga.',
    targetPage: ''
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
    data: {
      targetPage: data.targetPage || ''
    },
    tag: 'portal-rt-push',
    renotify: true
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handler klik notifikasi
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notificationData = event.notification.data;
  const targetPage = notificationData.targetPage || '';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Jika aplikasi sudah terbuka, fokus dan navigasi
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          if (targetPage) {
            client.postMessage({ action: 'navigate', page: targetPage });
          }
          return client.focus();
        }
      }
      // Jika belum terbuka, buka jendela baru dengan hash halaman tujuan
      let destination = './';
      if (targetPage) destination += '#' + targetPage;
      if (self.clients.openWindow) return self.clients.openWindow(destination);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    })
  );
});
