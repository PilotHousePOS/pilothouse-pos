import sgMail from '@sendgrid/mail';

async function getCredentials() {
  const apiKey = process.env.SENDGRID_KEY_OVERRIDE || process.env.SENDGRID_API_KEY;
  const email = process.env.SENDGRID_FROM_EMAIL;

  if (apiKey && email) {
    return { apiKey, email };
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME || process.env.CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (hostname && xReplitToken) {
    try {
      const connectionSettings = await fetch(
        'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=sendgrid',
        {
          headers: {
            'Accept': 'application/json',
            'X_REPLIT_TOKEN': xReplitToken
          }
        }
      ).then(res => res.json()).then(data => data.items?.[0]);

      if (connectionSettings?.settings?.api_key && connectionSettings?.settings?.from_email) {
        return { apiKey: connectionSettings.settings.api_key, email: connectionSettings.settings.from_email };
      }
    } catch {
    }
  }

  throw new Error('SendGrid not configured: set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL environment variables');
}

async function getAlternateReplyToEmail(tenantId?: number): Promise<string | null> {
  try {
    const { storage } = await import('./storage');
    const settings = await storage.getGroomingSettings(tenantId);
    const setting = settings.find((s: any) => s.setting === 'alternate_reply_email');
    return setting?.value || null;
  } catch {
    return null;
  }
}

export async function getUncachableSendGridClient(tenantId?: number) {
  const {apiKey, email} = await getCredentials();
  sgMail.setApiKey(apiKey);
  const alternateEmail = await getAlternateReplyToEmail(tenantId);
  const replyTo: {email: string} = alternateEmail 
    ? {email: alternateEmail}
    : {email};
  return {
    client: sgMail,
    fromEmail: email,
    replyTo,
    replyToList: [replyTo],
    adminBcc: alternateEmail || email,
  };
}
