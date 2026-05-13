// ============================================================
// My Finance Pro — Service Worker 2025
// Strategy: Cache First for assets, Network First for API/Firestore
// ============================================================

const APP_VERSION = 'v1.0.0';
const CACHE_STATIC = `mfp-static-${APP_VERSION}`;
const CACHE_DYNAMIC = `mfp-dynamic-${APP_VERSION}`;
const CACHE_IMAGES = `mfp-images-${APP_VERSION}`;

// Static assets to pre-cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png',
];

// URLs that should NEVER be cached (Firebase Auth, Firestore)
const NEVER_CACHE = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'accounts.google.com',
  'firebase.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'fcmregistrations.googleapis.com',
];

// ============================================================
// INSTALL — Pre-cache static assets
// ============================================================
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...', APP_VERSION);
  event.waitUntil(
    caches
      .open(CACHE_STATIC)
      .then((cache) => {
        console.log('[SW] Pre-caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        // Force new SW to activate immediately
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] Pre-cache failed:', err);
      })
  );
});

// ============================================================
// ACTIVATE — Clean old caches
// ============================================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...', APP_VERSION);
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            const isOldCache =
              cacheName !== CACHE_STATIC &&
              cacheName !== CACHE_DYNAMIC &&
              cacheName !== CACHE_IMAGES &&
              cacheName.startsWith('mfp-');
            if (isOldCache) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        // Take control of all clients immediately
        return self.clients.claim();
      })
  );
});

// ============================================================
// FETCH — Smart caching strategies
// ============================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip Chrome extensions
  if (url.protocol === 'chrome-extension:') return;

  // Skip Firebase/Google Auth — NEVER cache these
  const shouldNeverCache = NEVER_CACHE.some(
    (domain) => url.hostname.includes(domain) || request.url.includes(domain)
  );
  if (shouldNeverCache) {
    event.respondWith(fetch(request));
    return;
  }

  // Strategy 1: Cache First for static assets (JS, CSS, fonts, icons)
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, CACHE_STATIC));
    return;
  }

  // Strategy 2: Cache First for images
  if (isImageRequest(url)) {
    event.respondWith(cacheFirst(request, CACHE_IMAGES));
    return;
  }

  // Strategy 3: Network First for HTML navigation (SPA routes)
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }

  // Strategy 4: Network First for everything else
  event.respondWith(networkFirst(request, CACHE_DYNAMIC));
});

// ============================================================
// Helper: Is static asset?
// ============================================================
function isStaticAsset(url) {
  return (
    url.pathname.match(/\.(js|css|woff|woff2|ttf|eot)$/) ||
    url.pathname.startsWith('/assets/')
  );
}

// ============================================================
// Helper: Is image request?
// ============================================================
function isImageRequest(url) {
  return url.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/);
}

// ============================================================
// Strategy: Cache First
// ============================================================
async function cacheFirst(request, cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      // Update cache in background (stale-while-revalidate)
      updateCacheInBackground(request, cache);
      return cachedResponse;
    }
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) return cachedResponse;
    throw error;
  }
}

// ============================================================
// Strategy: Network First
// ============================================================
async function networkFirst(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) return cachedResponse;
    throw error;
  }
}

// ============================================================
// Strategy: Network First with Offline Fallback (for SPA)
// ============================================================
async function networkFirstWithOfflineFallback(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_STATIC);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // Offline — serve cached index.html for SPA routing
    const cache = await caches.open(CACHE_STATIC);
    const cachedIndex =
      (await cache.match(request)) || (await cache.match('/index.html'));
    if (cachedIndex) return cachedIndex;

    // Ultimate fallback
    return new Response(
      `<!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>My Finance Pro — Offline</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              background: #1a1f2e;
              color: #ffffff;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              padding: 24px;
              text-align: center;
            }
            .icon { font-size: 64px; margin-bottom: 24px; }
            h1 { font-size: 24px; margin-bottom: 12px; color: #6366f1; }
            p { color: #94a3b8; line-height: 1.6; margin-bottom: 24px; }
            button {
              background: #6366f1;
              color: white;
              border: none;
              padding: 12px 32px;
              border-radius: 12px;
              font-size: 16px;
              cursor: pointer;
            }
          </style>
        </head>
        <body>
          <div class="icon">📊</div>
          <h1>You're Offline</h1>
          <p>My Finance Pro needs internet connection.<br>Please check your connection and try again.</p>
          <button onclick="window.location.reload()">Try Again</button>
        </body>
      </html>`,
      {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }
    );
  }
}

// ============================================================
// Helper: Background cache update
// ============================================================
function updateCacheInBackground(request, cache) {
  fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response);
      }
    })
    .catch(() => {
      // Silent fail — we already have cached version
    });
}

// ============================================================
// Push Notifications (Future use)
// ============================================================
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'My Finance Pro', {
      body: data.body || 'You have a new notification',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-96x96.png',
      vibrate: [200, 100, 200],
      data: data.url || '/',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data));
});

console.log('[SW] Service Worker loaded:', APP_VERSION);