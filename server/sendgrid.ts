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
      from: { email: fromEmail, name: 'PilotHouse' },
      replyTo,
      subject: 'Verify Your PilotHouse Account',
      text: `Welcome to PilotHouse, ${firstName}!\n\nPlease verify your email address within 24 hours by visiting:\n\n${verifyLink}\n\nIf you did not create an account, you can ignore this email.\n\nPilotHouse\n(318) 322-3023`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #dc2626; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">PilotHouse</h1>
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
            <p style="margin: 0 0 5px 0;"><strong>PilotHouse</strong></p>
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
        name: 'PilotHouse'
      },
      replyTo,
      subject: 'Your PilotHouse Account - Action Required',
      text: `PilotHouse - Account Security\n\nHello,\n\nWe received a request to update your account credentials. To complete this process, please visit:\n\n${resetLink}\n\nThis link expires in 1 hour.\n\nIf you did not make this request, no action is needed - your account remains secure.\n\nThank you,\nPilotHouse\n318-323-6090`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #dc2626; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">PilotHouse</h1>
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
            <p style="margin: 0 0 5px 0;"><strong>PilotHouse</strong></p>
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
      from: { email: fromEmail, name: 'PilotHouse' },
      replyTo,
      subject: `PilotHouse – Verify Your ${changeType === 'email' ? 'New Email' : 'Phone Change'}`,
      text: `Hi ${firstName},\n\nWe received a request to change your ${fieldLabel} to: ${newValue}\n\nYour verification code is: ${otp}\n\nThis code expires in 15 minutes. If you did not request this change, please ignore this email and your account will remain unchanged.\n\nPilotHouse\n(318) 322-3023`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #dc2626; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">PilotHouse</h1>
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
            <p style="margin: 0 0 5px 0;"><strong>PilotHouse</strong></p>
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

export async function sendTrialWarningEmail(
  toEmail: string,
  firstName: string,
  daysLeft: number,
  tenantName: string,
  baseUrl?: string,
): Promise<void> {
  try {
    const { client, fromEmail, replyTo } = await getUncachableSendGridClient();
    const resolvedBaseUrl = baseUrl || getBaseUrl();
    const billingUrl = `${resolvedBaseUrl}/settings/billing`;

    const dayWord = daysLeft === 1 ? 'day' : 'days';
    const urgency = daysLeft <= 1 ? '⚠️ ' : '';

    const msg = {
      to: toEmail,
      from: { email: fromEmail, name: 'PilotHouse' },
      replyTo,
      subject: `${urgency}Your PilotHouse trial ends in ${daysLeft} ${dayWord}`,
      text: `Hi ${firstName},\n\nYour PilotHouse trial for ${tenantName} expires in ${daysLeft} ${dayWord}. Subscribe now to keep full access to your store.\n\nChoose a plan: ${billingUrl}\n\nIf you have any questions, reply to this email or call us at (318) 322-3023.\n\nPilotHouse`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #dc2626; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">PilotHouse</h1>
          </div>
          <div style="padding: 30px; background-color: #f9f9f9;">
            <h2 style="color: #333; margin-bottom: 10px;">Your trial ends in ${daysLeft} ${dayWord}</h2>
            <p style="font-size: 16px; line-height: 1.5; color: #444;">
              Hi ${firstName},
            </p>
            <p style="font-size: 16px; line-height: 1.5; color: #444;">
              Your PilotHouse trial for <strong>${tenantName}</strong> will expire in <strong>${daysLeft} ${dayWord}</strong>.
              Subscribe now to keep uninterrupted access to your POS, orders, inventory, and grooming appointments.
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${billingUrl}"
                 style="background-color: #dc2626; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                Choose a Plan
              </a>
            </div>
            <div style="background-color: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0; color: #92400e; font-size: 14px;">
                <strong>Don't lose access.</strong> After your trial ends, your store will be locked until you subscribe.
              </p>
            </div>
            <p style="font-size: 14px; color: #666;">
              Questions? Reply to this email or call us at (318) 322-3023.
            </p>
          </div>
          <div style="background-color: #1f2937; color: #d1d5db; padding: 15px; text-align: center; font-size: 12px;">
            <p style="margin: 0 0 5px 0;"><strong>PilotHouse</strong></p>
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
    console.log(`Trial warning email sent to ${toEmail} (${daysLeft} days left)`);
  } catch (error: any) {
    console.error('Error sending trial warning email:', error);
    if (error.response?.body) {
      console.error('SendGrid error details:', JSON.stringify(error.response.body, null, 2));
    }
    throw new Error('Failed to send trial warning email');
  }
}

/**
 * Sends an alert email to all platform super-admins when a trial tenant is skipped
 * during the trial expiry warning run because the owner has no email (or no ownerId).
 * Without this alert the tenant would silently miss their expiry warning.
 */
export async function sendTrialOwnerMissingAlertToSuperAdmins(tenant: {
  id: number;
  name: string;
  trialEndsAt: Date | string | null;
  ownerId: string | number | null | undefined;
}): Promise<void> {
  try {
    const { storage } = await import('./storage');
    const allUsers = await storage.getAllUsers();
    const superAdmins = allUsers.filter((u: any) => u.isSuperAdmin && u.email);

    if (superAdmins.length === 0) {
      console.warn(`[trial-owner-missing-alert] No super-admins with email found to notify for tenant ${tenant.id}.`);
      return;
    }

    const { client, fromEmail } = await getUncachableSendGridClient();

    const trialEndsAt = tenant.trialEndsAt
      ? new Date(tenant.trialEndsAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago' })
      : 'unknown';

    const reason = !tenant.ownerId
      ? 'No ownerId is set on this tenant — the owner account may not have been created yet.'
      : 'The owner account exists but has no email address on file.';

    const subject = `[PilotHouse] Trial warning skipped — owner email missing for "${tenant.name}"`;
    const textBody = `A trial expiry warning could not be sent for the following store because the owner has no email address.\n\nStore details:\n  Tenant ID:   ${tenant.id}\n  Store Name:  ${tenant.name}\n  Trial Ends:  ${trialEndsAt}\n  Owner ID:    ${tenant.ownerId ?? '(none)'}\n\nReason: ${reason}\n\nPlease assign a valid email to the store owner so future warnings can be delivered.`;
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #dc2626; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">PilotHouse</h1>
        </div>
        <div style="padding: 30px; background-color: #f9f9f9;">
          <h2 style="color: #92400e; margin-bottom: 10px;">⚠️ Trial Warning Not Sent — Owner Email Missing</h2>
          <p style="font-size: 15px; color: #444; line-height: 1.5;">
            The scheduled trial expiry warning could <strong>not be delivered</strong> for the store below
            because the owner has no email address on file. The tenant will <strong>silently miss their warning</strong>
            unless this is resolved.
          </p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 8px 12px; color: #6b7280; width: 110px;">Tenant ID</td>
              <td style="padding: 8px 12px; color: #111827; font-family: monospace;">${tenant.id}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 8px 12px; color: #6b7280;">Store Name</td>
              <td style="padding: 8px 12px; color: #111827; font-weight: 500;">${tenant.name}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 8px 12px; color: #6b7280;">Trial Ends</td>
              <td style="padding: 8px 12px; color: #111827;">${trialEndsAt}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 8px 12px; color: #6b7280;">Owner ID</td>
              <td style="padding: 8px 12px; color: #111827; font-family: monospace;">${tenant.ownerId ?? '<em>(none)</em>'}</td>
            </tr>
          </table>
          <div style="background-color: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 5px;">
            <p style="margin: 0; color: #92400e; font-size: 14px;">
              <strong>Reason:</strong> ${reason}<br><br>
              Please assign a valid email to the store owner from the admin panel so the trial warning can be delivered.
            </p>
          </div>
        </div>
        <div style="background-color: #1f2937; color: #d1d5db; padding: 15px; text-align: center; font-size: 12px;">
          <p style="margin: 0 0 5px 0;"><strong>PilotHouse</strong></p>
          <p style="margin: 0 0 5px 0;">2934 Cypress St, West Monroe, LA 71291</p>
          <p style="margin: 0;">Phone: (318) 322-3023</p>
        </div>
      </div>
    `;

    for (const admin of superAdmins) {
      try {
        await client.send({
          to: admin.email!,
          from: { email: fromEmail, name: 'PilotHouse' },
          subject,
          text: textBody,
          html: htmlBody,
          trackingSettings: { clickTracking: { enable: false, enableText: false } },
        });
        console.log(`[trial-owner-missing-alert] Alert sent to super-admin ${admin.email} for tenant ${tenant.id}`);
      } catch (adminEmailErr) {
        console.error(`[trial-owner-missing-alert] Failed to send alert to ${admin.email}:`, adminEmailErr);
      }
    }
  } catch (error) {
    console.error('[trial-owner-missing-alert] Error sending trial-owner-missing alert:', error);
    // Non-fatal — never block the scheduler for an alert failure
  }
}

/**
 * Sends an alert email to all platform super-admins when the scheduled Stripe
 * key health check detects an invalid or rotated secret key.
 *
 * Returns the number of super-admins successfully notified.
 * Throws if the outer setup fails (no SendGrid client, DB unavailable, etc.)
 * so the caller can decide whether to mark the idempotency guard.
 */
export async function sendStripeKeyFailureAlertToSuperAdmins(error: string): Promise<number> {
  const { storage } = await import('./storage');
  const allUsers = await storage.getAllUsers();
  const superAdmins = allUsers.filter((u: any) => u.isSuperAdmin && u.email);

  if (superAdmins.length === 0) {
    console.warn('[stripe-health-alert] No super-admins with email found to notify.');
    // Nothing to send — treat as "delivered to nobody" (0) so the caller can retry
    return 0;
  }

  const { client, fromEmail } = await getUncachableSendGridClient();

  const checkedAt = new Date().toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Chicago',
  });

  const subject = `[PilotHouse] ⚠️ Stripe key health check failed`;
  const textBody = [
    'The scheduled Stripe key health check has detected a failure.',
    '',
    `Error: ${error}`,
    `Checked at: ${checkedAt} CST`,
    '',
    'Please rotate or update the Stripe API key in Replit Secrets immediately to prevent checkout failures for customers.',
  ].join('\n');

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #dc2626; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0;">PilotHouse</h1>
      </div>
      <div style="padding: 30px; background-color: #f9f9f9;">
        <h2 style="color: #92400e; margin-bottom: 10px;">⚠️ Stripe Key Health Check Failed</h2>
        <p style="font-size: 15px; color: #444; line-height: 1.5;">
          The scheduled Stripe key health check has detected a failure.
          Customers will be <strong>unable to complete checkout</strong> until the key is fixed.
        </p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px 12px; color: #6b7280; width: 110px;">Error</td>
            <td style="padding: 8px 12px; color: #111827; font-family: monospace;">${error}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; color: #6b7280;">Checked At</td>
            <td style="padding: 8px 12px; color: #111827;">${checkedAt} CST</td>
          </tr>
        </table>
        <div style="background-color: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 5px;">
          <p style="margin: 0; color: #92400e; font-size: 14px;">
            <strong>Action required:</strong> Update the Stripe API key in Replit Secrets immediately
            to restore checkout for all stores.
          </p>
        </div>
      </div>
      <div style="background-color: #1f2937; color: #d1d5db; padding: 15px; text-align: center; font-size: 12px;">
        <p style="margin: 0 0 5px 0;"><strong>PilotHouse</strong></p>
        <p style="margin: 0 0 5px 0;">2934 Cypress St, West Monroe, LA 71291</p>
        <p style="margin: 0;">Phone: (318) 322-3023</p>
      </div>
    </div>
  `;

  let sentCount = 0;
  for (const admin of superAdmins) {
    try {
      await client.send({
        to: admin.email!,
        from: { email: fromEmail, name: 'PilotHouse' },
        subject,
        text: textBody,
        html: htmlBody,
        trackingSettings: { clickTracking: { enable: false, enableText: false } },
      });
      sentCount++;
      console.log(`[stripe-health-alert] Alert sent to super-admin ${admin.email}`);
    } catch (adminEmailErr) {
      console.error(`[stripe-health-alert] Failed to send alert to ${admin.email}:`, adminEmailErr);
    }
  }

  if (sentCount === 0) {
    throw new Error(
      `[stripe-health-alert] All ${superAdmins.length} super-admin alert(s) failed to deliver`,
    );
  }

  return sentCount;
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
      subject: 'PilotHouse - Appointment Update',
      text: `PilotHouse regrets to inform you that we could not accept your appointment. This may have been due to several reasons. If you have any questions about this please contact us at 318-323-6090`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #1e40af; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">PilotHouse</h1>
          </div>
          <div style="padding: 30px; background-color: #f9fafb;">
            <h2 style="color: #dc2626;">Appointment Update</h2>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.5;">
              PilotHouse regrets to inform you that we could not accept your appointment. This may have been due to several reasons. If you have any questions about this please contact us at <strong>318-323-6090</strong>.
            </p>
          </div>
          <div style="background-color: #1f2937; color: #d1d5db; padding: 15px; text-align: center; font-size: 12px;">
            <p style="margin: 0 0 5px 0;"><strong>PilotHouse</strong></p>
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

/**
 * Sends an alert email to all platform super-admins when an authenticated user
 * has no tenant assigned to their account (i.e., they are stuck and cannot use the app).
 */
export async function sendNoTenantAlertToSuperAdmins(strandedUser: {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  createdAt: Date | null;
}): Promise<void> {
  try {
    const { storage } = await import('./storage');
    const allUsers = await storage.getAllUsers();
    const superAdmins = allUsers.filter((u: any) => u.isSuperAdmin && u.email);

    if (superAdmins.length === 0) {
      console.warn('[no-tenant-alert] No super-admins with email found to notify.');
      return;
    }

    const { client, fromEmail } = await getUncachableSendGridClient();

    const displayName = [strandedUser.firstName, strandedUser.lastName].filter(Boolean).join(' ') || '(no name)';
    const joinDate = strandedUser.createdAt
      ? new Date(strandedUser.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
      : 'unknown';

    const subject = `[PilotHouse] Stranded account — user has no store assigned`;
    const textBody = `A user logged in but has no tenant (store) assigned to their account.\n\nUser details:\n  Name:      ${displayName}\n  Email:     ${strandedUser.email || '(none)'}\n  User ID:   ${strandedUser.id}\n  Joined:    ${joinDate}\n\nPlease assign the correct tenant from the admin panel or contact the user directly.`;
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #dc2626; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">PilotHouse</h1>
        </div>
        <div style="padding: 30px; background-color: #f9f9f9;">
          <h2 style="color: #92400e; margin-bottom: 10px;">⚠️ Stranded Account Alert</h2>
          <p style="font-size: 15px; color: #444; line-height: 1.5;">
            A user logged in but has <strong>no store (tenant) assigned</strong> to their account.
            They are currently seeing the "Account Not Configured" screen and cannot use the app.
          </p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 8px 12px; color: #6b7280; width: 100px;">Name</td>
              <td style="padding: 8px 12px; color: #111827; font-weight: 500;">${displayName}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 8px 12px; color: #6b7280;">Email</td>
              <td style="padding: 8px 12px; color: #111827;">${strandedUser.email || '<em>(none)</em>'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 8px 12px; color: #6b7280;">User ID</td>
              <td style="padding: 8px 12px; color: #111827; font-family: monospace;">${strandedUser.id}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; color: #6b7280;">Joined</td>
              <td style="padding: 8px 12px; color: #111827;">${joinDate}</td>
            </tr>
          </table>
          <div style="background-color: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 5px;">
            <p style="margin: 0; color: #92400e; font-size: 14px;">
              Please assign the correct tenant from the admin panel or contact the user directly so they can access their store.
            </p>
          </div>
        </div>
        <div style="background-color: #1f2937; color: #d1d5db; padding: 15px; text-align: center; font-size: 12px;">
          <p style="margin: 0 0 5px 0;"><strong>PilotHouse</strong></p>
          <p style="margin: 0 0 5px 0;">2934 Cypress St, West Monroe, LA 71291</p>
          <p style="margin: 0;">Phone: (318) 322-3023</p>
        </div>
      </div>
    `;

    for (const admin of superAdmins) {
      try {
        await client.send({
          to: admin.email!,
          from: { email: fromEmail, name: 'PilotHouse' },
          subject,
          text: textBody,
          html: htmlBody,
          trackingSettings: { clickTracking: { enable: false, enableText: false } },
        });
        console.log(`[no-tenant-alert] Alert sent to super-admin ${admin.email}`);
      } catch (adminEmailErr) {
        console.error(`[no-tenant-alert] Failed to send alert to ${admin.email}:`, adminEmailErr);
      }
    }
  } catch (error) {
    console.error('[no-tenant-alert] Error sending no-tenant alert:', error);
    // Non-fatal — never block the user response for an alert failure
  }
}

export async function send2faCodeEmail(
  toEmail: string,
  firstName: string,
  code: string,
): Promise<void> {
  try {
    const { client, fromEmail, replyTo } = await getUncachableSendGridClient();
    await client.send({
      to: toEmail,
      from: { email: fromEmail, name: 'PilotHouse' },
      replyTo,
      subject: 'PilotHouse – Your Sign-In Verification Code',
      text: `Hi ${firstName},\n\nYour sign-in verification code is: ${code}\n\nThis code expires in 10 minutes. If you did not attempt to sign in, please change your password immediately.\n\nPilotHouse\n(318) 322-3023`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background-color:#dc2626;color:white;padding:20px;text-align:center;">
            <h1 style="margin:0;">PilotHouse</h1>
          </div>
          <div style="padding:30px;background-color:#f9f9f9;">
            <h2 style="color:#333;">Sign-In Verification</h2>
            <p style="font-size:16px;color:#444;">Hi ${firstName},</p>
            <p style="font-size:16px;color:#444;">Enter this code to complete your sign-in:</p>
            <div style="text-align:center;margin:30px 0;">
              <span style="font-size:40px;font-weight:bold;letter-spacing:10px;color:#dc2626;background:#fff;border:2px solid #dc2626;padding:14px 28px;border-radius:8px;">${code}</span>
            </div>
            <div style="background:#fef3c7;border:1px solid #f59e0b;padding:15px;border-radius:5px;margin:20px 0;">
              <p style="margin:0;color:#92400e;font-size:14px;"><strong>Expires in 10 minutes.</strong> If you did not try to sign in, change your password immediately.</p>
            </div>
          </div>
          <div style="background-color:#1f2937;color:#d1d5db;padding:15px;text-align:center;font-size:12px;">
            <p style="margin:0 0 5px 0;"><strong>PilotHouse</strong></p>
            <p style="margin:0 0 5px 0;">2934 Cypress St, West Monroe, LA 71291</p>
            <p style="margin:0;">Phone: (318) 322-3023</p>
          </div>
        </div>
      `,
    });
  } catch (error: any) {
    console.error('Error sending 2FA code email:', error);
    throw new Error('Failed to send verification code');
  }
}
