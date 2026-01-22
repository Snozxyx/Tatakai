/* eslint-disable no-restricted-globals */
// Service Worker for PWA offline support

const CACHE_NAME = 'tatakai-v1';
const RUNTIME_CACHE = 'tatakai-runtime-v1';

// Assets to cache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/tatakai-logo-square.png',
];

// Install event - cache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE)
          .map((name) => caches.delete(name))
      );
    })
  );
  return self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip external domains (API calls, images from CDN, etc.)
  if (url.origin !== self.location.origin) {
    return;
  }

  // Cache strategy: Network first, fallback to cache
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Clone the response
        const responseToCache = response.clone();

        // Cache successful responses
        if (response.status === 200) {
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseToCache);
          });
        }

        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }

          // Return offline page if available
          if (request.destination === 'document') {
            return caches.match('/index.html');
          }

          // Return a basic response for other requests
          return new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable',
          });
        });
      })
  );
});

// Background sync for watch progress
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-watch-progress') {
    event.waitUntil(syncWatchProgress());
  }
});

async function syncWatchProgress() {
  try {
    // Get pending progress from IndexedDB
    const db = await openDB();
    const pending = await db.getAll('pending-progress');

    for (const item of pending) {
      try {
        // Try to sync
        const response = await fetch('/api/watch-progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.data),
        });

        if (response.ok) {
          // Remove from pending
          await db.delete('pending-progress', item.id);
        }
      } catch (error) {
        console.error('Failed to sync progress:', error);
      }
    }
  } catch (error) {
    console.error('Sync error:', error);
  }
}

// Helper to open IndexedDB
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('tatakai-db', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pending-progress')) {
        db.createObjectStore('pending-progress', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}
