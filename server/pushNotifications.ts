import webpush from 'web-push';
import { db } from './db';
import { pushSubscriptions, users } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

let vapidConfigured = false;

function ensureVapidConfigured() {
  if (vapidConfigured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:theanimalhouse@comcast.net';

  if (!publicKey || !privateKey) {
    console.warn('VAPID keys not configured - push notifications disabled');
    return;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

export async function saveSubscription(userId: string, subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  const existing = await db.select().from(pushSubscriptions)
    .where(and(
      eq(pushSubscriptions.userId, userId),
      eq(pushSubscriptions.endpoint, subscription.endpoint)
    ));

  if (existing.length > 0) {
    return existing[0];
  }

  const [sub] = await db.insert(pushSubscriptions).values({
    userId,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
  }).returning();

  await db.update(users).set({ notificationsEnabled: true, updatedAt: new Date() }).where(eq(users.id, userId));

  return sub;
}

export async function removeSubscription(userId: string, endpoint: string) {
  await db.delete(pushSubscriptions).where(
    and(
      eq(pushSubscriptions.userId, userId),
      eq(pushSubscriptions.endpoint, endpoint)
    )
  );

  const remaining = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  if (remaining.length === 0) {
    await db.update(users).set({ notificationsEnabled: false, updatedAt: new Date() }).where(eq(users.id, userId));
  }
}

export async function removeAllSubscriptions(userId: string) {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  await db.update(users).set({ notificationsEnabled: false, updatedAt: new Date() }).where(eq(users.id, userId));
}

async function sendToUser(userId: string, payload: { title: string; body: string; icon?: string; badge?: string; url?: string; tag?: string }) {
  ensureVapidConfigured();
  if (!vapidConfigured) return;

  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));

  const jsonPayload = JSON.stringify(payload);

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        jsonPayload
      );
    } catch (error: any) {
      if (error.statusCode === 410 || error.statusCode === 404) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        console.log(`Removed expired push subscription ${sub.id} for user ${userId}`);
      } else {
        console.error(`Push notification failed for subscription ${sub.id}:`, error.message);
      }
    }
  }
}

async function sendToAllAdmins(payload: { title: string; body: string; icon?: string; badge?: string; url?: string; tag?: string }) {
  ensureVapidConfigured();
  if (!vapidConfigured) return;

  const adminUsers = await db.select({ id: users.id }).from(users).where(eq(users.isAdmin, true));

  for (const admin of adminUsers) {
    await sendToUser(admin.id, payload);
  }
}

export async function notifyAdminsNewOrder(orderId: number, customerName: string, totalAmount: string) {
  await sendToAllAdmins({
    title: 'New Order!',
    body: `Order #${orderId} from ${customerName} — $${totalAmount}`,
    url: '/admin',
    tag: `new-order-${orderId}`,
  });
}

export async function notifyCustomerOrderApproved(userId: string, orderId: number) {
  await sendToUser(userId, {
    title: 'Order Approved!',
    body: `Your order #${orderId} has been approved and is being prepared.`,
    url: '/orders',
    tag: `order-approved-${orderId}`,
  });
}

export async function notifyCustomerOrderReady(userId: string, orderId: number) {
  await sendToUser(userId, {
    title: 'Order Ready for Pickup!',
    body: `Your order #${orderId} is ready! Come pick it up during store hours.`,
    url: '/orders',
    tag: `order-ready-${orderId}`,
  });
}
