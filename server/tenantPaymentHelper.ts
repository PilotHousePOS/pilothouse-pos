// ─── Tenant Payment Helper ────────────────────────────────────────────────────
// Looks up a tenant's active payment processor and provides helpers for
// creating charges / payment links through whichever processor they've connected.
//
// Called from routes.ts payment paths to route charges through the tenant's
// own processor instead of the platform's Stripe account.

import { db } from './db';
import { sql } from 'drizzle-orm';
import { decryptToken } from './stripeConnectRoutes';

export type ProcessorRow = {
  id: number;
  tenantId: number;
  processorType: 'stripe' | 'square' | 'paypal';
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  accountDisplayName: string | null;
  accountId: string | null;
  isActive: boolean;
  connectedAt: Date;
};

// ── Look up the active processor for a tenant ─────────────────────────────────
export async function getActiveTenantProcessor(
  tenantId: number,
): Promise<ProcessorRow | null> {
  try {
    const rows = await db.execute(sql`
      SELECT id, tenant_id, processor_type, encrypted_access_token,
             encrypted_refresh_token, account_display_name, account_id,
             is_active, connected_at
      FROM tenant_payment_processors
      WHERE tenant_id = ${tenantId} AND is_active = true
      LIMIT 1
    `);
    if (!rows.rows.length) return null;
    const r = rows.rows[0] as any;
    return {
      id: r.id,
      tenantId: r.tenant_id,
      processorType: r.processor_type,
      encryptedAccessToken: r.encrypted_access_token,
      encryptedRefreshToken: r.encrypted_refresh_token,
      accountDisplayName: r.account_display_name,
      accountId: r.account_id,
      isActive: r.is_active,
      connectedAt: r.connected_at,
    };
  } catch {
    return null;
  }
}

// ── Create a Stripe instance using the tenant's own access token ──────────────
export function createTenantStripeClient(processor: ProcessorRow) {
  // Dynamic import to avoid circular dependency issues
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Stripe = require('stripe');
  const accessToken = decryptToken(processor.encryptedAccessToken);
  return new Stripe(accessToken, { apiVersion: '2025-11-17.clover' });
}

// ── Create a Square payment link ──────────────────────────────────────────────
// Returns the hosted payment URL or null on failure.
export async function createSquarePaymentLink(
  processor: ProcessorRow,
  amountCents: number,
  description: string,
  redirectUrl?: string,
): Promise<string | null> {
  try {
    const accessToken = decryptToken(processor.encryptedAccessToken);

    // Square requires a location_id; we store the primary location as accountId
    if (!processor.accountId) {
      console.error('[Square] No location_id stored — cannot create payment link');
      return null;
    }

    const body: Record<string, unknown> = {
      idempotency_key: `plink-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      quick_pay: {
        name: description,
        price_money: { amount: amountCents, currency: 'USD' },
        location_id: processor.accountId,
      },
    };
    if (redirectUrl) {
      body.checkout_options = { redirect_url: redirectUrl };
    }

    const resp = await fetch(
      'https://connect.squareup.com/v2/online-checkout/payment-links',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Square-Version': '2024-02-22',
        },
        body: JSON.stringify(body),
      },
    );

    if (!resp.ok) {
      console.error('[Square] payment link error:', await resp.text());
      return null;
    }

    const data = (await resp.json()) as any;
    return data.payment_link?.url ?? null;
  } catch (e) {
    console.error('[Square] createPaymentLink threw:', e);
    return null;
  }
}

// ── PayPal token helpers ──────────────────────────────────────────────────────

/**
 * Attempt to refresh a PayPal access token using the stored refresh token.
 * If successful, persists the new access token and returns it.
 * Returns null when refresh is not possible (no refresh token, network error, etc.).
 */
async function refreshPayPalToken(processor: ProcessorRow): Promise<string | null> {
  if (!processor.encryptedRefreshToken) return null;
  try {
    const refreshToken = decryptToken(processor.encryptedRefreshToken);
    const { encryptToken } = await import('./stripeConnectRoutes');

    // PayPal token endpoint uses client_credentials with the refresh token
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;

    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const resp = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
    });

    if (!resp.ok) {
      console.error('[PayPal] token refresh failed:', await resp.text());
      return null;
    }

    const data = (await resp.json()) as any;
    const newAccessToken: string = data.access_token;
    if (!newAccessToken) return null;

    // Persist refreshed token
    const { db } = await import('./db');
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`
      UPDATE tenant_payment_processors
      SET encrypted_access_token = ${encryptToken(newAccessToken)}
      WHERE id = ${processor.id}
    `);

    return newAccessToken;
  } catch (e) {
    console.error('[PayPal] refreshPayPalToken threw:', e);
    return null;
  }
}

/**
 * Make a PayPal API call with automatic one-retry on 401 using refreshed token.
 */
async function paypalFetch(
  processor: ProcessorRow,
  url: string,
  options: RequestInit,
): Promise<Response> {
  const accessToken = decryptToken(processor.encryptedAccessToken);
  const headers = { ...(options.headers as Record<string, string>), Authorization: `Bearer ${accessToken}` };
  const resp = await fetch(url, { ...options, headers });

  if (resp.status === 401) {
    const newToken = await refreshPayPalToken(processor);
    if (!newToken) return resp; // can't refresh — caller handles the failure
    const retryHeaders = { ...(options.headers as Record<string, string>), Authorization: `Bearer ${newToken}` };
    return fetch(url, { ...options, headers: retryHeaders });
  }

  return resp;
}

// ── Create a PayPal checkout order and return the approve URL ─────────────────
export async function createPayPalCheckout(
  processor: ProcessorRow,
  amountCents: number,
  description: string,
  returnUrl: string,
  cancelUrl: string,
): Promise<string | null> {
  try {
    const amount = (amountCents / 100).toFixed(2);

    const resp = await paypalFetch(processor, 'https://api-m.paypal.com/v2/checkout/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: { currency_code: 'USD', value: amount },
            description,
          },
        ],
        application_context: {
          return_url: returnUrl,
          cancel_url: cancelUrl,
          user_action: 'PAY_NOW',
        },
      }),
    });

    if (!resp.ok) {
      console.error('[PayPal] create order error:', await resp.text());
      return null;
    }

    const data = (await resp.json()) as any;
    const approveLink = (data.links || []).find((l: any) => l.rel === 'approve');
    return approveLink?.href ?? null;
  } catch (e) {
    console.error('[PayPal] createCheckout threw:', e);
    return null;
  }
}
