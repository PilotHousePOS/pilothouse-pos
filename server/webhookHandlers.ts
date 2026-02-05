// Stripe webhook handlers for Animal House Pet Store

import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { storage } from './storage';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    // Process with stripe-replit-sync for data syncing
    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);
    
    // Also handle custom order payment logic with signature verification
    try {
      const stripe = await getUncachableStripeClient();
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      const isProduction = process.env.NODE_ENV === 'production';
      
      if (webhookSecret) {
        // Verify signature and construct event
        const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
        await WebhookHandlers.handleStripeEvent(event);
      } else if (isProduction) {
        // In production, require signature verification - reject unverified webhooks
        console.error('SECURITY: Webhook rejected - STRIPE_WEBHOOK_SECRET required in production');
        throw new Error('Webhook signature verification required in production');
      } else {
        // Development only - allow unverified for local testing
        console.warn('WARNING: Processing webhook without signature verification (dev mode only)');
        const event = JSON.parse(payload.toString());
        await WebhookHandlers.handleStripeEvent(event);
      }
    } catch (err: any) {
      console.error('Custom webhook handler error:', err.message);
      // Don't throw - the sync already processed successfully
    }
  }
  
  static async handleStripeEvent(event: any): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
        await WebhookHandlers.handleCheckoutSessionCompleted(event.data.object);
        break;
        
      case 'checkout.session.expired':
        await WebhookHandlers.handleCheckoutSessionExpired(event.data.object);
        break;
        
      case 'payment_intent.succeeded':
        await WebhookHandlers.handlePaymentIntentSucceeded(event.data.object);
        break;
        
      case 'payment_intent.payment_failed':
        await WebhookHandlers.handlePaymentIntentFailed(event.data.object);
        break;
        
      default:
        // Unhandled event type - ignore
        break;
    }
  }
  
  static async handleCheckoutSessionCompleted(session: any): Promise<void> {
    console.log('Processing checkout.session.completed:', session.id);
    
    // Find order by checkout session ID
    const order = await storage.getOrderByStripeCheckoutSession(session.id);
    
    if (!order) {
      // Try to find by metadata
      const orderId = session.metadata?.orderId;
      if (orderId) {
        const orderById = await storage.getOrder(parseInt(orderId));
        if (orderById) {
          await storage.updateOrderStripePayment(parseInt(orderId), {
            stripePaymentIntentId: session.payment_intent,
            paymentStatus: 'paid',
            paidAt: new Date(),
          });
          
          // Update order to ready_for_pickup since payment is complete
          await storage.updateOrderApprovalStatus(parseInt(orderId), 'ready_for_pickup');
          
          console.log(`Order #${orderId} marked as paid and ready for pickup`);
          
          // Send payment confirmation email
          await WebhookHandlers.sendPaymentConfirmationEmail(parseInt(orderId));
        }
      }
      return;
    }
    
    // Update order payment status
    await storage.updateOrderStripePayment(order.id, {
      stripePaymentIntentId: session.payment_intent,
      paymentStatus: 'paid',
      paidAt: new Date(),
    });
    
    // Update order to ready_for_pickup since payment is complete
    await storage.updateOrderApprovalStatus(order.id, 'ready_for_pickup');
    
    console.log(`Order #${order.id} marked as paid and ready for pickup`);
    
    // Send payment confirmation email
    await WebhookHandlers.sendPaymentConfirmationEmail(order.id);
  }
  
  static async handleCheckoutSessionExpired(session: any): Promise<void> {
    console.log('Processing checkout.session.expired:', session.id);
    
    const order = await storage.getOrderByStripeCheckoutSession(session.id);
    
    if (order) {
      await storage.updateOrderStripePayment(order.id, {
        paymentStatus: 'expired',
      });
      console.log(`Order #${order.id} payment link expired`);
    }
  }
  
  static async handlePaymentIntentSucceeded(paymentIntent: any): Promise<void> {
    console.log('Processing payment_intent.succeeded:', paymentIntent.id);
    // This is handled by checkout.session.completed for our flow
  }
  
  static async handlePaymentIntentFailed(paymentIntent: any): Promise<void> {
    console.log('Processing payment_intent.payment_failed:', paymentIntent.id);
    
    const orderId = paymentIntent.metadata?.orderId;
    if (orderId) {
      await storage.updateOrderStripePayment(parseInt(orderId), {
        paymentStatus: 'failed',
      });
      console.log(`Order #${orderId} payment failed`);
    }
  }
  
  static async sendPaymentConfirmationEmail(orderId: number): Promise<void> {
    try {
      const orderWithItems = await storage.getOrderWithItems(orderId);
      if (!orderWithItems) return;
      
      const { order } = orderWithItems;
      const customerEmail = orderWithItems.customerEmail || order.customerEmail;
      const customerName = orderWithItems.customerName || 'Valued Customer';
      
      if (!customerEmail) return;
      
      const { getUncachableSendGridClient } = await import('./sendgridIntegration');
      const { client, fromEmail } = await getUncachableSendGridClient();
      
      const itemsList = orderWithItems.items.map((item: any) => 
        `• ${item.productName || item.itemName || 'Item'} x${item.quantity} - $${item.price}`
      ).join('\n');
      
      await client.send({
        to: customerEmail,
        from: fromEmail,
        subject: 'Payment Received - Your Order is Being Prepared!',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: #dc2626; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0;">🐾 Animal House Pet Store</h1>
            </div>
            <div style="padding: 20px; background-color: #f9fafb;">
              <h2 style="color: #16a34a;">✓ Payment Received!</h2>
              <p>Hi ${customerName},</p>
              <p>Thank you! We've received your payment for order <strong>#${order.id}</strong>.</p>
              
              <div style="background: white; border-radius: 8px; padding: 15px; margin: 15px 0;">
                <h3 style="margin-top: 0;">Order Details:</h3>
                <pre style="white-space: pre-wrap; font-family: Arial;">${itemsList}</pre>
                <p style="font-weight: bold; font-size: 18px; color: #16a34a;">Total Paid: $${order.totalAmount}</p>
              </div>
              
              <p><strong>Your order is now being prepared!</strong></p>
              <p>We'll send you another email when it's ready for pickup.</p>
              <p>Thank you for shopping with us!</p>
            </div>
            <div style="background-color: #1f2937; color: white; padding: 15px; text-align: center; font-size: 12px;">
              <p>Animal House Pet Store</p>
            </div>
          </div>
        `
      });
      
      console.log(`Payment confirmation email sent to ${customerEmail}`);
    } catch (error) {
      console.error('Failed to send payment confirmation email:', error);
    }
  }
}
