import { MailService } from '@sendgrid/mail';

// Email notification service
class EmailService {
  private mailService: MailService;

  constructor() {
    this.mailService = new MailService();
    if (process.env.SENDGRID_API_KEY) {
      this.mailService.setApiKey(process.env.SENDGRID_API_KEY);
    }
  }

  async sendAdminNewOrderEmail(adminEmail: string, orderId: number, customerName: string, totalAmount: string): Promise<boolean> {
    if (!process.env.SENDGRID_API_KEY) {
      console.log('SendGrid not configured, admin email notification skipped');
      return false;
    }

    try {
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
        </div>
      `;

      await this.mailService.send({
        to: adminEmail,
        from: 'noreply@animalhouse.com',
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
    if (!process.env.SENDGRID_API_KEY) {
      console.log('SendGrid not configured, admin email notification skipped');
      return false;
    }

    try {
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
        </div>
      `;

      await this.mailService.send({
        to: adminEmail,
        from: 'noreply@animalhouse.com',
        subject: `New Appointment #${appointmentId} - Animal House Admin Alert`,
        html: emailContent,
      });

      return true;
    } catch (error) {
      console.error('Failed to send admin new appointment email:', error);
      return false;
    }
  }

  async sendOrderStatusEmail(to: string, firstName: string, orderId: number, status: string): Promise<boolean> {
    if (!process.env.SENDGRID_API_KEY) {
      console.log('SendGrid not configured, email notification skipped');
      return false;
    }

    try {
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
        </div>
      `;

      await this.mailService.send({
        to,
        from: 'noreply@animalhousepetstore.com',
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
      const emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px;">
            <h2 style="color: #22c55e; margin-bottom: 20px;">✅ Appointment Confirmed #${appointmentId}</h2>
            <p style="font-size: 16px; line-height: 1.5;">Hi ${firstName},</p>
            <p style="font-size: 16px; line-height: 1.5;">Great news! Your grooming appointment has been confirmed.</p>
            
            <div style="background-color: #22c55e; color: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <strong>📅 Appointment Details:</strong><br>
              Service: ${serviceType}<br>
              Date: ${new Date(appointmentDate).toLocaleDateString()}<br>
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
        </div>
      `;

      await this.mailService.send({
        to,
        from: 'noreply@animalhousepetstore.com',
        subject: `Appointment Confirmed - ${serviceType} on ${new Date(appointmentDate).toLocaleDateString()}`,
        html: emailContent,
      });

      console.log(`Appointment confirmation email sent to ${to} for appointment ${appointmentId}`);
      return true;
    } catch (error) {
      console.error('Appointment confirmation email error:', error);
      return false;
    }
  }

  async sendAppointmentRejectedEmail(to: string, firstName: string, appointmentId: number, serviceType: string, appointmentDate: string, appointmentTime: string): Promise<boolean> {
    try {
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
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">
              Animal House Pet Store - Your trusted pet care partner
            </p>
          </div>
        </div>
      `;

      await this.mailService.send({
        to,
        from: 'noreply@animalhousepetstore.com',
        subject: 'Animal House - Appointment Update',
        html: emailContent,
      });

      console.log(`Appointment rejection email sent to ${to} for appointment ${appointmentId}`);
      return true;
    } catch (error) {
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

// SMS notification service
class SMSService {
  async sendOrderStatusSMS(phoneNumber: string, firstName: string, orderId: number, status: string): Promise<boolean> {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
      console.log('Twilio not configured, SMS notification skipped');
      return false;
    }

    try {
      // Import Twilio dynamically to avoid errors if not installed
      const twilio = await import('twilio');
      const client = twilio.default(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

      const messages = {
        'in_progress': `Hi ${firstName}! Your Animal House order #${orderId} is being prepared. We'll text you when it's ready for pickup!`,
        'ready': `${firstName}, your order #${orderId} is ready for pickup at Animal House Pet Store! 🐾`
      };

      const message = messages[status as keyof typeof messages];
      if (!message) return false;

      await client.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phoneNumber,
      });

      console.log(`SMS sent to ${phoneNumber} for order ${orderId} status: ${status}`);
      return true;
    } catch (error) {
      console.error('SMS notification error:', error);
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
    totalAmount: string
  ): Promise<void> {
    console.log(`Sending admin notifications for new order ${orderId}`);

    // Send email notifications to all admin users
    for (const adminEmail of adminEmails) {
      await this.emailService.sendAdminNewOrderEmail(adminEmail, orderId, customerName, totalAmount);
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
    appointmentTime: string
  ): Promise<void> {
    console.log(`Sending admin notifications for new appointment ${appointmentId}`);

    // Send email notifications to all admin users
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

    // Send email notification
    await this.emailService.sendOrderStatusEmail(userEmail, userFirstName, orderId, status);

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
    appointmentTime: string
  ): Promise<void> {
    console.log(`Sending appointment confirmation notification for appointment ${appointmentId}`);
    
    // Send email notification
    await this.emailService.sendAppointmentConfirmedEmail(
      userEmail, 
      userFirstName, 
      appointmentId, 
      serviceType, 
      appointmentDate, 
      appointmentTime
    );
  }

  async sendAppointmentRejectedNotification(
    userEmail: string,
    userFirstName: string,
    appointmentId: number,
    serviceType: string,
    appointmentDate: string,
    appointmentTime: string
  ): Promise<void> {
    console.log(`Sending appointment rejection notification for appointment ${appointmentId}`);
    
    // Send email notification
    await this.emailService.sendAppointmentRejectedEmail(
      userEmail, 
      userFirstName, 
      appointmentId, 
      serviceType, 
      appointmentDate, 
      appointmentTime
    );
  }
}

export const notificationService = new NotificationService();