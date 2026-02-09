import { getUncachableSendGridClient } from './sendgridIntegration';

export async function sendPasswordResetEmail(toEmail: string, resetToken: string): Promise<void> {
  try {
    const { client, fromEmail, replyToList } = await getUncachableSendGridClient();
    
    // Get the base URL for the reset link
    const baseUrl = process.env.REPLIT_DOMAINS 
      ? `https://${process.env.REPLIT_DOMAINS}` 
      : 'http://localhost:5000';
    
    const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;
    
    const msg = {
      to: toEmail,
      from: {
        email: fromEmail,
        name: 'Animal House Pet Store'
      },
      replyToList,
      subject: 'Your Animal House Account - Action Required',
      text: `Animal House Pet Store - Account Security\n\nHello,\n\nWe received a request to update your account credentials. To complete this process, please visit:\n\n${resetLink}\n\nThis link expires in 1 hour.\n\nIf you did not make this request, no action is needed - your account remains secure.\n\nThank you,\nAnimal House Pet Store\n318-323-6090`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #dc2626; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">Animal House Pet Store</h1>
          </div>
          <div style="padding: 30px; background-color: #f9f9f9;">
            <h2 style="color: #333; margin-bottom: 20px;">🔐 Account Security Update</h2>
            <p style="font-size: 16px; line-height: 1.5;">
              We received a request to update your account credentials. Click below to continue:
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" 
                 style="background-color: #dc2626; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                Update Account
              </a>
            </div>
            <div style="background-color: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0; color: #92400e; font-size: 14px;">
                <strong>Security Notice:</strong> This link expires in 1 hour. If you didn't request this, no action is needed.
              </p>
            </div>
            <p style="font-size: 14px; color: #666;">
              If the button doesn't work, copy and paste this link into your browser:
            </p>
            <p style="font-size: 12px; color: #999; word-break: break-all;">
              ${resetLink}
            </p>
          </div>
          <div style="background-color: #1f2937; color: #d1d5db; padding: 15px; text-align: center; font-size: 12px;">
            <p style="margin: 0 0 5px 0;"><strong>Animal House Pet Store</strong></p>
            <p style="margin: 0 0 5px 0;">2934 Cypress St, West Monroe, LA 71291</p>
            <p style="margin: 0;">Phone: (318) 322-3023</p>
          </div>
        </div>
      `,
    };
    
    await client.send(msg);
    console.log(`Password reset email sent to ${toEmail}`);
  } catch (error: any) {
    console.error('Error sending password reset email:', error);
    if (error.response?.body) {
      console.error('SendGrid error details:', JSON.stringify(error.response.body, null, 2));
    }
    throw new Error('Failed to send password reset email');
  }
}

export async function sendAppointmentRejectionEmail(
  toEmail: string, 
  ownerName: string,
  petName: string,
  appointmentDate: string,
  appointmentTime: string
): Promise<void> {
  try {
    const { client, fromEmail, replyToList } = await getUncachableSendGridClient();
    
    const msg = {
      to: toEmail,
      from: fromEmail,
      replyToList,
      subject: 'Animal House - Appointment Update',
      text: `The Animal House regrets to inform you that we could not accept your appointment. This may have been due to several reasons. If you have any questions about this please contact us at 318-323-6090`,
      html: `
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
      `,
    };
    
    await client.send(msg);
    console.log(`Appointment rejection email sent to ${toEmail}`);
  } catch (error) {
    console.error('Error sending appointment rejection email:', error);
    throw new Error('Failed to send appointment rejection email');
  }
}
