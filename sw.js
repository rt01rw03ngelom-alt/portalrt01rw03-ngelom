// Minimal service worker for PWA shell.

const VERSION = '1.2.0'; // Tingkatkan versi ini setiap kali update
const CACHE_NAME = `portal-rt-v${VERSION}`;
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
  console.log(`[Service Worker] Installing version ${VERSION}...`);
  event.waitUntil(
    customCacheAll(CACHE_NAME, ASSETS_TO_CACHE).then(() => {
      console.log('[Service Worker] Install complete.');
      return self.skipWaiting(); // Paksa versi baru aktif segera
    })
  );
});

self.addEventListener('activate', (event) => {
  console.log(`[Service Worker] Activated version ${VERSION}`);
  event.waitUntil(self.clients.claim());
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
  // Strategy: Cache First, then Network, with Offline Fallback for navigation (Point 3)
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      // If found in cache, return it immediately
      if (cachedResponse) {
        return cachedResponse;
      }

      // If not in cache, try to fetch from the network
      return fetch(event.request)
        .then(networkResponse => {
          // If network request is successful, cache it for future use and return
          if (networkResponse.ok && event.request.method === 'GET') { // Only cache GET requests
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // If network fetch fails (e.g., offline)
          // For navigation requests (HTML pages), serve the offline fallback page
          if (event.request.mode === 'navigate' || (event.request.method === 'GET' && event.request.headers.get('accept').includes('text/html'))) {
            return caches.match('./offline.html');
          }
          // For other types of requests (images, scripts, etc.),
          // it's generally better to let them fail or return a specific placeholder
          // rather than a generic offline page.
          console.warn(`[Service Worker] Network request failed for ${event.request.url}. Not found in cache.`);
          return new Response(null, { status: 503, statusText: 'Service Unavailable (Offline)' }); // Generic error response
        });
    })
  );
});
