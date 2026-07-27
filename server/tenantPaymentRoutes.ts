// ─── Tenant Payment Processor OAuth Routes ───────────────────────────────────
// Handles per-tenant OAuth flows for Square, PayPal, and Stripe (own account).
// Stores encrypted credentials in `tenant_payment_processors`.
//
// SECURITY: Uses the same HMAC-signed one-time nonce pattern as
// stripeConnectRoutes.ts to prevent state forgery and replay attacks.
//
// Required environment variables (per processor):
//   Stripe:  STRIPE_CONNECT_CLIENT_ID  (reuses platform's Connect app)
//   Square:  SQUARE_APP_ID, SQUARE_APP_SECRET
//   PayPal:  PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET

import type { Express } from 'express';
import crypto from 'crypto';
import { db } from './db';
import { sql } from 'drizzle-orm';
import { authMiddleware } from './auth';
import { storage } from './storage';
import { getBaseUrl } from './utils';

// ── Encryption (mirrors stripeConnectRoutes.ts) ───────────────────────────────
const ENCRYPTION_KEY = crypto
  .createHash('sha256')
  .update(process.env.SESSION_SECRET || 'pilotHouse-placeholder-key')
  .digest();

function encryptToken(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let enc = cipher.update(text, 'utf8', 'hex');
  enc += cipher.final('hex');
  return iv.toString('hex') + ':' + enc;
}

function decryptToken(text: string): string {
  try {
    const [ivHex, enc] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let dec = decipher.update(enc, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec;
  } catch {
    return '';
  }
}

// ── OAuth state (nonce store shared across all processors) ────────────────────
const STATE_TTL_MS = 15 * 60 * 1000;
type PendingFlow = { tenantId: number; processor: string; expiresAt: number };
const pendingFlows = new Map<string, PendingFlow>();

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pendingFlows) {
    if (v.expiresAt <= now) pendingFlows.delete(k);
  }
}, 5 * 60 * 1000);

const HMAC_SECRET = process.env.SESSION_SECRET || 'pilotHouse-placeholder-key';

function buildState(nonce: string): string {
  const payload = Buffer.from(JSON.stringify({ nonce, ts: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', HMAC_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifyState(state: string): { nonce: string } | null {
  try {
    const dot = state.lastIndexOf('.');
    if (dot === -1) return null;
    const payload = state.slice(0, dot);
    const sig = state.slice(dot + 1);
    const expected = crypto.createHmac('sha256', HMAC_SECRET).update(payload).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed.nonce || !parsed.ts) return null;
    if (Date.now() - parsed.ts > STATE_TTL_MS) return null;
    return { nonce: parsed.nonce };
  } catch {
    return null;
  }
}

// ── DB helpers ────────────────────────────────────────────────────────────────
async function upsertProcessor(
  tenantId: number,
  processorType: string,
  encryptedAccessToken: string,
  encryptedRefreshToken: string | null,
  accountDisplayName: string | null,
  accountId: string | null,
) {
  // Remove any existing row for this processor type, then insert fresh.
  // Also deactivate other processors so the newly connected one becomes active.
  await db.execute(sql`
    DELETE FROM tenant_payment_processors
    WHERE tenant_id = ${tenantId} AND processor_type = ${processorType}
  `);
  await db.execute(sql`
    UPDATE tenant_payment_processors SET is_active = false WHERE tenant_id = ${tenantId}
  `);
  await db.execute(sql`
    INSERT INTO tenant_payment_processors
      (tenant_id, processor_type, encrypted_access_token, encrypted_refresh_token,
       account_display_name, account_id, is_active, connected_at)
    VALUES
      (${tenantId}, ${processorType}, ${encryptedAccessToken}, ${encryptedRefreshToken},
       ${accountDisplayName}, ${accountId}, true, NOW())
  `);
}

async function deleteProcessor(tenantId: number, processorType: string) {
  await db.execute(sql`
    DELETE FROM tenant_payment_processors
    WHERE tenant_id = ${tenantId} AND processor_type = ${processorType}
  `);
  // If there's another processor, activate the most recently connected one
  await db.execute(sql`
    UPDATE tenant_payment_processors
    SET is_active = true
    WHERE id = (
      SELECT id FROM tenant_payment_processors
      WHERE tenant_id = ${tenantId}
      ORDER BY connected_at DESC
      LIMIT 1
    )
  `);
}

// ── Admin guard ───────────────────────────────────────────────────────────────
async function requireAdmin(req: any, res: any): Promise<boolean> {
  const user = await storage.getUser(req.user?.id);
  if (!user?.isAdmin && !user?.isSuperiorManager) {
    res.status(403).json({ message: 'Admin access required' });
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
export function registerTenantPaymentRoutes(app: Express): void {

  // ── GET /api/payment/processor/status ──────────────────────────────────────
  // Returns all connected processors + terminal config for this tenant.
  app.get('/api/payment/processor/status', authMiddleware, async (req: any, res) => {
    try {
      if (!await requireAdmin(req, res)) return;
      const tenantId: number = req.tenantId;
      if (!tenantId) return res.status(400).json({ message: 'No tenant context' });

      const rows = await db.execute(sql`
        SELECT id, processor_type, account_display_name, account_id, is_active, connected_at
        FROM tenant_payment_processors
        WHERE tenant_id = ${tenantId}
        ORDER BY connected_at DESC
      `);

      const tenantRow = await db.execute(sql`
        SELECT processor_config FROM tenants WHERE id = ${tenantId}
      `);
      const cfg = ((tenantRow.rows[0] as any)?.processor_config as Record<string, any>) ?? {};

      res.json({
        processors: rows.rows.map((r: any) => ({
          id: r.id,
          processorType: r.processor_type,
          accountDisplayName: r.account_display_name,
          accountId: r.account_id,
          isActive: r.is_active,
          connectedAt: r.connected_at,
        })),
        terminal: {
          name: cfg.name ?? '',
          terminalAddress: cfg.terminalAddress ?? '',
          hasToken: !!(cfg.encryptedToken),
        },
      });
    } catch (err) {
      console.error('[PaymentStatus] error:', err);
      res.status(500).json({ message: 'Failed to retrieve payment status' });
    }
  });

  // ── POST /api/payment/processor/set-active ─────────────────────────────────
  app.post('/api/payment/processor/set-active', authMiddleware, async (req: any, res) => {
    try {
      if (!await requireAdmin(req, res)) return;
      const tenantId: number = req.tenantId;
      if (!tenantId) return res.status(400).json({ message: 'No tenant context' });
      const { processorType } = req.body;
      if (!processorType) return res.status(400).json({ message: 'processorType required' });

      await db.execute(sql`
        UPDATE tenant_payment_processors SET is_active = false WHERE tenant_id = ${tenantId}
      `);
      await db.execute(sql`
        UPDATE tenant_payment_processors SET is_active = true
        WHERE tenant_id = ${tenantId} AND processor_type = ${processorType}
      `);
      res.json({ success: true });
    } catch (err) {
      console.error('[SetActive] error:', err);
      res.status(500).json({ message: 'Failed to set active processor' });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // STRIPE (TENANT'S OWN ACCOUNT)
  // Uses Stripe Connect OAuth — the access_token returned IS the tenant's
  // Stripe secret key.  We use it directly (no destination charges).
  // ════════════════════════════════════════════════════════════════════════════

  app.get('/api/payment/stripe-own/connect', authMiddleware, async (req: any, res) => {
    try {
      if (!await requireAdmin(req, res)) return;
      const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
      if (!clientId) {
        return res.status(500).json({
          message:
            'Stripe Connect is not configured on this platform. ' +
            'A super-admin must set STRIPE_CONNECT_CLIENT_ID.',
        });
      }
      const tenantId: number = req.tenantId;
      if (!tenantId) return res.status(400).json({ message: 'No tenant context' });

      const nonce = crypto.randomBytes(32).toString('hex');
      pendingFlows.set(nonce, { tenantId, processor: 'stripe', expiresAt: Date.now() + STATE_TTL_MS });

      const base = getBaseUrl();
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        scope: 'read_write',
        redirect_uri: `${base}/api/payment/stripe-own/callback`,
        state: buildState(nonce),
      });
      res.redirect(`https://connect.stripe.com/oauth/authorize?${params}`);
    } catch (err) {
      console.error('[StripeOwn] connect error:', err);
      res.status(500).json({ message: 'Failed to start Stripe OAuth flow' });
    }
  });

  app.get('/api/payment/stripe-own/callback', async (req: any, res) => {
    try {
      const { code, state, error, error_description } = req.query as Record<string, string>;

      if (error) {
        return res.redirect(
          `/admin?tab=settings&paymentError=${encodeURIComponent(error_description || error)}`,
        );
      }
      if (!code || !state) {
        return res.redirect('/admin?tab=settings&paymentError=missing_params');
      }

      const verified = verifyState(state);
      if (!verified) {
        return res.redirect('/admin?tab=settings&paymentError=invalid_or_expired_state');
      }

      const flow = pendingFlows.get(verified.nonce);
      if (!flow || flow.expiresAt < Date.now() || flow.processor !== 'stripe') {
        pendingFlows.delete(verified.nonce);
        return res.redirect('/admin?tab=settings&paymentError=state_expired_or_replayed');
      }
      pendingFlows.delete(verified.nonce);
      const { tenantId } = flow;

      const { getUncachableStripeClient } = await import('./stripeClient');
      const stripe = await getUncachableStripeClient();
      const token = await stripe.oauth.token({ grant_type: 'authorization_code', code });

      const accessToken = token.access_token!;
      const refreshToken = token.refresh_token ?? null;
      const accountId = token.stripe_user_id ?? null;

      // Fetch the account's display name so the UI can show something useful
      let displayName: string | null = null;
      try {
        const tenantStripe = new (require('stripe'))(accessToken, { apiVersion: '2025-11-17.clover' });
        const acct = await tenantStripe.accounts.retrieve();
        displayName =
          acct.business_profile?.name ||
          (acct as any).settings?.dashboard?.display_name ||
          acct.email ||
          null;
      } catch {}

      await upsertProcessor(
        tenantId, 'stripe',
        encryptToken(accessToken),
        refreshToken ? encryptToken(refreshToken) : null,
        displayName,
        accountId,
      );

      console.log(`[TenantPayment] tenant ${tenantId} connected own Stripe → ${accountId}`);
      res.redirect('/admin?tab=settings&paymentSuccess=stripe');
    } catch (err: any) {
      console.error('[StripeOwn] callback error:', err);
      res.redirect(
        `/admin?tab=settings&paymentError=${encodeURIComponent(err?.message ?? 'oauth_failed')}`,
      );
    }
  });

  app.delete('/api/payment/stripe-own/disconnect', authMiddleware, async (req: any, res) => {
    try {
      if (!await requireAdmin(req, res)) return;
      const tenantId: number = req.tenantId;
      if (!tenantId) return res.status(400).json({ message: 'No tenant context' });

      // Best-effort deauth on Stripe side
      const rows = await db.execute(sql`
        SELECT account_id FROM tenant_payment_processors
        WHERE tenant_id = ${tenantId} AND processor_type = 'stripe'
      `);
      const accountId = (rows.rows[0] as any)?.account_id;
      if (accountId && process.env.STRIPE_CONNECT_CLIENT_ID) {
        try {
          const { getUncachableStripeClient } = await import('./stripeClient');
          const stripe = await getUncachableStripeClient();
          await stripe.oauth.deauthorize({
            client_id: process.env.STRIPE_CONNECT_CLIENT_ID,
            stripe_user_id: accountId,
          });
        } catch (e) {
          console.warn('[StripeOwn] deauth failed (clearing locally):', e);
        }
      }

      await deleteProcessor(tenantId, 'stripe');
      res.json({ success: true });
    } catch (err) {
      console.error('[StripeOwn] disconnect error:', err);
      res.status(500).json({ message: 'Failed to disconnect Stripe account' });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SQUARE
  // Required env: SQUARE_APP_ID, SQUARE_APP_SECRET
  // ════════════════════════════════════════════════════════════════════════════

  app.get('/api/payment/square/connect', authMiddleware, async (req: any, res) => {
    try {
      if (!await requireAdmin(req, res)) return;
      const appId = process.env.SQUARE_APP_ID;
      if (!appId) {
        return res.status(500).json({
          message:
            'Square is not configured on this platform. ' +
            'A super-admin must set SQUARE_APP_ID and SQUARE_APP_SECRET.',
        });
      }
      const tenantId: number = req.tenantId;
      if (!tenantId) return res.status(400).json({ message: 'No tenant context' });

      const nonce = crypto.randomBytes(32).toString('hex');
      pendingFlows.set(nonce, { tenantId, processor: 'square', expiresAt: Date.now() + STATE_TTL_MS });

      const base = getBaseUrl();
      const params = new URLSearchParams({
        client_id: appId,
        scope: 'PAYMENTS_WRITE PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS ORDERS_WRITE MERCHANT_PROFILE_READ',
        session: 'false',
        state: buildState(nonce),
        redirect_uri: `${base}/api/payment/square/callback`,
      });
      res.redirect(`https://connect.squareup.com/oauth2/authorize?${params}`);
    } catch (err) {
      console.error('[Square] connect error:', err);
      res.status(500).json({ message: 'Failed to start Square OAuth flow' });
    }
  });

  app.get('/api/payment/square/callback', async (req: any, res) => {
    try {
      const { code, state, error } = req.query as Record<string, string>;

      if (error) {
        return res.redirect(`/admin?tab=settings&paymentError=${encodeURIComponent(error)}`);
      }
      if (!code || !state) {
        return res.redirect('/admin?tab=settings&paymentError=missing_params');
      }

      const verified = verifyState(state);
      if (!verified) {
        return res.redirect('/admin?tab=settings&paymentError=invalid_or_expired_state');
      }
      const flow = pendingFlows.get(verified.nonce);
      if (!flow || flow.expiresAt < Date.now() || flow.processor !== 'square') {
        pendingFlows.delete(verified.nonce);
        return res.redirect('/admin?tab=settings&paymentError=state_expired_or_replayed');
      }
      pendingFlows.delete(verified.nonce);
      const { tenantId } = flow;

      const appId = process.env.SQUARE_APP_ID!;
      const appSecret = process.env.SQUARE_APP_SECRET!;
      const base = getBaseUrl();

      // Exchange code for tokens
      const tokenResp = await fetch('https://connect.squareup.com/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Square-Version': '2024-02-22' },
        body: JSON.stringify({
          client_id: appId,
          client_secret: appSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: `${base}/api/payment/square/callback`,
        }),
      });
      if (!tokenResp.ok) {
        const msg = await tokenResp.text();
        console.error('[Square] token exchange error:', msg);
        return res.redirect(`/admin?tab=settings&paymentError=${encodeURIComponent('Square token exchange failed')}`);
      }
      const tokenData = (await tokenResp.json()) as any;
      const accessToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token ?? null;
      const merchantId = tokenData.merchant_id ?? null;

      // Fetch merchant display name + primary location ID
      let displayName: string | null = null;
      let locationId: string | null = null;
      try {
        const merchantResp = await fetch('https://connect.squareup.com/v2/merchants/me', {
          headers: { Authorization: `Bearer ${accessToken}`, 'Square-Version': '2024-02-22' },
        });
        if (merchantResp.ok) {
          const md = (await merchantResp.json()) as any;
          displayName = md.merchant?.business_name ?? md.merchant?.display_name ?? null;
        }
        const locResp = await fetch('https://connect.squareup.com/v2/locations', {
          headers: { Authorization: `Bearer ${accessToken}`, 'Square-Version': '2024-02-22' },
        });
        if (locResp.ok) {
          const ld = (await locResp.json()) as any;
          locationId = ld.locations?.[0]?.id ?? null;
        }
      } catch {}

      await upsertProcessor(
        tenantId, 'square',
        encryptToken(accessToken),
        refreshToken ? encryptToken(refreshToken) : null,
        displayName,
        locationId ?? merchantId, // accountId stores location_id for payment link creation
      );

      console.log(`[TenantPayment] tenant ${tenantId} connected Square merchant ${merchantId}`);
      res.redirect('/admin?tab=settings&paymentSuccess=square');
    } catch (err: any) {
      console.error('[Square] callback error:', err);
      res.redirect(`/admin?tab=settings&paymentError=${encodeURIComponent(err?.message ?? 'oauth_failed')}`);
    }
  });

  app.delete('/api/payment/square/disconnect', authMiddleware, async (req: any, res) => {
    try {
      if (!await requireAdmin(req, res)) return;
      const tenantId: number = req.tenantId;
      if (!tenantId) return res.status(400).json({ message: 'No tenant context' });

      // Best-effort Square token revoke
      try {
        const rows = await db.execute(sql`
          SELECT encrypted_access_token FROM tenant_payment_processors
          WHERE tenant_id = ${tenantId} AND processor_type = 'square'
        `);
        const enc = (rows.rows[0] as any)?.encrypted_access_token;
        if (enc && process.env.SQUARE_APP_SECRET) {
          const at = decryptToken(enc);
          await fetch('https://connect.squareup.com/oauth2/revoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Square-Version': '2024-02-22' },
            body: JSON.stringify({
              client_id: process.env.SQUARE_APP_ID,
              access_token: at,
              revoke_only_access_token: false,
            }),
          });
        }
      } catch (e) {
        console.warn('[Square] revoke failed (clearing locally):', e);
      }

      await deleteProcessor(tenantId, 'square');
      res.json({ success: true });
    } catch (err) {
      console.error('[Square] disconnect error:', err);
      res.status(500).json({ message: 'Failed to disconnect Square account' });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // PAYPAL
  // Required env: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET
  // ════════════════════════════════════════════════════════════════════════════

  app.get('/api/payment/paypal/connect', authMiddleware, async (req: any, res) => {
    try {
      if (!await requireAdmin(req, res)) return;
      const clientId = process.env.PAYPAL_CLIENT_ID;
      if (!clientId) {
        return res.status(500).json({
          message:
            'PayPal is not configured on this platform. ' +
            'A super-admin must set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.',
        });
      }
      const tenantId: number = req.tenantId;
      if (!tenantId) return res.status(400).json({ message: 'No tenant context' });

      const nonce = crypto.randomBytes(32).toString('hex');
      pendingFlows.set(nonce, { tenantId, processor: 'paypal', expiresAt: Date.now() + STATE_TTL_MS });

      const base = getBaseUrl();
      const params = new URLSearchParams({
        flowEntry: 'static',
        client_id: clientId,
        response_type: 'code',
        scope: 'openid https://uri.paypal.com/services/payments/payment https://uri.paypal.com/services/payments/sell',
        redirect_uri: `${base}/api/payment/paypal/callback`,
        state: buildState(nonce),
      });
      res.redirect(`https://www.paypal.com/signin/authorize?${params}`);
    } catch (err) {
      console.error('[PayPal] connect error:', err);
      res.status(500).json({ message: 'Failed to start PayPal OAuth flow' });
    }
  });

  app.get('/api/payment/paypal/callback', async (req: any, res) => {
    try {
      const { code, state, error } = req.query as Record<string, string>;

      if (error) {
        return res.redirect(`/admin?tab=settings&paymentError=${encodeURIComponent(error)}`);
      }
      if (!code || !state) {
        return res.redirect('/admin?tab=settings&paymentError=missing_params');
      }

      const verified = verifyState(state);
      if (!verified) {
        return res.redirect('/admin?tab=settings&paymentError=invalid_or_expired_state');
      }
      const flow = pendingFlows.get(verified.nonce);
      if (!flow || flow.expiresAt < Date.now() || flow.processor !== 'paypal') {
        pendingFlows.delete(verified.nonce);
        return res.redirect('/admin?tab=settings&paymentError=state_expired_or_replayed');
      }
      pendingFlows.delete(verified.nonce);
      const { tenantId } = flow;

      const clientId = process.env.PAYPAL_CLIENT_ID!;
      const clientSecret = process.env.PAYPAL_CLIENT_SECRET!;
      const base = getBaseUrl();

      // Exchange code for tokens
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const tokenResp = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: `${base}/api/payment/paypal/callback`,
        }),
      });
      if (!tokenResp.ok) {
        const msg = await tokenResp.text();
        console.error('[PayPal] token exchange error:', msg);
        return res.redirect(`/admin?tab=settings&paymentError=${encodeURIComponent('PayPal token exchange failed')}`);
      }
      const tokenData = (await tokenResp.json()) as any;
      const accessToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token ?? null;

      // Fetch payer ID / display name
      let displayName: string | null = null;
      let payerId: string | null = null;
      try {
        const userResp = await fetch('https://api-m.paypal.com/v1/identity/openidconnect/userinfo?schema=openid', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (userResp.ok) {
          const ud = (await userResp.json()) as any;
          displayName = ud.name ?? ud.email ?? null;
          payerId = ud.payer_id ?? ud.user_id ?? null;
        }
      } catch {}

      await upsertProcessor(
        tenantId, 'paypal',
        encryptToken(accessToken),
        refreshToken ? encryptToken(refreshToken) : null,
        displayName,
        payerId,
      );

      console.log(`[TenantPayment] tenant ${tenantId} connected PayPal payer ${payerId}`);
      res.redirect('/admin?tab=settings&paymentSuccess=paypal');
    } catch (err: any) {
      console.error('[PayPal] callback error:', err);
      res.redirect(`/admin?tab=settings&paymentError=${encodeURIComponent(err?.message ?? 'oauth_failed')}`);
    }
  });

  app.delete('/api/payment/paypal/disconnect', authMiddleware, async (req: any, res) => {
    try {
      if (!await requireAdmin(req, res)) return;
      const tenantId: number = req.tenantId;
      if (!tenantId) return res.status(400).json({ message: 'No tenant context' });

      await deleteProcessor(tenantId, 'paypal');
      res.json({ success: true });
    } catch (err) {
      console.error('[PayPal] disconnect error:', err);
      res.status(500).json({ message: 'Failed to disconnect PayPal account' });
    }
  });
}
