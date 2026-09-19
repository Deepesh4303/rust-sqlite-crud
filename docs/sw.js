// Service Worker for Retro Clinic PWA
const CACHE_NAME = 'retro-clinic-v2';
const LOCAL_ASSETS = [
  './index.html',
  './style.css',
  './app.js',
  './trie.js',
  './db-worker.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

const REMOTE_ASSETS = [
  'https://cdn.jsdelivr.net/npm/@sqlite.org/sqlite-wasm@3.46.1-build1/sqlite-wasm/jswasm/sqlite3.js',
  'https://cdn.jsdelivr.net/npm/@sqlite.org/sqlite-wasm@3.46.1-build1/sqlite-wasm/jswasm/sqlite3.wasm'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[SW] Caching local assets');
      // Cache local assets first
      for (const asset of LOCAL_ASSETS) {
        try {
          await cache.add(asset);
        } catch (e) {
          console.warn(`[SW] Failed to cache local asset: ${asset}`, e);
        }
      }
      // Also try caching root
      try {
        await cache.add('./');
      } catch (e) {}

      // Cache remote CDN assets in background
      for (const asset of REMOTE_ASSETS) {
        try {
          await cache.add(asset);
        } catch (e) {
          console.warn(`[SW] Failed to pre-cache remote asset: ${asset}`, e);
        }
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // Fallback to index.html if navigating offline
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
