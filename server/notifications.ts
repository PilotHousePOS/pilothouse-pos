import { getUncachableSendGridClient } from './sendgridIntegration';
import { storage } from './storage';
import { getBaseUrl } from './utils';

// Email toggle keys — stored in grooming_settings as 'true' / 'false'
// Default is enabled (true) when not configured so existing behaviour is preserved.
export const EMAIL_TOGGLE_KEYS = {
  new_appointment_admin:       'email_toggle_new_appointment_admin',
  new_appointment_groomer:     'email_toggle_new_appointment_groomer',
  new_appointment_customer:    'email_toggle_new_appointment_customer',
  appt_confirmed_customer:     'email_toggle_appt_confirmed_customer',
  appt_confirmed_groomer:      'email_toggle_appt_confirmed_groomer',
  appt_rejected_customer:      'email_toggle_appt_rejected_customer',
  appt_rejected_groomer:       'email_toggle_appt_rejected_groomer',
  new_order_admin:             'email_toggle_new_order_admin',
  order_received_customer:     'email_toggle_order_received_customer',
  order_status_customer:       'email_toggle_order_status_customer',
  abandoned_cart_customer:     'email_toggle_abandoned_cart_customer',
} as const;

async function isEmailEnabled(key: string): Promise<boolean> {
  try {
    const setting = await storage.getGroomingSetting(key);
    if (!setting) return true; // not configured → enabled by default
    return setting.value !== 'false';
  } catch {
    return true;
  }
}

// Email notification service
class EmailService {
  async sendAdminNewOrderEmail(adminEmail: string, orderId: number, customerName: string, totalAmount: string): Promise<boolean> {
    try {
      const { client, fromEmail, replyTo } = await getUncachableSendGridClient();
      
      const emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #dc2626; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">Animal House Pet Store - Admin Alert</h1>
          </div>
          <div style="padding: 30px; background-color: #f9f9f9;">
            <h2 style="color: #333; margin-bottom: 20px;">🛒 New Order Received #${orderId}</h2>
            <p style="font-size: 16px; line-height: 1.5;"><strong>Customer:</strong> ${customerName}</p>
            <p style="font-size: 16px; line-height: 1.5;"><strong>Order Total:</strong> $${totalAmount}</p>
            <p style="font-size: 16px; line-height: 1.5;"><strong>Status:</strong> Pending</p>
            <div style="background-color: #dc2626; color: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <strong>Action Required:</strong><br>
              Please review and process this order in the admin dashboard.
            </div>
          </div>
          <div style="background-color: #1f2937; color: #d1d5db; padding: 15px; text-align: center; font-size: 12px;">
            <p style="margin: 0 0 5px 0;"><strong>Animal House Pet Store</strong></p>
            <p style="margin: 0 0 5px 0;">2934 Cypress St, West Monroe, LA 71291</p>
            <p style="margin: 0;">Phone: (318) 322-3023</p>
          </div>
        </div>
      `;

      await client.send({
        to: adminEmail,
        from: fromEmail,
        replyTo,
        subject: `New Order #${orderId} - Animal House Admin Alert`,
        html: emailContent,
      });

      return true;
    } catch (error) {
      console.error('Failed to send admin new order email:', error);
      return false;
    }
  }

  async sendAdminNewAppointmentEmail(adminEmail: string, appointmentId: number, customerName: string, serviceType: string, appointmentDate: string, appointmentTime: string): Promise<boolean> {
    try {
      const { client, fromEmail, replyTo } = await getUncachableSendGridClient();
      
      const emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #dc2626; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">Animal House Pet Store - Admin Alert</h1>
          </div>
          <div style="padding: 30px; background-color: #f9f9f9;">
            <h2 style="color: #333; margin-bottom: 20px;">📅 New Grooming Appointment #${appointmentId}</h2>
            <p style="font-size: 16px; line-height: 1.5;"><strong>Customer:</strong> ${customerName}</p>
            <p style="font-size: 16px; line-height: 1.5;"><strong>Service:</strong> ${serviceType}</p>
            <p style="font-size: 16px; line-height: 1.5;"><strong>Date:</strong> ${appointmentDate}</p>
            <p style="font-size: 16px; line-height: 1.5;"><strong>Time:</strong> ${appointmentTime}</p>
            <div style="background-color: #dc2626; color: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <strong>Action Required:</strong><br>
              Please review and confirm this appointment in the admin dashboard.
            </div>
          </div>
          <div style="background-color: #1f2937; color: #d1d5db; padding: 15px; text-align: center; font-size: 12px;">
            <p style="margin: 0 0 5px 0;"><strong>Animal House Pet Store</strong></p>
            <p style="margin: 0 0 5px 0;">2934 Cypress St, West Monroe, LA 71291</p>
            <p style="margin: 0;">Phone: (318) 322-3023</p>
          </div>
        </div>
      `;

      await client.send({
        to: adminEmail,
        from: fromEmail,
        replyTo,
        subject: `New Appointment #${appointmentId} - Animal House Admin Alert`,
        html: emailContent,
      });

      return true;
    } catch (error: any) {
      const sgErrors = error.response?.body?.errors;
      console.error('Failed to send admin new appointment email:', error.message, JSON.stringify(sgErrors));
      return false;
    }
  }

  async sendOrderReceivedEmail(to: string, firstName: string, orderId: number, items: Array<{name: string; quantity: number; price: string}>, subtotal: string, taxAmount: string, convenienceFee: string, loyaltyCreditsApplied: string, totalAmount: string, discountAmount?: string, customerNotes?: string): Promise<boolean> {
    try {
      const { client, fromEmail, replyTo } = await getUncachableSendGridClient();

      const itemRows = items.map(item => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.name}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${(parseFloat(item.price) * item.quantity).toFixed(2)}</td>
        </tr>
      `).join('');

      const loyaltyCredits = parseFloat(loyaltyCreditsApplied || '0');
      const astroDiscount = parseFloat(discountAmount || '0');

      const emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #dc2626; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">Animal House Pet Store</h1>
          </div>
          <div style="padding: 30px; background-color: #f9f9f9;">
            <h2 style="color: #333; margin-bottom: 20px;">We Got Your Order! #${orderId}</h2>
            <p style="font-size: 16px; line-height: 1.5;">Hi ${firstName},</p>
            <p style="font-size: 16px; line-height: 1.5;">
              Thank you for your order! We've received it and our team will review it shortly.
              You'll get another email once we start preparing your items.
            </p>

            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <thead>
                <tr style="background-color: #f3f4f6;">
                  <th style="padding: 8px; text-align: left;">Item</th>
                  <th style="padding: 8px; text-align: center;">Qty</th>
                  <th style="padding: 8px; text-align: right;">Price</th>
                </tr>
              </thead>
              <tbody>
                ${itemRows}
              </tbody>
            </table>

            <div style="border-top: 2px solid #dc2626; padding-top: 15px; margin-top: 10px;">
              <p style="margin: 4px 0;"><strong>Subtotal:</strong> $${parseFloat(subtotal).toFixed(2)}</p>
              ${astroDiscount > 0 ? `<p style="margin: 4px 0; color: #ea580c;"><strong>Astro Loyalty Savings:</strong> -$${astroDiscount.toFixed(2)}</p>` : ''}
              <p style="margin: 4px 0;"><strong>Tax:</strong> $${parseFloat(taxAmount).toFixed(2)}</p>
              ${loyaltyCredits > 0 ? `<p style="margin: 4px 0; color: #16a34a;"><strong>Loyalty Credits:</strong> -$${loyaltyCredits.toFixed(2)}</p>` : ''}
              <p style="margin: 4px 0;"><strong>Convenience Fee:</strong> $${parseFloat(convenienceFee).toFixed(2)}</p>
              <p style="margin: 8px 0; font-size: 20px; font-weight: bold; color: #dc2626;">Total: $${parseFloat(totalAmount).toFixed(2)}</p>
            </div>

            ${customerNotes ? `
            <div style="background-color: #fefce8; border: 1px solid #fde047; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <strong style="color: #854d0e;">Your Order Notes:</strong>
              <p style="margin: 8px 0 0 0; color: #713f12; white-space: pre-wrap;">${customerNotes}</p>
            </div>
            ` : ''}

            <div style="background-color: #fef3c7; color: #92400e; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <strong>What happens next?</strong><br>
              Our team will review your order and begin preparing it. We'll send you updates as your order progresses.
              When it's ready, we'll let you know so you can pick it up!
            </div>

            <p style="font-size: 14px; color: #666; margin-top: 30px;">
              Thank you for choosing Animal House Pet Store!
            </p>
          </div>
          <div style="background-color: #1f2937; color: #d1d5db; padding: 15px; text-align: center; font-size: 12px;">
            <p style="margin: 0 0 5px 0;"><strong>Animal House Pet Store</strong></p>
            <p style="margin: 0 0 5px 0;">2934 Cypress St, West Monroe, LA 71291</p>
            <p style="margin: 0;">Phone: (318) 322-3023</p>
          </div>
        </div>
      `;

      await client.send({
        to,
        from: fromEmail,
        replyTo,
        subject: `Order Received #${orderId} - Animal House Pet Store`,
        html: emailContent,
      });

      console.log(`Order received confirmation email sent to ${to} for order ${orderId}`);
      return true;
    } catch (error) {
      console.error('Order received email error:', error);
      return false;
    }
  }

  async sendAbandonedCartEmail(to: string, firstName: string, items: Array<{name: string; price: string; quantity: number}>): Promise<boolean> {
    try {
      const { client, fromEmail, replyTo } = await getUncachableSendGridClient();

      const itemList = items.map(item => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.name}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${parseFloat(item.price).toFixed(2)}</td>
        </tr>
      `).join('');

      const baseUrl = getBaseUrl();

      const emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #dc2626; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">Animal House Pet Store</h1>
          </div>
          <div style="padding: 30px; background-color: #f9f9f9;">
            <h2 style="color: #333; margin-bottom: 20px;">You Left Something Behind!</h2>
            <p style="font-size: 16px; line-height: 1.5;">Hi ${firstName},</p>
            <p style="font-size: 16px; line-height: 1.5;">
              We noticed you have items waiting in your cart. Don't miss out on these great finds for your furry friends!
            </p>

            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <thead>
                <tr style="background-color: #f3f4f6;">
                  <th style="padding: 8px; text-align: left;">Item</th>
                  <th style="padding: 8px; text-align: center;">Qty</th>
                  <th style="padding: 8px; text-align: right;">Price</th>
                </tr>
              </thead>
              <tbody>
                ${itemList}
              </tbody>
            </table>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${baseUrl}" style="background-color: #dc2626; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold;">
                Complete Your Order
              </a>
            </div>

            <p style="font-size: 14px; color: #666; margin-top: 30px;">
              Questions? Call us at <strong>(318) 322-3023</strong> - we're happy to help!
            </p>
          </div>
          <div style="background-color: #1f2937; color: #d1d5db; padding: 15px; text-align: center; font-size: 12px;">
            <p style="margin: 0 0 5px 0;"><strong>Animal House Pet Store</strong></p>
            <p style="margin: 0 0 5px 0;">2934 Cypress St, West Monroe, LA 71291</p>
            <p style="margin: 0 0 10px 0;">Phone: (318) 322-3023</p>
            <p style="margin: 0 0 5px 0;">You are receiving this email because you have an account with Animal House Pet Store.</p>
            <p style="margin: 0;"><a href="${baseUrl}/profile" style="color: #93c5fd; text-decoration: underline;">Unsubscribe from marketing emails</a></p>
          </div>
        </div>
      `;

      await client.send({
        to,
        from: fromEmail,
        replyTo,
        subject: `Don't Forget Your Cart - Animal House Pet Store`,
        html: emailContent,
      });

      console.log(`Abandoned cart email sent to ${to}`);
      return true;
    } catch (error) {
      console.error('Abandoned cart email error:', error);
      return false;
    }
  }

  async sendOrderStatusEmail(to: string, firstName: string, orderId: number, status: string): Promise<boolean> {
    try {
      const { client, fromEmail, replyTo } = await getUncachableSendGridClient();
      
      const statusMessages = {
        'in_progress': {
          subject: 'Your Order is Being Prepared - Animal House',
          message: 'Great news! We\'ve started preparing your order and it will be ready for pickup soon.'
        },
        'ready': {
          subject: 'Your Order is Ready for Pickup - Animal House',
          message: 'Your order is ready! Please come to Animal House Pet Store to pick up your items.'
        }
      };

      const statusInfo = statusMessages[status as keyof typeof statusMessages];
      if (!statusInfo) return false;

      const emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #dc2626; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">Animal House Pet Store</h1>
          </div>
          <div style="padding: 30px; background-color: #f9f9f9;">
            <h2 style="color: #333; margin-bottom: 20px;">Order Update #${orderId}</h2>
            <p style="font-size: 16px; line-height: 1.5;">Hi ${firstName},</p>
            <p style="font-size: 16px; line-height: 1.5;">${statusInfo.message}</p>
            ${status === 'ready' ? `
              <div style="background-color: #dc2626; color: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <strong>📍 Pickup Location:</strong><br>
                Animal House Pet Store<br>
                Ready for immediate pickup during business hours
              </div>
            ` : ''}
            <p style="font-size: 14px; color: #666; margin-top: 30px;">
              Thank you for choosing Animal House Pet Store!
            </p>
          </div>
          <div style="background-color: #1f2937; color: #d1d5db; padding: 15px; text-align: center; font-size: 12px;">
            <p style="margin: 0 0 5px 0;"><strong>Animal House Pet Store</strong></p>
            <p style="margin: 0 0 5px 0;">2934 Cypress St, West Monroe, LA 71291</p>
            <p style="margin: 0;">Phone: (318) 322-3023</p>
          </div>
        </div>
      `;

      await client.send({
        to,
        from: fromEmail,
        replyTo,
        subject: statusInfo.subject,
        html: emailContent,
      });

      console.log(`Email sent to ${to} for order ${orderId} status: ${status}`);
      return true;
    } catch (error) {
      console.error('Email notification error:', error);
      return false;
    }
  }

  async sendAppointmentConfirmedEmail(to: string, firstName: string, appointmentId: number, serviceType: string, appointmentDate: string, appointmentTime: string): Promise<boolean> {
    try {
      const { client, fromEmail, replyTo } = await getUncachableSendGridClient();
      
      const emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px;">
            <h2 style="color: #22c55e; margin-bottom: 20px;">✅ Appointment Confirmed #${appointmentId}</h2>
            <p style="font-size: 16px; line-height: 1.5;">Hi ${firstName},</p>
            <p style="font-size: 16px; line-height: 1.5;">Great news! Your grooming appointment has been confirmed.</p>
            
            <div style="background-color: #22c55e; color: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <strong>📅 Appointment Details:</strong><br>
              Service: ${serviceType}<br>
              Date: ${new Date(appointmentDate + 'T12:00:00').toLocaleDateString('en-US', { timeZone: 'America/Chicago' })}<br>
              Time: ${appointmentTime}
            </div>
            
            <div style="background-color: #fef3c7; color: #92400e; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <strong>⚠️ Important Reminder:</strong><br>
              NO Poodles, Doodles, German Shepherds, or Large Mix Breed Dogs after 12:00 PM!<br>
              Please ensure your appointment time complies with this policy.
            </div>

            <p style="font-size: 16px; line-height: 1.5;">
              Please arrive 10 minutes early for your appointment. If you need to reschedule, please call us as soon as possible.
            </p>
            
            <p style="font-size: 14px; color: #666; margin-top: 30px;">
              Thank you for choosing Animal House Pet Store!
            </p>
          </div>
          <div style="background-color: #1f2937; color: #d1d5db; padding: 15px; text-align: center; font-size: 12px;">
            <p style="margin: 0 0 5px 0;"><strong>Animal House Pet Store</strong></p>
            <p style="margin: 0 0 5px 0;">2934 Cypress St, West Monroe, LA 71291</p>
            <p style="margin: 0;">Phone: (318) 322-3023</p>
          </div>
        </div>
      `;

      await client.send({
        to,
        from: fromEmail,
        replyTo,
        subject: `Appointment Confirmed - ${serviceType} on ${new Date(appointmentDate + 'T12:00:00').toLocaleDateString('en-US', { timeZone: 'America/Chicago' })}`,
        html: emailContent,
      });

      console.log(`Appointment confirmation email sent to ${to} for appointment ${appointmentId}`);
      return true;
    } catch (error) {
      console.error('Appointment confirmation email error:', error);
      return false;
    }
  }

  async sendAppointmentBookedCustomerEmail(to: string, firstName: string, appointmentId: number, serviceType: string, appointmentDate: string, appointmentTime: string): Promise<boolean> {
    try {
      const { client, fromEmail, replyTo } = await getUncachableSendGridClient();

      const emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #1e40af; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">Animal House Pet Store</h1>
          </div>
          <div style="background-color: #f8f9fa; padding: 30px;">
            <h2 style="color: #1e40af; margin-bottom: 20px;">📋 Booking Received #${appointmentId}</h2>
            <p style="font-size: 16px; line-height: 1.5;">Hi ${firstName},</p>
            <p style="font-size: 16px; line-height: 1.5;">
              Thanks for booking with Animal House! We've received your appointment request and it is now <strong>pending review</strong>. You'll get another email once it's been confirmed or if we need to make any changes.
            </p>

            <div style="background-color: #dbeafe; color: #1e3a8a; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <strong>📅 Appointment Details:</strong><br>
              Service: ${serviceType}<br>
              Date: ${new Date(appointmentDate + 'T12:00:00').toLocaleDateString('en-US', { timeZone: 'America/Chicago' })}<br>
              Time: ${appointmentTime}
            </div>

            <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
              If you have any questions, call us at <strong>(318) 322-3023</strong>.
            </p>
            <p style="font-size: 14px; color: #666;">Thank you for choosing Animal House Pet Store!</p>
          </div>
          <div style="background-color: #1f2937; color: #d1d5db; padding: 15px; text-align: center; font-size: 12px;">
            <p style="margin: 0 0 5px 0;"><strong>Animal House Pet Store</strong></p>
            <p style="margin: 0 0 5px 0;">2934 Cypress St, West Monroe, LA 71291</p>
            <p style="margin: 0;">Phone: (318) 322-3023</p>
          </div>
        </div>
      `;

      await client.send({
        to,
        from: fromEmail,
        replyTo,
        subject: `Booking Received – ${serviceType} on ${new Date(appointmentDate + 'T12:00:00').toLocaleDateString('en-US', { timeZone: 'America/Chicago' })}`,
        html: emailContent,
      });

      console.log(`Booking received email sent to ${to} for appointment ${appointmentId}`);
      return true;
    } catch (error) {
      console.error('Booking received customer email error:', error);
      return false;
    }
  }

  async sendAppointmentRejectedEmail(to: string, firstName: string, appointmentId: number, serviceType: string, appointmentDate: string, appointmentTime: string): Promise<boolean> {
    try {
      const { client, fromEmail, replyTo } = await getUncachableSendGridClient();
      
      const emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #1e40af; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">Animal House Pet Store</h1>
          </div>
          <div style="padding: 30px; background-color: #f9fafb;">
            <h2 style="color: #dc2626;">Appointment Update</h2>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.5;">
              The Animal House regrets to inform you that we could not accept your appointment. This may have been due to several reasons. If you have any questions about this please contact us at <strong>318-323-6090</strong>.
            </p>
          </div>
          <div style="background-color: #1f2937; color: #d1d5db; padding: 15px; text-align: center; font-size: 12px;">
            <p style="margin: 0 0 5px 0;"><strong>Animal House Pet Store</strong></p>
            <p style="margin: 0 0 5px 0;">2934 Cypress St, West Monroe, LA 71291</p>
            <p style="margin: 0;">Phone: (318) 322-3023</p>
          </div>
        </div>
      `;

      await client.send({
        to,
        from: fromEmail,
        replyTo,
        subject: 'Animal House - Appointment Update',
        html: emailContent,
      });

      console.log(`Appointment rejection email sent to ${to} for appointment ${appointmentId}`);
      return true;
    } catch (error: any) {
      console.error('Appointment rejection email error:', error);
      return false;
    }
  }
}

// Push notification service (for web push notifications)
class PushNotificationService {
  async sendAdminNewOrderPush(orderId: number, customerName: string): Promise<boolean> {
    const title = `New Order #${orderId}`;
    const message = `New order from ${customerName}`;
    
    console.log(`Admin push notification: ${title} - ${message}`);
    
    // Send real-time WebSocket notification to admin users
    const wsServer = (global as any).wsServer;
    if (wsServer) {
      wsServer.broadcastToAdmins({
        notificationType: 'order',
        title,
        message
      });
    }
    
    return true;
  }

  async sendAdminNewAppointmentPush(appointmentId: number, customerName: string, serviceType: string): Promise<boolean> {
    const title = `New Appointment #${appointmentId}`;
    const message = `${serviceType} appointment from ${customerName}`;
    
    console.log(`Admin push notification: ${title} - ${message}`);
    
    // Send real-time WebSocket notification to admin users
    const wsServer = (global as any).wsServer;
    if (wsServer) {
      wsServer.broadcastToAdmins({
        notificationType: 'appointment',
        title,
        message
      });
    }
    
    return true;
  }

  async sendOrderStatusPush(userId: string, orderId: number, status: string): Promise<boolean> {
    // This would integrate with a service like Firebase Cloud Messaging or web push
    // For now, we'll log the notification that would be sent
    const messages = {
      'in_progress': `Your order #${orderId} is being prepared!`,
      'ready': `Order #${orderId} is ready for pickup at Animal House Pet Store!`
    };

    const message = messages[status as keyof typeof messages];
    if (!message) return false;

    console.log(`Push notification for user ${userId}: ${message}`);
    
    // TODO: Implement actual push notification service when ready
    // This could use Firebase Cloud Messaging, OneSignal, or similar service
    
    return true;
  }
}

// SMS notification service with logging and opt-out checking
class SMSService {
  // Helper to check if contact has opted out
  private async isOptedOut(phoneNumber: string): Promise<{ optedOut: boolean; contactId?: number }> {
    try {
      const { normalizePhoneNumber } = await import('./phoneUtils');
      const normalizedPhone = normalizePhoneNumber(phoneNumber);
      const contact = await storage.getContactByPhoneNumber(normalizedPhone);
      if (contact) {
        return { optedOut: contact.smsOptOut === true, contactId: contact.id };
      }
      return { optedOut: false };
    } catch (error) {
      console.error('Error checking opt-out status:', error);
      return { optedOut: false };
    }
  }

  // Helper to log SMS attempts
  private async logSms(params: { contactId?: number; phoneNumber: string; message: string; status: string; errorMessage?: string; twilioSid?: string; appointmentId?: number }): Promise<void> {
    try {
      await storage.createSmsLog(params);
    } catch (error) {
      console.error('Error logging SMS:', error);
    }
  }

  private toE164(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
    return `+${digits}`;
  }

  async sendAdminNewOrderSMS(phoneNumber: string, orderId: number, customerName: string, totalAmount: string): Promise<boolean> {
    const message = `Animal House: New order #${orderId} from ${customerName} - Total: $${parseFloat(totalAmount).toFixed(2)}. Check the admin dashboard.`;

    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
      console.log('Twilio not configured, admin SMS skipped');
      return false;
    }

    const toNumber = this.toE164(phoneNumber);
    if (!toNumber.match(/^\+1\d{10}$/)) {
      console.log(`Admin order SMS skipped — invalid phone: ${phoneNumber}`);
      return false;
    }

    try {
      const twilio = await import('twilio');
      const client = twilio.default(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      const result = await client.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: toNumber,
      });
      console.log(`Admin new-order SMS sent to ${toNumber} for order ${orderId}: ${result.sid}`);
      return true;
    } catch (error: any) {
      console.error('Admin new-order SMS error:', error);
      return false;
    }
  }

  async sendTestSMS(phoneNumber: string): Promise<{ success: boolean; sid?: string; error?: string }> {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
      return { success: false, error: 'Twilio not configured' };
    }
    const toNumber = this.toE164(phoneNumber);
    if (!toNumber.match(/^\+1\d{10}$/)) {
      return { success: false, error: `Invalid phone number: ${phoneNumber}` };
    }
    try {
      const twilio = await import('twilio');
      const client = twilio.default(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      const result = await client.messages.create({
        body: `Animal House Pet Store: SMS notifications are active! 🐾 Order alerts will be sent to this number.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: toNumber,
      });
      console.log(`Test SMS sent to ${toNumber}: ${result.sid}`);
      return { success: true, sid: result.sid };
    } catch (error: any) {
      console.error('Test SMS error:', error);
      return { success: false, error: error.message };
    }
  }

  async sendOrderStatusSMS(phoneNumber: string, firstName: string, orderId: number, status: string): Promise<boolean> {
    const messages = {
      'approved': `Hi ${firstName}! Your Animal House order #${orderId} has been approved. We'll text you when it's ready for pickup! Reply STOP to opt out.`,
      'in_progress': `Hi ${firstName}! Your Animal House order #${orderId} is being prepared. We'll text you when it's ready for pickup! Reply STOP to opt out.`,
      'ready': `${firstName}, your order #${orderId} is ready for pickup at Animal House Pet Store! 🐾 Reply STOP to opt out.`,
      'picked_up': `Hi ${firstName}! Your Animal House order #${orderId} has been picked up. Thanks for shopping with us! 🐾 Reply STOP to opt out.`,
    };
    const message = messages[status as keyof typeof messages];
    if (!message) return false;

    // Check opt-out status
    const { optedOut, contactId } = await this.isOptedOut(phoneNumber);
    if (optedOut) {
      console.log(`SMS skipped for ${phoneNumber} - contact opted out`);
      await this.logSms({ contactId, phoneNumber, message, status: 'skipped', errorMessage: 'Contact opted out of SMS' });
      return false;
    }

    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
      console.log('Twilio not configured, SMS notification skipped');
      return false;
    }

    try {
      const twilio = await import('twilio');
      const client = twilio.default(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

      const result = await client.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phoneNumber,
      });

      console.log(`SMS sent to ${phoneNumber} for order ${orderId} status: ${status}`);
      await this.logSms({ contactId, phoneNumber, message, status: 'sent', twilioSid: result.sid });
      return true;
    } catch (error: any) {
      console.error('SMS notification error:', error);
      await this.logSms({ contactId, phoneNumber, message, status: 'failed', errorMessage: error.message || 'Unknown error' });
      return false;
    }
  }

  async sendPetReadySMS(phoneNumber: string, firstName: string, petName: string, appointmentId?: number): Promise<boolean> {
    const message = `Your Fur Baby is ready for pick-up please give us a call to let us know you're on your way. The Animal House 318-323-6090. Reply STOP to opt out.`;
    // Route through sendGenericSMS so E.164 normalization and duplicate guard apply automatically
    return await this.sendGenericSMS(phoneNumber, message, appointmentId);
  }

  private toE164(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
    return `+${digits}`;
  }

  async sendGenericSMS(phoneNumber: string, message: string, appointmentId?: number): Promise<boolean> {
    // Normalize to E.164 so Twilio always accepts it
    const toNumber = this.toE164(phoneNumber);
    if (!toNumber.match(/^\+1\d{10}$/)) {
      console.log(`SMS skipped — invalid/non-US phone: ${phoneNumber}`);
      return false;
    }

    // Duplicate guard: if we've already sent a grooming-ready SMS for this appointment, skip
    if (appointmentId) {
      try {
        const { db } = await import('./db');
        const { smsLogs } = await import('../shared/schema');
        const { and, eq } = await import('drizzle-orm');
        const existing = await db.select({ id: smsLogs.id })
          .from(smsLogs)
          .where(and(eq(smsLogs.appointmentId, appointmentId), eq(smsLogs.status, 'sent')))
          .limit(1);
        if (existing.length > 0) {
          console.log(`SMS already sent for appointment ${appointmentId} — skipping duplicate`);
          return false;
        }
      } catch (e) {
        console.error('Duplicate SMS check failed (proceeding):', e);
      }
    }

    // Check opt-out status
    const { optedOut, contactId } = await this.isOptedOut(toNumber);
    if (optedOut) {
      console.log(`SMS skipped for ${toNumber} - contact opted out`);
      await this.logSms({ contactId, phoneNumber: toNumber, message, status: 'skipped', errorMessage: 'Contact opted out of SMS', appointmentId });
      return false;
    }

    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
      console.log('Twilio not configured, SMS notification skipped');
      return false;
    }

    try {
      const twilio = await import('twilio');
      const client = twilio.default(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

      const result = await client.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: toNumber,
      });

      console.log(`SMS sent to ${toNumber}${appointmentId ? ` for appointment ${appointmentId}` : ''}`);
      await this.logSms({ contactId, phoneNumber: toNumber, message, status: 'sent', twilioSid: result.sid, appointmentId });
      return true;
    } catch (error: any) {
      console.error('SMS notification error:', error);
      await this.logSms({ contactId, phoneNumber: toNumber, message, status: 'failed', errorMessage: error.message || 'Unknown error', appointmentId });
      return false;
    }
  }
}

// Main notification service that coordinates all notification types
export class NotificationService {
  private emailService: EmailService;
  private pushService: PushNotificationService;
  private smsService: SMSService;

  constructor() {
    this.emailService = new EmailService();
    this.pushService = new PushNotificationService();
    this.smsService = new SMSService();
  }

  async sendAdminNewOrderNotifications(
    adminEmails: string[],
    orderId: number,
    customerName: string,
    totalAmount: string,
    adminPhones?: string[]
  ): Promise<void> {
    console.log(`Sending admin notifications for new order ${orderId}`);

    // Send email notifications to all admin users (respects toggle)
    if (await isEmailEnabled(EMAIL_TOGGLE_KEYS.new_order_admin)) {
      for (const adminEmail of adminEmails) {
        await this.emailService.sendAdminNewOrderEmail(adminEmail, orderId, customerName, totalAmount);
      }
    } else {
      console.log(`[EMAIL TOGGLE] New order admin email suppressed for order ${orderId}`);
    }

    // Send SMS notifications to admin users who have a phone number
    if (adminPhones && adminPhones.length > 0) {
      for (const phone of adminPhones) {
        await this.smsService.sendAdminNewOrderSMS(phone, orderId, customerName, totalAmount);
      }
    }

    // Send push notification to admin users
    await this.pushService.sendAdminNewOrderPush(orderId, customerName);
  }

  async sendAdminNewAppointmentNotifications(
    adminEmails: string[],
    appointmentId: number,
    customerName: string,
    serviceType: string,
    appointmentDate: string,
    appointmentTime: string,
    groomerEmails?: string[],
    customerEmail?: string,
    customerFirstName?: string
  ): Promise<void> {
    console.log(`Sending admin notifications for new appointment ${appointmentId}`);

    // Send email notifications to all admin users (respects toggle)
    if (await isEmailEnabled(EMAIL_TOGGLE_KEYS.new_appointment_admin)) {
      for (const adminEmail of adminEmails) {
        await this.emailService.sendAdminNewAppointmentEmail(
          adminEmail,
          appointmentId,
          customerName,
          serviceType,
          appointmentDate,
          appointmentTime
        );
      }
    } else {
      console.log(`[EMAIL TOGGLE] New appointment admin email suppressed for appointment ${appointmentId}`);
    }

    // Send email notifications to groomers (respects toggle)
    if (groomerEmails && groomerEmails.length > 0) {
      if (await isEmailEnabled(EMAIL_TOGGLE_KEYS.new_appointment_groomer)) {
        for (const groomerEmail of groomerEmails) {
          await this.emailService.sendAdminNewAppointmentEmail(
            groomerEmail,
            appointmentId,
            customerName,
            serviceType,
            appointmentDate,
            appointmentTime
          );
        }
      } else {
        console.log(`[EMAIL TOGGLE] New appointment groomer email suppressed for appointment ${appointmentId}`);
      }
    }

    // Send "booking received" email to the customer (respects toggle)
    if (customerEmail && customerFirstName) {
      if (await isEmailEnabled(EMAIL_TOGGLE_KEYS.new_appointment_customer)) {
        await this.emailService.sendAppointmentBookedCustomerEmail(
          customerEmail,
          customerFirstName,
          appointmentId,
          serviceType,
          appointmentDate,
          appointmentTime
        );
      } else {
        console.log(`[EMAIL TOGGLE] New appointment customer email suppressed for appointment ${appointmentId}`);
      }
    }

    // Send push notification to admin users
    await this.pushService.sendAdminNewAppointmentPush(appointmentId, customerName, serviceType);
  }

  async sendOrderStatusNotifications(
    userEmail: string,
    userFirstName: string,
    userPhoneNumber: string | null,
    userId: string,
    orderId: number,
    status: string
  ): Promise<void> {
    // Only send notifications for specific status changes
    if (!['in_progress', 'ready'].includes(status)) {
      return;
    }

    console.log(`Sending notifications for order ${orderId} status change to: ${status}`);

    // Send email notification (respects toggle)
    if (await isEmailEnabled(EMAIL_TOGGLE_KEYS.order_status_customer)) {
      await this.emailService.sendOrderStatusEmail(userEmail, userFirstName, orderId, status);
    } else {
      console.log(`[EMAIL TOGGLE] Order status customer email suppressed for order ${orderId}`);
    }

    // Send push notification
    await this.pushService.sendOrderStatusPush(userId, orderId, status);

    // Send SMS if phone number is available
    if (userPhoneNumber) {
      await this.smsService.sendOrderStatusSMS(userPhoneNumber, userFirstName, orderId, status);
    }
  }

  async sendAppointmentConfirmedNotification(
    userEmail: string,
    userFirstName: string,
    appointmentId: number,
    serviceType: string,
    appointmentDate: string,
    appointmentTime: string,
    groomerEmails?: string[],
    customerName?: string
  ): Promise<void> {
    console.log(`Sending appointment confirmation notification for appointment ${appointmentId}`);

    // Customer email
    if (await isEmailEnabled(EMAIL_TOGGLE_KEYS.appt_confirmed_customer)) {
      await this.emailService.sendAppointmentConfirmedEmail(
        userEmail,
        userFirstName,
        appointmentId,
        serviceType,
        appointmentDate,
        appointmentTime
      );
    } else {
      console.log(`[EMAIL TOGGLE] Appointment confirmed customer email suppressed for appointment ${appointmentId}`);
    }

    // Groomer email (reuses admin appointment template so groomers see the full details)
    if (groomerEmails && groomerEmails.length > 0) {
      if (await isEmailEnabled(EMAIL_TOGGLE_KEYS.appt_confirmed_groomer)) {
        for (const groomerEmail of groomerEmails) {
          await this.emailService.sendAdminNewAppointmentEmail(
            groomerEmail,
            appointmentId,
            customerName || userFirstName,
            serviceType,
            appointmentDate,
            appointmentTime
          );
        }
      } else {
        console.log(`[EMAIL TOGGLE] Appointment confirmed groomer email suppressed for appointment ${appointmentId}`);
      }
    }
  }

  async sendAppointmentRejectedNotification(
    userEmail: string,
    userFirstName: string,
    appointmentId: number,
    serviceType: string,
    appointmentDate: string,
    appointmentTime: string,
    groomerEmails?: string[],
    customerName?: string
  ): Promise<void> {
    console.log(`Sending appointment rejection notification for appointment ${appointmentId}`);

    // Customer email
    if (await isEmailEnabled(EMAIL_TOGGLE_KEYS.appt_rejected_customer)) {
      await this.emailService.sendAppointmentRejectedEmail(
        userEmail,
        userFirstName,
        appointmentId,
        serviceType,
        appointmentDate,
        appointmentTime
      );
    } else {
      console.log(`[EMAIL TOGGLE] Appointment rejected customer email suppressed for appointment ${appointmentId}`);
    }

    // Groomer email
    if (groomerEmails && groomerEmails.length > 0) {
      if (await isEmailEnabled(EMAIL_TOGGLE_KEYS.appt_rejected_groomer)) {
        for (const groomerEmail of groomerEmails) {
          await this.emailService.sendAdminNewAppointmentEmail(
            groomerEmail,
            appointmentId,
            customerName || userFirstName,
            serviceType,
            appointmentDate,
            appointmentTime
          );
        }
      } else {
        console.log(`[EMAIL TOGGLE] Appointment rejected groomer email suppressed for appointment ${appointmentId}`);
      }
    }
  }

  async sendOrderReceivedNotification(
    userEmail: string,
    userFirstName: string,
    orderId: number,
    items: Array<{name: string; quantity: number; price: string}>,
    subtotal: string,
    taxAmount: string,
    convenienceFee: string,
    loyaltyCreditsApplied: string,
    totalAmount: string,
    discountAmount?: string,
    customerNotes?: string
  ): Promise<void> {
    console.log(`Sending order received confirmation to ${userEmail} for order ${orderId}`);
    if (!(await isEmailEnabled(EMAIL_TOGGLE_KEYS.order_received_customer))) {
      console.log(`[EMAIL TOGGLE] Order received customer email suppressed for order ${orderId}`);
      return;
    }
    await this.emailService.sendOrderReceivedEmail(
      userEmail, userFirstName, orderId, items,
      subtotal, taxAmount, convenienceFee, loyaltyCreditsApplied, totalAmount, discountAmount, customerNotes
    );
  }

  async sendAbandonedCartNotification(
    userEmail: string,
    userFirstName: string,
    items: Array<{name: string; price: string; quantity: number}>
  ): Promise<boolean> {
    console.log(`Sending abandoned cart email to ${userEmail}`);
    if (!(await isEmailEnabled(EMAIL_TOGGLE_KEYS.abandoned_cart_customer))) {
      console.log(`[EMAIL TOGGLE] Abandoned cart customer email suppressed`);
      return false;
    }
    return await this.emailService.sendAbandonedCartEmail(userEmail, userFirstName, items);
  }

  async sendPetReadyNotification(
    phoneNumber: string,
    firstName: string,
    petName: string
  ): Promise<boolean> {
    console.log(`Sending pet ready SMS notification for ${petName} to ${phoneNumber}`);
    return await this.smsService.sendPetReadySMS(phoneNumber, firstName, petName);
  }

  async sendGenericSMS(
    phoneNumber: string,
    message: string
  ): Promise<boolean> {
    console.log(`Sending generic SMS to ${phoneNumber}`);
    return await this.smsService.sendGenericSMS(phoneNumber, message);
  }

  async sendCustomSMS(
    phoneNumber: string,
    message: string,
    appointmentId?: number
  ): Promise<boolean> {
    console.log(`Sending custom SMS to ${phoneNumber}: ${message.substring(0, 50)}...`);
    return await this.smsService.sendGenericSMS(phoneNumber, message, appointmentId);
  }

  async sendTestSMS(phoneNumber: string): Promise<{ success: boolean; sid?: string; error?: string }> {
    return await this.smsService.sendTestSMS(phoneNumber);
  }
}

export const notificationService = new NotificationService();