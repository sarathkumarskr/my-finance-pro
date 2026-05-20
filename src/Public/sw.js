// ============================================================
// My Finance Pro — Service Worker v3
// ============================================================

const CACHE_NAME = 'mfp-v3';
const STATIC_CACHE = 'mfp-static-v3';
const DYNAMIC_CACHE = 'mfp-dynamic-v3';

// Core assets to pre-cache
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/maskable-icon-512x512.png',
];

// Domains to never cache
const BYPASS_DOMAINS = [
  'firebase',
  'google',
  'googleapis',
  'gstatic',
  'firebaseapp',
  'firebaseio',
];

// ============================================================
// INSTALL — Pre-cache core assets
// ============================================================
self.addEventListener('install', (event) => {
  console.log('[SW v3] Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW v3] Pre-caching assets...');
        // Use individual adds to prevent one failure killing all
        return Promise.allSettled(
          PRECACHE_ASSETS.map((url) =>
            cache.add(url).catch((err) => {
              console.warn('[SW v3] Failed to cache:', url, err);
            })
          )
        );
      })
      .then(() => {
        console.log('[SW v3] Install complete');
        return self.skipWaiting();
      })
  );
});

// ============================================================
// ACTIVATE — Clean old caches
// ============================================================
self.addEventListener('activate', (event) => {
  console.log('[SW v3] Activating...');
  
  const validCaches = [STATIC_CACHE, DYNAMIC_CACHE];
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => !validCaches.includes(name))
            .map((name) => {
              console.log('[SW v3] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW v3] Activation complete');
        return self.clients.claim();
      })
  );
});

// ============================================================
// FETCH — Smart caching strategy
// ============================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip Firebase/Google API calls — always fresh
  if (BYPASS_DOMAINS.some((domain) => url.hostname.includes(domain))) {
    return;
  }

  // Skip chrome extensions
  if (url.protocol === 'chrome-extension:') return;

  // ── Navigation requests (HTML pages) ──
  // Network first → fallback to cached index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache fresh copy
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => {
            cache.put(request, clone);
          });
          return response;
        })
        .catch(() => {
          // Offline → serve cached index.html
          return caches.match('/index.html').then((cached) => {
            return cached || new Response(
              '<h1>Offline</h1><p>Please check your connection.</p>',
              { headers: { 'Content-Type': 'text/html' } }
            );
          });
        })
    );
    return;
  }

  // ── Static assets (JS, CSS, fonts, icons) ──
  // Cache first → network fallback
  if (
    url.pathname.match(/\.(js|css|woff2?|ttf|otf|png|jpg|jpeg|svg|webp|ico)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;

        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(request, clone);
            });
          }
          return response;
        }).catch(() => {
          // Return placeholder for failed image loads
          if (url.pathname.match(/\.(png|jpg|jpeg|svg|webp)$/)) {
            return new Response(
              '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#1a1f2e"/></svg>',
              { headers: { 'Content-Type': 'image/svg+xml' } }
            );
          }
        });
      })
    );
    return;
  }

  // ── Everything else ──
  // Network first with dynamic cache
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, clone);
          });
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// ============================================================
// MESSAGE — Handle skip waiting from app
// ============================================================
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    console.log('[SW v3] Skip waiting triggered');
    self.skipWaiting();
  }
});