const CACHE_NAME = 'animal-house-v16';
const IMAGE_CACHE_NAME = 'animal-house-images-v1';
const OFFLINE_CACHE = [
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
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
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'STORE_VAPID_KEY') {
    self.__vapidPublicKey = event.data.key;
  }
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.filter(function(cacheName) {
          return cacheName !== CACHE_NAME && cacheName !== IMAGE_CACHE_NAME;
        }).map(function(cacheName) {
          return caches.delete(cacheName);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Never intercept API calls
  if (url.pathname.startsWith('/api/')) return;

  // Never intercept HTML navigation requests — always fetch fresh from network
  // This ensures index.html is always up to date after a deployment
  if (event.request.mode === 'navigate') return;

  // Never cache JS or CSS chunks — they have content hashes in the filename
  // and must always be fresh. Let the browser's built-in HTTP cache handle them.
  if (url.pathname.startsWith('/assets/')) return;

  // Product/pet images served from object storage — cache-first with persistent fallback.
  // Once an image loads successfully it is stored in a dedicated image cache.
  // If the network ever fails (GCS hiccup, server restart, etc.) the cached copy
  // is returned, so a stale request can NEVER break a previously-loaded image.
  if (url.pathname.startsWith('/public-objects/')) {
    event.respondWith(
      caches.open(IMAGE_CACHE_NAME).then(function(imageCache) {
        return imageCache.match(event.request).then(function(cached) {
          if (cached) {
            // Serve instantly from cache, then silently refresh in the background
            var networkFetch = fetch(event.request).then(function(response) {
              if (response.ok) imageCache.put(event.request, response.clone());
              return response;
            }).catch(function() {/* silent — cached copy already served */});
            return cached;
          }
          // Not in cache yet — fetch from network and store on success
          return fetch(event.request).then(function(response) {
            if (response.ok) imageCache.put(event.request, response.clone());
            return response;
          }).catch(function(err) {
            // Network completely unreachable and nothing cached — nothing we can do
            return new Response('', { status: 503, statusText: 'Offline' });
          });
        });
      })
    );
    return;
  }

  // For everything else (icons, manifest), use cache-first
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      return cached || fetch(event.request);
    })
  );
});

self.addEventListener('push', function(event) {
  console.log('[SW] Push notification received');

  let notificationData = {
    title: 'Animal House Pet Store',
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
        title: data.title || notificationData.title,
        body: data.body || notificationData.body,
        icon: data.icon || notificationData.icon,
        badge: data.badge || notificationData.badge,
        tag: data.tag || notificationData.tag,
        data: { url: data.url || '/' }
      };
    } catch (e) {
      console.error('[SW] Error parsing push data:', e);
      notificationData.body = event.data.text() || notificationData.body;
    }
  }

  const options = {
    body: notificationData.body,
    icon: notificationData.icon,
    badge: notificationData.badge,
    tag: notificationData.tag,
    data: notificationData.data,
    requireInteraction: true,
    vibrate: [200, 100, 200],
    renotify: true,
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(notificationData.title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/';
  const fullUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.navigate(fullUrl).then(function(c) {
            return c.focus();
          });
        }
      }
      return clients.openWindow(fullUrl);
    })
  );
});

self.addEventListener('notificationclose', function(event) {
  console.log('[SW] Notification closed:', event.notification.tag);
});

self.addEventListener('pushsubscriptionchange', function(event) {
  console.log('[SW] Push subscription changed - resubscribing');

  var subscribeOptions = event.oldSubscription ? event.oldSubscription.options : {
    userVisibleOnly: true,
    applicationServerKey: self.__vapidPublicKey || null
  };

  if (!subscribeOptions || !subscribeOptions.applicationServerKey) {
    console.warn('[SW] No applicationServerKey available for re-subscription');
    return;
  }

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
      .catch(function(err) {
        console.error('[SW] Failed to resubscribe:', err);
      })
  );
});
