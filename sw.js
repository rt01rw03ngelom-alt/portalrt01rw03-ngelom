// Minimal service worker for PWA shell.

const CACHE_NAME = 'portal-rt-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './clouds.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://fonts.googleapis.com/icon?family=Material+Icons'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
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
      // Jika payload dari Cloudflare/GAS terbungkus dalam properti 'payload'
      if (data.payload) data = data.payload;
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body || 'Ada informasi terbaru untuk warga.',
    icon: 'https://drive.google.com/thumbnail?id=11fh_T74_ljF_WPq7EJddDvAuFFMpiRXz&sz=w128',
    badge: 'https://drive.google.com/thumbnail?id=11fh_T74_ljF_WPq7EJddDvAuFFMpiRXz&sz=w128',
    vibrate: [100, 50, 100],
    data: {
      targetPage: data.targetPage || '',
      url: self.location.origin + (data.targetPage ? '#' + data.targetPage : '')
    },
    tag: 'portal-rt-push',
    renotify: true
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Portal RT Ngelom', options) // Judul default jika kosong
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
      let url = '/';
      if (targetPage) url += '#' + targetPage;
      if (self.clients.openWindow) return self.clients.openWindow(url);
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
