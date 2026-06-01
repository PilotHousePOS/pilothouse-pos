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
    
    // Check production security before processing
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (isProduction && !webhookSecret) {
      // Secret not configured — Replit sync already handled the event above; skip custom logic
      console.warn('STRIPE_WEBHOOK_SECRET not set in production — skipping custom event processing');
      return;
    }
    
    // Handle custom order payment logic with signature verification
    try {
      const stripe = await getUncachableStripeClient();
      
      if (webhookSecret) {
        // Verify signature and construct event
        const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
        await WebhookHandlers.handleStripeEvent(event);
      } else {
        // Development only - allow unverified for local testing
        console.warn('WARNING: Processing webhook without signature verification (dev mode only)');
        const event = JSON.parse(payload.toString());
        await WebhookHandlers.handleStripeEvent(event);
      }
    } catch (err: any) {
      console.error('Custom webhook handler error:', err.message);
      // Re-throw signature verification errors
      if (err.message.includes('signature') || err.message.includes('verification')) {
        throw err;
      }
      // For other errors, don't throw - the sync already processed successfully
    }
  }
  
  static async handleStripeEvent(event: any): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
        await WebhookHandlers.handleCheckoutSessionCompleted(event.data.object, event.created);
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
        
      case 'charge.refunded':
        await WebhookHandlers.handleChargeRefunded(event.data.object);
        break;
        
      default:
        break;
    }
  }
  
  static async handleCheckoutSessionCompleted(session: any, eventCreated?: number): Promise<void> {
    console.log('Processing checkout.session.completed:', session.id);
    const paidAt = eventCreated ? new Date(eventCreated * 1000) : new Date();
    
    // Find order by checkout session ID
    const order = await storage.getOrderByStripeCheckoutSession(session.id);
    
    if (!order) {
      // Try to find by metadata
      const orderId = session.metadata?.orderId;
      if (orderId) {
        const orderById = await storage.getOrder(parseInt(orderId));
        if (orderById) {
          const alreadyPaid = orderById.paymentStatus === 'paid';
          await storage.updateOrderStripePayment(parseInt(orderId), {
            stripePaymentIntentId: session.payment_intent,
            paymentStatus: 'paid',
            paidAt,
          });
          
          // Update order to ready_for_pickup since payment is complete
          await storage.updateOrderApprovalStatus(parseInt(orderId), 'ready_for_pickup');
          
          // Track loyalty rewards for the customer (only if not already paid to prevent double-credit on webhook replay)
          if (!alreadyPaid && orderById.userId) {
            try {
              const orderAmount = parseFloat(orderById.totalAmount || "0");
              const convenienceFee = parseFloat(orderById.convenienceFee || "0");
              const loyaltyAmount = orderAmount - convenienceFee;
              if (loyaltyAmount > 0) {
                const result = await storage.addToUserTotalSpent(orderById.userId, loyaltyAmount);
                console.log(`Loyalty updated for user ${orderById.userId}: earned=${result.newCreditsEarned}, credits=${result.creditsAmount}`);
              }
            } catch (loyaltyError) {
              console.error('Error updating loyalty for order:', loyaltyError);
            }
          }
          
          console.log(`Order #${orderId} marked as paid and ready for pickup`);
          
          // Send payment confirmation email
          await WebhookHandlers.sendPaymentConfirmationEmail(parseInt(orderId));
        }
      }
      return;
    }
    
    const alreadyPaid = order.paymentStatus === 'paid';
    // Update order payment status
    await storage.updateOrderStripePayment(order.id, {
      stripePaymentIntentId: session.payment_intent,
      paymentStatus: 'paid',
      paidAt,
    });
    
    // Update order to ready_for_pickup since payment is complete
    await storage.updateOrderApprovalStatus(order.id, 'ready_for_pickup');
    
    // Track loyalty rewards for the customer (only if not already paid to prevent double-credit on webhook replay)
    if (!alreadyPaid && order.userId) {
      try {
        const orderAmount = parseFloat(order.totalAmount || "0");
        const convenienceFee = parseFloat(order.convenienceFee || "0");
        const loyaltyAmount = orderAmount - convenienceFee;
        if (loyaltyAmount > 0) {
          const result = await storage.addToUserTotalSpent(order.userId, loyaltyAmount);
          console.log(`Loyalty updated for user ${order.userId}: earned=${result.newCreditsEarned}, credits=${result.creditsAmount}`);
        }
      } catch (loyaltyError) {
        console.error('Error updating loyalty for order:', loyaltyError);
      }
    }
    
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
  
  static async handleChargeRefunded(charge: any): Promise<void> {
    console.log('Processing charge.refunded:', charge.id);
    
    const paymentIntentId = charge.payment_intent;
    if (!paymentIntentId) {
      console.log('No payment_intent on refunded charge, skipping');
      return;
    }
    
    const order = await storage.getOrderByStripePaymentIntent(paymentIntentId);
    if (!order) {
      console.log(`No order found for payment_intent ${paymentIntentId}, skipping refund recording`);
      return;
    }
    
    const amountRefunded = (charge.amount_refunded || 0) / 100;
    const totalCharged = (charge.amount || 0) / 100;
    const isFullRefund = charge.refunded === true;
    
    const existingRefunds = await storage.getRefundsByOrderId(order.id);
    const alreadyRecorded = existingRefunds.some(
      (r: any) => r.reason?.includes(charge.id)
    );
    
    if (alreadyRecorded) {
      console.log(`Refund for charge ${charge.id} already recorded for order #${order.id}`);
      return;
    }
    
    const latestRefund = charge.refunds?.data?.[0];
    const stripeRefundId = latestRefund?.id || charge.id;
    const refundAmount = latestRefund ? (latestRefund.amount / 100) : amountRefunded;
    
    const orderTotal = parseFloat(order.totalAmount || "0");
    const orderTax = parseFloat(order.taxAmount || "0");
    const orderSubtotal = parseFloat(order.subtotal || "0");
    
    let taxPortion = 0;
    let subtotalPortion = 0;
    
    if (isFullRefund || refundAmount >= orderTotal) {
      taxPortion = orderTax;
      subtotalPortion = orderSubtotal;
    } else if (orderTotal > 0) {
      const ratio = refundAmount / orderTotal;
      taxPortion = parseFloat((orderTax * ratio).toFixed(2));
      subtotalPortion = parseFloat((refundAmount - taxPortion).toFixed(2));
    }
    
    try {
      await storage.createRefund({
        orderId: order.id,
        orderItemId: null,
        refundType: isFullRefund ? 'full' : 'partial',
        quantity: 1,
        subtotalRefunded: subtotalPortion.toFixed(2),
        taxRefunded: taxPortion.toFixed(2),
        totalRefunded: refundAmount.toFixed(2),
        reason: `Stripe refund ${stripeRefundId} (via Stripe dashboard) | Charge: ${charge.id}`,
        processedBy: null,
        posTransactionId: null,
      });
      
      if (isFullRefund) {
        await storage.updateOrderStripePayment(order.id, {
          paymentStatus: 'refunded',
        });
        await storage.updateOrderStatus(order.id, 'refunded');
      }
      
      console.log(`Refund recorded for order #${order.id}: $${refundAmount.toFixed(2)} (${isFullRefund ? 'full' : 'partial'})`);
    } catch (err: any) {
      console.error(`Failed to record refund for order #${order.id}:`, err.message);
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
      const { client, fromEmail, replyTo } = await getUncachableSendGridClient();
      
      const itemsList = orderWithItems.items.map((item: any) => 
        `• ${item.productName || item.itemName || 'Item'} x${item.quantity} - $${item.price}`
      ).join('\n');
      
      await client.send({
        to: customerEmail,
        from: fromEmail,
        replyTo,
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
            <div style="background-color: #1f2937; color: #d1d5db; padding: 15px; text-align: center; font-size: 12px;">
              <p style="margin: 0 0 5px 0;"><strong>Animal House Pet Store</strong></p>
              <p style="margin: 0 0 5px 0;">2934 Cypress St, West Monroe, LA 71291</p>
              <p style="margin: 0;">Phone: (318) 322-3023</p>
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
