// Minimal service worker for PWA shell.

const APP_VERSION = '1.2.3'; // Tingkatkan versi ini setiap kali update
const CACHE_NAME = `rt-cache-v${APP_VERSION}`;

// Daftar asset yang akan di-cache sebagai app shell
const ASSETS_TO_CACHE = [
  './', // Root path
  './index.html', // Main application shell
  './manifest.json', // PWA manifest
  './offline.html', // Offline fallback page (NEW)
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap', // Google Fonts CSS
  'https://fonts.googleapis.com/icon?family=Material+Icons' // Material Icons CSS
];

// Helper untuk membaca Token dari IndexedDB (karena SW tidak bisa akses localStorage)
async function getAuthTokenFromIDB() {
  return new Promise((resolve) => {
    const request = indexedDB.open('AuthDB', 1);
    request.onupgradeneeded = (e) => {
      e.target.result.createObjectStore('session', { keyPath: 'id' });
    };
    request.onsuccess = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('session')) {
        resolve(null); return;
      }
      const transaction = db.transaction('session', 'readonly');
      const store = transaction.objectStore('session');
      const getRequest = store.get('currentToken');
      getRequest.onsuccess = () => resolve(getRequest.result ? getRequest.result.token : null);
      getRequest.onerror = () => resolve(null);
    };
    request.onerror = () => resolve(null);
  });
}

// Helper function for resilient caching
async function customCacheAll(cacheName, urls) {
  const cache = await caches.open(cacheName);
  
  // Mengunduh aset satu per satu secara independen
  const promises = urls.map(url => 
    fetch(url)
      .then(response => {
        if (!response.ok) throw new Error(`Offline storage error: ${response.status}`);
        return cache.put(url, response);
      })
      .catch(err => {
        // Laporkan error ke konsol, tapi jangan hentikan proses instalasi
        console.warn(`[Service Worker] Skipping cache for: ${url} - Reason: ${err.message}`);
        return Promise.resolve(); 
      })
  );

  return Promise.all(promises);
}

self.addEventListener('install', (event) => {
  console.log(`[Service Worker] Installing version ${APP_VERSION}...`);

  event.waitUntil(
    customCacheAll(CACHE_NAME, ASSETS_TO_CACHE).then(() => {
      console.log('[Service Worker] Install complete.');
      return self.skipWaiting(); // Paksa versi baru aktif segera
    })
  );
});

self.addEventListener('activate', (event) => {
  console.log(`[Service Worker] Activated version ${APP_VERSION}`);

  event.waitUntil((async () => {
    // Aggressive eviction: hapus semua cache selain CACHE_NAME saat versi berubah
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => {
        if (k !== CACHE_NAME) {
          return caches.delete(k);
        }
        return Promise.resolve();
      }));
    } catch (e) {
      console.warn('[Service Worker] Failed to clean old caches:', e);
    }

    // Paksa SW baru langsung ambil alih semua tab
    await self.clients.claim();
  })());
});


// Handler untuk menerima sinyal "Push" dari server (Bekerja saat aplikasi ditutup)
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    try {
      let data = {
        title: 'Portal RT Ngelom',
        body: 'Ada informasi terbaru untuk warga.',
        targetPage: ''
      };

      // Parsing payload JSON dari Push Service
      if (event.data) {
        const payload = event.data.json();
        data = payload.payload || payload;
      }

      const targetPage = data.targetPage || '';
      
      const options = {
        body: data.body || 'Ketuk untuk melihat informasi terbaru.',
        icon: 'https://drive.google.com/thumbnail?id=11fh_T74_ljF_WPq7EJddDvAuFFMpiRXz&sz=w128',
        badge: 'https://drive.google.com/thumbnail?id=11fh_T74_ljF_WPq7EJddDvAuFFMpiRXz&sz=w128',
        vibrate: [200, 100, 200],
        timestamp: Date.now(),
        data: {
          // Deep Linking: Gunakan query param agar tidak hilang saat auto-login di frontend
          url: `${self.location.origin}${self.location.pathname}?redirect=${targetPage}#${targetPage}`
        },
        tag: 'portal-rt-push', // Mencegah duplikasi notifikasi dengan topik sama
        renotify: true
      };

      return self.registration.showNotification(data.title || 'Portal RT Ngelom', options);
    } catch (error) {
      console.error('[SW] Push processing failed:', error);
      // Fallback notifikasi jika payload rusak
      return self.registration.showNotification('Portal RT Ngelom', {
        body: 'Ada pembaruan informasi untuk Anda.'
      });
    }
  })());
});

// Handler klik notifikasi
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data.url;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Force Cache Invalidation on version mismatch is handled by CACHE_NAME versioning.
  // Strategy: Cache First, then Network.

  // Strategy: Cache First, then Network, with Offline Fallback for navigation (Point 3)
event.respondWith((async () => {
    const req = event.request;
    const url = new URL(req.url);

    // Untuk navigasi/HTML: gunakan network-first agar web/desktop tidak stuck versi lama
    const isNavigation = req.mode === 'navigate' || (req.method === 'GET' && req.headers.get('accept') && req.headers.get('accept').includes('text/html'));
    if (isNavigation) {
      try {
        const networkResponse = await fetch(req);
        if (networkResponse && networkResponse.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(req, networkResponse.clone());
        }
        return networkResponse;
      } catch (e) {
        const cached = await caches.match(req);
        if (cached) return cached;
        return caches.match('./offline.html');
      }
    }

    // Selain navigasi: cache-first (performa)
    const cachedResponse = await caches.match(req);
    if (cachedResponse) return cachedResponse;

    try {
      const networkResponse = await fetch(req);
      if (networkResponse && networkResponse.ok && req.method === 'GET') {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(req, networkResponse.clone());
      }
      return networkResponse;
    } catch (e) {
      console.warn(`[Service Worker] Network request failed for ${req.url}. Not found in cache.`);
      if (url.pathname.endsWith('.html') || isNavigation) {
        return caches.match('./offline.html');
      }
      return new Response(null, { status: 503, statusText: 'Service Unavailable (Offline)' });
    }
  })());
});
