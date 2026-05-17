import { getUncachableSendGridClient } from './sendgridIntegration';
import { getBaseUrl } from './utils';

export async function sendVerificationEmail(toEmail: string, firstName: string, verificationToken: string, baseUrl?: string): Promise<void> {
  try {
    const { client, fromEmail, replyTo } = await getUncachableSendGridClient();

    // Prefer the caller-supplied baseUrl (derived from req.get('host')) so the
    // link always matches the domain the user actually signed up from.
    // Fall back to getBaseUrl() if not provided.
    const resolvedBaseUrl = baseUrl || getBaseUrl();
    console.log(`[sendVerificationEmail] baseUrl resolved to: ${resolvedBaseUrl}`);

    const verifyLink = `${resolvedBaseUrl}/verify-email?token=${verificationToken}`;

    const msg = {
      to: toEmail,
      from: { email: fromEmail, name: 'Animal House Pet Store' },
      replyTo,
      subject: 'Verify Your Animal House Account',
      text: `Welcome to Animal House Pet Store, ${firstName}!\n\nPlease verify your email address within 24 hours by visiting:\n\n${verifyLink}\n\nIf you did not create an account, you can ignore this email.\n\nAnimal House Pet Store\n(318) 322-3023`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #dc2626; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">Animal House Pet Store</h1>
          </div>
          <div style="padding: 30px; background-color: #f9f9f9;">
            <h2 style="color: #333; margin-bottom: 10px;">Welcome, ${firstName}!</h2>
            <p style="font-size: 16px; line-height: 1.5; color: #444;">
              Thanks for creating an account. Please verify your email address to activate your account.
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verifyLink}"
                 style="background-color: #dc2626; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                Verify My Email
              </a>
            </div>
            <div style="background-color: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0; color: #92400e; font-size: 14px;">
                <strong>This link expires in 24 hours.</strong> If it expires, you can request a new verification link from the sign-in page.
              </p>
            </div>
            <p style="font-size: 14px; color: #666;">
              If the button doesn't work, copy and paste this link into your browser:
            </p>
            <p style="font-size: 12px; color: #999; word-break: break-all;">${verifyLink}</p>
          </div>
          <div style="background-color: #1f2937; color: #d1d5db; padding: 15px; text-align: center; font-size: 12px;">
            <p style="margin: 0 0 5px 0;"><strong>Animal House Pet Store</strong></p>
            <p style="margin: 0 0 5px 0;">2934 Cypress St, West Monroe, LA 71291</p>
            <p style="margin: 0;">Phone: (318) 322-3023</p>
          </div>
        </div>
      `,
    };

    await client.send({
      ...msg,
      trackingSettings: {
        clickTracking: { enable: false, enableText: false },
      },
    });
    console.log(`Verification email sent to ${toEmail}`);
  } catch (error: any) {
    console.error('Error sending verification email:', error);
    if (error.response?.body) {
      console.error('SendGrid error details:', JSON.stringify(error.response.body, null, 2));
    }
    throw new Error('Failed to send verification email');
  }
}

export async function sendPasswordResetEmail(toEmail: string, resetToken: string): Promise<void> {
  try {
    const { client, fromEmail, replyTo } = await getUncachableSendGridClient();
    
    const baseUrl = getBaseUrl();
    
    const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;
    
    const msg = {
      to: toEmail,
      from: {
        email: fromEmail,
        name: 'Animal House Pet Store'
      },
      replyTo,
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

export async function sendContactChangeOtpEmail(
  toEmail: string,
  firstName: string,
  otp: string,
  changeType: 'email' | 'phone',
  newValue: string,
): Promise<void> {
  try {
    const { client, fromEmail, replyTo } = await getUncachableSendGridClient();
    const fieldLabel = changeType === 'email' ? 'email address' : 'phone number';
    const msg = {
      to: toEmail,
      from: { email: fromEmail, name: 'Animal House Pet Store' },
      replyTo,
      subject: `Animal House – Verify Your ${changeType === 'email' ? 'New Email' : 'Phone Change'}`,
      text: `Hi ${firstName},\n\nWe received a request to change your ${fieldLabel} to: ${newValue}\n\nYour verification code is: ${otp}\n\nThis code expires in 15 minutes. If you did not request this change, please ignore this email and your account will remain unchanged.\n\nAnimal House Pet Store\n(318) 322-3023`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #dc2626; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">Animal House Pet Store</h1>
          </div>
          <div style="padding: 30px; background-color: #f9f9f9;">
            <h2 style="color: #333;">Verify Your ${fieldLabel === 'email address' ? 'New Email' : 'Phone Change'}</h2>
            <p style="font-size: 16px; color: #444;">Hi ${firstName},</p>
            <p style="font-size: 16px; color: #444;">We received a request to change your ${fieldLabel} to: <strong>${newValue}</strong></p>
            <p style="font-size: 16px; color: #444;">Enter this code to confirm the change:</p>
            <div style="text-align: center; margin: 30px 0;">
              <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #dc2626; background-color: #fff; border: 2px solid #dc2626; padding: 12px 24px; border-radius: 8px;">${otp}</span>
            </div>
            <div style="background-color: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0; color: #92400e; font-size: 14px;"><strong>This code expires in 15 minutes.</strong> If you did not request this change, ignore this email — your account will remain unchanged.</p>
            </div>
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
    console.log(`Contact change OTP sent to ${toEmail}`);
  } catch (error: any) {
    console.error('Error sending contact change OTP email:', error);
    if (error.response?.body) {
      console.error('SendGrid error details:', JSON.stringify(error.response.body, null, 2));
    }
    throw new Error('Failed to send verification code');
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
    const { client, fromEmail, replyTo } = await getUncachableSendGridClient();
    
    const msg = {
      to: toEmail,
      from: fromEmail,
      replyTo,
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
