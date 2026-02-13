// Stripe client for Animal House Pet Store
// Uses user-provided API keys, falls back to Replit connector

import Stripe from 'stripe';

let validatedCredentials: { publishableKey: string; secretKey: string } | null = null;

async function getCredentials() {
  if (validatedCredentials) return validatedCredentials;

  const candidates: { publishableKey: string; secretKey: string; source: string }[] = [];

  const liveSecretKey = (process.env.STRIPE_SK_LIVE || process.env.STRIPE_LIVE_SECRET_KEY)?.trim();
  const livePublishableKey = (process.env.STRIPE_PK_LIVE || process.env.STRIPE_LIVE_PUBLISHABLE_KEY)?.trim();
  if (liveSecretKey && livePublishableKey) {
    candidates.push({ publishableKey: livePublishableKey, secretKey: liveSecretKey, source: 'live env vars' });
  }

  const userSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const userPublishableKey = process.env.STRIPE_PUBLISHABLE_KEY?.trim();
  if (userSecretKey && userPublishableKey) {
    candidates.push({ publishableKey: userPublishableKey, secretKey: userSecretKey, source: 'test env vars' });
  }

  try {
    const connectorCreds = await getConnectorCredentials();
    if (connectorCreds) {
      candidates.push({ ...connectorCreds, source: 'Stripe connector' });
    }
  } catch (e) {}

  for (const cred of candidates) {
    try {
      const testStripe = new Stripe(cred.secretKey, { apiVersion: '2025-08-27.basil' });
      await testStripe.accounts.retrieve();
      console.log(`[Stripe] Using validated key from: ${cred.source}`);
      validatedCredentials = { publishableKey: cred.publishableKey, secretKey: cred.secretKey };
      return validatedCredentials;
    } catch (err: any) {
      console.warn(`[Stripe] Key from ${cred.source} failed validation: ${err.message?.substring(0, 80)}`);
    }
  }

  if (candidates.length > 0) {
    console.warn('[Stripe] No key passed validation, using first available (live keys)');
    const fallback = candidates[0];
    validatedCredentials = { publishableKey: fallback.publishableKey, secretKey: fallback.secretKey };
    return validatedCredentials;
  }

  throw new Error('No Stripe API keys configured.');
}

async function getConnectorCredentials(): Promise<{ publishableKey: string; secretKey: string } | null> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken || !hostname) return null;

  const connectorName = 'stripe';
  const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
  const targetEnvironment = isProduction ? 'production' : 'development';

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set('include_secrets', 'true');
  url.searchParams.set('connector_names', connectorName);
  url.searchParams.set('environment', targetEnvironment);

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'X_REPLIT_TOKEN': xReplitToken
    }
  });

  const data = await response.json();
  const connectionSettings = data.items?.[0];

  if (!connectionSettings?.settings?.publishable || !connectionSettings?.settings?.secret) {
    return null;
  }

  return {
    publishableKey: connectionSettings.settings.publishable,
    secretKey: connectionSettings.settings.secret,
  };
}

export async function getUncachableStripeClient() {
  const { secretKey } = await getCredentials();

  return new Stripe(secretKey, {
    apiVersion: '2025-08-27.basil',
  });
}

export async function getStripePublishableKey() {
  const { publishableKey } = await getCredentials();
  return publishableKey;
}

export async function getStripeSecretKey() {
  const { secretKey } = await getCredentials();
  return secretKey;
}

let stripeSync: any = null;

export async function getStripeSync() {
  if (!stripeSync) {
    const { StripeSync } = await import('stripe-replit-sync');
    const secretKey = await getStripeSecretKey();

    stripeSync = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL!,
        max: 2,
      },
      stripeSecretKey: secretKey,
    });
  }
  return stripeSync;
}
