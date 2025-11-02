import sgMail from '@sendgrid/mail';

function getSendGridClient() {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;

  console.log('[SendGrid] Checking credentials...');
  console.log('[SendGrid] API Key exists:', !!apiKey);
  console.log('[SendGrid] From Email exists:', !!fromEmail);
  console.log('[SendGrid] From Email value:', fromEmail);

  if (!apiKey || !fromEmail) {
    console.error('[SendGrid] Missing credentials - API Key:', !!apiKey, 'From Email:', !!fromEmail);
    throw new Error('SendGrid credentials not configured. Please set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL in Replit Secrets.');
  }

  sgMail.setApiKey(apiKey);
  return {
    client: sgMail,
    fromEmail: fromEmail
  };
}

export async function sendPasswordResetEmail(toEmail: string, resetToken: string): Promise<void> {
  try {
    const { client, fromEmail } = getSendGridClient();
    
    // Get the base URL for the reset link
    const baseUrl = process.env.REPLIT_DOMAINS 
      ? `https://${process.env.REPLIT_DOMAINS}` 
      : 'http://localhost:5000';
    
    const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;
    
    const msg = {
      to: toEmail,
      from: fromEmail,
      subject: 'Animal House - Password Reset Request',
      text: `You requested a password reset. Click this link to reset your password: ${resetLink}\n\nThis link will expire in 1 hour.\n\nIf you didn't request this, please ignore this email.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #1e40af; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">Animal House Pet Store</h1>
          </div>
          <div style="padding: 30px; background-color: #f9fafb;">
            <h2 style="color: #1f2937;">Password Reset Request</h2>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.5;">
              You requested to reset your password. Click the button below to create a new password:
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" 
                 style="background-color: #1e40af; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                Reset Password
              </a>
            </div>
            <p style="color: #6b7280; font-size: 14px;">
              This link will expire in 1 hour for security purposes.
            </p>
            <p style="color: #6b7280; font-size: 14px;">
              If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
            </p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">
              Animal House Pet Store - Your trusted pet care partner
            </p>
          </div>
        </div>
      `,
    };
    
    await client.send(msg);
    console.log(`Password reset email sent to ${toEmail}`);
  } catch (error) {
    console.error('Error sending password reset email:', error);
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
    const { client, fromEmail } = getSendGridClient();
    
    const msg = {
      to: toEmail,
      from: fromEmail,
      subject: 'Animal House - Grooming Appointment Update',
      text: `Dear ${ownerName},\n\nSorry for the inconvenience, but your Grooming Appointment has been rejected.\n\nAppointment Details:\n- Pet: ${petName}\n- Date: ${appointmentDate}\n- Time: ${appointmentTime}\n\nPlease expect a call promptly with an explanation.\n\nThank you for your understanding.\n\nAnimal House Pet Store`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #1e40af; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">Animal House Pet Store</h1>
          </div>
          <div style="padding: 30px; background-color: #f9fafb;">
            <h2 style="color: #dc2626;">Grooming Appointment Update</h2>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.5;">
              Dear ${ownerName},
            </p>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.5;">
              Sorry for the inconvenience, but your <strong>Grooming Appointment has been rejected</strong>.
            </p>
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
              <h3 style="color: #1f2937; margin-top: 0;">Appointment Details</h3>
              <p style="color: #4b5563; margin: 8px 0;"><strong>Pet:</strong> ${petName}</p>
              <p style="color: #4b5563; margin: 8px 0;"><strong>Date:</strong> ${appointmentDate}</p>
              <p style="color: #4b5563; margin: 8px 0;"><strong>Time:</strong> ${appointmentTime}</p>
            </div>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.5;">
              Please expect a call promptly with an explanation.
            </p>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.5;">
              Thank you for your understanding.
            </p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">
              Animal House Pet Store - Your trusted pet care partner
            </p>
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
