import webpush from 'web-push';

// Configure web push with VAPID keys (these would be generated once and stored as env variables)
const vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY || 'BMjQz7FP-ynN8h7WCjMBB-aM5zJ7Y4Pv9z5_mU8Cz2dR3L6P1Q9jKbNfG2wC4xR8tX',
  privateKey: process.env.VAPID_PRIVATE_KEY || 'wL6f4G8N2rP9dE3mK7cX1vB5yH6tR4uI2o9pA8sD3fG1z'
};

webpush.setVapidDetails(
  'mailto:admin@animalhousepetstore.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

export interface PushSubscription {
  endpoint: string;
  keys: {
    auth: string;
    p256dh: string;
  };
}

export class WebPushService {
  async sendNotification(subscription: PushSubscription, payload: any): Promise<boolean> {
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      return true;
    } catch (error) {
      console.error('Push notification error:', error);
      return false;
    }
  }

  async sendOrderStatusNotification(
    subscriptions: PushSubscription[], 
    orderId: number, 
    status: string
  ): Promise<void> {
    const messages = {
      'in_progress': {
        title: 'Order Update - Animal House',
        body: `Your order #${orderId} is being prepared!`,
        icon: '/icon-192x192.png',
        badge: '/badge-72x72.png',
        tag: `order-${orderId}`,
        data: { orderId, status, url: '/profile' }
      },
      'ready': {
        title: 'Order Ready - Animal House',
        body: `Order #${orderId} is ready for pickup!`,
        icon: '/icon-192x192.png',
        badge: '/badge-72x72.png',
        tag: `order-${orderId}`,
        data: { orderId, status, url: '/profile' }
      }
    };

    const notification = messages[status as keyof typeof messages];
    if (!notification) return;

    // Send to all user's subscriptions
    for (const subscription of subscriptions) {
      await this.sendNotification(subscription, notification);
    }
  }
}

export const webPushService = new WebPushService();