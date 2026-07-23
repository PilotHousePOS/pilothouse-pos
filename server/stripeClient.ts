// Stripe client for PilotHouse
// Uses user-provided API keys, falls back to Replit connector

import Stripe from 'stripe';

// TTL for the credential cache. Defaults to 1 hour so a rotated key is picked
// up without a full restart. Override with STRIPE_CREDENTIAL_TTL_MS env var.
const CREDENTIAL_TTL_MS = Number(process.env.STRIPE_CREDENTIAL_TTL_MS) || 60 * 60 * 1000;

// --- Module-level state (all declared here so clearCredentialCache can reach them) ---
let validatedCredentials: { publishableKey: string; secretKey: string } | null = null;
let validatedAt: number | null = null;

// StripeSync singleton — tracks the secret key it was built with so it can be
// recreated automatically when credentials are rotated.
let stripeSync: any = null;
let stripeSyncSecretKey: string | null = null;

/**
 * Close the pg connection pool held by a StripeSync instance.
 * StripeSync exposes its pool via `postgresClient.pool` (a `pg.Pool`).
 * We log-and-swallow errors so a stale/already-ended pool never prevents
 * the cache from being cleared.
 */
async function closeStripeSyncPool(instance: any): Promise<void> {
  try {
    const pool = instance?.postgresClient?.pool;
    if (pool && typeof pool.end === 'function') {
      await pool.end();
      console.log('[Stripe] Closed old StripeSync pg pool');
    }
  } catch (err: any) {
    console.warn('[Stripe] Error closing old StripeSync pg pool:', err.message);
  }
}

/**
 * Clear the credential cache and invalidate the StripeSync singleton.
 * The next call to getCredentials() / getStripeSync() will re-validate from
 * env vars / connector and rebuild the singleton with the new key.
 * Exported so health-check routes and tests can force a fresh validation.
 */
export async function clearCredentialCache(): Promise<void> {
  if (stripeSync) {
    await closeStripeSyncPool(stripeSync);
  }
  validatedCredentials = null;
  validatedAt = null;
  stripeSync = null;
  stripeSyncSecretKey = null;
}

// ---------------------------------------------------------------------------------

async function getCredentials() {
  // Expire cache if the TTL has elapsed (e.g. after key rotation)
  if (validatedCredentials && validatedAt !== null) {
    if (Date.now() - validatedAt > CREDENTIAL_TTL_MS) {
      console.log('[Stripe] Credential cache expired — re-validating keys');
      await clearCredentialCache();
    }
  }

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
      const account = await testStripe.accounts.retrieve();
      console.log(`[Stripe] Using validated key from: ${cred.source} (account: ${account.id})`);
      validatedCredentials = { publishableKey: cred.publishableKey, secretKey: cred.secretKey };
      validatedAt = Date.now();
      return validatedCredentials;
    } catch (err: any) {
      console.warn(`[Stripe] Key from ${cred.source} failed validation: ${err.message?.substring(0, 80)}`);
    }
  }

  if (candidates.length > 0) {
    console.warn('[Stripe] No key passed validation, using first available (live keys)');
    const fallback = candidates[0];
    validatedCredentials = { publishableKey: fallback.publishableKey, secretKey: fallback.secretKey };
    validatedAt = Date.now();
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

export async function getStripeSync() {
  const secretKey = await getStripeSecretKey();

  // Recreate the singleton if the key has changed (e.g. after rotation + TTL expiry)
  if (stripeSync && stripeSyncSecretKey !== secretKey) {
    console.log('[Stripe] Secret key changed — rebuilding StripeSync with new key');
    await closeStripeSyncPool(stripeSync);
    stripeSync = null;
    stripeSyncSecretKey = null;
  }

  if (!stripeSync) {
    const { StripeSync } = await import('stripe-replit-sync');

    stripeSync = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL!,
        max: 2,
      },
      stripeSecretKey: secretKey,
    });
    stripeSyncSecretKey = secretKey;
  }

  return stripeSync;
}
