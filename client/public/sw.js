const CACHE_NAME       = 'pilothouse-v1';   // bumped — new offline strategy
const IMAGE_CACHE_NAME = 'pilothouse-images-v1';
const API_CACHE_NAME   = 'pilothouse-api-v1';

// App shell resources cached at install time so the UI loads even when offline
const OFFLINE_CACHE = [
  '/',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// API GET routes whose responses are cached with stale-while-revalidate so
// the POS can serve products, the employee roster, and settings while offline.
const API_CACHE_ROUTES = [
  '/api/pos/layout',
  '/api/settings/tax-rate',
  '/api/admin/pos-override-config',
  '/api/employee/roster',
  '/api/admin/categories',
  '/api/tenants/current',
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(OFFLINE_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data && event.data.type === 'STORE_VAPID_KEY') self.__vapidPublicKey = event.data.key;
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.filter(function(n) {
          return n !== CACHE_NAME && n !== IMAGE_CACHE_NAME && n !== API_CACHE_NAME;
        }).map(function(n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // ── HTML navigate requests: network-first, fall back to cached '/' ──────
  // This keeps the app loadable even if the user refreshes while offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(function() {
        return caches.match('/');
      })
    );
    return;
  }

  // ── JS/CSS assets (content-hashed filenames): cache on first load ────────
  // Because filenames include a content hash they never go stale; caching
  // them lets the app boot offline after the first successful load.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          if (cached) return cached;
          return fetch(event.request).then(function(response) {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          });
        });
      })
    );
    return;
  }

  // ── POS-critical API routes: stale-while-revalidate ──────────────────────
  // Serve the cached response immediately (fast), then refresh in background.
  // If completely offline, the cached response is all that's available —
  // which is enough to browse products, see the roster, and check tax rates.
  if (url.pathname.startsWith('/api/') &&
      API_CACHE_ROUTES.some(function(r) { return url.pathname === r || url.pathname.startsWith(r + '?'); })) {
    event.respondWith(
      caches.open(API_CACHE_NAME).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          var networkFetch = fetch(event.request).then(function(response) {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(function() { return null; });

          // Serve cached immediately; network refresh happens in background
          return cached || networkFetch || new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        });
      })
    );
    return;
  }

  // ── All other API calls: pass through (no caching) ───────────────────────
  if (url.pathname.startsWith('/api/')) return;

  // ── Product/pet images: cache-first with background refresh ─────────────
  if (url.pathname.startsWith('/public-objects/')) {
    event.respondWith(
      caches.open(IMAGE_CACHE_NAME).then(function(imageCache) {
        return imageCache.match(event.request).then(function(cached) {
          if (cached) {
            fetch(event.request).then(function(r) {
              if (r.ok) imageCache.put(event.request, r.clone());
            }).catch(function() {});
            return cached;
          }
          return fetch(event.request).then(function(r) {
            if (r.ok) imageCache.put(event.request, r.clone());
            return r;
          }).catch(function() {
            return new Response('', { status: 503, statusText: 'Offline' });
          });
        });
      })
    );
    return;
  }

  // ── Icons, manifest, everything else: cache-first ───────────────────────
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      return cached || fetch(event.request);
    })
  );
});

// ── Push notifications ───────────────────────────────────────────────────────

self.addEventListener('push', function(event) {
  let notificationData = {
    title: 'PilotHouse',
    body: 'You have a new notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: 'default',
    data: { url: '/' }
  };

  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = {
        title:  data.title  || notificationData.title,
        body:   data.body   || notificationData.body,
        icon:   data.icon   || notificationData.icon,
        badge:  data.badge  || notificationData.badge,
        tag:    data.tag    || notificationData.tag,
        data:   { url: data.url || '/' }
      };
    } catch (e) {
      notificationData.body = event.data.text() || notificationData.body;
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body:              notificationData.body,
      icon:              notificationData.icon,
      badge:             notificationData.badge,
      tag:               notificationData.tag,
      data:              notificationData.data,
      requireInteraction: true,
      vibrate:           [200, 100, 200],
      renotify:          true,
      actions: [
        { action: 'open',    title: 'Open' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const fullUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.navigate(fullUrl).then(function(c) { return c.focus(); });
        }
      }
      return clients.openWindow(fullUrl);
    })
  );
});

self.addEventListener('pushsubscriptionchange', function(event) {
  var subscribeOptions = event.oldSubscription ? event.oldSubscription.options : {
    userVisibleOnly: true,
    applicationServerKey: self.__vapidPublicKey || null
  };
  if (!subscribeOptions?.applicationServerKey) return;
  event.waitUntil(
    self.registration.pushManager.subscribe(subscribeOptions)
      .then(function(subscription) {
        return fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: subscription.toJSON() }),
          credentials: 'include'
        });
      })
      .catch(function(err) { console.error('[SW] Failed to resubscribe:', err); })
  );
});
