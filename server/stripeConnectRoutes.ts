// ─── Stripe Connect & Processor Config Routes ────────────────────────────────
// Handles per-tenant Stripe Connect OAuth, physical terminal config storage,
// and the hardware config read endpoint used by the USB hardware layer.
//
// SECURITY NOTES:
// 1. OAuth state is HMAC-SHA256 signed with SESSION_SECRET to prevent
//    tenant-account hijacking via forged redirects.
// 2. A server-side nonce Map ties each pending OAuth flow to exactly one
//    tenant and allows only one-time use — replaying a captured state URL
//    fails because the nonce is deleted on first callback completion.
// 3. Stripe refresh tokens and processor API tokens are encrypted at rest
//    (AES-256-CBC, key derived from SESSION_SECRET).
// 4. These routes are registered AFTER app.use('/api', tenantMiddleware) so
//    req.tenantId is always populated before any handler runs.

import type { Express } from 'express';
import crypto from 'crypto';
import { db } from './db';
import { sql } from 'drizzle-orm';
import { authMiddleware } from './auth';
import { storage } from './storage';
import { getBaseUrl } from './utils';

// ── Encryption helpers ────────────────────────────────────────────────────────
// AES-256-CBC; 32-byte key derived from SESSION_SECRET via SHA-256.
// IV is prepended to the ciphertext (hex:hex) so decrypt never needs
// separate storage. Survives server restarts as long as SESSION_SECRET is stable.
const ENCRYPTION_KEY = crypto
  .createHash('sha256')
  .update(process.env.SESSION_SECRET || 'pilotHouse-placeholder-key')
  .digest(); // always 32 bytes

export function encryptToken(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let enc = cipher.update(text, 'utf8', 'hex');
  enc += cipher.final('hex');
  return iv.toString('hex') + ':' + enc;
}

export function decryptToken(text: string): string {
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

// ── Server-side nonce store (one-time OAuth state) ────────────────────────────
// Maps nonce (hex) → { tenantId, expiresAt }.
// The nonce is placed inside an HMAC-signed state blob. On callback:
//   1. HMAC is verified (state was issued by this server).
//   2. Nonce is looked up — must exist and be unexpired.
//   3. Nonce is immediately deleted (prevents replay).
// This means a leaked/captured state URL cannot be re-submitted.
const STATE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const pendingOAuthFlows = new Map<string, { tenantId: number; expiresAt: number }>();

// Periodic cleanup of expired nonces
setInterval(() => {
  const now = Date.now();
  for (const [nonce, flow] of pendingOAuthFlows) {
    if (flow.expiresAt <= now) pendingOAuthFlows.delete(nonce);
  }
}, 5 * 60 * 1000);

// ── OAuth state signing ───────────────────────────────────────────────────────
const HMAC_SECRET = process.env.SESSION_SECRET || 'pilotHouse-placeholder-key';

function buildOAuthState(nonce: string): string {
  const payload = Buffer.from(JSON.stringify({ nonce, ts: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', HMAC_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifyOAuthState(state: string): { nonce: string } | null {
  try {
    const dotIdx = state.lastIndexOf('.');
    if (dotIdx === -1) return null;
    const payload = state.slice(0, dotIdx);
    const sig     = state.slice(dotIdx + 1);

    const expectedSig = crypto.createHmac('sha256', HMAC_SECRET).update(payload).digest('hex');
    // Constant-time comparison prevents timing-based signature extraction
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))) {
      return null;
    }
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed.nonce || !parsed.ts) return null;
    if (Date.now() - parsed.ts > STATE_TTL_MS) return null; // Expired at HMAC level too
    return { nonce: parsed.nonce };
  } catch {
    return null;
  }
}

// ── Charge-routing helper ─────────────────────────────────────────────────────
// Returns the connected Stripe account ID for a tenant, or null if none.
// Imported by routes.ts to inject transfer_data on PaymentIntent creation.
export async function getTenantConnectAccountId(
  tenantId: number | undefined,
): Promise<string | null> {
  if (!tenantId) return null;
  try {
    const rows = await db.execute(
      sql`SELECT stripe_connect_account_id FROM tenants WHERE id = ${tenantId}`,
    );
    return (rows.rows[0] as any)?.stripe_connect_account_id ?? null;
  } catch {
    return null;
  }
}

// ── Route registration ────────────────────────────────────────────────────────
// MUST be called after app.use('/api', tenantMiddleware) so req.tenantId is set.
export function registerStripeConnectRoutes(app: Express): void {

  // ── GET /api/billing/stripe-connect/status ──────────────────────────────
  app.get('/api/billing/stripe-connect/status', authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isSuperiorManager) {
        return res.status(403).json({ message: 'Admin access required' });
      }
      const tenantId: number = req.tenantId;
      if (!tenantId) return res.status(400).json({ message: 'No tenant context' });

      const rows = await db.execute(sql`
        SELECT stripe_connect_account_id, stripe_connect_onboarded_at, processor_config
        FROM tenants WHERE id = ${tenantId}
      `);
      const tenant = rows.rows[0] as any;

      let businessName: string | null = null;
      const accountId: string | null = tenant?.stripe_connect_account_id ?? null;

      if (accountId) {
        try {
          const { getUncachableStripeClient } = await import('./stripeClient');
          const stripe = await getUncachableStripeClient();
          const acct = await stripe.accounts.retrieve(accountId);
          businessName =
            acct.business_profile?.name ||
            (acct as any).settings?.dashboard?.display_name ||
            acct.email ||
            null;
        } catch {
          // Account may have been deauthorised externally — treat as stale
          businessName = null;
        }
      }

      const cfg = (tenant?.processor_config as Record<string, any>) ?? {};

      res.json({
        connected: !!accountId,
        accountId,
        onboardedAt: tenant?.stripe_connect_onboarded_at ?? null,
        businessName,
        processor: {
          name: cfg.name ?? '',
          terminalAddress: cfg.terminalAddress ?? '',
          hasToken: !!(cfg.encryptedToken),
        },
      });
    } catch (err) {
      console.error('[StripeConnect] status error:', err);
      res.status(500).json({ message: 'Failed to retrieve payment processor status' });
    }
  });

  // ── GET /api/billing/stripe-connect/authorize ───────────────────────────
  // Generates a one-time HMAC-signed state (nonce stored server-side) and
  // redirects to the Stripe Connect OAuth screen.
  app.get('/api/billing/stripe-connect/authorize', authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isSuperiorManager) {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
      if (!clientId) {
        return res.status(500).json({
          message:
            'Stripe Connect is not configured on this platform. ' +
            'A super-admin must set STRIPE_CONNECT_CLIENT_ID in environment secrets.',
        });
      }

      const tenantId: number = req.tenantId;
      if (!tenantId) return res.status(400).json({ message: 'No tenant context' });

      // Generate a cryptographically random nonce and store it server-side.
      // The state sent to Stripe contains only the nonce (not the tenantId),
      // so the tenantId cannot be forged or enumerated from the redirect URL.
      const nonce = crypto.randomBytes(32).toString('hex');
      pendingOAuthFlows.set(nonce, { tenantId, expiresAt: Date.now() + STATE_TTL_MS });

      const base = getBaseUrl();
      const redirectUri = `${base}/api/billing/stripe-connect/callback`;
      const state = buildOAuthState(nonce);

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        scope: 'read_write',
        redirect_uri: redirectUri,
        state,
      });

      res.redirect(`https://connect.stripe.com/oauth/authorize?${params}`);
    } catch (err) {
      console.error('[StripeConnect] authorize error:', err);
      res.status(500).json({ message: 'Failed to start Stripe Connect flow' });
    }
  });

  // ── GET /api/billing/stripe-connect/callback ────────────────────────────
  // Stripe redirects here after the merchant completes (or cancels) the flow.
  // Verification chain:
  //   1. HMAC signature on state blob (proves we issued this state).
  //   2. Nonce lookup in pendingOAuthFlows (one-time; deleted on first use).
  //   3. Nonce expiry check (belt-and-suspenders after HMAC expiry check).
  app.get('/api/billing/stripe-connect/callback', async (req: any, res) => {
    try {
      const { code, state, error, error_description } = req.query as Record<string, string>;

      if (error) {
        console.warn('[StripeConnect] OAuth declined:', error, error_description);
        return res.redirect(
          `/admin?tab=settings&connectError=${encodeURIComponent(error_description || error)}`,
        );
      }

      if (!code || !state) {
        return res.redirect('/admin?tab=settings&connectError=missing_params');
      }

      // Step 1: Verify HMAC — state was issued by this server
      const verified = verifyOAuthState(state);
      if (!verified) {
        console.warn('[StripeConnect] Callback received invalid or expired state (HMAC fail)');
        return res.redirect('/admin?tab=settings&connectError=invalid_or_expired_state');
      }

      // Step 2: Nonce lookup — one-time use, ties callback to exact initiating tenant
      const flow = pendingOAuthFlows.get(verified.nonce);
      if (!flow || flow.expiresAt < Date.now()) {
        console.warn('[StripeConnect] Nonce missing or expired — possible replay attempt');
        pendingOAuthFlows.delete(verified.nonce);
        return res.redirect('/admin?tab=settings&connectError=state_expired_or_replayed');
      }

      // Step 3: Consume nonce (prevents replay)
      pendingOAuthFlows.delete(verified.nonce);
      const { tenantId } = flow;

      const { getUncachableStripeClient } = await import('./stripeClient');
      const stripe = await getUncachableStripeClient();

      // Exchange the authorisation code for access + refresh tokens
      const token = await stripe.oauth.token({
        grant_type: 'authorization_code',
        code,
      });

      const connectedAccountId = token.stripe_user_id;

      // Encrypt the refresh token at rest — same AES-256-CBC as processor tokens
      const encryptedRefreshToken = token.refresh_token
        ? encryptToken(token.refresh_token)
        : null;

      await db.execute(sql`
        UPDATE tenants
        SET stripe_connect_account_id    = ${connectedAccountId},
            stripe_connect_refresh_token = ${encryptedRefreshToken},
            stripe_connect_onboarded_at  = NOW()
        WHERE id = ${tenantId}
      `);

      console.log(`[StripeConnect] tenant ${tenantId} connected → ${connectedAccountId}`);
      res.redirect('/admin?tab=settings&connectSuccess=1');
    } catch (err: any) {
      console.error('[StripeConnect] callback error:', err);
      res.redirect(
        `/admin?tab=settings&connectError=${encodeURIComponent(err?.message ?? 'oauth_failed')}`,
      );
    }
  });

  // ── DELETE /api/billing/stripe-connect/disconnect ───────────────────────
  app.delete(
    '/api/billing/stripe-connect/disconnect',
    authMiddleware,
    async (req: any, res) => {
      try {
        const user = await storage.getUser(req.user?.id);
        if (!user?.isAdmin && !user?.isSuperiorManager) {
          return res.status(403).json({ message: 'Admin access required' });
        }
        const tenantId: number = req.tenantId;
        if (!tenantId) return res.status(400).json({ message: 'No tenant context' });

        const rows = await db.execute(
          sql`SELECT stripe_connect_account_id FROM tenants WHERE id = ${tenantId}`,
        );
        const accountId: string | null =
          (rows.rows[0] as any)?.stripe_connect_account_id ?? null;

        // Best-effort Stripe-side deauthorise (clearing locally regardless)
        if (accountId && process.env.STRIPE_CONNECT_CLIENT_ID) {
          try {
            const { getUncachableStripeClient } = await import('./stripeClient');
            const stripe = await getUncachableStripeClient();
            await stripe.oauth.deauthorize({
              client_id: process.env.STRIPE_CONNECT_CLIENT_ID,
              stripe_user_id: accountId,
            });
          } catch (e) {
            console.warn('[StripeConnect] Deauthorize failed (clearing locally anyway):', e);
          }
        }

        await db.execute(sql`
          UPDATE tenants
          SET stripe_connect_account_id    = NULL,
              stripe_connect_refresh_token = NULL,
              stripe_connect_onboarded_at  = NULL
          WHERE id = ${tenantId}
        `);

        res.json({ success: true });
      } catch (err) {
        console.error('[StripeConnect] disconnect error:', err);
        res.status(500).json({ message: 'Failed to disconnect payment processor' });
      }
    },
  );

  // ── PUT /api/admin/settings/processor-config ────────────────────────────
  // Saves the physical terminal processor name, address, and API token.
  // The token is AES-encrypted before storage; the plaintext is never persisted.
  app.put(
    '/api/admin/settings/processor-config',
    authMiddleware,
    async (req: any, res) => {
      try {
        const user = await storage.getUser(req.user?.id);
        if (!user?.isAdmin && !user?.isSuperiorManager) {
          return res.status(403).json({ message: 'Admin access required' });
        }
        const tenantId: number = req.tenantId;
        if (!tenantId) return res.status(400).json({ message: 'No tenant context' });

        const { processorName, terminalAddress, apiToken } = req.body;

        const existing = await db.execute(
          sql`SELECT processor_config FROM tenants WHERE id = ${tenantId}`,
        );
        const existingCfg =
          ((existing.rows[0] as any)?.processor_config as Record<string, any>) ?? {};

        const newCfg: Record<string, any> = {
          name: (processorName ?? existingCfg.name ?? '').trim(),
          terminalAddress: (terminalAddress ?? existingCfg.terminalAddress ?? '').trim(),
        };

        if (apiToken?.trim()) {
          newCfg.encryptedToken = encryptToken(apiToken.trim());
        } else if (existingCfg.encryptedToken) {
          // Preserve existing token if no new one was provided
          newCfg.encryptedToken = existingCfg.encryptedToken;
        }

        await db.execute(sql`
          UPDATE tenants SET processor_config = ${JSON.stringify(newCfg)}::jsonb
          WHERE id = ${tenantId}
        `);

        res.json({ success: true });
      } catch (err) {
        console.error('[ProcessorConfig] save error:', err);
        res.status(500).json({ message: 'Failed to save processor configuration' });
      }
    },
  );

  // ── DELETE /api/admin/settings/processor-config ─────────────────────────
  app.delete(
    '/api/admin/settings/processor-config',
    authMiddleware,
    async (req: any, res) => {
      try {
        const user = await storage.getUser(req.user?.id);
        if (!user?.isAdmin && !user?.isSuperiorManager) {
          return res.status(403).json({ message: 'Admin access required' });
        }
        const tenantId: number = req.tenantId;
        if (!tenantId) return res.status(400).json({ message: 'No tenant context' });

        await db.execute(sql`
          UPDATE tenants SET processor_config = NULL WHERE id = ${tenantId}
        `);

        res.json({ success: true });
      } catch (err) {
        console.error('[ProcessorConfig] clear error:', err);
        res.status(500).json({ message: 'Failed to clear processor configuration' });
      }
    },
  );

  // ── GET /api/hardware/processor-config ──────────────────────────────────
  // Returns terminal address and processor name for the hardware layer.
  // The encrypted API token is intentionally excluded — it is only used
  // server-side for any cloud-based terminal proxy APIs.
  app.get('/api/hardware/processor-config', authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isEmployee && !user?.isSuperiorManager) {
        return res.status(403).json({ message: 'Staff access required' });
      }
      const tenantId: number = req.tenantId;
      if (!tenantId) return res.status(400).json({ message: 'No tenant context' });

      const rows = await db.execute(
        sql`SELECT processor_config FROM tenants WHERE id = ${tenantId}`,
      );
      const cfg = ((rows.rows[0] as any)?.processor_config as Record<string, any>) ?? {};

      res.json({
        processorName: cfg.name ?? '',
        terminalAddress: cfg.terminalAddress ?? '',
        hasToken: !!(cfg.encryptedToken),
      });
    } catch (err) {
      console.error('[HardwareConfig] error:', err);
      res.status(500).json({ message: 'Failed to retrieve hardware configuration' });
    }
  });
}
