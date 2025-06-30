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
}

// Push notification service (for web push notifications)
class PushNotificationService {
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
}

export const notificationService = new NotificationService();