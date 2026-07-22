// Subscription billing routes for PilotHouse
// Handles Stripe Checkout, Customer Portal, and billing status

import type { Express } from "express";
import { authMiddleware } from "./auth";
import { storage } from "./storage";
import { getUncachableStripeClient } from "./stripeClient";

// Get or create Stripe products/prices for subscription tiers
// Falls back gracefully if env vars are not set by creating them on-demand
async function getOrCreatePriceId(tier: 'starter' | 'pro'): Promise<string> {
  const stripe = await getUncachableStripeClient();

  const envKey = tier === 'starter' ? 'STRIPE_STARTER_PRICE_ID' : 'STRIPE_PRO_PRICE_ID';
  const configuredPriceId = process.env[envKey];

  if (configuredPriceId) {
    return configuredPriceId;
  }

  // Auto-create product and price if not configured (dev/first-run convenience)
  const productName = tier === 'starter' ? 'PilotHouse Starter' : 'PilotHouse Pro';
  const unitAmount = tier === 'starter' ? 4900 : 9900; // $49 or $99 in cents

  // Look for existing product
  const products = await stripe.products.search({
    query: `name:"${productName}" AND active:"true"`,
  });

  let productId: string;
  if (products.data.length > 0) {
    productId = products.data[0].id;
  } else {
    const product = await stripe.products.create({
      name: productName,
      description: tier === 'starter'
        ? 'PilotHouse Starter — full POS access for one location'
        : 'PilotHouse Pro — advanced analytics, multi-location, and priority support',
      metadata: { tier },
    });
    productId = product.id;
  }

  // Look for existing monthly price
  const prices = await stripe.prices.list({ product: productId, active: true, type: 'recurring' });
  if (prices.data.length > 0) {
    return prices.data[0].id;
  }

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: unitAmount,
    currency: 'usd',
    recurring: { interval: 'month' },
    metadata: { tier },
  });

  return price.id;
}

// Ensure a Stripe customer exists for this tenant
async function ensureTenantStripeCustomer(tenantId: number): Promise<string> {
  const stripe = await getUncachableStripeClient();
  const tenant = await storage.getTenant(tenantId);
  if (!tenant) throw new Error('Tenant not found');

  if (tenant.stripeCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(tenant.stripeCustomerId);
      if (!customer.deleted) return tenant.stripeCustomerId;
    } catch {
      // Customer gone, will create new one
    }
  }

  const customer = await stripe.customers.create({
    name: tenant.name,
    metadata: { tenantId: String(tenantId) },
  });

  await storage.updateTenant(tenantId, { stripeCustomerId: customer.id } as any);
  return customer.id;
}

export function registerBillingRoutes(app: Express): void {

  // GET /api/billing/status — current plan, status, and trial info for the tenant
  app.get('/api/billing/status', authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      if (!user?.tenantId) {
        return res.json({
          subscriptionStatus: 'trial',
          subscriptionTier: 'starter',
          trialEndsAt: null,
          trialDaysLeft: null,
          currentPeriodEnd: null,
          stripeCustomerId: null,
          stripeSubscriptionId: null,
        });
      }

      const tenant = await storage.getTenant(user.tenantId);
      if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

      let trialDaysLeft: number | null = null;
      if (tenant.subscriptionStatus === 'trial' && tenant.trialEndsAt) {
        const msLeft = new Date(tenant.trialEndsAt).getTime() - Date.now();
        trialDaysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
      }

      // Fetch live subscription data from Stripe if available
      let currentPeriodEnd: string | null = null;
      let cancelAtPeriodEnd = false;

      if (tenant.stripeSubscriptionId) {
        try {
          const stripe = await getUncachableStripeClient();
          const sub = await stripe.subscriptions.retrieve(tenant.stripeSubscriptionId);
          currentPeriodEnd = new Date((sub as any).current_period_end * 1000).toISOString();
          cancelAtPeriodEnd = (sub as any).cancel_at_period_end;
        } catch {
          // If Stripe lookup fails, use cached value
          currentPeriodEnd = tenant.stripeCurrentPeriodEnd
            ? new Date(tenant.stripeCurrentPeriodEnd).toISOString()
            : null;
        }
      } else if (tenant.stripeCurrentPeriodEnd) {
        currentPeriodEnd = new Date(tenant.stripeCurrentPeriodEnd).toISOString();
      }

      res.json({
        subscriptionStatus: tenant.subscriptionStatus,
        subscriptionTier: tenant.subscriptionTier,
        trialEndsAt: tenant.trialEndsAt ? new Date(tenant.trialEndsAt).toISOString() : null,
        trialDaysLeft,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        stripeCustomerId: tenant.stripeCustomerId,
        stripeSubscriptionId: tenant.stripeSubscriptionId,
      });
    } catch (error: any) {
      console.error('Billing status error:', error);
      res.status(500).json({ message: 'Failed to get billing status' });
    }
  });

  // POST /api/billing/create-checkout-session — start a Stripe Checkout for a subscription plan
  app.post('/api/billing/create-checkout-session', authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      if (!user?.tenantId) {
        return res.status(400).json({ message: 'No tenant associated with this account' });
      }

      // Only tenant owner (isAdmin) can subscribe
      if (!user.isAdmin) {
        return res.status(403).json({ message: 'Only account owners can manage billing' });
      }

      const { tier = 'starter', successUrl, cancelUrl } = req.body;
      if (!['starter', 'pro'].includes(tier)) {
        return res.status(400).json({ message: 'Invalid tier. Must be starter or pro' });
      }

      const stripe = await getUncachableStripeClient();
      const customerId = await ensureTenantStripeCustomer(user.tenantId);
      const priceId = await getOrCreatePriceId(tier as 'starter' | 'pro');

      const tenant = await storage.getTenant(user.tenantId);

      // If tenant already has an active subscription, redirect to portal instead
      if (tenant?.stripeSubscriptionId && tenant.subscriptionStatus === 'active') {
        return res.status(400).json({
          message: 'Already subscribed. Use the Customer Portal to change your plan.',
          hasActiveSubscription: true,
        });
      }

      const baseUrl = successUrl
        ? new URL(successUrl).origin
        : (process.env.REPLIT_DEV_DOMAIN
          ? `https://${process.env.REPLIT_DEV_DOMAIN}`
          : 'http://localhost:5000');

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl || `${baseUrl}/settings/billing?success=1`,
        cancel_url: cancelUrl || `${baseUrl}/settings/billing?cancelled=1`,
        subscription_data: {
          metadata: {
            tenantId: String(user.tenantId),
            tier,
          },
        },
        metadata: {
          tenantId: String(user.tenantId),
          tier,
        },
      });

      res.json({ url: session.url, sessionId: session.id });
    } catch (error: any) {
      console.error('Create checkout session error:', error);
      res.status(500).json({ message: 'Failed to create checkout session' });
    }
  });

  // POST /api/billing/portal-session — open Stripe Customer Portal for self-serve management
  app.post('/api/billing/portal-session', authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      if (!user?.tenantId) {
        return res.status(400).json({ message: 'No tenant associated with this account' });
      }

      if (!user.isAdmin) {
        return res.status(403).json({ message: 'Only account owners can manage billing' });
      }

      const stripe = await getUncachableStripeClient();
      const customerId = await ensureTenantStripeCustomer(user.tenantId);

      const { returnUrl } = req.body;
      const baseUrl = returnUrl
        ? new URL(returnUrl).origin
        : (process.env.REPLIT_DEV_DOMAIN
          ? `https://${process.env.REPLIT_DEV_DOMAIN}`
          : 'http://localhost:5000');

      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl || `${baseUrl}/settings/billing`,
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error('Portal session error:', error);
      res.status(500).json({ message: 'Failed to open billing portal' });
    }
  });

  // GET /api/billing/plans — available subscription plans with pricing
  app.get('/api/billing/plans', async (_req, res) => {
    res.json({
      plans: [
        {
          id: 'starter',
          name: 'Starter',
          price: 49,
          currency: 'usd',
          interval: 'month',
          description: 'Full POS access for one location',
          features: [
            'Full POS & order management',
            'Customer loyalty program',
            'Online store & checkout',
            'Grooming appointments',
            'Email notifications',
            'Inventory management',
          ],
        },
        {
          id: 'pro',
          name: 'Pro',
          price: 99,
          currency: 'usd',
          interval: 'month',
          description: 'Advanced features for growing businesses',
          features: [
            'Everything in Starter',
            'Advanced analytics & reports',
            'AI-powered invoice scanning',
            'Priority support',
            'Custom branding options',
            'Multi-user management',
          ],
        },
      ],
    });
  });
}
