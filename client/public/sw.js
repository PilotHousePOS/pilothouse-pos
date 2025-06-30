// Service Worker for Push Notifications
self.addEventListener('push', function(event) {
  console.log('Push notification received:', event);
  
  if (event.data) {
    const data = event.data.json();
    
    const options = {
      body: data.body,
      icon: data.icon || '/icon-192x192.png',
      badge: data.badge || '/badge-72x72.png',
      tag: data.tag,
      data: data.data,
      actions: [
        {
          action: 'view',
          title: 'View Order',
          icon: '/view-icon.png'
        },
        {
          action: 'close',
          title: 'Close',
          icon: '/close-icon.png'
        }
      ],
      requireInteraction: true,
      vibrate: [200, 100, 200]
    };

    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

self.addEventListener('notificationclick', function(event) {
  console.log('Notification clicked:', event);
  
  event.notification.close();
  
  if (event.action === 'view') {
    // Open the app to the orders/profile page
    event.waitUntil(
      clients.openWindow(event.notification.data.url || '/profile')
    );
  }
});

self.addEventListener('notificationclose', function(event) {
  console.log('Notification closed:', event);
});