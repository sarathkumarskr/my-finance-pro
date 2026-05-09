// My Finance Pro — Service Worker
const CACHE_NAME = 'myfinancepro-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
];

// Install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch — Network First, Cache Fallback
self.addEventListener('fetch', (event) => {
  // Skip non-GET & chrome-extension requests
  if (
    event.request.method !== 'GET' ||
    event.request.url.startsWith('chrome-extension')
  ) return;

  // Skip Firebase/Google Auth requests — never cache
  if (
    event.request.url.includes('firestore.googleapis.com') ||
    event.request.url.includes('googleapis.com') ||
    event.request.url.includes('firebase') ||
    event.request.url.includes('accounts.google.com')
  ) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache
        return caches.match(event.request).then((cached) => {
          return cached || caches.match('/index.html');
        });
      })
  );
});