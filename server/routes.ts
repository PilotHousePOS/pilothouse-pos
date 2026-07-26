import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import rateLimit from "express-rate-limit";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import ExcelJS from "exceljs";
import { storage } from "./storage";
import { generateToken, verifyToken, authMiddleware, setAuthCookie } from "./auth";
import { tenantMiddleware, requireSuperAdminMiddleware } from "./tenantMiddleware";
import {
  insertPetSchema,
  insertOrderSchema,
  insertAppointmentSchema,
  insertCustomerPetSchema,
  insertSupplySchema,
  users,
  orderItems,
  orders,
  appointments,
  appointmentItems,
} from "@shared/schema";
import { z } from "zod/v4";
import { notificationService } from './notifications';
import { sendPasswordResetEmail, sendVerificationEmail, sendContactChangeOtpEmail, sendNoTenantAlertToSuperAdmins } from './sendgrid';
import { normalizePhoneNumber } from './phoneUtils';
import { db, resetPool } from './db';
import { eq, inArray, or, and, ilike, sql } from 'drizzle-orm';
import { supplies, supplyCategories, tenants } from '@shared/schema';
import OpenAI from 'openai';
import sharp from 'sharp';
import { expandProductAbbreviations } from './abbreviationExpansion';
import { hashPassword, verifyPassword, isPasswordComplexEnough, getPasswordRequirementsMessage } from './passwordUtils';
import { getBaseUrl } from './utils';

// Strip sensitive fields from user objects before sending to client
// posPinPlain is intentionally kept — it's a 4-digit convenience code that admins need to look up
function sanitizeUser(user: any) {
  const { password, stripeCustomerId, stripeDefaultPaymentMethod, employeePin, ...safeUser } = user;
  return safeUser;
}

// Retry helper for transient database errors
async function withRetry<T>(operation: () => Promise<T>, maxRetries = 3, delayMs = 1000): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const isTransient = error?.code === '57P01' || 
                          error?.code === 'ECONNRESET' ||
                          error?.message?.includes('connection') ||
                          error?.message?.includes('terminating');
      if (isTransient && attempt < maxRetries) {
        console.log(`Database operation failed (attempt ${attempt}/${maxRetries}), retrying in ${delayMs}ms...`);
        resetPool();
        await new Promise(r => setTimeout(r, delayMs * attempt));
      } else {
        throw error;
      }
    }
  }
  throw lastError;
}
import { extractOrderFromPhoto, apply99Pricing } from './orderPhotoProcessor';
import { categorizeProduct, detectLiveAnimal } from './productCategorization';
import { registerBillingRoutes } from './billingRoutes';
// Shared-pool limiters MUST be imported from sharedLimiters.ts — never
// re-created inline.  See server/sharedLimiters.ts for the full explanation.
import { getRealIp, authLimiter, searchLimiter, checkoutLimiter, uploadLimiter, overridePinLimiter, overridePinSlugLimiter } from './sharedLimiters';

// Helper: clean a name string — collapse extra spaces, trim
function cleanName(name: string | undefined | null): string {
  if (!name) return '';
  return name.replace(/\s+/g, ' ').trim();
}

/**
 * Infer a human-readable record type from the request URL path for audit logging.
 * e.g. "/api/supplies/123" → "supply", "/api/pets" → "pet"
 */
function inferRecordType(path: string): string {
  const segment = path.replace(/^\/api\//, '').split('/')[0] ?? 'unknown';
  // Normalise common plurals to singular
  const map: Record<string, string> = {
    supplies: 'supply',
    pets: 'pet',
    appointments: 'appointment',
    contacts: 'contact',
    orders: 'order',
    groomers: 'groomer',
    boarding: 'boarding_record',
    'boarding-records': 'boarding_record',
    specials: 'special',
    'legal-pages': 'legal_page',
    'appointment-items': 'appointment_item',
    users: 'user',
  };
  return map[segment] ?? segment;
}

/**
 * Resolves the tenantId to use for a write (INSERT/UPDATE) operation.
 *
 * - Super-admins may pass `targetTenantId` in the request body to write on
 *   behalf of a specific tenant.
 * - All other callers must have req.tenantId set by tenantMiddleware.
 * - Returns undefined and sends a 400 response when tenant context is absent,
 *   so the caller can simply `return` without writing anything.
 *
 * When a super-admin override is resolved, this function automatically schedules
 * an audit-log insert that fires after the response is sent (res.on('finish')).
 * No changes to individual route handlers are needed.
 */
function resolveWriteTenantId(req: any, res: any): number | undefined {
  // Reject targetTenantId from non-super-admin callers to prevent privilege escalation.
  if (req.body?.targetTenantId !== undefined && req.body?.targetTenantId !== null && req.body?.targetTenantId !== '') {
    if (!req.isSuperAdmin) {
      res.status(403).json({ message: "targetTenantId is only available to super-admins." });
      return undefined;
    }
    const tid = parseInt(req.body.targetTenantId, 10);
    if (!isNaN(tid) && tid > 0) {
      // Super-admin override detected — schedule an audit log entry once the
      // response has been sent so we know whether the write actually succeeded.
      const actorUserId: string = req.actorUserId ?? req.user?.id ?? 'unknown';
      const targetTenantId = tid;
      res.on('finish', () => {
        // Only record successful writes (2xx status codes)
        if (res.statusCode < 200 || res.statusCode >= 300) return;
        const method: string = req.method?.toUpperCase() ?? 'POST';
        const actionType = method === 'DELETE' ? 'delete' : method === 'POST' ? 'create' : 'update';
        const recordType = inferRecordType(req.path ?? '');
        withRetry(() => storage.createAuditLog({
          actorUserId,
          targetTenantId,
          actionType,
          recordType,
          metadata: {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
          },
        })).catch((err: any) => {
          const warning = {
            droppedAt: new Date().toISOString(),
            actorUserId,
            targetTenantId,
            actionType,
            recordType,
            path: req.path,
            statusCode: res.statusCode,
            error: err?.message ?? String(err),
          };
          console.warn('[auditLog] AUDIT ENTRY DROPPED — failed to write after retries.', warning);
          // Persist to a local JSONL file so operators can review offline.
          try {
            const { appendFileSync, mkdirSync } = require('fs');
            const { join } = require('path');
            const dir = join(process.cwd(), '.cache');
            mkdirSync(dir, { recursive: true });
            appendFileSync(join(dir, 'dropped-audit-warnings.jsonl'), JSON.stringify(warning) + '\n', 'utf8');
          } catch (fileErr: any) {
            console.warn('[auditLog] Also failed to persist dropped warning to file:', fileErr?.message);
          }
        });
      });
      return tid;
    }
  }
  const tenantId: number | undefined = req.tenantId;
  if (!tenantId) {
    res.status(400).json({ message: "Tenant context is required to create records. Ensure you are logged in to a configured store account." });
    return undefined;
  }
  return tenantId;
}

// Helper function to capitalize first letter of each word
function capitalizeWords(text: string | undefined | null): string | undefined | null {
  if (!text) return text;
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(word => {
      if (!word) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

// Configure multer for file uploads
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: uploadStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit for images and PDFs
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only image files and PDFs are allowed'));
    }
  }
});

// Configure multer for Excel file uploads
const excelUpload = multer({ 
  storage: multer.memoryStorage(), // Store in memory for immediate processing
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit for Excel files
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'application/octet-stream' // Sometimes Excel files are detected as this
    ];
    if (allowedMimeTypes.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
    }
  }
});

// In-memory deduplication for no-tenant alerts.
// Prevents flooding super-admins when a stranded user keeps reloading the app.
// Keys are user IDs; the value is the UTC date string (YYYY-MM-DD) when the alert was last sent.
//
// Known limitation — one-per-server-restart edge case:
// Stranded-account alert deduplication is now persisted to the database via the
// strandedAlertSentAt column on the users table. This survives server restarts.

// In-memory store for pending contact-change OTPs (email/phone).
// Keyed by a random pendingToken returned to the client.
const pendingContactChanges = new Map<string, {
  userId: number;
  type: 'email' | 'phone';
  newValue: string;
  otp: string;
  expiresAt: Date;
  attempts: number;
}>();
const MAX_OTP_ATTEMPTS = 5;

/**
 * Resolve the caller's user ID with full session validation (signature + DB tokenVersion).
 * Returns the user ID string on success, undefined if no token is present or validation fails.
 * Never rejects the request — intended for routes that allow optional authentication.
 */
async function resolveOptionalAuthUserId(req: any): Promise<string | undefined> {
  const token = req.cookies?.auth_token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return undefined;
  const decoded = verifyToken(token);
  if (!decoded) return undefined;
  try {
    const dbUser = await storage.getUser(decoded.id);
    if (!dbUser) return undefined;
    const dbTokenVersion: number = dbUser.tokenVersion ?? 0;
    const tokenVersion: number = decoded.tokenVersion ?? 0;
    if (tokenVersion !== dbTokenVersion) return undefined;
    return decoded.id;
  } catch {
    return undefined;
  }
}

/**
 * Express middleware that requires an authenticated admin session.
 * Must be placed BEFORE any file-upload middleware so that file parsing
 * is skipped entirely for unauthenticated or non-admin callers.
 */
/** Rejects requests from tenants not on the Pro (or higher) plan. */
async function requireProPlan(req: any, res: any, next: any): Promise<void> {
  try {
    const tenantId: number | undefined = req.tenantId;
    if (!tenantId) { next(); return; } // super-admin or no-tenant context — allow through
    const [tenant] = await db
      .select({ subscriptionTier: tenants.subscriptionTier })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    const tier = tenant?.subscriptionTier ?? 'starter';
    if (tier !== 'pro' && tier !== 'enterprise') {
      res.status(403).json({ error: 'PRO_REQUIRED', message: 'This feature requires a Pro subscription. Please upgrade to continue.' });
      return;
    }
    next();
  } catch (err) {
    console.error('requireProPlan error:', err);
    next(err);
  }
}

async function requireAdminMiddleware(req: any, res: any, next: any): Promise<void> {
  const token = req.cookies?.auth_token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(401).json({ message: 'Invalid token' });
    return;
  }
  try {
    const dbUser = await storage.getUser(decoded.id);
    if (!dbUser) {
      res.status(401).json({ message: 'Account not found' });
      return;
    }
    const dbTokenVersion: number = dbUser.tokenVersion ?? 0;
    const tokenVersion: number = decoded.tokenVersion ?? 0;
    if (tokenVersion !== dbTokenVersion) {
      res.status(401).json({ message: 'Session has been invalidated. Please log in again.' });
      return;
    }
    if (!dbUser.isAdmin) {
      res.status(403).json({ message: 'Admin access required' });
      return;
    }
    req.user = decoded;
    next();
  } catch (error) {
    console.error('requireAdminMiddleware error:', error);
    res.status(500).json({ message: 'Authentication check failed' });
  }
}

export async function registerRoutes(app: Express, server?: Server): Promise<void> {

  // Register subscription billing routes (Stripe Checkout, Portal, status)
  registerBillingRoutes(app);

  // Prevent browser caching of API responses to avoid stale data
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
  });

  // Resolve tenant context for all API routes (non-blocking: attaches req.tenantId if authenticated)
  app.use('/api', tenantMiddleware);

  // getRealIp is imported from ./sharedLimiters — see that module for the full
  // explanation of why the RIGHTMOST X-Forwarded-For entry must be used.

  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getRealIp,
    message: { message: "Too many requests, please try again later." },
    // Skip authenticated sessions entirely — the admin panel fires 30+ queries
    // per page mount, so a legitimate owner navigating normally would exhaust
    // a 200-request budget in minutes.  The general limiter exists to blunt
    // unauthenticated abuse (scrapers, misconfigured clients); authenticated
    // requests have already passed auth checks and are governed by the
    // authLimiter / overridePinLimiter on sensitive endpoints instead.
    // Also exclude no-tenant signup attempts to avoid blocking real signups
    // when a misconfigured client hammers /api/auth/signup without a slug.
    skip: (req: any) => {
      const hasAuth = !!(req.cookies?.auth_token || req.headers.authorization);
      if (hasAuth) return true;
      if (req.path === '/auth/signup' && !req.tenantId) return true;
      return false;
    },
  });
  app.use('/api', generalLimiter);

  // authLimiter is imported from ./sharedLimiters (shared-pool singleton).
  // Creating a new rateLimit() call here — or in any future auth router file —
  // silently gives those routes an independent budget, bypassing brute-force
  // protection.  See server/sharedLimiters.ts for the full contract and the
  // regression test: server/tests/auth-limiter-xff-bypass.test.ts
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
  app.use('/api/auth/forgot-password', authLimiter);
  app.use('/api/auth/reset-password', authLimiter);
  app.use('/api/auth/change-password', authLimiter);

  // overridePinLimiter is imported from ./sharedLimiters (shared-pool singleton).
  // The store override PIN is a 4-digit code; without a rate limit an attacker
  // could enumerate all 10,000 combinations in seconds.  This limiter caps
  // guesses at 10 per 15 minutes per real IP.  Always import this export —
  // never create a new rateLimit() call inline for this route.
  // See server/sharedLimiters.ts for the keyGenerator rationale (getRealIp).
  app.use('/api/auth/admin-override', overridePinLimiter);

  // overridePinSlugLimiter supplements overridePinLimiter with a per-store cap.
  // A distributed attacker rotating real IPs can evade the per-IP limiter by
  // staying under the 10-attempt cap on each machine.  Keying on the tenant
  // slug ensures that all guesses against the same store — regardless of the
  // source IP — share a single 10-attempt / 15-minute budget, closing the
  // distributed-rotation bypass entirely.
  // See server/sharedLimiters.ts for the full rationale and regression test ref.
  app.use('/api/auth/admin-override', overridePinSlugLimiter);

  // Separate limiter for customer signup that does NOT count requests that will
  // be immediately rejected with 400 due to a missing tenant context.
  // A misconfigured client or embedded widget that hammers /api/auth/signup
  // without a valid store slug would otherwise exhaust the budget and block
  // real users on the same IP from signing up through a legitimate store link.
  // By the time this middleware runs, tenantMiddleware has already attached
  // req.tenantId (or left it undefined), so we can skip counting those requests
  // safely — they carry no authentication risk because they always return 400.
  const signupLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getRealIp,
    message: { message: "Too many signup attempts, please try again in 15 minutes." },
    skip: (req: any) => !req.tenantId,
  });
  app.use('/api/auth/signup', signupLimiter);

  // searchLimiter is imported from ./sharedLimiters (shared-pool singleton).
  // Both routes reference the SAME instance so they share one per-IP counter.
  // See server/sharedLimiters.ts for the full shared-pool contract.
  // Regression guard: server/tests/search-limiter-shared-pool.test.ts
  app.use('/api/supplies/search', searchLimiter);
  app.use('/api/pets', searchLimiter);

  // checkoutLimiter is imported from ./sharedLimiters (shared-pool singleton).
  // Both routes reference the SAME instance so they share one per-IP counter.
  // See server/sharedLimiters.ts for the full shared-pool contract.
  app.use('/api/orders', checkoutLimiter);
  app.use('/api/create-payment-intent', checkoutLimiter);

  // uploadLimiter is imported from ./sharedLimiters (shared-pool singleton).
  // Both routes reference the SAME instance so they share one per-IP counter.
  // See server/sharedLimiters.ts for the full shared-pool contract.
  // Regression guard: server/tests/upload-limiter-shared-pool.test.ts
  app.use('/api/upload', uploadLimiter);
  app.use('/api/admin/order-photos', uploadLimiter);

  // Stripe API routes
  app.get("/api/stripe/config", async (req, res) => {
    try {
      const { getStripePublishableKey } = await import('./stripeClient');
      const publishableKey = await getStripePublishableKey();
      res.json({ configured: !!publishableKey, publishableKey });
    } catch (error: any) {
      console.error("Failed to get Stripe config:", error);
      res.json({ configured: false, publishableKey: null });
    }
  });

  // Get or create Stripe customer for current user
  app.post("/api/stripe/customer", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const { getUncachableStripeClient } = await import('./stripeClient');
      const stripe = await getUncachableStripeClient();
      
      // Check if user already has a Stripe customer ID
      if (user.stripeCustomerId) {
        try {
          // Verify customer still exists in Stripe
          const customer = await stripe.customers.retrieve(user.stripeCustomerId);
          if (!customer.deleted) {
            return res.json({ customerId: user.stripeCustomerId });
          }
        } catch (e) {
          // Customer doesn't exist, will create new one
        }
      }
      
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined,
        phone: user.phoneNumber || undefined,
        metadata: {
          userId: userId,
        },
      });
      
      // Save customer ID to user
      await storage.updateUserStripeInfo(userId, { stripeCustomerId: customer.id });
      
      res.json({ customerId: customer.id });
    } catch (error: any) {
      console.error("Failed to create/get Stripe customer:", error);
      res.status(500).json({ error: "Failed to create customer" });
    }
  });

  // Create a SetupIntent for saving a new card
  app.post("/api/stripe/setup-intent", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const { getUncachableStripeClient } = await import('./stripeClient');
      const stripe = await getUncachableStripeClient();
      
      // Ensure user has a Stripe customer
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email || undefined,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined,
          metadata: { userId },
        });
        customerId = customer.id;
        await storage.updateUserStripeInfo(userId, { stripeCustomerId: customerId });
      }
      
      // Create SetupIntent for saving card
      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
        usage: 'off_session', // Allow charging when customer is not present
      });
      
      res.json({
        clientSecret: setupIntent.client_secret,
        customerId: customerId,
      });
    } catch (error: any) {
      console.error("Failed to create setup intent:", error);
      res.status(500).json({ error: "Failed to create setup intent" });
    }
  });

  // Get user's saved payment methods
  app.get("/api/stripe/payment-methods", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user || !user.stripeCustomerId) {
        return res.json({ paymentMethods: [], defaultPaymentMethod: null });
      }
      
      const { getUncachableStripeClient } = await import('./stripeClient');
      const stripe = await getUncachableStripeClient();
      
      const paymentMethods = await stripe.paymentMethods.list({
        customer: user.stripeCustomerId,
        type: 'card',
      });
      
      res.json({
        paymentMethods: paymentMethods.data.map(pm => ({
          id: pm.id,
          brand: pm.card?.brand,
          last4: pm.card?.last4,
          expMonth: pm.card?.exp_month,
          expYear: pm.card?.exp_year,
        })),
        defaultPaymentMethod: user.stripeDefaultPaymentMethod,
      });
    } catch (error: any) {
      console.error("Failed to get payment methods:", error);
      res.status(500).json({ error: "Failed to get payment methods" });
    }
  });

  // Set default payment method
  app.post("/api/stripe/default-payment-method", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { paymentMethodId } = req.body;
      
      if (!paymentMethodId) {
        return res.status(400).json({ error: "Payment method ID required" });
      }
      
      const user = await storage.getUser(userId);
      if (!user || !user.stripeCustomerId) {
        return res.status(400).json({ error: "No Stripe customer found" });
      }
      
      const { getUncachableStripeClient } = await import('./stripeClient');
      const stripe = await getUncachableStripeClient();
      
      // Verify ownership: check that this payment method belongs to the user's customer
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      if (paymentMethod.customer !== user.stripeCustomerId) {
        return res.status(403).json({ error: "Payment method does not belong to this customer" });
      }
      
      // Update default payment method in Stripe
      await stripe.customers.update(user.stripeCustomerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
      
      // Save to our database too
      await storage.updateUserStripeInfo(userId, { stripeDefaultPaymentMethod: paymentMethodId });
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Failed to set default payment method:", error);
      res.status(500).json({ error: "Failed to set default payment method" });
    }
  });

  // Delete a payment method
  app.delete("/api/stripe/payment-methods/:id", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const paymentMethodId = req.params.id;
      const user = await storage.getUser(userId);
      
      if (!user || !user.stripeCustomerId) {
        return res.status(400).json({ error: "No Stripe customer found" });
      }
      
      const { getUncachableStripeClient } = await import('./stripeClient');
      const stripe = await getUncachableStripeClient();
      
      // Verify ownership: check that this payment method belongs to the user's customer
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      if (paymentMethod.customer !== user.stripeCustomerId) {
        return res.status(403).json({ error: "Payment method does not belong to this customer" });
      }
      
      // Detach the payment method
      await stripe.paymentMethods.detach(paymentMethodId);
      
      // If this was the default, clear it
      if (user.stripeDefaultPaymentMethod === paymentMethodId) {
        await storage.updateUserStripeInfo(userId, { stripeDefaultPaymentMethod: undefined });
      }
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Failed to delete payment method:", error);
      res.status(500).json({ error: "Failed to delete payment method" });
    }
  });

  // Customer signup
  app.post('/api/auth/signup', async (req, res) => {
    try {
      const { email, password, firstName: rawFirst, lastName: rawLast, phoneNumber } = req.body;
      
      if (!email || !password || !rawFirst || !rawLast || !phoneNumber) {
        return res.status(400).json({ message: "All fields including phone number are required" });
      }

      // Reject signups that arrive without a valid tenant context.
      // A missing or unresolvable X-Tenant-Slug header means tenantMiddleware
      // could not attach req.tenantId.  Creating the account anyway would
      // produce a stranded user (tenantId = null) that requires manual cleanup.
      if (!(req as any).tenantId) {
        return res.status(400).json({
          message: "Signup is not available: no store was identified. Please use a valid store link to create your account.",
        });
      }

      const firstName = cleanName(rawFirst);
      const lastName = cleanName(rawLast);

      // Validate password complexity
      const passwordValidation = isPasswordComplexEnough(password);
      if (!passwordValidation.valid) {
        return res.status(400).json({ 
          message: passwordValidation.errors.join('. '),
          requirements: getPasswordRequirementsMessage()
        });
      }

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      // Hash password before storing
      const hashedPassword = await hashPassword(password);

      // Generate email verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Create new user with hashed password (unverified), assigned to the current tenant
      const newUser = await storage.createUser({
        email,
        password: hashedPassword,
        firstName,
        lastName,
        tenantId: (req as any).tenantId ?? undefined,
      });

      // Phone number is now required - update user and link to any existing contacts
      const { phoneNumbersMatch } = await import("./phoneUtils");
      
      // Update user with phone number and verification token
      await db.update(users).set({
        phoneNumber,
        emailVerified: false,
        emailVerificationToken: verificationToken,
        emailVerificationExpiry: verificationExpiry,
      }).where(eq(users.id, newUser.id));
      
      // Find and link any existing contacts with matching phone number
      // This will also replace temp emails with user's real email
      const matchingContacts = await storage.findUnlinkedContactsByPhoneNumber(phoneNumber);
      
      for (const contact of matchingContacts) {
        await storage.linkContactToUser(contact.id, newUser.id);
        console.log(`Linked contact ${contact.id} to user ${newUser.id}, replaced temp email with ${email}`);
      }

      console.log(`Linked ${matchingContacts.length} contacts to new user ${newUser.id}`);

      // Link any prior grooming appointments booked under the same phone number
      if ((req as any).tenantId) {
        const linkedAppts = await storage.linkAppointmentsToUser(phoneNumber, newUser.id, (req as any).tenantId);
        if (linkedAppts > 0) {
          console.log(`Linked ${linkedAppts} historical appointments to new user ${newUser.id} (phone match)`);
        }
      }

      // Send verification email (non-blocking — don't fail signup if email fails)
      try {
        const proto = (req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
        const host = req.get('host') || '';
        const reqBaseUrl = host ? `${proto}://${host}` : undefined;
        await sendVerificationEmail(email, firstName, verificationToken, reqBaseUrl);
      } catch (emailError) {
        console.error('Failed to send verification email during signup:', emailError);
      }

      // Notify admins of new account via WebSocket
      try {
        const wsServer = (global as any).wsServer;
        if (wsServer) {
          wsServer.broadcastToAdmins({
            notificationType: 'new_account',
            title: 'New Account Created',
            message: `${firstName} ${lastName} just created an account (${email})`
          });
        }
      } catch (wsError) {
        console.error('Failed to send new account WS notification:', wsError);
      }

      // Return user but indicate email verification is pending
      res.json({ ...sanitizeUser(newUser), emailVerified: false, requiresVerification: true });
    } catch (error) {
      console.error("Signup error:", error);
      res.status(500).json({ message: "Signup failed" });
    }
  });

  // ─── Tenant Self-Service Signup ───────────────────────────────────────────────
  // GET /api/tenants/slug-check — check if a slug is available and suggest alternatives
  app.get('/api/tenants/slug-check', async (req, res) => {
    try {
      const raw = (req.query.slug as string || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (!raw) {
        return res.status(400).json({ message: 'slug is required' });
      }
      const taken = !!(await storage.getTenantBySlug(raw));
      const suggestions: string[] = [];
      if (taken) {
        for (let i = 2; suggestions.length < 3; i++) {
          const candidate = `${raw}-${i}`;
          if (!(await storage.getTenantBySlug(candidate))) {
            suggestions.push(candidate);
          }
        }
      }
      return res.json({ slug: raw, available: !taken, suggestions });
    } catch (error) {
      console.error('slug-check error:', error);
      return res.status(500).json({ message: 'Failed to check slug.' });
    }
  });

  // POST /api/tenants/signup — create a new tenant + owner account in one step.
  // Returns a session token; auto-logs the user in.
  app.post('/api/tenants/signup', async (req, res) => {
    try {
      const { businessName, firstName: rawFirst, lastName: rawLast, email, password, phone, slug: requestedSlug } = req.body;

      if (!businessName || !rawFirst || !rawLast || !email || !password) {
        return res.status(400).json({ message: "Business name, owner name, email, and password are required." });
      }

      const firstName = cleanName(rawFirst);
      const lastName = cleanName(rawLast);

      // Validate password complexity
      const passwordValidation = isPasswordComplexEnough(password);
      if (!passwordValidation.valid) {
        return res.status(400).json({
          message: passwordValidation.errors.join('. '),
          requirements: getPasswordRequirementsMessage(),
        });
      }

      // Check if email already in use
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "An account with this email already exists. Please sign in." });
      }

      // Determine the base slug from the client-supplied slug or the business name.
      // The advisory pre-check on the client is UX-only; slug uniqueness is enforced here
      // atomically by catching unique-constraint violations and retrying with a numeric suffix.
      const baseSlug = (requestedSlug
        ? requestedSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        : businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) || 'business';

      const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days

      // Attempt to create the tenant with the requested slug. If the slug is taken
      // (Postgres unique-constraint violation 23505 on the slug column) we return a
      // 409 with alternative suggestions so the owner can consciously pick a new URL
      // rather than being silently assigned a different one.
      let tenant: Awaited<ReturnType<typeof storage.createTenant>> | null = null;
      try {
        tenant = await storage.createTenant({
          name: businessName.trim(),
          slug: baseSlug,
          subscriptionStatus: 'trial',
          subscriptionTier: 'starter',
          trialEndsAt,
        });
      } catch (err: any) {
        // Drizzle wraps the underlying pg error in err.cause, so check both the
        // top-level error and its cause for the unique-constraint violation code/detail.
        const pgErr = (err?.code === '23505') ? err : (err?.cause?.code === '23505' ? err.cause : null);
        const isSlugConflict = pgErr !== null &&
          (pgErr?.constraint?.includes('slug') || pgErr?.detail?.includes('slug'));
        if (isSlugConflict) {
          // Build a short list of available alternatives and tell the client.
          const suggestions: string[] = [];
          for (let i = 2; suggestions.length < 3; i++) {
            const candidate = `${baseSlug}-${i}`;
            if (!(await storage.getTenantBySlug(candidate))) {
              suggestions.push(candidate);
            }
          }
          return res.status(409).json({
            message: `The URL "${baseSlug}" was just taken. Please choose one of the suggestions or enter your own.`,
            slug: baseSlug,
            suggestions,
          });
        }
        throw err; // re-throw non-slug errors
      }
      if (!tenant) {
        return res.status(500).json({ message: "Unable to assign a unique store URL. Please try a different business name." });
      }

      // Hash password and create the owner user linked to this tenant
      const hashedPassword = await hashPassword(password);
      const userId = Math.random().toString(36).substring(2, 15);
      const [ownerUser] = await db.insert(users).values({
        id: userId,
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        firstName,
        lastName,
        phoneNumber: phone ? normalizePhoneNumber(phone) : null,
        tenantId: tenant.id,
        isAdmin: true,
        emailVerified: true, // Tenant owners skip email verification during onboarding
      }).returning();

      // Set tenant ownerId now that the user exists
      await storage.updateTenant(tenant.id, { ownerId: ownerUser.id });

      // Generate session token and set cookie
      const token = generateToken(ownerUser);
      setAuthCookie(res, token);

      res.status(201).json({ ...sanitizeUser(ownerUser), token });
    } catch (error) {
      console.error('Tenant signup error:', error);
      res.status(500).json({ message: "Failed to create account. Please try again." });
    }
  });

  // GET /api/tenants/current — return the current user's tenant
  app.get('/api/tenants/current', authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const dbUser = await storage.getUser(userId);
      if (!dbUser?.tenantId) {
        return res.status(404).json({ message: "No tenant found for this user." });
      }
      const tenant = await storage.getTenant(dbUser.tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found." });
      }
      res.json({ id: tenant.id, name: tenant.name, slug: tenant.slug, subscriptionStatus: tenant.subscriptionStatus, subscriptionTier: tenant.subscriptionTier, trialEndsAt: tenant.trialEndsAt, onboardingStep: tenant.onboardingStep ?? 0, enabledFeatures: tenant.enabledFeatures ?? {} });
    } catch (error) {
      console.error('GET /api/tenants/current error:', error);
      res.status(500).json({ message: "Failed to fetch tenant." });
    }
  });

  // PATCH /api/tenants/current — update business name/slug for the current tenant
  app.patch('/api/tenants/current', authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const dbUser = await storage.getUser(userId);
      if (!dbUser?.tenantId) {
        return res.status(404).json({ message: "No tenant found for this user." });
      }
      if (!dbUser.isAdmin) {
        return res.status(403).json({ message: "Only admins can update business details." });
      }
      const { name, slug, onboardingStep } = req.body;
      const updates: Record<string, unknown> = {};
      if (name) updates.name = name.trim();
      if (slug) {
        const sanitizedSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '');
        // Check slug uniqueness (ignore own tenant)
        const existing = await storage.getTenantBySlug(sanitizedSlug);
        if (existing && existing.id !== dbUser.tenantId) {
          return res.status(400).json({ message: "This slug is already taken. Please choose another." });
        }
        updates.slug = sanitizedSlug;
      }
      // Only advance the onboarding step — never regress it server-side.
      if (typeof onboardingStep === 'number' && Number.isInteger(onboardingStep) && onboardingStep >= 0) {
        const current = await storage.getTenant(dbUser.tenantId);
        if (current && onboardingStep > (current.onboardingStep ?? 0)) {
          updates.onboardingStep = onboardingStep;
        }
      }
      const updated = await storage.updateTenant(dbUser.tenantId, updates as any);
      res.json({ id: updated.id, name: updated.name, slug: updated.slug, onboardingStep: updated.onboardingStep ?? 0, enabledFeatures: updated.enabledFeatures ?? {} });
    } catch (error: any) {
      console.error('PATCH /api/tenants/current error:', error);
      // Detect a Postgres unique-constraint violation (23505) on the slug column.
      // Drizzle wraps the underlying pg error in err.cause, so check both the
      // top-level error and its cause — matching the same pattern used in signup.
      const pgErr = (error?.code === '23505') ? error : (error?.cause?.code === '23505' ? error.cause : null);
      const isSlugConflict = pgErr !== null && pgErr !== undefined &&
        (pgErr?.constraint?.includes('slug') || pgErr?.detail?.includes('slug'));
      if (isSlugConflict) {
        return res.status(409).json({ message: "This slug is already taken. Please choose another." });
      }
      res.status(500).json({ message: "Failed to update business details." });
    }
  });

  // PATCH /api/tenants/features — save enabled feature flags for the current tenant
  app.patch('/api/tenants/features', authMiddleware, async (req: any, res) => {
    try {
      const dbUser = await storage.getUser(req.user?.id);
      if (!dbUser?.tenantId) return res.status(404).json({ message: "No tenant found." });
      if (!dbUser.isAdmin) return res.status(403).json({ message: "Admin access required." });

      // Whitelist of valid feature keys
      const VALID_FEATURES = ['appointments', 'loyalty', 'boarding', 'hiring', 'emailMarketing', 'pets', 'onlineStore'];
      const incoming = req.body ?? {};
      const features: Record<string, boolean> = {};
      for (const key of VALID_FEATURES) {
        if (typeof incoming[key] === 'boolean') features[key] = incoming[key];
      }

      const updated = await storage.updateTenant(dbUser.tenantId, {
        enabledFeatures: features,
        // Advance onboarding step to 2 (features chosen) — never regress
        ...((() => {
          const step = req.body.onboardingStep;
          return typeof step === 'number' && step === 2 ? { onboardingStep: 2 } : {};
        })()),
      } as any);
      res.json({ enabledFeatures: updated.enabledFeatures ?? {}, onboardingStep: updated.onboardingStep ?? 0 });
    } catch (err: any) {
      console.error('PATCH /api/tenants/features error:', err);
      res.status(500).json({ message: "Failed to save features." });
    }
  });

  // ─── End Tenant Self-Service ──────────────────────────────────────────────────

  // Test-only endpoint to create users (only in development)
  app.post('/api/test/create-user', async (req, res) => {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({ message: "Test endpoints only available in development" });
    }

    try {
      const { email, password, firstName: rawFirst, lastName: rawLast, phoneNumber, isAdmin, isGroomer } = req.body;
      
      if (!email || !password || !rawFirst || !rawLast) {
        return res.status(400).json({ message: "Email, password, firstName, and lastName are required" });
      }

      const firstName = cleanName(rawFirst);
      const lastName = cleanName(rawLast);

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        // Return existing user instead of error
        console.log('Test user already exists, returning existing:', email);
        return res.json(sanitizeUser(existingUser));
      }

      // Create new user
      const newUser = await storage.createUser({
        email,
        password,
        firstName,
        lastName,
        isAdmin: isAdmin || false,
        isGroomer: isGroomer || false,
      });

      // Update phone number if provided
      if (phoneNumber) {
        await db.update(users).set({ phoneNumber }).where(eq(users.id, newUser.id));
      }

      console.log('Test user created:', email, 'isAdmin:', isAdmin, 'isGroomer:', isGroomer);
      res.json(sanitizeUser(newUser));
    } catch (error) {
      console.error("Test user creation error:", error);
      res.status(500).json({ message: "Failed to create test user" });
    }
  });

  // Customer login
  // POST /api/auth/login
  // The client may forward X-Tenant-Slug (read from ?tenant=<slug> in the URL)
  // but this route intentionally does NOT use it to resolve tenant context.
  // Tenant scoping for a returning user is already stored in their user record
  // (set at signup time) and is encoded in the JWT that is issued here.
  // Using the slug from the URL would open a class of bugs where a customer
  // arriving via the wrong store link gets their session incorrectly scoped.
  // The stored tenantId is always authoritative for login — do not add slug
  // resolution here.  If the slug context is needed for analytics or logging
  // in the future, read req.headers['x-tenant-slug'] but do NOT override tenantId.
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      // Find user
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Verify password using bcrypt (handles both hashed and legacy plain text)
      const passwordValid = await verifyPassword(password, user.password);
      if (!passwordValid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Block login if email is not verified and the 24-hour window has expired
      if (user.emailVerified === false) {
        const expiry = user.emailVerificationExpiry ? new Date(user.emailVerificationExpiry) : null;
        if (!expiry || new Date() > expiry) {
          return res.status(403).json({
            message: "Your verification link has expired. Please request a new one.",
            verificationExpired: true,
          });
        }
        // Still within 24 hours — let them know but don't block login yet
        return res.status(403).json({
          message: "Please verify your email address. Check your inbox for the verification link.",
          requiresVerification: true,
        });
      }

      // If a specific store's login page sent its slug, make sure this account
      // belongs to that store.  This prevents an employee of Store A from
      // accidentally authenticating on Store B's login URL.
      // We only enforce when a slug IS provided — generic login (no slug) is
      // always allowed so employees on a fresh device can still sign in.
      const requestedSlug = (req.headers['x-tenant-slug'] as string | undefined)?.trim();
      if (requestedSlug && !user.isSuperAdmin) {
        const requestedTenant = await storage.getTenantBySlug(requestedSlug);
        if (requestedTenant && user.tenantId !== requestedTenant.id) {
          return res.status(403).json({
            message: "This account doesn't belong to this store. Please use your own store's sign-in link.",
            code: "WRONG_TENANT",
          });
        }
      }

      // Generate JWT token
      const token = generateToken(user);
      setAuthCookie(res, token);
      
      res.json({ ...sanitizeUser(user), token });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Logout
  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('auth_token');
    res.json({ message: "Logged out successfully" });
  });

  // Check if a verification token is valid — does NOT consume it.
  // Email privacy scanners (Google, Apple, Outlook) pre-fetch every link in an
  // email via GET.  By keeping the GET side-effect-free we prevent the token from
  // being burned before the real user clicks the button.
  app.get('/api/auth/verify-email', async (req, res) => {
    try {
      const { token } = req.query;
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ message: "Invalid verification token" });
      }

      const [user] = await db.select().from(users).where(eq(users.emailVerificationToken, token)).limit(1);
      if (!user) {
        return res.status(400).json({ message: "Invalid or already used verification link" });
      }

      if (user.emailVerified) {
        return res.json({ alreadyVerified: true, message: "Email already verified. You can log in." });
      }

      const expiry = user.emailVerificationExpiry ? new Date(user.emailVerificationExpiry) : null;
      if (!expiry || new Date() > expiry) {
        return res.status(400).json({ message: "Verification link has expired. Please request a new one.", expired: true });
      }

      // Token is valid — tell the frontend to show the confirm button
      return res.json({ valid: true, message: "Ready to verify" });
    } catch (error) {
      console.error("Email verification check error:", error);
      res.status(500).json({ message: "Verification check failed" });
    }
  });

  // Actually verify the email — only called when the user clicks the button.
  // POST requests are never made by email privacy scanners, so the token is safe.
  app.post('/api/auth/verify-email', authLimiter, async (req, res) => {
    try {
      const { token } = req.body;
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ message: "Invalid verification token" });
      }

      const [user] = await db.select().from(users).where(eq(users.emailVerificationToken, token)).limit(1);
      if (!user) {
        return res.status(400).json({ message: "Invalid or already used verification link" });
      }

      if (user.emailVerified) {
        return res.json({ message: "Email already verified. You can log in." });
      }

      const expiry = user.emailVerificationExpiry ? new Date(user.emailVerificationExpiry) : null;
      if (!expiry || new Date() > expiry) {
        return res.status(400).json({ message: "Verification link has expired. Please request a new one.", expired: true });
      }

      // Mark as verified and clear token
      await db.update(users).set({
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiry: null,
      }).where(eq(users.id, user.id));

      // Generate JWT and log them in automatically
      const updatedUser = await storage.getUser(user.id);
      if (updatedUser) {
        const authToken = generateToken(updatedUser);
        setAuthCookie(res, authToken);
        return res.json({ message: "Email verified successfully!", ...sanitizeUser(updatedUser), token: authToken });
      }

      res.json({ message: "Email verified successfully! You can now log in." });
    } catch (error) {
      console.error("Email verification error:", error);
      res.status(500).json({ message: "Verification failed" });
    }
  });

  // Resend verification email
  app.post('/api/auth/resend-verification', authLimiter, async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.json({ message: "If that account exists, a new verification email has been sent." });
      }

      if (user.emailVerified) {
        return res.json({ message: "This account is already verified. Please log in." });
      }

      // Generate new token and expiry
      const newToken = crypto.randomBytes(32).toString('hex');
      const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await db.update(users).set({
        emailVerificationToken: newToken,
        emailVerificationExpiry: newExpiry,
      }).where(eq(users.id, user.id));

      try {
        const proto = (req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
        const host = req.get('host') || '';
        const reqBaseUrl = host ? `${proto}://${host}` : undefined;
        await sendVerificationEmail(email, user.firstName || 'there', newToken, reqBaseUrl);
      } catch (emailError) {
        console.error('Failed to resend verification email:', emailError);
      }

      res.json({ message: "If that account exists, a new verification email has been sent." });
    } catch (error) {
      console.error("Resend verification error:", error);
      res.status(500).json({ message: "Failed to resend verification email" });
    }
  });

  // Auth routes
  app.get('/api/auth/user', authMiddleware, async (req: any, res) => {
    try {
      // Get fresh user data from database to ensure admin status is current
      const freshUser = await storage.getUser(req.user.id);
      if (!freshUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Detect stranded accounts: authenticated user with no tenant and not a super-admin.
      // Log a warning and fire a one-per-day alert to super-admins so they can act immediately.
      // Deduplication uses strandedAlertSentAt persisted in the database so it survives restarts.
      if (!freshUser.tenantId && !freshUser.isSuperAdmin) {
        const todayUtc = new Date().toISOString().slice(0, 10);
        const userId = String(freshUser.id);
        const lastAlertDate = freshUser.strandedAlertSentAt
          ? new Date(freshUser.strandedAlertSentAt).toISOString().slice(0, 10)
          : null;
        console.warn(
          `[no-tenant] Stranded account login — userId=${userId} email=${freshUser.email ?? '(none)'} joined=${freshUser.createdAt ?? 'unknown'}`
        );
        if (lastAlertDate !== todayUtc) {
          // Persist the timestamp before firing the alert so a rapid second request
          // within the same UTC day won't send a duplicate even mid-flight.
          storage.updateUserStrandedAlertSentAt(userId, new Date()).catch((err) => {
            console.error('[no-tenant-alert] Failed to persist strandedAlertSentAt:', err);
          });
          // Fire-and-forget: do not await so the user response is not delayed
          sendNoTenantAlertToSuperAdmins({
            id: userId,
            email: freshUser.email ?? null,
            firstName: freshUser.firstName ?? null,
            lastName: freshUser.lastName ?? null,
            createdAt: freshUser.createdAt ?? null,
          }).catch((err) => {
            console.error('[no-tenant-alert] Background alert failed:', err);
          });
        }
      }

      res.json(sanitizeUser(freshUser));
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Self-service account deletion
  app.delete('/api/auth/delete-account', authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user) return res.status(404).json({ message: "User not found" });

      // Admins cannot self-delete to protect the system
      if (user.isAdmin) {
        return res.status(403).json({ message: "Admin accounts cannot be self-deleted. Contact another admin." });
      }

      await storage.deleteUser(user.id);
      res.clearCookie('auth_token');
      res.json({ message: "Account deleted successfully" });
    } catch (error) {
      console.error("Error deleting account:", error);
      res.status(500).json({ message: "Failed to delete account" });
    }
  });

  // Update user email
  app.patch('/api/auth/update-email', authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;

      const { email, currentPassword } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      if (!currentPassword) {
        return res.status(400).json({ message: "Current password is required to change email" });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Invalid email format" });
      }

      // Check if email is already taken by another user
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser && existingUser.id !== user.id) {
        return res.status(400).json({ message: "Email already in use" });
      }

      // Get current user data
      const currentUser = await storage.getUser(user.id);
      if (!currentUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Require password re-verification before initiating the change
      const passwordValid = await verifyPassword(currentPassword, currentUser.password);
      if (!passwordValid) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      // Do NOT commit the change yet — send an OTP to the NEW email to prove ownership
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      const pendingToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      pendingContactChanges.set(pendingToken, {
        userId: currentUser.id,
        type: 'email',
        newValue: email,
        otp,
        expiresAt,
        attempts: 0,
      });

      try {
        await sendContactChangeOtpEmail(email, currentUser.firstName || 'there', otp, 'email', email);
      } catch (emailErr) {
        pendingContactChanges.delete(pendingToken);
        console.error("Failed to send email OTP:", emailErr);
        return res.status(502).json({ message: "Failed to send verification code. Please try again." });
      }

      res.json({
        pendingToken,
        message: `A 6-digit verification code has been sent to ${email}. Enter it to complete the email change.`,
      });
    } catch (error) {
      console.error("Error updating email:", error);
      res.status(500).json({ message: "Failed to update email" });
    }
  });

  // Confirm email change with OTP
  app.post('/api/auth/confirm-email-change', authMiddleware, async (req: any, res) => {
    try {
      const { pendingToken, otp } = req.body;

      if (!pendingToken || !otp) {
        return res.status(400).json({ message: "Pending token and verification code are required" });
      }

      const pending = pendingContactChanges.get(pendingToken);
      if (!pending) {
        return res.status(400).json({ message: "Invalid or expired verification session" });
      }

      if (pending.userId !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (pending.type !== 'email') {
        return res.status(400).json({ message: "Invalid verification session type" });
      }

      if (new Date() > pending.expiresAt) {
        pendingContactChanges.delete(pendingToken);
        return res.status(400).json({ message: "Verification code has expired. Please start over." });
      }

      if (pending.attempts >= MAX_OTP_ATTEMPTS) {
        pendingContactChanges.delete(pendingToken);
        return res.status(429).json({ message: "Too many incorrect attempts. Please start over." });
      }

      if (otp.trim() !== pending.otp) {
        pending.attempts += 1;
        const remaining = MAX_OTP_ATTEMPTS - pending.attempts;
        if (remaining <= 0) {
          pendingContactChanges.delete(pendingToken);
          return res.status(429).json({ message: "Too many incorrect attempts. Please start over." });
        }
        return res.status(400).json({ message: `Incorrect verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.` });
      }

      // OTP valid — commit the email change
      pendingContactChanges.delete(pendingToken);

      const currentUser = await storage.getUser(pending.userId);
      if (!currentUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Double-check the new email is still available
      const existingUser = await storage.getUserByEmail(pending.newValue);
      if (existingUser && existingUser.id !== currentUser.id) {
        return res.status(400).json({ message: "Email already in use" });
      }

      const updatedUser = await storage.upsertUser({
        ...currentUser,
        email: pending.newValue,
        updatedAt: new Date(),
      });

      const newToken = generateToken(updatedUser);
      setAuthCookie(res, newToken);

      res.json({ ...sanitizeUser(updatedUser), token: newToken });
    } catch (error) {
      console.error("Error confirming email change:", error);
      res.status(500).json({ message: "Failed to confirm email change" });
    }
  });

  // Update user password
  app.patch('/api/auth/update-password', authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;

      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current password and new password are required" });
      }

      // Validate new password complexity
      const passwordValidation = isPasswordComplexEnough(newPassword);
      if (!passwordValidation.valid) {
        return res.status(400).json({ 
          message: passwordValidation.errors.join('. '),
          requirements: getPasswordRequirementsMessage()
        });
      }

      // Get current user data
      const currentUser = await storage.getUser(user.id);
      if (!currentUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Verify current password using bcrypt
      const currentPasswordValid = await verifyPassword(currentPassword, currentUser.password);
      if (!currentPasswordValid) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      // Prevent reuse of the same password
      const isSamePassword = await verifyPassword(newPassword, currentUser.password);
      if (isSamePassword) {
        return res.status(400).json({ message: "New password cannot be the same as your current password" });
      }

      // Hash new password and update user
      const hashedNewPassword = await hashPassword(newPassword);
      const updatedUser = await storage.upsertUser({
        ...currentUser,
        password: hashedNewPassword,
        updatedAt: new Date(),
      });

      // Invalidate all other sessions by bumping the token version
      await storage.incrementTokenVersion(user.id);

      res.json({ message: "Password updated successfully", user: sanitizeUser(updatedUser) });
    } catch (error) {
      console.error("Error updating password:", error);
      res.status(500).json({ message: "Failed to update password" });
    }
  });

  // Update user name
  app.patch('/api/auth/update-name', authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;

      const { firstName: rawFirst, lastName: rawLast } = req.body;

      if (!rawFirst || !rawLast) {
        return res.status(400).json({ message: "First name and last name are required" });
      }

      const firstName = cleanName(rawFirst);
      const lastName = cleanName(rawLast);

      // Validate name lengths
      if (firstName.length === 0 || lastName.length === 0) {
        return res.status(400).json({ message: "Names cannot be empty" });
      }

      // Get current user data
      const currentUser = await storage.getUser(user.id);
      if (!currentUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Update user with new name
      const updatedUser = await storage.upsertUser({
        ...currentUser,
        firstName,
        lastName,
        updatedAt: new Date(),
      });

      // Generate new token with updated name
      const newToken = generateToken(updatedUser);
      setAuthCookie(res, newToken);

      res.json({ ...sanitizeUser(updatedUser), token: newToken });
    } catch (error) {
      console.error("Error updating name:", error);
      res.status(500).json({ message: "Failed to update name" });
    }
  });

  // Update phone number (step 1: initiate with OTP sent to current email)
  app.patch('/api/auth/update-phone', authMiddleware, async (req: any, res) => {
    try {
      const user = req.user;

      const { phoneNumber, currentPassword } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({ message: "Phone number is required" });
      }

      if (!currentPassword) {
        return res.status(400).json({ message: "Current password is required to change phone number" });
      }

      // Validate phone number format (at least 10 digits)
      const digitsOnly = phoneNumber.replace(/\D/g, '');
      if (digitsOnly.length < 10) {
        return res.status(400).json({ message: "Phone number must have at least 10 digits" });
      }

      // Get current user data
      const currentUser = await storage.getUser(user.id);
      if (!currentUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Require password re-verification before initiating the change
      const passwordValid = await verifyPassword(currentPassword, currentUser.password);
      if (!passwordValid) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      if (!currentUser.email) {
        return res.status(400).json({ message: "A verified email address is required to change your phone number" });
      }

      // Do NOT commit the change yet — send an OTP to the current email to prove account ownership
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      const pendingToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      pendingContactChanges.set(pendingToken, {
        userId: currentUser.id,
        type: 'phone',
        newValue: phoneNumber.trim(),
        otp,
        expiresAt,
        attempts: 0,
      });

      try {
        await sendContactChangeOtpEmail(currentUser.email, currentUser.firstName || 'there', otp, 'phone', phoneNumber.trim());
      } catch (emailErr) {
        pendingContactChanges.delete(pendingToken);
        console.error("Failed to send phone change OTP:", emailErr);
        return res.status(502).json({ message: "Failed to send verification code. Please try again." });
      }

      res.json({
        pendingToken,
        message: `A 6-digit verification code has been sent to your email address. Enter it to complete the phone number change.`,
      });
    } catch (error) {
      console.error("Error updating phone number:", error);
      res.status(500).json({ message: "Failed to update phone number" });
    }
  });

  // Confirm phone change with OTP
  app.post('/api/auth/confirm-phone-change', authMiddleware, async (req: any, res) => {
    try {
      const { pendingToken, otp } = req.body;

      if (!pendingToken || !otp) {
        return res.status(400).json({ message: "Pending token and verification code are required" });
      }

      const pending = pendingContactChanges.get(pendingToken);
      if (!pending) {
        return res.status(400).json({ message: "Invalid or expired verification session" });
      }

      if (pending.userId !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (pending.type !== 'phone') {
        return res.status(400).json({ message: "Invalid verification session type" });
      }

      if (new Date() > pending.expiresAt) {
        pendingContactChanges.delete(pendingToken);
        return res.status(400).json({ message: "Verification code has expired. Please start over." });
      }

      if (pending.attempts >= MAX_OTP_ATTEMPTS) {
        pendingContactChanges.delete(pendingToken);
        return res.status(429).json({ message: "Too many incorrect attempts. Please start over." });
      }

      if (otp.trim() !== pending.otp) {
        pending.attempts += 1;
        const remaining = MAX_OTP_ATTEMPTS - pending.attempts;
        if (remaining <= 0) {
          pendingContactChanges.delete(pendingToken);
          return res.status(429).json({ message: "Too many incorrect attempts. Please start over." });
        }
        return res.status(400).json({ message: `Incorrect verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.` });
      }

      // OTP valid — commit the phone change
      pendingContactChanges.delete(pendingToken);

      const currentUser = await storage.getUser(pending.userId);
      if (!currentUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const updatedUser = await storage.upsertUser({
        ...currentUser,
        phoneNumber: pending.newValue,
        updatedAt: new Date(),
      });

      const newToken = generateToken(updatedUser);
      setAuthCookie(res, newToken);

      res.json({ ...sanitizeUser(updatedUser), token: newToken });
    } catch (error) {
      console.error("Error confirming phone change:", error);
      res.status(500).json({ message: "Failed to confirm phone change" });
    }
  });

  // Request password reset
  app.post('/api/auth/forgot-password', async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      // Check if user exists
      const user = await storage.getUserByEmail(email);
      
      // Don't reveal if user exists or not (security best practice)
      // Always return success to prevent user enumeration
      if (!user) {
        console.log(`Password reset requested for non-existent email: ${email}`);
        return res.json({ message: "If an account exists with this email, you will receive a password reset link." });
      }

      // Generate secure reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      
      // Token expires in 1 hour
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      // Save token to database
      await storage.createPasswordResetToken(resetToken, user.id, expiresAt);

      // Try to send password reset email (non-fatal if it fails)
      try {
        await sendPasswordResetEmail(user.email!, resetToken);
        console.log(`Password reset email sent to ${user.email}`);
      } catch (emailError) {
        // Log the error but don't fail the request
        // This prevents the password reset flow from breaking if email service is down
        console.error("Failed to send password reset email (non-fatal):", emailError);
        console.error(`Password reset token created for ${user.email} but email send failed.`);
      }

      // Always return success to prevent user enumeration
      res.json({ message: "If an account exists with this email, you will receive a password reset link." });
    } catch (error) {
      console.error("Error in forgot password:", error);
      res.status(500).json({ message: "Failed to process password reset request" });
    }
  });

  // Reset password with token
  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        return res.status(400).json({ message: "Token and new password are required" });
      }

      // Validate new password complexity
      const passwordValidation = isPasswordComplexEnough(newPassword);
      if (!passwordValidation.valid) {
        return res.status(400).json({ 
          message: passwordValidation.errors.join('. '),
          requirements: getPasswordRequirementsMessage()
        });
      }

      // Get token from database
      const resetToken = await storage.getPasswordResetToken(token);

      if (!resetToken) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      // Check if token is expired
      if (new Date() > new Date(resetToken.expiresAt)) {
        return res.status(400).json({ message: "Reset token has expired" });
      }

      // Check if token was already used
      if (resetToken.used) {
        return res.status(400).json({ message: "Reset token has already been used" });
      }

      // Get user
      const user = await storage.getUser(resetToken.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Prevent reuse of the same password
      const isSamePassword = await verifyPassword(newPassword, user.password);
      if (isSamePassword) {
        return res.status(400).json({ message: "New password cannot be the same as your previous password. Please choose a different password." });
      }

      // Hash and update password
      const hashedPassword = await hashPassword(newPassword);
      await storage.upsertUser({
        ...user,
        password: hashedPassword,
        updatedAt: new Date(),
      });

      // Invalidate all previously issued JWTs for this user
      await storage.incrementTokenVersion(user.id);

      // Mark token as used
      await storage.markTokenAsUsed(token);

      // Clean up expired tokens (housekeeping)
      await storage.deleteExpiredTokens();

      console.log(`Password successfully reset for user ${user.email}`);
      res.json({ message: "Password has been successfully reset. You can now log in with your new password." });
    } catch (error) {
      console.error("Error resetting password:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // Pet routes with search and pagination
  app.get("/api/pets", async (req, res) => {
    try {
      const { species, search, page = '1', limit = '20' } = req.query;
      
      // Parse pagination parameters (page is 1-indexed from frontend)
      const pageNum = Math.max(1, parseInt(page as string) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
      const offset = (pageNum - 1) * pageSize;
      
      let allPets = species 
        ? await storage.getPetsBySpecies(species as string, (req as any).tenantId)
        : await storage.getAllPets((req as any).tenantId);
      
      // Apply search filter if provided (fuzzy search across name, species, breed, description)
      // Includes brand name expansion for abbreviated brand names
      if (search && typeof search === 'string' && search.trim()) {
        const { expandBrandNames } = await import('./brandNameExpansion');
        const brandVariations = expandBrandNames(search);
        
        allPets = allPets.filter(pet => {
          const searchableText = [
            pet.name || '',
            pet.species || '',
            pet.breed || '',
            pet.description || ''
          ].join(' ').toLowerCase();
          
          // Check if any brand variation matches
          return brandVariations.some(variation => 
            searchableText.includes(variation.toLowerCase())
          );
        });
      }
      
      // Calculate total count and pages
      const totalCount = allPets.length;
      const totalPages = Math.ceil(totalCount / pageSize);
      
      // Apply pagination
      const paginatedPets = allPets.slice(offset, offset + pageSize);
      
      res.json({
        pets: paginatedPets,
        pagination: {
          currentPage: pageNum,
          totalPages,
          total: totalCount,
          pageSize
        }
      });
    } catch (error) {
      console.error("Error fetching pets:", error);
      // Return fallback data on error
      res.json({
        pets: [
        {
          id: 1,
          name: "Bella",
          species: "dog",
          breed: "Golden Retriever",
          age: "2 years",
          price: "800",
          description: "Friendly and energetic golden retriever",
          imageUrl: "https://images.unsplash.com/photo-1552053831-71594a27632d?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
          isAvailable: true,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 2,
          name: "Max",
          species: "cat", 
          breed: "Maine Coon",
          age: "3 years",
          price: "600",
          description: "Gentle giant with beautiful fur",
          imageUrl: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
          isAvailable: true,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 3,
          name: "Charlie",
          species: "reptile",
          breed: "Bearded Dragon", 
          age: "1 year",
          price: "150",
          description: "Our specialty exotic reptile - calm and friendly",
          imageUrl: "https://images.unsplash.com/photo-1516814765986-4d2b2a7b6ec8?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
          isAvailable: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
        ],
        pagination: {
          currentPage: 0,
          totalPages: 1,
          totalCount: 3,
          pageSize: 20
        }
      });
    }
  });

  app.get("/api/pets/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const pet = await storage.getPet(id, (req as any).tenantId);
      if (!pet) {
        return res.status(404).json({ message: "Pet not found" });
      }
      res.json(pet);
    } catch (error) {
      console.error("Error fetching pet:", error);
      res.status(500).json({ message: "Failed to fetch pet" });
    }
  });

  // File upload endpoint - now stores in Object Storage for persistence
  app.post("/api/upload", authMiddleware, upload.single('image'), async (req: any, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Read the uploaded file and store it in Object Storage for persistence
      const fs = await import('fs');
      const filePath = req.file.path;
      const rawBuffer = fs.readFileSync(filePath);
      
      // Process image: auto-orient (bake EXIF rotation into pixels) and convert to sRGB
      // This fixes rendering issues with wide-gamut (DCI-P3) camera photos in Chrome
      let fileBuffer: Buffer;
      try {
        const sharp = (await import('sharp')).default;
        fileBuffer = await sharp(rawBuffer)
          .rotate()
          .toColorspace('srgb')
          .jpeg({ quality: 90, mozjpeg: false })
          .toBuffer();
      } catch (sharpError) {
        console.warn('Sharp processing failed, using raw buffer:', sharpError);
        fileBuffer = rawBuffer;
      }
      
      const { ObjectStorageService } = await import('./objectStorageService');
      const { setObjectAclPolicy } = await import('./objectAcl');
      const objectStorageService = new ObjectStorageService();
      
      // Generate a unique filename (always .jpg since sharp outputs JPEG)
      const uniqueId = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const objectFileName = `uploads/${uniqueId}.jpg`;
      
      // Get the public bucket path and upload
      const publicPaths = objectStorageService.getPublicObjectSearchPaths();
      if (publicPaths.length === 0) {
        // Fallback to legacy local storage if Object Storage not configured
        const imageUrl = `/uploads/${req.file.filename}`;
        return res.json({ imageUrl });
      }
      
      const fullPath = `${publicPaths[0]}/${objectFileName}`;
      const { bucketName, objectName } = parseObjectPathForUpload(fullPath);
      
      const { objectStorageClient } = await import('./objectStorageService');
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      
      await file.save(fileBuffer, {
        contentType: 'image/jpeg',
        metadata: {
          cacheControl: 'public, max-age=31536000',
        },
      });
      
      // Set public ACL
      await setObjectAclPolicy(file, { visibility: 'public' });
      
      // Clean up local file
      fs.unlinkSync(filePath);
      
      const imageUrl = `/public-objects/${objectFileName}`;
      res.json({ imageUrl });
    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({ message: "Failed to upload file" });
    }
  });
  
  // Helper function for parsing object paths
  function parseObjectPathForUpload(path: string): { bucketName: string; objectName: string } {
    if (!path.startsWith("/")) {
      path = `/${path}`;
    }
    const pathParts = path.split("/");
    if (pathParts.length < 3) {
      throw new Error("Invalid path: must contain at least a bucket name");
    }
    const bucketName = pathParts[1];
    const objectName = pathParts.slice(2).join("/");
    return { bucketName, objectName };
  }

  // Admin endpoint to re-process existing pet images (fix EXIF rotation + DCI-P3 color profile)
  app.post("/api/admin/reprocess-image", authMiddleware, async (req: any, res) => {
    try {
      const userId = (req as any).user?.id;
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });

      const { imageUrl } = req.body;
      if (!imageUrl || !imageUrl.startsWith('/public-objects/')) {
        return res.status(400).json({ message: "Invalid imageUrl — must start with /public-objects/" });
      }

      const filePath = imageUrl.replace('/public-objects/', '');
      const { ObjectStorageService } = await import('./objectStorageService');
      const { setObjectAclPolicy } = await import('./objectAcl');
      const objectStorageService = new ObjectStorageService();
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) return res.status(404).json({ message: "Image not found in object storage" });

      // Download the image into a buffer
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        const stream = file.createReadStream();
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', resolve);
        stream.on('error', reject);
      });
      const rawBuffer = Buffer.concat(chunks);

      // Re-process: auto-orient and convert to sRGB to fix Chrome rendering issues
      const sharp = (await import('sharp')).default;
      const processedBuffer = await sharp(rawBuffer)
        .rotate()
        .toColorspace('srgb')
        .jpeg({ quality: 90, mozjpeg: false })
        .toBuffer();

      // Overwrite the existing file in GCS
      await file.save(processedBuffer, {
        contentType: 'image/jpeg',
        metadata: { cacheControl: 'public, max-age=31536000' },
      });
      await setObjectAclPolicy(file, { visibility: 'public' });

      console.log(`[reprocess-image] Re-processed ${imageUrl}: ${rawBuffer.length} → ${processedBuffer.length} bytes`);
      res.json({ success: true, imageUrl, originalSize: rawBuffer.length, processedSize: processedBuffer.length });
    } catch (error) {
      console.error("Error reprocessing image:", error);
      res.status(500).json({ message: "Failed to reprocess image" });
    }
  });

  // Object Storage endpoints for persistent file storage (survives redeployments)
  // Get presigned upload URL for object storage
  app.post("/api/objects/upload", authMiddleware, async (req: any, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { ObjectStorageService } = await import('./objectStorageService');
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ message: "Failed to get upload URL" });
    }
  });

  // Image proxy — re-serves external product images with correct Content-Type.
  // Some CDNs (e.g. Colgate's pxmshare) return application/octet-stream for PNG
  // files, which browsers refuse to render in <img> tags. This endpoint fetches
  // the upstream file, detects the real type from magic bytes, and re-serves it.
  app.get("/api/image-proxy", async (req, res) => {
    const urlParam = req.query.url as string;
    if (!urlParam) return res.status(400).send("Missing url parameter");

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(urlParam);
    } catch {
      return res.status(400).send("Invalid url");
    }

    // Only proxy known product image CDNs — prevents open-proxy abuse
    const ALLOWED_DOMAINS = [
      "pxmshare.colgatepalmolive.com",
      "cdn.frommfamily.com",
      "nutrisourcepetfoods.com",
      "image.chewy.com",
      "www.hillspet.com",
      "cdn.shopify.com",
      "images.unsplash.com",
    ];
    if (!ALLOWED_DOMAINS.includes(parsedUrl.hostname)) {
      return res.status(403).send("Domain not in allowlist");
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const upstream = await fetch(urlParam, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; AnimalHouseBot/1.0)" },
      });
      clearTimeout(timeout);

      if (!upstream.ok) {
        return res.status(upstream.status).send("Upstream error");
      }

      const buffer = await upstream.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // Detect content-type from magic bytes
      let contentType = "image/jpeg";
      if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
        contentType = "image/png";
      } else if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
        contentType = "image/gif";
      } else if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
        contentType = "image/webp";
      }

      res.set({
        "Content-Type": contentType,
        "Content-Length": bytes.length.toString(),
        "Cache-Control": "public, max-age=86400, stale-if-error=2592000",
      });
      return res.send(Buffer.from(buffer));
    } catch (err: any) {
      console.error("[image-proxy] Error fetching", urlParam, err.message);
      return res.status(502).send("Proxy error");
    }
  });

  // Serve public objects from object storage
  app.get("/public-objects/:filePath(*)", async (req, res) => {
    try {
      const filePath = req.params.filePath;
      const { ObjectStorageService } = await import('./objectStorageService');
      const objectStorageService = new ObjectStorageService();
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        return res.status(404).send("Not found");
      }
      // forcePublic=true: skips redundant ACL metadata call — these are always public
      objectStorageService.downloadObject(file, res, 86400, true);
    } catch (error) {
      console.error("Error serving public object:", error);
      return res.status(500).send("Internal server error");
    }
  });

  // Serve private objects from object storage with ACL enforcement
  app.get("/objects/:objectPath(*)", async (req: any, res) => {
    try {
      const { ObjectStorageService, ObjectNotFoundError } = await import('./objectStorageService');
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);

      // Resolve user ID with full session validation (signature + DB tokenVersion)
      const userId = await resolveOptionalAuthUserId(req);

      // Enforce ACL policy — deny access if the caller is not permitted
      const allowed = await objectStorageService.canAccessObjectEntity({
        userId,
        objectFile,
      });
      if (!allowed) {
        return res.sendStatus(403);
      }

      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving object:", error);
      const { ObjectNotFoundError } = await import('./objectStorageService');
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Update pet image after object storage upload
  app.put("/api/pets/:id/image", authMiddleware, async (req: any, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const id = parseInt(req.params.id);
      const { imageUrl } = req.body;
      
      if (!imageUrl) {
        return res.status(400).json({ message: "imageUrl is required" });
      }

      // Normalize the object path if it's a GCS URL
      const { ObjectStorageService } = await import('./objectStorageService');
      const objectStorageService = new ObjectStorageService();
      const normalizedPath = objectStorageService.normalizeObjectEntityPath(imageUrl);

      const pet = await storage.updatePet(id, { imageUrl: normalizedPath }, tenantId);
      res.json(pet);
    } catch (error) {
      console.error("Error updating pet image:", error);
      res.status(500).json({ message: "Failed to update pet image" });
    }
  });

  app.post("/api/pets", authMiddleware, async (req: any, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const petData = insertPetSchema.parse(req.body);
      const pet = await storage.createPet({ ...petData, tenantId });
      res.json(pet);
    } catch (error) {
      console.error("Error creating pet:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid pet data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create pet" });
    }
  });

  app.put("/api/pets/:id", authMiddleware, async (req: any, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const id = parseInt(req.params.id);

      // Route-layer guard: confirm the pet belongs to this tenant before writing
      const existing = await storage.getPet(id, tenantId);
      if (!existing) {
        return res.status(404).json({ message: "Pet not found" });
      }

      const petData = insertPetSchema.partial().parse(req.body);
      const pet = await storage.updatePet(id, petData, tenantId);
      res.json(pet);
    } catch (error) {
      console.error("Error updating pet:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid pet data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update pet" });
    }
  });

  app.delete("/api/pets/:id", authMiddleware, async (req: any, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const id = parseInt(req.params.id);

      // Route-layer guard: confirm the pet belongs to this tenant before deleting
      const existing = await storage.getPet(id, tenantId);
      if (!existing) {
        return res.status(404).json({ message: "Pet not found" });
      }

      await storage.deletePet(id, tenantId);
      res.json({ message: "Pet deleted successfully" });
    } catch (error) {
      console.error("Error deleting pet:", error);
      res.status(500).json({ message: "Failed to delete pet" });
    }
  });

  // Admin-only: all pets regardless of availability (for inventory management)
  app.get("/api/admin/pets", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) return res.status(403).json({ message: "Admin access required" });

      const { species, search, page = '1', limit = '20' } = req.query;
      const pageNum = Math.max(1, parseInt(page as string) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
      const offset = (pageNum - 1) * pageSize;

      let allPets = await storage.getAllPetsAdmin((req as any).tenantId);

      if (species && typeof species === 'string') {
        allPets = allPets.filter(p => p.species?.toLowerCase() === species.toLowerCase());
      }

      if (search && typeof search === 'string' && search.trim()) {
        const term = search.toLowerCase();
        allPets = allPets.filter(p =>
          [p.name, p.species, p.breed, p.description].some(f => f?.toLowerCase().includes(term))
        );
      }

      const total = allPets.length;
      const paginatedPets = allPets.slice(offset, offset + pageSize);

      res.json({
        pets: paginatedPets,
        pagination: {
          page: pageNum,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      });
    } catch (error) {
      console.error("Error fetching admin pets:", error);
      res.status(500).json({ message: "Failed to fetch pets" });
    }
  });

  // Admin-only: toggle pet availability
  app.patch("/api/admin/pets/:id/availability", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const id = parseInt(req.params.id);
      const { isAvailable } = req.body;
      if (typeof isAvailable !== 'boolean') return res.status(400).json({ message: "isAvailable must be a boolean" });
      const updated = await storage.updatePet(id, { isAvailable }, tenantId);
      res.json(updated);
    } catch (error) {
      console.error("Error toggling pet availability:", error);
      res.status(500).json({ message: "Failed to update pet availability" });
    }
  });

  // Export inventory to Excel for POS setup
  app.get("/api/export/inventory", authMiddleware, async (req: any, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Get all supplies and pets
      const allSupplies = await storage.getAllSupplies((req as any).tenantId);
      const allPets = await storage.getAllPets((req as any).tenantId);

      // Create workbook
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'PilotHouse';
      workbook.created = new Date();

      // Supplies Sheet
      const suppliesSheet = workbook.addWorksheet('Supplies');
      suppliesSheet.columns = [
        { header: 'ID', key: 'id', width: 8 },
        { header: 'Name', key: 'name', width: 50 },
        { header: 'Brand', key: 'brand', width: 20 },
        { header: 'Category', key: 'category', width: 15 },
        { header: 'Price', key: 'price', width: 10 },
        { header: 'Stock', key: 'stock', width: 8 },
        { header: 'Description', key: 'description', width: 60 },
        { header: 'Specialty Section', key: 'specialtySection', width: 15 },
        { header: 'Product Type', key: 'productType', width: 15 },
      ];

      // Style header row
      suppliesSheet.getRow(1).font = { bold: true };
      suppliesSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      };
      suppliesSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

      // Add supplies data
      allSupplies.forEach(supply => {
        suppliesSheet.addRow({
          id: supply.id,
          name: supply.name,
          brand: supply.brand || '',
          category: supply.category || '',
          price: supply.price ? `$${supply.price}` : '',
          stock: (supply as any).stockQuantity || 0,
          description: supply.description || '',
          specialtySection: (supply as any).filterType || '',
          productType: supply.category || '',
        });
      });

      // Pets Sheet
      const petsSheet = workbook.addWorksheet('Pets');
      petsSheet.columns = [
        { header: 'ID', key: 'id', width: 8 },
        { header: 'Name', key: 'name', width: 30 },
        { header: 'Species', key: 'species', width: 15 },
        { header: 'Breed', key: 'breed', width: 25 },
        { header: 'Price', key: 'price', width: 10 },
        { header: 'Available', key: 'isAvailable', width: 10 },
        { header: 'Description', key: 'description', width: 60 },
      ];

      // Style header row
      petsSheet.getRow(1).font = { bold: true };
      petsSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF70AD47' }
      };
      petsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

      // Add pets data
      allPets.forEach(pet => {
        petsSheet.addRow({
          id: pet.id,
          name: pet.name,
          species: pet.species || '',
          breed: pet.breed || '',
          price: pet.price ? `$${pet.price}` : '',
          isAvailable: pet.isAvailable ? 'Yes' : 'No',
          description: pet.description || '',
        });
      });

      // Generate filename with date
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `AnimalHouse_Inventory_${dateStr}.xlsx`;

      // Set response headers
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Write to response
      await workbook.xlsx.write(res);
      res.end();

    } catch (error) {
      console.error("Error exporting inventory:", error);
      res.status(500).json({ message: "Failed to export inventory" });
    }
  });

  // Export unmatched supplies (no UPC) to CSV
  app.get("/api/export/unmatched-supplies", authMiddleware, async (req: any, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Get all supplies without UPC
      const allSupplies = await storage.getAllSupplies((req as any).tenantId);
      const unmatchedSupplies = allSupplies.filter(s => !s.upc || s.upc.trim() === '');

      // Sort by brand, then name
      unmatchedSupplies.sort((a, b) => {
        const brandA = (a.brand || '').toLowerCase();
        const brandB = (b.brand || '').toLowerCase();
        if (brandA !== brandB) return brandA.localeCompare(brandB);
        return (a.name || '').localeCompare(b.name || '');
      });

      // Create CSV content
      const escapeCSV = (str: string) => {
        if (!str) return '';
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const headers = ['ID', 'Name', 'Brand', 'Category', 'Price', 'UPC_Enter_Here', 'Description'];
      const rows = unmatchedSupplies.map(supply => [
        supply.id.toString(),
        escapeCSV(supply.name || ''),
        escapeCSV(supply.brand || ''),
        escapeCSV(supply.category || ''),
        supply.price ? `$${supply.price}` : '',
        '',
        escapeCSV(supply.description || ''),
      ].join(','));

      const csvContent = [headers.join(','), ...rows].join('\n');

      // Generate filename with date
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `Unmatched_Supplies_Need_UPC_${dateStr}.csv`;

      // Set response headers for CSV download
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvContent);

    } catch (error) {
      console.error("Error exporting unmatched supplies:", error);
      res.status(500).json({ message: "Failed to export unmatched supplies" });
    }
  });

  // Export inventory to Exatouch POS format
  app.get("/api/export/exatouch", authMiddleware, async (req: any, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Get all supplies (live animals handled separately in POS)
      const allSupplies = await storage.getAllSupplies((req as any).tenantId);

      // Create workbook with Exatouch format
      const workbook = new ExcelJS.Workbook();
      const itemsSheet = workbook.addWorksheet('Items');

      // Set up columns based on Exatouch template (60 columns)
      itemsSheet.columns = [
        { header: 'Active', key: 'active', width: 8 },
        { header: 'Description', key: 'description', width: 50 },
        { header: 'DescLong', key: 'descLong', width: 60 },
        { header: 'DescButton', key: 'descButton', width: 20 },
        { header: 'DescReceipt', key: 'descReceipt', width: 30 },
        { header: 'DescRemote', key: 'descRemote', width: 30 },
        { header: 'DescSticky', key: 'descSticky', width: 30 },
        { header: 'Price', key: 'price', width: 10 },
        { header: 'PricePrompt', key: 'pricePrompt', width: 10 },
        { header: 'PriceSuggest', key: 'priceSuggest', width: 12 },
        { header: 'CostIndex', key: 'costIndex', width: 10 },
        { header: 'CostAvg', key: 'costAvg', width: 10 },
        { header: 'CostRecent', key: 'costRecent', width: 10 },
        { header: 'CostLow', key: 'costLow', width: 10 },
        { header: 'CostEntered', key: 'costEntered', width: 12 },
        { header: 'StockType', key: 'stockType', width: 10 },
        { header: 'QtyOnHand', key: 'qtyOnHand', width: 10 },
        { header: 'MinQty', key: 'minQty', width: 8 },
        { header: 'QtyReorder', key: 'qtyReorder', width: 10 },
        { header: 'LimitQty', key: 'limitQty', width: 10 },
        { header: 'DynamicEnabled', key: 'dynamicEnabled', width: 15 },
        { header: 'DynamicQty', key: 'dynamicQty', width: 12 },
        { header: 'OrderMin', key: 'orderMin', width: 10 },
        { header: 'SKU', key: 'sku', width: 15 },
        { header: 'AltSKU', key: 'altSku', width: 15 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'SubCategory', key: 'subCategory', width: 20 },
        { header: 'Mfg', key: 'mfg', width: 20 },
        { header: 'MfgPart', key: 'mfgPart', width: 15 },
        { header: 'Color', key: 'color', width: 12 },
        { header: 'Size', key: 'size', width: 12 },
        { header: 'Style', key: 'style', width: 12 },
        { header: 'PackSize', key: 'packSize', width: 10 },
        { header: 'PackUnit', key: 'packUnit', width: 10 },
        { header: 'SBF', key: 'sbf', width: 10 },
        { header: 'Unit', key: 'unit', width: 10 },
        { header: 'ChargeUnit', key: 'chargeUnit', width: 12 },
        { header: 'CustomField1', key: 'customField1', width: 15 },
        { header: 'CustomField2', key: 'customField2', width: 15 },
        { header: 'CustomField3', key: 'customField3', width: 15 },
        { header: 'CustomField4', key: 'customField4', width: 15 },
        { header: 'EBTFood', key: 'ebtFood', width: 10 },
        { header: 'EBTCash', key: 'ebtCash', width: 10 },
        { header: 'CheckAge', key: 'checkAge', width: 10 },
        { header: 'Refundable', key: 'refundable', width: 12 },
        { header: 'TaxableA', key: 'taxableA', width: 10 },
        { header: 'TaxableB', key: 'taxableB', width: 10 },
        { header: 'TaxableC', key: 'taxableC', width: 10 },
        { header: 'TaxableD', key: 'taxableD', width: 10 },
        { header: 'TaxIncluded', key: 'taxIncluded', width: 12 },
        { header: 'OverridePrice', key: 'overridePrice', width: 14 },
        { header: 'OverrideQty', key: 'overrideQty', width: 12 },
        { header: 'ExcludeDisc', key: 'excludeDisc', width: 12 },
        { header: 'ExcludePromo', key: 'excludePromo', width: 14 },
        { header: 'Vendor', key: 'vendor', width: 15 },
        { header: 'VendorBuyQty', key: 'vendorBuyQty', width: 14 },
        { header: 'VendorSRP', key: 'vendorSrp', width: 12 },
        { header: 'VendorCost', key: 'vendorCost', width: 12 },
        { header: 'VendorPart', key: 'vendorPart', width: 12 },
        { header: 'VendorLeadTime', key: 'vendorLeadTime', width: 15 },
      ];

      // Style header
      itemsSheet.getRow(1).font = { bold: true };
      itemsSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      };
      itemsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

      // Helper function to format category names (camelCase to Title Case)
      const formatCategory = (category: string): string => {
        if (!category) return '';
        // Split camelCase into words and capitalize first letter of each
        return category
          .replace(/([a-z])([A-Z])/g, '$1 $2') // Add space before capitals
          .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      };

      // Add supplies
      allSupplies.forEach(supply => {
        const priceNum = supply.price ? parseFloat(supply.price.replace(/[^\d.]/g, '')) : '';
        
        itemsSheet.addRow({
          active: 'True',
          description: supply.name || '',
          descLong: supply.description || supply.name || '',
          descButton: (supply.name || '').substring(0, 20),
          descReceipt: supply.name || '',
          descRemote: supply.name || '',
          descSticky: supply.name || '',
          price: priceNum,
          pricePrompt: '',
          priceSuggest: '',
          costIndex: 0,
          costAvg: '',
          costRecent: '',
          costLow: '',
          costEntered: '',
          stockType: 2,
          qtyOnHand: (supply as any).stockQuantity || 0,
          minQty: 1,
          qtyReorder: 5,
          limitQty: '',
          dynamicEnabled: 'False',
          dynamicQty: '',
          orderMin: '',
          sku: supply.sku || supply.id.toString(),
          altSku: supply.sku ? supply.id.toString() : '',
          category: formatCategory(supply.category || ''),
          subCategory: formatCategory(supply.category || ''),
          mfg: supply.brand || '',
          mfgPart: supply.mfgPart || '',
          color: supply.color || '',
          size: supply.size || '',
          style: supply.style || '',
          packSize: '',
          packUnit: '',
          sbf: '',
          unit: 'ea',
          chargeUnit: 'ea',
          customField1: (supply as any).filterType || '',
          customField2: '',
          customField3: '',
          customField4: '',
          ebtFood: 'False',
          ebtCash: 'False',
          checkAge: '',
          refundable: 'True',
          taxableA: 'True',
          taxableB: 'False',
          taxableC: 'False',
          taxableD: 'False',
          taxIncluded: 'False',
          overridePrice: 'False',
          overrideQty: 'False',
          excludeDisc: 'False',
          excludePromo: 'False',
          vendor: supply.vendor || '',
          vendorBuyQty: '',
          vendorSrp: '',
          vendorCost: '',
          vendorPart: '',
          vendorLeadTime: '',
        });
      });

      // Note: Live animals excluded from ExaTouch export - handled separately in POS

      // Generate filename with date
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `AnimalHouse_Exatouch_Import_${dateStr}.xlsx`;

      // Set response headers
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Write to response
      await workbook.xlsx.write(res);
      res.end();

    } catch (error) {
      console.error("Error exporting Exatouch inventory:", error);
      res.status(500).json({ message: "Failed to export Exatouch inventory" });
    }
  });

  // Supply routes with pagination
  app.get("/api/supplies", async (req: any, res) => {
    try {
      const { category, search, page = '0', limit = '24', animalType, foodType, toyType, healthcareType, aquaticType, reptileType, birdType, smallAnimalProductType, petFoodAnimalType, treatAnimalType, accessoryType, filterType: filterTypeParam, ids } = req.query;
      
      // Soft-auth: detect admin callers so they can see products without SKUs
      let callerIsAdmin = false;
      try {
        const cookieToken = req.cookies?.auth_token;
        const headerToken = req.headers.authorization?.replace('Bearer ', '');
        const token = headerToken || cookieToken;
        if (token) {
          const decoded = verifyToken(token);
          if (decoded?.isAdmin) {
            const dbUser = await storage.getUser(decoded.id);
            if (dbUser && (decoded.tokenVersion ?? 0) === (dbUser.tokenVersion ?? 0)) {
              callerIsAdmin = true;
            }
          }
        }
      } catch (_) {}

      // If specific IDs requested (for cart display), fetch those directly
      if (ids && typeof ids === 'string') {
        const idList = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
        if (idList.length > 0) {
          const items = await storage.getSuppliesByIds(idList, (req as any).tenantId);
          return res.json({ items, total: items.length, page: 0, pageSize: items.length });
        }
      }
      
      // Parse pagination parameters with defaults
      const pageNum = Math.max(0, parseInt(page as string) || 0);
      const pageSize = Math.min(20000, Math.max(1, parseInt(limit as string) || 24));
      const offset = pageNum * pageSize;

      // Determine filter type based on query param or category parameter
      let filterType: 'reptile' | 'aquatic' | undefined = filterTypeParam as 'reptile' | 'aquatic' | undefined;
      let actualCategory: string | undefined = category as string | undefined;
      
      if (category === 'reptile-supplies') {
        filterType = 'reptile';
        actualCategory = undefined; // Don't filter by category for specialty landing pages
      } else if (category === 'aquatic-supplies') {
        filterType = 'aquatic';
        actualCategory = undefined; // Don't filter by category for specialty landing pages
      }
      
      // Use paginated query
      // Note: When filterType is set via query param (not via category mapping), we DO want to preserve the category filter
      const { items, total } = await storage.getPaginatedSupplies({
        limit: pageSize,
        offset,
        category: actualCategory,
        search: search as string | undefined,
        filterType,
        requireSku: !callerIsAdmin,
        animalType: animalType as string | undefined,
        foodType: foodType as string | undefined,
        toyType: toyType as string | undefined,
        healthcareType: healthcareType as string | undefined,
        aquaticType: aquaticType as string | undefined,
        reptileType: reptileType as string | undefined,
        birdType: birdType as string | undefined,
        smallAnimalProductType: smallAnimalProductType as string | undefined,
        petFoodAnimalType: petFoodAnimalType as string | undefined,
        treatAnimalType: treatAnimalType as string | undefined,
        accessoryType: accessoryType as string | undefined,
        tenantId: (req as any).tenantId
      });

      // Return paginated response with metadata
      res.json({
        items,
        total,
        page: pageNum,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      });
    } catch (error) {
      console.error("Error fetching supplies:", error);
      res.status(500).json({ 
        message: "Failed to fetch supplies",
        items: [],
        total: 0,
        page: 0,
        pageSize: 24,
        totalPages: 0
      });
    }
  });

  // UPC/barcode lookup — matches SKU field (with leading-zero normalization)
  app.get("/api/supplies/by-upc/:upc", async (req: any, res) => {
    try {
      const upc = req.params.upc.trim();
      const supply = await storage.getSupplyByUpc(upc, (req as any).tenantId);
      if (!supply) return res.status(404).json({ message: "Product not found" });
      res.json(supply);
    } catch (error) {
      console.error("Error looking up supply by UPC:", error);
      res.status(500).json({ message: "Failed to look up product" });
    }
  });

  app.get("/api/supplies/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const supply = await storage.getSupply(id, (req as any).tenantId);
      if (!supply) {
        return res.status(404).json({ message: "Supply not found" });
      }
      
      // Get related products (same category/brand, excluding current item)
      let relatedProducts: any[] = [];
      try {
        relatedProducts = await storage.getRelatedSupplies(id, supply.category, supply.brand, 6, supply.name);
      } catch (e) {
        console.error("Error fetching related products:", e);
      }
      
      res.json({ ...supply, relatedProducts });
    } catch (error) {
      console.error("Error fetching supply:", error);
      res.status(500).json({ message: "Failed to fetch supply" });
    }
  });

  app.post("/api/supplies", authMiddleware, async (req: any, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const supplyData = insertSupplySchema.parse(req.body);
      const supply = await storage.createSupply({ ...supplyData, tenantId });
      res.json(supply);
    } catch (error) {
      console.error("Error creating supply:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid supply data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create supply" });
    }
  });

  app.put("/api/supplies/:id", authMiddleware, async (req: any, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const id = parseInt(req.params.id);
      const supplyData = insertSupplySchema.partial().parse(req.body);
      
      // Note: Abbreviation expansion removed from regular edits
      // Only run expansion during bulk import/invoice processing
      // to prevent unwanted autocorrection of manually entered names
      
      const supply = await storage.updateSupply(id, supplyData, tenantId);
      res.json(supply);
    } catch (error: any) {
      console.error("Error updating supply:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid supply data", errors: error.errors });
      }
      if (error?.message === "Supply not found or access denied") {
        return res.status(404).json({ message: "Supply not found" });
      }
      res.status(500).json({ message: "Failed to update supply" });
    }
  });

  app.delete("/api/supplies/:id", authMiddleware, async (req: any, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
      if (!user?.isAdmin && !user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const id = parseInt(req.params.id);
      await storage.deleteSupply(id, tenantId);
      res.json({ message: "Supply deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting supply:", error);
      if (error?.message === "Supply not found or access denied") {
        return res.status(404).json({ message: "Supply not found" });
      }
      res.status(500).json({ message: "Failed to delete supply" });
    }
  });

  // POS Zero-Stock Tracker — upload XLS, increment/reset counters, delete after 10 consecutive zeros
  app.post("/api/admin/pos-scan/upload", requireAdminMiddleware, excelUpload.single('file'), async (req: any, res) => {
    try {
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const xlsx = await import('xlsx');
      const wb = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      const POS_CATEGORY_MAP: Record<string, string> = {
        'Accessories': 'accessories',
        'Aquatic Fish/Plant': 'aquatics',
        'Aquatics': 'aquatics',
        'Beds': 'beds',
        'Bird Supplies': 'birdSupplies',
        'Cat Food': 'catFood',
        'Cat Treats': 'catTreats',
        'Dog Cages': 'dogCages',
        'Dog Food': 'dogFood',
        'Dog Treats': 'dogTreats',
        'Healthcare': 'healthcare',
        'Leashes And Collars': 'leashesAndCollars',
        'Live Reptiles/Feeders': 'reptiles',
        'Live Small Animals': 'smallAnimalSupplies',
        'Reptiles': 'reptiles',
        'Small Animal': 'smallAnimalSupplies',
        'Toys': 'toys',
        'Treats': 'dogTreats',
      };
      const SKIP_CATEGORIES = new Set(['Gift Cards', 'Grooming', 'Tips', 'Misc.', 'Live Reptiles/Feeders', 'Live Small Animals', 'Aquatic Fish/Plant', 'Aquatics', '']);

      const escStr = (s: string) => String(s ?? '').replace(/'/g, "''");
      const chunkArr = <T>(arr: T[], size: number): T[][] => {
        const out: T[][] = [];
        for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
        return out;
      };

      // Parse all items up front
      const posItems = raw.slice(7)
        .filter((r: any[]) => r[0] !== '')
        .map((r: any[]) => ({
          name: String(r[0] ?? '').trim(),
          brand: String(r[1] ?? '').trim(),
          sku: String(r[2] ?? '').trim(),
          posCategory: String(r[3] ?? '').trim(),
          inStock: Number(r[8]) || 0,
          price: Number(r[9]) || 0,
        }))
        .filter(i => i.sku.length >= 6 && !SKIP_CATEGORIES.has(i.posCategory));

      // Step 1: Bulk-fetch all matching supplies in chunks of 1000 SKUs
      const supplyMap = new Map<string, { id: number; name: string; brand: string }>();
      for (const chunk of chunkArr(posItems.map(i => i.sku), 1000)) {
        const skuList = chunk.map(s => `'${escStr(s)}'`).join(',');
        const tenantClause = ` AND tenant_id = ${Number(tenantId)}`;
        const result = await db.execute(sql.raw(`SELECT id, name, brand, sku FROM supplies WHERE sku IN (${skuList})${tenantClause}`));
        for (const row of result.rows as any[]) {
          supplyMap.set(row.sku, { id: Number(row.id), name: row.name, brand: row.brand ?? '' });
        }
      }

      // Step 2: Classify items
      type PriceUpdate = { id: number; price: number };
      type TrackerReset = { supplyId: number; sku: string; name: string; threshold: number };
      type TrackerIncrement = { supplyId: number; sku: string; name: string; threshold: number };
      type NewItem = { sku: string; name: string; brand: string; price: number; category: string; inStock: number };

      type StockUpdate = { id: number; qty: number };
      const priceUpdates: PriceUpdate[] = [];
      const stockUpdates: StockUpdate[] = [];
      const resetItems: TrackerReset[] = [];
      const incrementItems: TrackerIncrement[] = [];
      const newItems: NewItem[] = [];
      let skipped = 0;

      for (const item of posItems) {
        const existing = supplyMap.get(item.sku);
        if (!existing) {
          const mappedCat = POS_CATEGORY_MAP[item.posCategory] ?? null;
          if (mappedCat && item.inStock > 0) {
            newItems.push({ sku: item.sku, name: item.name, brand: item.brand, price: item.price, category: mappedCat, inStock: item.inStock });
          } else {
            skipped++;
          }
          continue;
        }
        if (item.price > 0) priceUpdates.push({ id: existing.id, price: item.price });
        stockUpdates.push({ id: existing.id, qty: item.inStock });
        const isCoastal = existing.brand.toLowerCase().includes('coastal') || existing.name.toLowerCase().includes('coastal') || item.brand.toLowerCase().includes('coastal');
        const threshold = isCoastal ? 50 : 16;
        if (item.inStock > 0) {
          resetItems.push({ supplyId: existing.id, sku: item.sku, name: existing.name, threshold });
        } else {
          incrementItems.push({ supplyId: existing.id, sku: item.sku, name: existing.name, threshold });
        }
      }

      // Step 3: Bulk price updates
      for (const chunk of chunkArr(priceUpdates, 500)) {
        const vals = chunk.map(({ id, price }) => `(${id}, ${price})`).join(',');
        const tenantFilter = ` AND supplies.tenant_id = ${Number(tenantId)}`;
        await db.execute(sql.raw(`UPDATE supplies SET price = v.price::numeric, price_source = 'pos', updated_at = NOW() FROM (VALUES ${vals}) AS v(id, price) WHERE supplies.id = v.id::int${tenantFilter}`));
      }

      // Step 3b: Bulk stock quantity updates from POS file (respects manual override)
      if (stockUpdates.length > 0) {
        for (const chunk of chunkArr(stockUpdates, 500)) {
          const vals = chunk.map(({ id, qty }) => `(${id}, ${qty})`).join(',');
          await db.execute(sql.raw(`
            UPDATE supplies
            SET stock_quantity = v.qty::int, quantity_source = 'pos', updated_at = NOW()
            FROM (VALUES ${vals}) AS v(id, qty)
            WHERE supplies.id = v.id::int
              AND supplies.tenant_id = ${Number(tenantId)}
              AND (manual_quantity_override = false OR manual_quantity_override IS NULL)
          `));
        }
      }

      // Step 4: Bulk tracker resets (items back in stock)
      for (const chunk of chunkArr(resetItems, 500)) {
        const vals = chunk.map(({ supplyId, sku, name, threshold }) => `(${supplyId}, '${escStr(sku)}', '${escStr(name)}', ${threshold})`).join(',');
        await db.execute(sql.raw(`
          INSERT INTO pos_zero_stock_tracker (supply_id, sku, item_name, zero_count, last_scan_at, last_nonzero_at, deletion_eligible, threshold)
          SELECT v.supply_id::int, v.sku, v.item_name, 0, NOW(), NOW(), FALSE, v.threshold::int
          FROM (VALUES ${vals}) AS v(supply_id, sku, item_name, threshold)
          ON CONFLICT (supply_id) DO UPDATE
            SET zero_count = 0, last_scan_at = NOW(), last_nonzero_at = NOW(), deletion_eligible = FALSE, threshold = EXCLUDED.threshold
        `));
      }

      // Step 5: Bulk tracker increments (still zero stock) — uses DB arithmetic so no read needed
      let nowEligible = 0;
      for (const chunk of chunkArr(incrementItems, 500)) {
        const vals = chunk.map(({ supplyId, sku, name, threshold }) => `(${supplyId}, '${escStr(sku)}', '${escStr(name)}', ${threshold})`).join(',');
        const result = await db.execute(sql.raw(`
          INSERT INTO pos_zero_stock_tracker (supply_id, sku, item_name, zero_count, last_scan_at, deletion_eligible, threshold)
          SELECT v.supply_id::int, v.sku, v.item_name, 1, NOW(), FALSE, v.threshold::int
          FROM (VALUES ${vals}) AS v(supply_id, sku, item_name, threshold)
          ON CONFLICT (supply_id) DO UPDATE
            SET zero_count = pos_zero_stock_tracker.zero_count + 1,
                last_scan_at = NOW(),
                deletion_eligible = CASE
                  WHEN NOT pos_zero_stock_tracker.protected
                    AND (pos_zero_stock_tracker.zero_count + 1) >= EXCLUDED.threshold
                  THEN TRUE
                  ELSE pos_zero_stock_tracker.deletion_eligible
                END,
                threshold = EXCLUDED.threshold
          RETURNING deletion_eligible
        `));
        nowEligible += (result.rows as any[]).filter((r: any) => r.deletion_eligible === true).length;
      }

      // Step 6: Bulk upsert new items
      for (const chunk of chunkArr(newItems, 500)) {
        const vals = chunk.map(({ sku, name, brand, price, category, inStock }) =>
          `('${escStr(sku)}', '${escStr(name)}', ${brand ? `'${escStr(brand)}'` : 'NULL'}, ${price}, '${escStr(category)}', ${inStock}, NOW())`
        ).join(',');
        await db.execute(sql.raw(`
          INSERT INTO pos_pending_new_items (sku, item_name, brand, price, mapped_category, pos_stock, found_at)
          VALUES ${vals}
          ON CONFLICT (sku) DO UPDATE
            SET item_name = EXCLUDED.item_name, brand = EXCLUDED.brand, price = EXCLUDED.price,
                mapped_category = EXCLUDED.mapped_category, pos_stock = EXCLUDED.pos_stock, found_at = NOW()
        `));
      }

      res.json({
        processed: posItems.length,
        incremented: incrementItems.length,
        reset: resetItems.length,
        nowEligible,
        skipped,
        newItemCount: newItems.length,
      });
    } catch (e: any) {
      console.error("POS scan upload error:", e);
      res.status(500).json({ message: "Failed to process POS file: " + e.message });
    }
  });

  // ── POS Sales Screen API ────────────────────────────────────────────────────
  app.get("/api/pos/items", requireAdminMiddleware, async (req: any, res) => {
    try {
      const category = String(req.query.category || '');
      const tenantId = (req as any).tenantId;
      if (!category) return res.json([]);
      const result = tenantId
        ? await db.execute(sql`
            SELECT id, name, sku, COALESCE(price, 0) AS price, brand,
                   COALESCE(stock_quantity, 0) AS "stockQuantity"
            FROM supplies
            WHERE category = ${category} AND is_active = true AND COALESCE(price, 0) > 0
              AND tenant_id = ${tenantId}
            ORDER BY name LIMIT 300
          `)
        : await db.execute(sql`
            SELECT id, name, sku, COALESCE(price, 0) AS price, brand,
                   COALESCE(stock_quantity, 0) AS "stockQuantity"
            FROM supplies
            WHERE category = ${category} AND is_active = true AND COALESCE(price, 0) > 0
            ORDER BY name LIMIT 300
          `);
      res.json(result.rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/pos/search", requireAdminMiddleware, async (req: any, res) => {
    try {
      const q = String(req.query.q || '').trim();
      const tenantId = (req as any).tenantId;
      if (q.length < 2) return res.json([]);
      const pattern = `%${q}%`;
      const result = tenantId
        ? await db.execute(sql`
            SELECT id, name, sku, COALESCE(price, 0) AS price, brand,
                   COALESCE(stock_quantity, 0) AS "stockQuantity"
            FROM supplies
            WHERE is_active = true AND COALESCE(price, 0) > 0
              AND (name ILIKE ${pattern} OR sku ILIKE ${pattern} OR brand ILIKE ${pattern})
              AND tenant_id = ${tenantId}
            ORDER BY name LIMIT 50
          `)
        : await db.execute(sql`
            SELECT id, name, sku, COALESCE(price, 0) AS price, brand,
                   COALESCE(stock_quantity, 0) AS "stockQuantity"
            FROM supplies
            WHERE is_active = true AND COALESCE(price, 0) > 0
              AND (name ILIKE ${pattern} OR sku ILIKE ${pattern} OR brand ILIKE ${pattern})
            ORDER BY name LIMIT 50
          `);
      res.json(result.rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/pos/order", requireAdminMiddleware, async (req: any, res) => {
    try {
      const { orderNumber, items, subtotal, tax, total, paymentMethod, amountTendered, changeDue } = req.body;
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      await db.execute(sql`
        INSERT INTO pos_orders (order_number, items, subtotal, tax, total, payment_method, amount_tendered, change_due, cashier_id, tenant_id)
        VALUES (
          ${orderNumber || null},
          ${JSON.stringify(items || [])}::jsonb,
          ${Number(subtotal) || 0},
          ${Number(tax) || 0},
          ${Number(total) || 0},
          ${String(paymentMethod)},
          ${amountTendered != null ? Number(amountTendered) : null},
          ${changeDue != null ? Number(changeDue) : null},
          ${req.user?.id?.toString() || null},
          ${tenantId}
        )
      `);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ── POS Sales Reports ─────────────────────────────────────────────────────

  // Paginated order history — BOTH POS and online orders combined
  app.get("/api/admin/pos/sales", requireAdminMiddleware, async (req: any, res) => {
    try {
      const { start, end, page = "1", limit = "50", channel } = req.query as Record<string, string>;
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));
      const offset = (pageNum - 1) * limitNum;
      const startDate = start || "1900-01-01";
      const endDate   = end   || "2100-12-31";

      // Channel filter helpers
      const includePOS    = !channel || channel === "all" || channel === "pos";
      const includeOnline = !channel || channel === "all" || channel === "online";

      const tenantId = (req as any).tenantId;
      const [rows, cnt] = await Promise.all([
        db.execute(sql`
          WITH combined AS (
            ${includePOS ? sql`
            SELECT
              'pos'::text AS channel,
              id::text AS sale_id,
              order_number,
              items,
              subtotal::numeric,
              tax::numeric,
              total::numeric,
              payment_method,
              amount_tendered::numeric,
              change_due::numeric,
              created_at
            FROM pos_orders
            WHERE created_at::date >= ${startDate}::date
              AND created_at::date <= ${endDate}::date
              ${tenantId ? sql`AND tenant_id = ${tenantId}` : sql``}
            ` : sql`SELECT NULL WHERE FALSE`}
            ${includePOS && includeOnline ? sql`UNION ALL` : sql``}
            ${includeOnline ? sql`
            SELECT
              'online'::text AS channel,
              o.id::text AS sale_id,
              ('ONL-' || o.id::text) AS order_number,
              COALESCE(
                (SELECT jsonb_agg(jsonb_build_object(
                  'name',     COALESCE(oi.product_name, s.name, 'Unknown'),
                  'category', COALESCE(oi.category, ''),
                  'price',    oi.price::float,
                  'quantity', COALESCE(oi.quantity, 1),
                  'sku',      s.sku
                ))
                FROM order_items oi
                LEFT JOIN supplies s ON oi.supply_id = s.id
                WHERE oi.order_id = o.id),
                '[]'::jsonb
              ) AS items,
              COALESCE(o.subtotal::numeric, 0),
              COALESCE(o.tax_amount::numeric, 0) AS tax,
              COALESCE(o.total_amount::numeric, 0) AS total,
              'online' AS payment_method,
              NULL::numeric AS amount_tendered,
              NULL::numeric AS change_due,
              o.order_date AS created_at
            FROM orders o
            WHERE o.payment_status = 'paid'
              AND o.order_date::date >= ${startDate}::date
              AND o.order_date::date <= ${endDate}::date
              ${tenantId ? sql`AND o.tenant_id = ${tenantId}` : sql``}
            ` : sql`SELECT NULL WHERE FALSE`}
          )
          SELECT * FROM combined ORDER BY created_at DESC
          LIMIT ${limitNum} OFFSET ${offset}
        `),
        db.execute(sql`
          SELECT (
            ${includePOS ? sql`
            (SELECT COUNT(*) FROM pos_orders
             WHERE created_at::date >= ${startDate}::date
               AND created_at::date <= ${endDate}::date
               ${tenantId ? sql`AND tenant_id = ${tenantId}` : sql``})
            ` : sql`0`}
            +
            ${includeOnline ? sql`
            (SELECT COUNT(*) FROM orders
             WHERE payment_status = 'paid'
               AND order_date::date >= ${startDate}::date
               AND order_date::date <= ${endDate}::date
               ${tenantId ? sql`AND tenant_id = ${tenantId}` : sql``})
            ` : sql`0`}
          ) AS cnt
        `),
      ]);
      res.json({ orders: rows.rows, total: parseInt(String(cnt.rows[0]?.cnt ?? 0)) });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Period summary — both POS + online orders combined
  app.get("/api/admin/pos/sales/summary", requireAdminMiddleware, async (req: any, res) => {
    try {
      const { start, end, groupBy = "day" } = req.query as Record<string, string>;
      const startDate = start || "1900-01-01";
      const endDate   = end   || "2100-12-31";

      // Reusable CTE that unions both channels
      const summaryTenantId = (req as any).tenantId;
      const allSalesCte = sql`
        all_sales AS (
          SELECT subtotal::numeric, tax::numeric, total::numeric,
                 payment_method, created_at
          FROM pos_orders
          WHERE created_at::date >= ${startDate}::date
            AND created_at::date <= ${endDate}::date
            ${summaryTenantId ? sql`AND tenant_id = ${summaryTenantId}` : sql``}
          UNION ALL
          SELECT COALESCE(subtotal::numeric,0),
                 COALESCE(tax_amount::numeric,0),
                 COALESCE(total_amount::numeric,0),
                 'online' AS payment_method,
                 order_date AS created_at
          FROM orders
          WHERE payment_status = 'paid'
            AND order_date::date >= ${startDate}::date
            AND order_date::date <= ${endDate}::date
            ${summaryTenantId ? sql`AND tenant_id = ${summaryTenantId}` : sql``}
        )
      `;

      const truncExpr =
        groupBy === "month" ? sql`DATE_TRUNC('month', created_at)` :
        groupBy === "year"  ? sql`DATE_TRUNC('year',  created_at)` :
                              sql`created_at::date`;
      const fmtExpr =
        groupBy === "month" ? sql`TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY')` :
        groupBy === "year"  ? sql`TO_CHAR(DATE_TRUNC('year',  created_at), 'YYYY')` :
                              sql`TO_CHAR(created_at, 'Mon DD, YYYY')`;
      const periodExpr =
        groupBy === "month" ? sql`TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM')` :
        groupBy === "year"  ? sql`TO_CHAR(DATE_TRUNC('year',  created_at), 'YYYY')` :
                              sql`created_at::date::text`;

      const [totals, byPeriod, byMethod] = await Promise.all([
        db.execute(sql`
          WITH ${allSalesCte}
          SELECT COUNT(*) AS order_count,
                 COALESCE(SUM(subtotal),0) AS subtotal,
                 COALESCE(SUM(tax),0)      AS tax,
                 COALESCE(SUM(total),0)    AS total
          FROM all_sales
        `),
        db.execute(sql`
          WITH ${allSalesCte}
          SELECT ${periodExpr} AS period,
                 ${fmtExpr}   AS label,
                 COUNT(*) AS order_count,
                 COALESCE(SUM(subtotal),0) AS subtotal,
                 COALESCE(SUM(tax),0)      AS tax,
                 COALESCE(SUM(total),0)    AS total
          FROM all_sales
          GROUP BY period, label ORDER BY period
        `),
        db.execute(sql`
          WITH ${allSalesCte}
          SELECT payment_method,
                 COUNT(*) AS order_count,
                 COALESCE(SUM(total),0) AS total
          FROM all_sales
          GROUP BY payment_method
        `),
      ]);
      res.json({ totals: totals.rows[0], byPeriod: byPeriod.rows, byMethod: byMethod.rows });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Top-selling items — POS (JSONB) + online (relational) combined
  app.get("/api/admin/pos/sales/trends", requireAdminMiddleware, async (req: any, res) => {
    try {
      const { start, end } = req.query as Record<string, string>;
      const startDate = start || "1900-01-01";
      const endDate   = end   || "2100-12-31";
      const trendsTenantId = (req as any).tenantId;
      const result = await db.execute(sql`
        WITH pos_items AS (
          SELECT
            item->>'name'     AS name,
            item->>'category' AS category,
            item->>'sku'      AS sku,
            (item->>'quantity')::numeric AS qty,
            (item->>'price')::numeric * (item->>'quantity')::numeric AS revenue,
            o.id AS order_id
          FROM pos_orders o
          CROSS JOIN LATERAL jsonb_array_elements(o.items) AS item
          WHERE o.created_at::date >= ${startDate}::date
            AND o.created_at::date <= ${endDate}::date
            ${trendsTenantId ? sql`AND o.tenant_id = ${trendsTenantId}` : sql``}
        ),
        online_items AS (
          SELECT
            COALESCE(oi.product_name, s.name, 'Unknown') AS name,
            COALESCE(oi.category, '') AS category,
            s.sku AS sku,
            COALESCE(oi.quantity, 1)::numeric AS qty,
            oi.price::numeric * COALESCE(oi.quantity,1)::numeric AS revenue,
            oi.order_id AS order_id
          FROM order_items oi
          JOIN orders o ON oi.order_id = o.id
          LEFT JOIN supplies s ON oi.supply_id = s.id
          WHERE o.payment_status = 'paid'
            AND o.order_date::date >= ${startDate}::date
            AND o.order_date::date <= ${endDate}::date
            ${trendsTenantId ? sql`AND o.tenant_id = ${trendsTenantId}` : sql``}
        ),
        combined AS (SELECT * FROM pos_items UNION ALL SELECT * FROM online_items)
        SELECT
          name, category, sku,
          SUM(qty)::numeric     AS total_qty,
          SUM(revenue)::numeric AS total_revenue,
          COUNT(DISTINCT order_id) AS order_count
        FROM combined
        GROUP BY name, category, sku
        ORDER BY total_revenue DESC
        LIMIT 200
      `);
      res.json(result.rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Inventory valuation (current stock × price)
  app.get("/api/admin/pos/inventory-value", requireAdminMiddleware, async (req: any, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const [byCat, totals] = await Promise.all([
        db.execute(sql`
          SELECT category,
                 COUNT(*) AS item_count,
                 SUM(COALESCE(stock_quantity, 0)) AS total_units,
                 SUM(COALESCE(price,0) * COALESCE(stock_quantity,0)) AS total_value
          FROM supplies
          WHERE is_active = true AND COALESCE(stock_quantity, 0) > 0
            AND (${tenantId}::int IS NULL OR tenant_id = ${tenantId})
          GROUP BY category
          ORDER BY total_value DESC
        `),
        db.execute(sql`
          SELECT COUNT(*) AS item_count,
                 SUM(COALESCE(stock_quantity,0)) AS total_units,
                 SUM(COALESCE(price,0) * COALESCE(stock_quantity,0)) AS total_value
          FROM supplies
          WHERE is_active = true AND COALESCE(stock_quantity,0) > 0
            AND (${tenantId}::int IS NULL OR tenant_id = ${tenantId})
        `),
      ]);
      res.json({ byCategory: byCat.rows, totals: totals.rows[0] });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/pos/low-stock", requireAdminMiddleware, async (req: any, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const result = await db.execute(sql`
        SELECT id, name, sku, brand, category,
               COALESCE(price, 0) AS price,
               COALESCE(stock_quantity, 0) AS "stockQuantity",
               COALESCE(reorder_point, 1) AS "reorderPoint"
        FROM supplies
        WHERE is_active = true
          AND stock_quantity IS NOT NULL
          AND stock_quantity <= COALESCE(reorder_point, 1)
          AND (${tenantId}::int IS NULL OR tenant_id = ${tenantId})
        ORDER BY stock_quantity ASC, name ASC
        LIMIT 500
      `);
      res.json(result.rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/pos/reorder-point/:id", requireAdminMiddleware, async (req: any, res) => {
    try {
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const id = parseInt(req.params.id);
      const reorderPoint = parseInt(req.body.reorderPoint);
      if (!id || isNaN(reorderPoint) || reorderPoint < 0) return res.status(400).json({ message: "Invalid input" });
      await db.execute(sql`UPDATE supplies SET reorder_point = ${reorderPoint} WHERE id = ${id} AND tenant_id = ${tenantId}`);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/pos/seed-inventory", requireAdminMiddleware, async (req: any, res) => {
    try {
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const zeroResult = await db.execute(sql`
        UPDATE supplies s
        SET stock_quantity = 0, quantity_source = 'pos', updated_at = NOW()
        FROM pos_zero_stock_tracker t
        WHERE s.id = t.supply_id
          AND s.tenant_id = ${tenantId}
          AND t.zero_count > 0
          AND (s.manual_quantity_override = false OR s.manual_quantity_override IS NULL)
      `);
      const inStockResult = await db.execute(sql`
        UPDATE supplies s
        SET stock_quantity = GREATEST(1, COALESCE(s.stock_quantity, 0)),
            quantity_source = 'pos', updated_at = NOW()
        FROM pos_zero_stock_tracker t
        WHERE s.id = t.supply_id
          AND s.tenant_id = ${tenantId}
          AND t.zero_count = 0
          AND t.last_nonzero_at IS NOT NULL
          AND (s.manual_quantity_override = false OR s.manual_quantity_override IS NULL)
      `);
      res.json({ zeroStockUpdated: zeroResult.rowCount || 0, inStockUpdated: inStockResult.rowCount || 0 });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  // POS Layout settings (persisted as JSON in grooming_settings table)
  app.get("/api/pos/layout", requireAdminMiddleware, async (req: any, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const row = await storage.getGroomingSetting("pos_layout", tenantId);
      if (row) {
        res.json(JSON.parse(row.value));
      } else {
        // Build a sensible default from the tenant's own supply_categories
        // so new tenants never see another tenant's pet-store categories.
        const catRows = await db.execute(
          sql`SELECT key, label FROM supply_categories WHERE tenant_id = ${tenantId} ORDER BY label ASC`
        );
        const NEUTRAL_COLORS = [
          "#1d4ed8","#c2410c","#7e22ce","#b45309","#be185d",
          "#166534","#991b1b","#ca8a04","#0f766e","#065f46",
          "#0369a1","#4d7c0f","#6d28d9","#ea580c",
        ];
        const productCats = (catRows.rows as any[]).map((r: any, i: number) => ({
          id: r.key,
          label: r.label,
          color: NEUTRAL_COLORS[i % NEUTRAL_COLORS.length],
          dbCategory: r.key,
        }));
        const defaultConfig = {
          categories: [
            ...productCats,
            { id: "tips",      label: "Tips",       color: "#4b5563", isSpecial: true },
            { id: "misc",      label: "Misc.",       color: "#374151", isSpecial: true },
            { id: "giftCards", label: "Gift Cards",  color: "#be123c", isSpecial: true },
          ],
          tipAmounts: [1, 2, 3, 4, 5, 10, 15, 20],
          giftCardAmounts: [10, 15, 20, 25, 50, 75, 100],
        };
        res.json(defaultConfig);
      }
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/admin/pos/layout", requireAdminMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin only" });
      const config = req.body;
      if (!config || !Array.isArray(config.categories)) {
        return res.status(400).json({ message: "Invalid config" });
      }
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      await storage.upsertGroomingSetting({ setting: "pos_layout", value: JSON.stringify(config), tenantId });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ────────────────────────────────────────────────────────────────────────────

  app.get("/api/admin/pos-scan/pending-new", requireAdminMiddleware, async (req: any, res) => {
    try {
      const result = await db.execute(sql`SELECT sku, item_name, brand, price, mapped_category, pos_stock, found_at FROM pos_pending_new_items ORDER BY mapped_category, item_name`);
      res.json(result.rows);
    } catch (e: any) {
      res.status(500).json({ message: "Failed to load pending new items" });
    }
  });

  app.post("/api/admin/pos-scan/add-new-item", requireAdminMiddleware, async (req: any, res) => {
    try {
      const { sku, item_name, brand, price, mapped_category } = req.body as { sku: string; item_name: string; brand: string; price: number; mapped_category: string };
      if (!sku || !item_name || !mapped_category) return res.status(400).json({ message: "Missing required fields" });
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      await db.execute(sql`
        INSERT INTO supplies (name, brand, sku, price, category, is_active, stock_quantity, tenant_id, created_at, updated_at)
        VALUES (${item_name}, ${brand || null}, ${sku}, ${price || 0}, ${mapped_category}, TRUE, 0, ${tenantId}, NOW(), NOW())
      `);
      await db.execute(sql`DELETE FROM pos_pending_new_items WHERE sku = ${sku}`);
      res.json({ ok: true });
    } catch (e: any) {
      console.error("Add new item error:", e);
      res.status(500).json({ message: "Failed to add item: " + e.message });
    }
  });

  app.post("/api/admin/pos-scan/dismiss-new-item", requireAdminMiddleware, async (req: any, res) => {
    try {
      const { sku } = req.body as { sku: string };
      await db.execute(sql`DELETE FROM pos_pending_new_items WHERE sku = ${sku}`);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: "Failed to dismiss" });
    }
  });

  app.post("/api/admin/pos-scan/add-all-new", requireAdminMiddleware, async (req: any, res) => {
    try {
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const pending = await db.execute(sql`SELECT sku, item_name, brand, price, mapped_category FROM pos_pending_new_items`);
      let added = 0;
      for (const row of pending.rows as any[]) {
        try {
          await db.execute(sql`
            INSERT INTO supplies (name, brand, sku, price, category, is_active, stock_quantity, tenant_id, created_at, updated_at)
            VALUES (${row.item_name}, ${row.brand || null}, ${row.sku}, ${row.price || 0}, ${row.mapped_category}, TRUE, 0, ${tenantId}, NOW(), NOW())
            ON CONFLICT DO NOTHING
          `);
          added++;
        } catch { }
      }
      await db.execute(sql`DELETE FROM pos_pending_new_items`);
      res.json({ added });
    } catch (e: any) {
      console.error("Add all new items error:", e);
      res.status(500).json({ message: "Failed: " + e.message });
    }
  });

  app.get("/api/admin/pos-scan/stats", requireAdminMiddleware, async (req: any, res) => {
    try {
      const eligible = await db.execute(sql`SELECT supply_id, item_name, sku, zero_count, last_scan_at, threshold, protected FROM pos_zero_stock_tracker WHERE deletion_eligible = TRUE AND protected = FALSE ORDER BY zero_count DESC`);
      const approaching = await db.execute(sql`SELECT supply_id, item_name, sku, zero_count, last_scan_at, threshold, protected FROM pos_zero_stock_tracker WHERE deletion_eligible = FALSE AND protected = FALSE AND zero_count >= (threshold - 4) AND zero_count > 0 ORDER BY (zero_count::float / threshold) DESC`);
      const all = await db.execute(sql`SELECT COUNT(*)::int as total, SUM(CASE WHEN deletion_eligible THEN 1 ELSE 0 END)::int as eligible_count, SUM(CASE WHEN protected THEN 1 ELSE 0 END)::int as protected_count FROM pos_zero_stock_tracker`);
      res.json({
        eligible: eligible.rows,
        approaching: approaching.rows,
        summary: all.rows[0] || { total: 0, eligible_count: 0, protected_count: 0 },
      });
    } catch (e: any) {
      res.status(500).json({ message: "Failed to load stats" });
    }
  });

  app.post("/api/admin/pos-scan/protect", requireAdminMiddleware, async (req: any, res) => {
    try {
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const { supplyId, protect } = req.body as { supplyId: number; protect: boolean };
      await db.execute(sql`UPDATE pos_zero_stock_tracker SET protected = ${protect}, deletion_eligible = FALSE WHERE supply_id = ${supplyId}`);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: "Failed to update protection" });
    }
  });

  app.patch("/api/admin/pos-scan/threshold/:supplyId", requireAdminMiddleware, async (req: any, res) => {
    try {
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const supplyId = parseInt(req.params.supplyId);
      const threshold = parseInt(req.body.threshold);
      if (!supplyId || isNaN(threshold) || threshold < 1) return res.status(400).json({ message: "Invalid input" });
      await db.execute(sql`
        UPDATE pos_zero_stock_tracker
        SET threshold = ${threshold},
            deletion_eligible = CASE
              WHEN NOT protected AND zero_count >= ${threshold} THEN TRUE
              WHEN zero_count < ${threshold} THEN FALSE
              ELSE deletion_eligible
            END
        WHERE supply_id = ${supplyId}
      `);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/admin/pos-scan/delete-eligible", requireAdminMiddleware, async (req: any, res) => {
    try {
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const toDelete = await db.execute(sql`SELECT supply_id, item_name FROM pos_zero_stock_tracker WHERE deletion_eligible = TRUE AND protected = FALSE`);
      if (!toDelete.rows.length) return res.json({ deleted: 0, skipped: 0 });
      let deleted = 0, skipped = 0;
      for (const row of toDelete.rows as any[]) {
        const id = row.supply_id;
        const inCart = await db.execute(sql`SELECT 1 FROM cart_items WHERE supply_id = ${id} LIMIT 1`);
        if (inCart.rows.length > 0) { skipped++; continue; }
        await db.execute(sql`DELETE FROM supplies WHERE id = ${id} AND tenant_id = ${tenantId}`);
        await db.execute(sql`DELETE FROM pos_zero_stock_tracker WHERE supply_id = ${id}`);
        deleted++;
      }
      res.json({ deleted, skipped });
    } catch (e: any) {
      console.error("POS delete eligible error:", e);
      res.status(500).json({ message: "Failed to delete: " + e.message });
    }
  });

  // Audit keep-list — save and load scanned item IDs so no-delete list is server-visible
  app.get("/api/admin/audit-keep", requireAdminMiddleware, async (req: any, res) => {
    try {
      const result = await db.execute(sql`SELECT supply_id, item_name, scanned_barcode, saved_at FROM audit_keep_list ORDER BY saved_at DESC`);
      res.json(result.rows);
    } catch (e: any) {
      res.status(500).json({ message: "Failed to load keep list" });
    }
  });

  app.post("/api/admin/audit-keep", requireAdminMiddleware, async (req: any, res) => {
    try {
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const { items } = req.body as { items: Array<{ supplyId: number; name: string; barcode: string }> };
      if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: "No items provided" });
      let saved = 0;
      for (const item of items) {
        if (!item.supplyId || isNaN(item.supplyId)) continue;
        await db.execute(sql`
          INSERT INTO audit_keep_list (supply_id, item_name, scanned_barcode, saved_at)
          VALUES (${item.supplyId}, ${item.name || null}, ${item.barcode || null}, NOW())
          ON CONFLICT (supply_id) DO UPDATE SET item_name = ${item.name || null}, scanned_barcode = ${item.barcode || null}, saved_at = NOW()
        `);
        saved++;
      }
      res.json({ saved });
    } catch (e: any) {
      console.error("Audit keep save error:", e);
      res.status(500).json({ message: "Failed to save keep list" });
    }
  });

  // Inventory Audit batch-apply route
  app.post("/api/admin/inventory-audit/apply", requireAdminMiddleware, async (req: any, res) => {
    try {
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const { actions } = req.body as {
        actions: Array<{ id: number; action: string; value?: number }>;
      };
      if (!Array.isArray(actions) || actions.length === 0) {
        return res.status(400).json({ message: "No actions provided" });
      }

      let applied = 0;
      const errors: string[] = [];

      for (const a of actions) {
        try {
          const supply = await storage.getSupply(a.id, tenantId);
          if (!supply) { errors.push(`ID ${a.id}: not found`); continue; }

          const auditTenantId = tenantId;
          switch (a.action) {
            case "delete":
              await storage.deleteSupply(a.id, auditTenantId);
              break;
            case "deactivate":
              await storage.updateSupply(a.id, { isActive: false } as any, auditTenantId);
              break;
            case "set_price":
              if (a.value == null || isNaN(a.value)) { errors.push(`ID ${a.id}: missing price value`); continue; }
              await storage.updateSupply(a.id, { price: String(Math.max(0, a.value).toFixed(2)) } as any, auditTenantId);
              break;
            case "raise_pct":
              if (a.value == null || isNaN(a.value)) { errors.push(`ID ${a.id}: missing % value`); continue; }
              { const cur = parseFloat(supply.price as any) || 0;
                await storage.updateSupply(a.id, { price: String((cur * (1 + a.value / 100)).toFixed(2)) } as any, auditTenantId); }
              break;
            case "lower_pct":
              if (a.value == null || isNaN(a.value)) { errors.push(`ID ${a.id}: missing % value`); continue; }
              { const cur = parseFloat(supply.price as any) || 0;
                await storage.updateSupply(a.id, { price: String(Math.max(0, cur * (1 - a.value / 100)).toFixed(2)) } as any, auditTenantId); }
              break;
            case "raise_flat":
              if (a.value == null || isNaN(a.value)) { errors.push(`ID ${a.id}: missing $ value`); continue; }
              { const cur = parseFloat(supply.price as any) || 0;
                await storage.updateSupply(a.id, { price: String((cur + a.value).toFixed(2)) } as any, auditTenantId); }
              break;
            case "lower_flat":
              if (a.value == null || isNaN(a.value)) { errors.push(`ID ${a.id}: missing $ value`); continue; }
              { const cur = parseFloat(supply.price as any) || 0;
                await storage.updateSupply(a.id, { price: String(Math.max(0, cur - a.value).toFixed(2)) } as any, auditTenantId); }
              break;
            case "clear_sku":
              await storage.updateSupply(a.id, { sku: null } as any, auditTenantId);
              break;
            default:
              errors.push(`ID ${a.id}: unknown action '${a.action}'`);
              continue;
          }
          applied++;
        } catch (err: any) {
          errors.push(`ID ${a.id}: ${err.message || "unknown error"}`);
        }
      }

      res.json({ applied, errors });
    } catch (error: any) {
      console.error("Inventory audit apply error:", error);
      res.status(500).json({ message: "Failed to apply audit actions" });
    }
  });

  // Cart routes
  app.get("/api/cart", authMiddleware, requireProPlan, async (req: any, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const cartItems = await storage.getCartItems(userId);
      res.json(cartItems);
    } catch (error) {
      console.error("Error fetching cart:", error);
      res.status(500).json({ message: "Failed to fetch cart" });
    }
  });

  app.post("/api/cart", authMiddleware, requireProPlan, async (req: any, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (req.body.petId || req.body.itemType === "pet") {
        return res.status(400).json({ message: "Live animals are view-only and cannot be purchased online. Please visit the store for live animal inquiries." });
      }
      const cartItemData = insertCartItemSchema.parse({ ...req.body, userId });
      const cartItem = await storage.addToCart(cartItemData);
      res.json(cartItem);
    } catch (error) {
      console.error("Error adding to cart:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid cart item data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to add to cart" });
    }
  });

  app.put("/api/cart/:id", authMiddleware, requireProPlan, async (req: any, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const id = parseInt(req.params.id);
      const { quantity } = req.body;
      const cartItem = await storage.updateCartItem(id, quantity, userId);
      if (!cartItem) {
        return res.status(403).json({ message: "Access denied" });
      }
      res.json(cartItem);
    } catch (error) {
      console.error("Error updating cart item:", error);
      res.status(500).json({ message: "Failed to update cart item" });
    }
  });

  app.delete("/api/cart/:id", authMiddleware, requireProPlan, async (req: any, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const id = parseInt(req.params.id);
      const removed = await storage.removeFromCart(id, userId);
      if (!removed) {
        return res.status(403).json({ message: "Access denied" });
      }
      res.json({ message: "Item removed from cart" });
    } catch (error) {
      console.error("Error removing from cart:", error);
      res.status(500).json({ message: "Failed to remove from cart" });
    }
  });

  // Order routes
  app.get("/api/orders", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);

      // Stranded users (no tenant assigned) must not receive data from any store.
      // Return an empty list immediately rather than letting the storage layer run
      // a userId-only query that has no tenant filter.
      if (!req.tenantId) {
        return res.json([]);
      }
      
      // Always filter by userId — admins view all orders in the admin panel (/api/admin/orders-with-items)
      const orders = await storage.getOrders(userId, req.tenantId);
      
      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  app.put("/api/orders/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const id = parseInt(req.params.id);
      const { status } = req.body;
      
      // Get the order before updating to get user info
      const existingOrder = await storage.getOrder(id, tenantId);
      if (!existingOrder) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Update the order status
      const order = await storage.updateOrderStatus(id, status, tenantId);
      
      // Get the customer information for notifications
      const customer = await storage.getUser(existingOrder.userId);
      if (customer && ['in_progress', 'ready'].includes(status)) {
        // Send notifications (email, push, SMS if available)
        await notificationService.sendOrderStatusNotifications(
          customer.email || '',
          customer.firstName || 'Customer',
          null, // Phone number - we'll need to add this to user schema later
          customer.id,
          order.id,
          status,
          (req as any).tenantId
        );
      }
      
      res.json(order);
    } catch (error) {
      console.error("Error updating order:", error);
      res.status(500).json({ message: "Failed to update order" });
    }
  });

  app.delete("/api/admin/orders/:orderId", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const orderId = parseInt(req.params.orderId);
      await storage.deleteOrder(orderId, tenantId);
      
      res.json({ message: "Order deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting order:", error);
      if (error.message === 'Order not found') {
        return res.status(404).json({ message: "Order not found" });
      }
      res.status(500).json({ message: "Failed to delete order" });
    }
  });

  app.post("/api/orders", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { orderData, items } = req.body;
      
      const orderSchema = insertOrderSchema.extend({
        items: z.array(z.object({
          supplyId: z.number().optional(),
          petId: z.number().optional(),
          quantity: z.number(),
          price: z.string(),
        })),
      });
      
      const validatedData = orderSchema.parse({ ...orderData, userId, items });

      // Check if this is a charge account user — no payment processed, no loyalty, no Astro
      const orderingUser = await storage.getUser(userId);
      const isChargeAccountUser = orderingUser?.isChargeAccount === true;

      // Compute subtotal and item prices server-side from the user's actual cart
      {
        const userCartItems = await storage.getCartItems(userId);
        let serverSubtotal = 0;
        const serverItems: Array<{supplyId?: number; petId?: number; quantity: number; price: string}> = [];
        for (const ci of userCartItems) {
          if (ci.supplyId) {
            const supply = await storage.getSupply(ci.supplyId, (req as any).tenantId);
            if (supply) {
              const unitPrice = Math.round(parseFloat(String(supply.price || "0")) * 100) / 100;
              const lineTotal = Math.round(unitPrice * (ci.quantity || 1) * 100) / 100;
              serverSubtotal = Math.round((serverSubtotal + lineTotal) * 100) / 100;
              serverItems.push({
                supplyId: ci.supplyId,
                quantity: ci.quantity || 1,
                price: unitPrice.toFixed(2),
              });
            }
          }
        }
        validatedData.subtotal = serverSubtotal.toFixed(2);
        validatedData.items = serverItems;
      }

      // Fetch tax settings once — used in both charge-account and regular paths
      const taxSettings = await storage.getGroomingSettings((req as any).tenantId);
      const cityTaxRate = parseFloat(taxSettings.find(s => s.setting === 'tax_city')?.value || '0');
      const countyTaxRate = parseFloat(taxSettings.find(s => s.setting === 'tax_county')?.value || '0');
      const stateTaxRate = parseFloat(taxSettings.find(s => s.setting === 'tax_state')?.value || '5.0000');
      const federalTaxRate = parseFloat(taxSettings.find(s => s.setting === 'tax_federal')?.value || '5.9900');
      const serverTaxRate = cityTaxRate + countyTaxRate + stateTaxRate + federalTaxRate;

      if (isChargeAccountUser) {
        // Zero out all fees — charge account orders are billed in-store later
        validatedData.convenienceFee = "0";
        validatedData.loyaltyCreditsApplied = "0";
        const subtotalVal = parseFloat(validatedData.subtotal || "0");
        const serverTaxVal = Math.round(subtotalVal * (serverTaxRate / 100) * 100) / 100;
        validatedData.taxAmount = serverTaxVal.toFixed(2);
        validatedData.totalAmount = Math.round((subtotalVal + serverTaxVal) * 100 / 100).toFixed(2);

        const orderTenantId = resolveWriteTenantId(req, res);
        if (orderTenantId === undefined) return;
        const order = await storage.createOrder(
          {
            ...validatedData,
            userId,
            tenantId: orderTenantId,
            discountAmount: "0",
            discountReason: "Charge Account - In-Store Payment",
            stripePaymentIntentId: null,
            paymentStatus: 'charge_account',
          },
          validatedData.items.map(item => ({ ...item, orderId: 0 }))
        );

        await storage.clearCart(userId);

        // Notify admins
        try {
          const customerName = `${orderingUser?.firstName || ''} ${orderingUser?.lastName || ''}`.trim();
          const allUsers = await storage.getAllUsers((req as any).tenantId);
          const adminUsers = allUsers.filter(u => u.isAdmin);
          const adminEmails = adminUsers.map(u => u.email).filter((e): e is string => !!e);
          const adminPhones = adminUsers.map(u => u.phoneNumber).filter((p): p is string => !!p);
          await notificationService.sendAdminNewOrderNotifications(adminEmails, order.id, customerName || 'Charge Account Customer', order.totalAmount || '0', adminPhones, (req as any).tenantId);
        } catch (notifErr) {
          console.error("Failed to send charge account order notifications:", notifErr);
        }

        console.log(`[CHARGE ACCOUNT] Order #${order.id} created for user ${userId} — no payment required, billed in-store`);
        return res.status(201).json(order);
      }
      
      // If loyalty credits are being applied, validate and deduct them from user's balance
      let verifiedLoyaltyCredits = 0;
      const requestedLoyaltyCredits = parseFloat(orderData.loyaltyCreditsApplied || "0");
      if (requestedLoyaltyCredits > 0) {
        const user = orderingUser;
        if (user) {
          const currentCredits = parseFloat(user.loyaltyCredits || "0");
          const subtotal = parseFloat(validatedData.subtotal || "0");
          const taxAmount = parseFloat(orderData.taxAmount || "0");
          const orderTotal = subtotal + taxAmount;
          
          // Server-side validation: credits can't exceed available balance or order total
          verifiedLoyaltyCredits = Math.min(requestedLoyaltyCredits, currentCredits, orderTotal);
          
          if (verifiedLoyaltyCredits > 0) {
            const newCredits = Math.max(0, currentCredits - verifiedLoyaltyCredits);
            await storage.updateUserLoyalty(userId, { loyaltyCredits: newCredits.toFixed(2) });
          }
        }
      }
      
      // Update the order data with verified loyalty credits
      validatedData.loyaltyCreditsApplied = verifiedLoyaltyCredits.toFixed(2);
      
      // Handle Astro reward discount with server-side validation
      let verifiedRewardDiscount = 0;
      let verifiedDealDiscount = 0;
      let verifiedAstroInfo: string | null = null;
      const requestedAstroDiscount = Math.round(parseFloat(orderData.astroRewardDiscount || "0") * 100) / 100;
      
      if (requestedAstroDiscount > 0 && orderData.astroRewardInfo) {
        try {
          const astroCustomer = await storage.getAstroCustomerByUserId(userId);
          if (astroCustomer) {
            const parsedInfo = JSON.parse(orderData.astroRewardInfo);
            
            // --- Validate frequent buyer rewards ---
            const appliedRewards: Array<{cartItemId: number; rewardId: string}> = parsedInfo.appliedRewards || [];
            if (appliedRewards.length > 0) {
              const { getCustomerStatus } = await import('./astroLoyalty');
              const internalId = `animalhouse-${userId}`;
              const status = await getCustomerStatus(astroCustomer.astroCustomerId, false, internalId);
              
              if (status) {
                const validRewardIds = new Set<string>();
                for (const card of status.frequentBuyerCards) {
                  const purchaseCount = card.purchases?.length || 0;
                  if (purchaseCount >= card.requiredPurchases) {
                    const unredeemed = (card.freeGoods || []).filter((fg: any) => !fg.redeemedOn);
                    for (const fg of unredeemed) {
                      validRewardIds.add(fg.rewardId);
                    }
                  }
                }
                
                const cartItems = await storage.getCartItems(userId);
                let serverComputedRewardDiscount = 0;
                const verifiedAppliedRewards: typeof appliedRewards = [];
                const usedRewardIds = new Set<string>();
                
                for (const applied of appliedRewards) {
                  if (usedRewardIds.has(applied.rewardId)) continue;
                  if (!validRewardIds.has(applied.rewardId)) continue;
                  
                  const cartItem = cartItems.find(ci => ci.id === applied.cartItemId);
                  if (!cartItem) continue;
                  
                  let itemPrice = 0;
                  if (cartItem.supplyId) {
                    const supply = await storage.getSupply(cartItem.supplyId, (req as any).tenantId);
                    if (supply) {
                      itemPrice = Math.round(parseFloat(String(supply.price || "0")) * (cartItem.quantity || 1) * 100) / 100;
                    }
                  }
                  
                  serverComputedRewardDiscount += itemPrice;
                  usedRewardIds.add(applied.rewardId);
                  verifiedAppliedRewards.push({ ...applied, supplyId: cartItem.supplyId });
                }
                
                if (verifiedAppliedRewards.length > 0) {
                  const orderSubtotalRaw = Math.round(parseFloat(validatedData.subtotal || "0") * 100) / 100;
                  verifiedRewardDiscount = Math.min(serverComputedRewardDiscount, orderSubtotalRaw);
                  parsedInfo.appliedRewards = verifiedAppliedRewards;
                  parsedInfo.astroDiscount = verifiedRewardDiscount.toFixed(2);
                  console.log(`[ASTRO] Server-verified reward discount: $${verifiedRewardDiscount} from ${verifiedAppliedRewards.length} valid rewards`);
                } else {
                  console.warn('[ASTRO] No valid unredeemed rewards matched applied cart items');
                }
              }
            }
            
            // --- Validate deal discounts (manufacturer offers) ---
            const appliedDeals = parsedInfo.appliedDeals || [];
            if (appliedDeals.length > 0) {
              const cartItems = await storage.getCartItems(userId);
              const supplyIds = cartItems.filter((item: any) => item.supplyId).map((item: any) => item.supplyId);
              const supplies = await Promise.all(supplyIds.map((id: number) => storage.getSupply(id, (req as any).tenantId)));
              
              const cartItemsWithDetails = cartItems
                .filter((item: any) => item.supplyId)
                .map((item: any) => {
                  const supply = supplies.find(s => s && s.id === item.supplyId);
                  return {
                    supplyId: item.supplyId,
                    supplyName: supply?.name || 'Unknown',
                    sku: supply?.sku || '',
                    price: parseFloat(supply?.price || '0'),
                    quantity: item.quantity,
                    brand: supply?.brand || '',
                  };
                })
                .filter((item: any) => item.sku && item.sku.trim() !== '');
              
              if (cartItemsWithDetails.length > 0) {
                const { evaluateCartDeals } = await import('./astroLoyalty');
                const serverDeals = await evaluateCartDeals(cartItemsWithDetails);
                const serverAutoDeals = serverDeals.filter(d => d.autoApply && d.calculatedDiscount > 0);
                
                verifiedDealDiscount = Math.round(
                  serverAutoDeals.reduce((sum, d) => sum + d.calculatedDiscount, 0) * 100
                ) / 100;
                
                const orderSubtotalRaw = Math.round(parseFloat(validatedData.subtotal || "0") * 100) / 100;
                const remainingSubtotal = Math.max(0, orderSubtotalRaw - verifiedRewardDiscount);
                verifiedDealDiscount = Math.min(verifiedDealDiscount, remainingSubtotal);
                
                parsedInfo.appliedDeals = serverAutoDeals.map((d: any) => ({
                  programId: d.programId,
                  programTitle: d.programTitle,
                  dealType: d.dealType,
                  discount: d.calculatedDiscount.toFixed(2),
                  matchingItems: d.matchingCartItems.map((i: any) => i.supplyName),
                }));
                parsedInfo.dealDiscount = verifiedDealDiscount.toFixed(2);
                console.log(`[ASTRO] Server-verified deal discount: $${verifiedDealDiscount} from ${serverAutoDeals.length} auto-applied deals`);
              }
            }
            
            const totalVerifiedDiscount = Math.round((verifiedRewardDiscount + verifiedDealDiscount) * 100) / 100;
            if (totalVerifiedDiscount > 0) {
              verifiedAstroInfo = JSON.stringify(parsedInfo);
            }
          }
        } catch (e) {
          console.warn('[ASTRO] Could not verify astro discounts, proceeding without:', e);
        }
      }
      
      const verifiedAstroDiscount = Math.round((verifiedRewardDiscount + verifiedDealDiscount) * 100) / 100;
      
      // Server-side recalculation of all amounts
      const orderSubtotal = Math.round(parseFloat(validatedData.subtotal || "0") * 100) / 100;
      const subtotalAfterAstro = Math.round(Math.max(0, orderSubtotal - verifiedAstroDiscount) * 100) / 100;
      
      // Recalculate tax using the already-fetched server tax rate
      const orderTax = Math.round(subtotalAfterAstro * (serverTaxRate / 100) * 100) / 100;
      const amountBeforeFee = Math.round((subtotalAfterAstro + orderTax - verifiedLoyaltyCredits) * 100) / 100;
      validatedData.convenienceFee = "0.00";
      validatedData.taxAmount = orderTax.toFixed(2);
      
      // Recalculate total with server-verified values
      const serverTotal = Math.round(amountBeforeFee * 100) / 100;
      validatedData.totalAmount = serverTotal.toFixed(2);
      
      // Get payment intent ID if provided (from Stripe checkout)
      const paymentIntentId = orderData.stripePaymentIntentId;
      
      const orderTenantId = resolveWriteTenantId(req, res);
      if (orderTenantId === undefined) return;
      const order = await storage.createOrder(
        { 
          ...validatedData, 
          userId,
          tenantId: orderTenantId,
          discountAmount: verifiedAstroDiscount > 0 ? verifiedAstroDiscount.toFixed(2) : "0",
          discountReason: verifiedAstroInfo ? `Astro Loyalty Reward: ${verifiedAstroInfo}` : null,
          stripePaymentIntentId: paymentIntentId || null,
          paymentStatus: serverTotal <= 0 ? 'paid' : (paymentIntentId ? 'authorized' : 'unpaid'),
        },
        validatedData.items.map(item => ({ ...item, orderId: 0 }))
      );
      
      // Clear cart after successful order
      await storage.clearCart(userId);
      
      // Send notifications for new order
      try {
        const user = req.user;
        const customerName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
        
        // Get all admin users
        const allUsers = await storage.getAllUsers((req as any).tenantId);
        const adminUsers = allUsers.filter(u => u.isAdmin);
        const adminEmails = adminUsers.map(u => u.email).filter((email): email is string => !!email);
        const adminPhones = adminUsers.map(u => u.phoneNumber).filter((p): p is string => !!p);
        
        await notificationService.sendAdminNewOrderNotifications(
          adminEmails,
          order.id,
          customerName,
          order.totalAmount,
          adminPhones,
          (req as any).tenantId
        );

        const { notifyAdminsNewOrder } = await import('./pushNotifications');
        await notifyAdminsNewOrder(order.id, customerName || 'Customer', order.totalAmount);

        // Send "We got your order" confirmation email to customer
        const customerEmail = user.email;
        if (customerEmail) {
          const orderWithItems = await storage.getOrderWithItems(order.id, (req as any).tenantId);
          const enrichedItems = (orderWithItems?.items || []).map((item: any) => ({
            name: item.itemName || item.name || 'Item',
            quantity: item.quantity || 1,
            price: item.price || '0',
          }));
          await notificationService.sendOrderReceivedNotification(
            customerEmail,
            user.firstName || 'Customer',
            order.id,
            enrichedItems,
            order.subtotal || '0',
            order.taxAmount || '0',
            order.convenienceFee || '0',
            order.loyaltyCreditsApplied || '0',
            order.totalAmount || '0',
            order.discountAmount || '0',
            order.customerNotes || undefined,
            (req as any).tenantId
          );
        }
      } catch (notificationError) {
        console.error('Failed to send notifications for new order:', notificationError);
      }
      
      res.json(order);
    } catch (error) {
      console.error("Error creating order:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid order data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create order" });
    }
  });

  // Get order details with items
  app.get("/api/orders/:id", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const orderId = parseInt(req.params.id);
      
      const orderWithItems = await storage.getOrderWithItems(orderId, (req as any).tenantId);
      
      if (!orderWithItems) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      // Check if user owns this order or is admin
      const user = await storage.getUser(userId);
      if (orderWithItems.order.userId !== userId && !user?.isAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      res.json(orderWithItems);
    } catch (error) {
      console.error("Error fetching order details:", error);
      res.status(500).json({ message: "Failed to fetch order details" });
    }
  });

  // Order Approval Management Routes (Admin)
  app.get("/api/admin/pending-orders", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }
      
      const allOrders = await storage.getOrders(undefined, (req as any).tenantId);
      const pendingOrders = allOrders.filter(o => 
        o.approvalStatus === 'pending_approval' || 
        o.approvalStatus === 'approved' ||
        o.approvalStatus === 'ready_for_pickup'
      );
      
      // Get order items for each order
      const ordersWithItems = await Promise.all(
        pendingOrders.map(async (order) => {
          const orderWithItems = await storage.getOrderWithItems(order.id, (req as any).tenantId);
          return orderWithItems;
        })
      );
      
      res.json(ordersWithItems.filter(Boolean));
    } catch (error) {
      console.error("Error fetching pending orders:", error);
      res.status(500).json({ message: "Failed to fetch pending orders" });
    }
  });
  
  app.post("/api/admin/orders/:id/approve", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const orderId = parseInt(req.params.id);
      const orderWithItems = await storage.getOrderWithItems(orderId, tenantId);
      
      if (!orderWithItems) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      const order = orderWithItems.order;
      const customerEmail = orderWithItems.customerEmail || order.customerEmail;
      const customerName = orderWithItems.customerName || 'Valued Customer';
      
      // Get the order owner to find their saved payment method
      const orderOwner = await storage.getUser(order.userId);
      
      let paymentSuccessful = false;
      let paymentError = null;
      let paymentIntentId = null;
      
      const orderTotalAmount = parseFloat(order.totalAmount);
      
      // If order total is $0 (fully discounted), skip Stripe entirely and mark as paid
      if (orderTotalAmount <= 0) {
        paymentSuccessful = true;
        await storage.updateOrderStripePayment(orderId, {
          paymentStatus: 'paid',
          paidAt: new Date(),
        });
        await storage.updateOrderApprovalStatus(orderId, 'approved', tenantId);
        console.log(`Order #${orderId} approved - fully discounted ($0.00), no payment needed`);
      } else if (orderOwner?.stripeCustomerId && orderOwner?.stripeDefaultPaymentMethod) {
        // Try to charge the customer's saved payment method
        try {
          const { getUncachableStripeClient } = await import('./stripeClient');
          const stripe = await getUncachableStripeClient();
          
          const amountCents = Math.round(orderTotalAmount * 100);
          
          // Create and confirm a PaymentIntent with the saved payment method
          const paymentIntent = await stripe.paymentIntents.create({
            amount: amountCents,
            currency: 'usd',
            customer: orderOwner.stripeCustomerId,
            payment_method: orderOwner.stripeDefaultPaymentMethod,
            off_session: true, // Charging without customer present
            confirm: true, // Charge immediately
            description: `Order #${orderId} - PilotHouse`,
            metadata: {
              orderId: orderId.toString(),
              customerId: order.userId,
            },
          }, {
            idempotencyKey: `order-approve-${orderId}`,
          });
          
          if (paymentIntent.status === 'succeeded') {
            paymentSuccessful = true;
            paymentIntentId = paymentIntent.id;
            
            // Update order with payment info
            await storage.updateOrderStripePayment(orderId, {
              stripePaymentIntentId: paymentIntentId,
              paymentStatus: 'paid',
              paidAt: new Date(),
            });
            
            // Keep order in "approved" status - admin needs to manually gather items
            // and move to "ready_for_pickup" when the order is actually ready
            await storage.updateOrderApprovalStatus(orderId, 'approved', tenantId);
            
            console.log(`Order #${orderId} approved and payment charged successfully: ${paymentIntentId}`);
          } else {
            paymentError = `Payment status: ${paymentIntent.status}`;
          }
        } catch (stripeError: any) {
          console.error("Failed to charge saved payment method:", stripeError);
          paymentError = stripeError.message;
        }
      } else {
        paymentError = "No saved payment method";
      }
      
      // If automatic charge failed, just approve and notify admin
      if (!paymentSuccessful) {
        console.warn(`Order #${orderId} approved but payment failed: ${paymentError}`);
        
        // Update order status to approved (not ready, since not paid)
        await storage.updateOrderApprovalStatus(orderId, 'approved', tenantId);
        await storage.updateOrderStripePayment(orderId, {
          paymentStatus: 'payment_failed',
        });
      }
      
      try {
        const { notifyCustomerOrderApproved } = await import('./pushNotifications');
        await notifyCustomerOrderApproved(order.userId, orderId);
      } catch (pushErr) {
        console.error('Push notification failed for order approval:', pushErr);
      }

      // Send customer SMS if they have a phone number
      if (orderOwner?.phoneNumber) {
        try {
          const { SMSService } = await import('./notifications') as any;
          // Use the SMSService directly to send approved status
          const twilio = await import('twilio');
          const client = twilio.default(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
          const smsMsg = `Hi ${orderOwner.firstName || 'there'}! Your PilotHouse order #${orderId} has been approved. We'll text you when it's ready for pickup!`;
          await client.messages.create({ body: smsMsg, from: process.env.TWILIO_PHONE_NUMBER!, to: orderOwner.phoneNumber });
          console.log(`Approval SMS sent to ${orderOwner.phoneNumber} for order ${orderId}`);
        } catch (smsErr) {
          console.error('Approval SMS failed:', smsErr);
        }
      }

      if (customerEmail) {
        try {
          const { getUncachableSendGridClient } = await import('./sendgridIntegration');
          const { client, fromEmail, replyTo } = await getUncachableSendGridClient();
          const itemsList = orderWithItems.items.map((item: any) => 
            `• ${item.productName || item.itemName || 'Item'} x${item.quantity} - $${item.price}`
          ).join('\n');
          
          const emailSubject = paymentSuccessful 
            ? 'Payment Received - Your PilotHouse Order Has Been Approved!'
            : 'Your PilotHouse Order Has Been Approved';
          
          const statusMessage = paymentSuccessful
            ? `<h2 style="color: #16a34a;">✓ Payment Received!</h2>
               <p>Your payment of <strong>$${order.totalAmount}</strong> has been processed successfully.</p>
               <p>Your order has been approved and we're getting it ready. We'll notify you when it's ready for pickup!</p>`
            : `<h2 style="color: #16a34a;">Order Approved!</h2>
               <p>Your order has been approved. Please contact the store to arrange payment.</p>`;
          
          await client.send({
            to: customerEmail,
            from: fromEmail,
            replyTo,
            subject: emailSubject,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background-color: #dc2626; color: white; padding: 20px; text-align: center;">
                  <h1 style="margin: 0;">PilotHouse</h1>
                </div>
                <div style="padding: 20px; background-color: #f9fafb;">
                  ${statusMessage}
                  <p>Hi ${customerName},</p>
                  
                  <div style="background: white; border-radius: 8px; padding: 15px; margin: 15px 0;">
                    <h3 style="margin-top: 0;">Order #${order.id} Details:</h3>
                    <pre style="white-space: pre-wrap; font-family: Arial;">${itemsList}</pre>
                    ${order.taxAmount && parseFloat(order.taxAmount) > 0 ? `<p>Tax: $${order.taxAmount}</p>` : ''}
                    ${order.loyaltyCreditsApplied && parseFloat(order.loyaltyCreditsApplied) > 0 ? `<p style="color: #16a34a;">Loyalty Credits Applied: -$${order.loyaltyCreditsApplied}</p>` : ''}
                    ${order.discountAmount && parseFloat(order.discountAmount) > 0 ? `<p style="color: #16a34a;">Discount: -$${parseFloat(order.discountAmount).toFixed(2)}${order.discountReason ? ` (${order.discountReason})` : ''}</p>` : ''}
                    <p style="font-weight: bold; font-size: 18px; color: #dc2626;">Total: $${order.totalAmount}</p>
                  </div>
                  
                  <p>Thank you for shopping with us!</p>
                </div>
                <div style="background-color: #1f2937; color: #d1d5db; padding: 15px; text-align: center; font-size: 12px;">
                  <p style="margin: 0 0 5px 0;"><strong>PilotHouse</strong></p>
                  <p style="margin: 0 0 5px 0;">2934 Cypress St, West Monroe, LA 71291</p>
                  <p style="margin: 0;">Phone: (318) 322-3023</p>
                </div>
              </div>
            `
          });
        } catch (emailError) {
          console.error("Failed to send approval email:", emailError);
        }
      }
      
      res.json({ 
        success: true, 
        paymentSuccessful,
        message: paymentSuccessful 
          ? "Order approved and payment charged successfully" 
          : `Order approved but payment failed: ${paymentError}`,
        paymentIntentId,
      });
    } catch (error) {
      console.error("Error approving order:", error);
      res.status(500).json({ message: "Failed to approve order" });
    }
  });
  
  app.post("/api/admin/orders/:id/retry-payment", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }
      
      const orderId = parseInt(req.params.id);
      const orderWithItems = await storage.getOrderWithItems(orderId, (req as any).tenantId);
      
      if (!orderWithItems) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      const order = orderWithItems.order;
      
      if (order.paymentStatus === 'paid') {
        return res.status(400).json({ message: "Order is already paid" });
      }
      
      const orderOwner = await storage.getUser(order.userId);
      
      if (!orderOwner?.stripeCustomerId || !orderOwner?.stripeDefaultPaymentMethod) {
        return res.status(400).json({ message: "Customer has no saved payment method on file" });
      }
      
      const { getUncachableStripeClient } = await import('./stripeClient');
      const stripe = await getUncachableStripeClient();
      
      const amountCents = Math.round(parseFloat(order.totalAmount) * 100);
      
      const retryKey = req.body?.idempotencyKey || `order-retry-${orderId}-${Date.now()}`;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'usd',
        customer: orderOwner.stripeCustomerId,
        payment_method: orderOwner.stripeDefaultPaymentMethod,
        off_session: true,
        confirm: true,
        description: `Order #${orderId} - PilotHouse (Retry)`,
        metadata: {
          orderId: orderId.toString(),
          customerId: order.userId,
        },
      }, {
        idempotencyKey: retryKey,
      });
      
      if (paymentIntent.status === 'succeeded') {
        await storage.updateOrderStripePayment(orderId, {
          stripePaymentIntentId: paymentIntent.id,
          paymentStatus: 'paid',
          paidAt: new Date(),
        });
        
        console.log(`Order #${orderId} payment retry succeeded: ${paymentIntent.id}`);
        
        res.json({ 
          success: true, 
          message: "Payment charged successfully",
          paymentIntentId: paymentIntent.id,
        });
      } else {
        res.status(400).json({ 
          success: false, 
          message: `Payment status: ${paymentIntent.status}` 
        });
      }
    } catch (error: any) {
      console.error("Error retrying payment:", error);
      res.status(500).json({ message: `Payment retry failed: ${error.message}` });
    }
  });

  app.post("/api/admin/orders/:id/ready", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const orderId = parseInt(req.params.id);
      const orderWithItems = await storage.getOrderWithItems(orderId, tenantId);
      
      if (!orderWithItems) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      await storage.updateOrderApprovalStatus(orderId, 'ready_for_pickup', tenantId);
      
      try {
        const { notifyCustomerOrderReady } = await import('./pushNotifications');
        await notifyCustomerOrderReady(orderWithItems.order.userId, orderId);
      } catch (pushErr) {
        console.error('Push notification failed for order ready:', pushErr);
      }

      const order = orderWithItems.order;
      const customerEmail = orderWithItems.customerEmail || order.customerEmail;

      // Send customer SMS if they have a phone number
      if (order.userId) {
        try {
          const customer = await storage.getUser(order.userId);
          if (customer?.phoneNumber && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
            const twilio = await import('twilio');
            const twilioClient = twilio.default(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
            const smsMsg = `${customer.firstName || 'Hi'}, your PilotHouse order #${orderId} is ready for pickup! Come grab it anytime during store hours. 🐾`;
            await twilioClient.messages.create({ body: smsMsg, from: process.env.TWILIO_PHONE_NUMBER, to: customer.phoneNumber });
            console.log(`Ready SMS sent to ${customer.phoneNumber} for order ${orderId}`);
          }
        } catch (smsErr) {
          console.error('Ready SMS failed:', smsErr);
        }
      }

      if (customerEmail) {
        try {
          const { getUncachableSendGridClient } = await import('./sendgridIntegration');
          const { client, fromEmail, replyTo } = await getUncachableSendGridClient();
          
          await client.send({
            to: customerEmail,
            from: fromEmail,
            replyTo,
            subject: 'Your PilotHouse Order Is Ready for Pickup!',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background-color: #dc2626; color: white; padding: 20px; text-align: center;">
                  <h1 style="margin: 0;">PilotHouse</h1>
                </div>
                <div style="padding: 20px; background-color: #f9fafb;">
                  <h2 style="color: #16a34a;">Your Order is Ready!</h2>
                  <p>Hi ${orderWithItems.customerName || 'Valued Customer'},</p>
                  <p>Your order <strong>#${order.id}</strong> is now ready for pickup!</p>
                  
                  <div style="background: #16a34a; color: white; border-radius: 8px; padding: 20px; margin: 15px 0; text-align: center;">
                    <h3 style="margin: 0;">Come pick up your order anytime during store hours</h3>
                    <p style="font-size: 24px; font-weight: bold; margin: 10px 0;">Order Total: $${order.totalAmount}</p>
                  </div>
                  
                  <p>Thank you for shopping with PilotHouse!</p>
                </div>
                <div style="background-color: #1f2937; color: #d1d5db; padding: 15px; text-align: center; font-size: 12px;">
                  <p style="margin: 0 0 5px 0;"><strong>PilotHouse</strong></p>
                  <p style="margin: 0 0 5px 0;">2934 Cypress St, West Monroe, LA 71291</p>
                  <p style="margin: 0;">Phone: (318) 322-3023</p>
                </div>
              </div>
            `
          });
        } catch (emailError) {
          console.error("Failed to send ready email:", emailError);
        }
      }
      
      res.json({ success: true, message: "Order marked ready and customer notified" });
    } catch (error) {
      console.error("Error marking order ready:", error);
      res.status(500).json({ message: "Failed to mark order ready" });
    }
  });
  
  app.post("/api/admin/orders/:id/picked-up", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const orderId = parseInt(req.params.id);
      const orderWithItems = await storage.getOrderWithItems(orderId, tenantId);

      if (!orderWithItems) {
        return res.status(404).json({ message: "Order not found" });
      }

      await storage.updateOrderApprovalStatus(orderId, 'picked_up', tenantId);
      // Also mark the order status as completed when picked up
      await storage.updateOrderStatus(orderId, 'completed', tenantId);

      // Send customer SMS if they have a phone number
      if (orderWithItems?.order.userId) {
        try {
          const pickedUpCustomer = await storage.getUser(orderWithItems.order.userId);
          if (pickedUpCustomer?.phoneNumber && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
            const twilio = await import('twilio');
            const twilioClient = twilio.default(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
            const smsMsg = `Hi ${pickedUpCustomer.firstName || 'there'}! Your PilotHouse order #${orderId} has been picked up. Thank you for shopping with us! 🐾`;
            await twilioClient.messages.create({ body: smsMsg, from: process.env.TWILIO_PHONE_NUMBER, to: pickedUpCustomer.phoneNumber });
            console.log(`Picked-up SMS sent to ${pickedUpCustomer.phoneNumber} for order ${orderId}`);
          }
        } catch (smsErr) {
          console.error('Picked-up SMS failed:', smsErr);
        }
      }
      
      // Update loyalty rewards - add the order amount to the customer's total spent
      if (orderWithItems) {
        const order = orderWithItems.order;
        const orderUserId = order.userId;
        // Skip loyalty and Astro for charge account orders
        const isChargeAccountOrder = order.paymentStatus === 'charge_account';
        if (orderUserId && !isChargeAccountOrder) {
          try {
            // Food items (dogFood/catFood) only count 25% toward loyalty due to low markup
            const FOOD_LOYALTY_RATE = 0.25;
            const FOOD_CATEGORIES = ['dogFood', 'catFood'];
            const orderItemsList = orderWithItems.items || [];
            let foodSubtotal = 0;
            let nonFoodSubtotal = 0;
            for (const item of orderItemsList) {
              const itemTotal = parseFloat(item.price) * (item.quantity || 1);
              if (item.supplyId) {
                const supply = await storage.getSupply(item.supplyId, (req as any).tenantId);
                if (supply && FOOD_CATEGORIES.includes(supply.category || '')) {
                  foodSubtotal += itemTotal;
                } else {
                  nonFoodSubtotal += itemTotal;
                }
              } else {
                nonFoodSubtotal += itemTotal;
              }
            }
            // If no item breakdown available, fall back to raw subtotal as non-food
            if (orderItemsList.length === 0) {
              nonFoodSubtotal = parseFloat(order.subtotal || order.totalAmount || '0');
            }
            const adjustedSubtotal = nonFoodSubtotal + (foodSubtotal * FOOD_LOYALTY_RATE);
            const loyaltyCreditsApplied = parseFloat(order.loyaltyCreditsApplied || '0');
            const astroDiscountApplied = parseFloat(order.discountAmount || '0');
            // Track the adjusted amount (food purchases earn 25% loyalty, non-food earns 100%)
            const amountForLoyalty = Math.max(0, adjustedSubtotal - loyaltyCreditsApplied - astroDiscountApplied);
            console.log(`[LOYALTY] Order #${orderId}: food=$${foodSubtotal.toFixed(2)} (25%=$${(foodSubtotal*FOOD_LOYALTY_RATE).toFixed(2)}), non-food=$${nonFoodSubtotal.toFixed(2)}, adjusted=$${adjustedSubtotal.toFixed(2)}`);
            
            if (amountForLoyalty > 0) {
              const loyaltyResult = await storage.addToUserTotalSpent(orderUserId, amountForLoyalty);
              console.log(`[LOYALTY] Updated total spent for user ${orderUserId}: +$${amountForLoyalty.toFixed(2)}${loyaltyResult.newCreditsEarned ? ` - NEW REWARD EARNED: $${loyaltyResult.creditsAmount}` : ''}`);
            }
          } catch (loyaltyError) {
            console.error("Failed to update loyalty rewards:", loyaltyError);
          }

          try {
            const astroCustomer = await storage.getAstroCustomerByUserId(orderUserId);
            if (astroCustomer && orderWithItems) {
              const { syncPurchaseToAstro, addRedemption, getCustomerStatus } = await import('./astroLoyalty');
              const orderItems = orderWithItems.items || [];
              const internalId = `animalhouse-${orderUserId}`;
              
              let rewardedSupplyIds = new Set<number>();
              let appliedRewardsList: Array<{rewardId: string; supplyId?: number}> = [];
              
              if (orderWithItems.order.discountReason?.startsWith('Astro Loyalty Reward:')) {
                try {
                  const jsonStr = orderWithItems.order.discountReason.replace('Astro Loyalty Reward: ', '');
                  const rewardInfo = JSON.parse(jsonStr);
                  if (rewardInfo.appliedRewards) {
                    for (const ar of rewardInfo.appliedRewards) {
                      appliedRewardsList.push({ rewardId: ar.rewardId, supplyId: ar.supplyId });
                      if (ar.supplyId) {
                        rewardedSupplyIds.add(ar.supplyId);
                      }
                    }
                  }
                } catch (e) {
                  console.warn('[ASTRO] Could not parse reward info from discount reason');
                }
              }
              
              const items = [];
              for (const item of orderItems) {
                if (item.supplyId && rewardedSupplyIds.has(item.supplyId)) {
                  console.log(`[ASTRO] Skipping supply #${item.supplyId} from purchase sync (covered by Astro reward)`);
                  continue;
                }
                if (item.supplyId) {
                  const supply = await storage.getSupply(item.supplyId, (req as any).tenantId);
                  if (supply) {
                    items.push({
                      productId: supply.id.toString(),
                      productName: supply.name,
                      brand: supply.brand || undefined,
                      sku: supply.sku || undefined,
                      quantity: item.quantity,
                      unitPrice: parseFloat(item.price),
                      totalPrice: parseFloat(item.price) * item.quantity,
                    });
                  }
                }
              }
              if (items.length > 0) {
                const paidSubtotal = items.reduce((sum, i) => sum + i.totalPrice, 0);
                const syncResult = await syncPurchaseToAstro({
                  customerId: astroCustomer.astroCustomerId,
                  internalCustomerId: internalId,
                  transactionId: orderId.toString(),
                  items,
                  purchaseDate: new Date(orderWithItems.order.orderDate || Date.now()),
                  totalAmount: paidSubtotal,
                });
                if (syncResult) {
                  console.log(`[ASTRO] Auto-synced order #${orderId} to Astro (${syncResult.syncedItems}/${items.length} items tracked, ${syncResult.failedItems} not in Astro DB, $${paidSubtotal.toFixed(2)})`);
                }
              }
              
              if (appliedRewardsList.length > 0) {
                try {
                  const status = await getCustomerStatus(astroCustomer.astroCustomerId, false, internalId);
                  if (status) {
                    for (const applied of appliedRewardsList) {
                      let itemId: string | null = null;
                      let foundReward = false;
                      for (const card of status.frequentBuyerCards) {
                        const fg = card.freeGoods.find(fg => fg.rewardId === applied.rewardId && !fg.redeemedOn);
                        if (fg) {
                          itemId = fg.itemId;
                          foundReward = true;
                          break;
                        }
                      }
                      
                      if (!foundReward) {
                        console.log(`[ASTRO] Reward ${applied.rewardId} not found in freeGoods, attempting direct redemption with rewardId as itemId`);
                      }
                      
                      const redeemed = await addRedemption(
                        astroCustomer.astroCustomerId,
                        applied.rewardId,
                        itemId || applied.rewardId,
                        undefined,
                        internalId
                      );
                      if (redeemed) {
                        console.log(`[ASTRO] Redeemed reward ${applied.rewardId} for order #${orderId}`);
                      } else {
                        console.warn(`[ASTRO] Failed to redeem reward ${applied.rewardId}`);
                      }
                    }
                  }
                } catch (redeemError) {
                  console.error('[ASTRO] Error redeeming rewards:', redeemError);
                }
              }
            }
          } catch (astroError) {
            console.error("[ASTRO] Failed to auto-sync purchase:", astroError);
          }
        }
      }
      
      // Send email notification
      if (orderWithItems) {
        const order = orderWithItems.order;
        const customerEmail = orderWithItems.customerEmail || order.customerEmail;
        if (customerEmail) {
          try {
            const { getUncachableSendGridClient } = await import('./sendgridIntegration');
            const { client, fromEmail, replyTo } = await getUncachableSendGridClient();
            
            await client.send({
              to: customerEmail,
              from: fromEmail,
              replyTo,
              subject: 'Thank You for Shopping at PilotHouse!',
              text: `Hi ${orderWithItems.customerName || 'Valued Customer'},

Your order #${orderId} has been picked up and completed!

Thank you for shopping with PilotHouse. We appreciate your business!

If you have any questions, please don't hesitate to contact us.

See you again soon!

PilotHouse
2934 Cypress St
West Monroe LA 71291
318 322-3023`,
              html: `
                <h2>Thank You for Shopping at PilotHouse!</h2>
                <p>Hi ${orderWithItems.customerName || 'Valued Customer'},</p>
                <p>Your order #${orderId} has been picked up and completed!</p>
                <p>Thank you for shopping with PilotHouse. We appreciate your business!</p>
                <p>If you have any questions, please don't hesitate to contact us.</p>
                <p>See you again soon!</p>
                <br>
                <p><strong>PilotHouse</strong><br>
                2934 Cypress St<br>
                West Monroe LA 71291<br>
                318 322-3023</p>
              `
            });
          } catch (emailError) {
            console.error("Failed to send pickup confirmation email:", emailError);
          }
        }
      }
      
      res.json({ success: true, message: "Order marked as picked up" });
    } catch (error) {
      console.error("Error marking order picked up:", error);
      res.status(500).json({ message: "Failed to mark order picked up" });
    }
  });

  app.post("/api/admin/orders/:id/sync-astro", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }
      
      const orderId = parseInt(req.params.id);
      const orderWithItems = await storage.getOrderWithItems(orderId, (req as any).tenantId);
      
      if (!orderWithItems) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      const order = orderWithItems.order;
      const orderOwner = await storage.getUser(order.userId);
      
      if (!orderOwner) {
        return res.status(400).json({ message: "Order owner not found" });
      }
      
      const astroCustomer = await storage.getAstroCustomerByUserId(order.userId);
      if (!astroCustomer) {
        return res.status(400).json({ message: "Customer not linked to Astro Loyalty" });
      }
      
      const { syncPurchaseToAstro } = await import('./astroLoyalty');
      const orderItems = orderWithItems.items || [];
      const items = [];
      for (const item of orderItems) {
        if (item.supplyId) {
          const supply = await storage.getSupply(item.supplyId, (req as any).tenantId);
          if (supply) {
            items.push({
              productId: supply.id.toString(),
              productName: supply.name,
              brand: supply.brand || undefined,
              sku: supply.sku || undefined,
              quantity: item.quantity,
              unitPrice: parseFloat(item.price),
              totalPrice: parseFloat(item.price) * item.quantity,
            });
          }
        }
      }
      
      if (items.length === 0) {
        return res.status(400).json({ message: "No items with UPCs found in this order" });
      }
      
      const timestamp = Date.now().toString().slice(-6);
      const syncResult = await syncPurchaseToAstro({
        customerId: astroCustomer.astroCustomerId,
        internalCustomerId: `animalhouse-${order.userId}`,
        transactionId: `${orderId}-retry-${timestamp}`,
        items,
        purchaseDate: new Date(order.orderDate || Date.now()),
        totalAmount: parseFloat(order.totalAmount),
      });
      
      if (syncResult?.success) {
        console.log(`[ASTRO] Manual sync for order #${orderId}: ${syncResult.syncedItems} tracked, ${syncResult.failedItems} not in Astro DB`);
        const msg = syncResult.failedItems > 0
          ? `Order synced - ${syncResult.syncedItems} item(s) tracked, ${syncResult.failedItems} item(s) not found in Astro's database`
          : "Order synced to Astro Loyalty successfully";
        res.json({ success: true, message: msg, syncedItems: syncResult.syncedItems, failedItems: syncResult.failedItems });
      } else {
        res.status(500).json({ success: false, message: "Astro sync failed - check server logs" });
      }
    } catch (error: any) {
      console.error("[ASTRO] Manual sync error:", error);
      res.status(500).json({ message: `Astro sync failed: ${error.message}` });
    }
  });

  // Sync order statuses - fix orders where approval_status is picked_up but status is still pending
  app.post("/api/admin/orders/sync-statuses", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const allOrders = await storage.getOrders(undefined, tenantId);
      let fixedCount = 0;
      
      for (const order of allOrders) {
        // If approval_status is picked_up but status is not completed, fix it
        if (order.approvalStatus === 'picked_up' && order.status !== 'completed') {
          await storage.updateOrderStatus(order.id, 'completed', tenantId);
          fixedCount++;
        }
      }
      
      res.json({ success: true, message: `Fixed ${fixedCount} order(s) with inconsistent status` });
    } catch (error) {
      console.error("Error syncing order statuses:", error);
      res.status(500).json({ message: "Failed to sync order statuses" });
    }
  });

  // Hide completed order from admin view (customer history persists)
  app.post("/api/admin/orders/:id/hide", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const orderId = parseInt(req.params.id);

      // Verify the order belongs to this tenant before mutating
      const orderToHide = await storage.getOrder(orderId, tenantId);
      if (!orderToHide) {
        return res.status(404).json({ message: "Order not found" });
      }

      await storage.hideOrderFromAdmin(orderId);
      
      res.json({ success: true, message: "Order hidden from admin view" });
    } catch (error) {
      console.error("Error hiding order:", error);
      res.status(500).json({ message: "Failed to hide order" });
    }
  });

  // Unhide a previously-hidden order (restores it to the admin view)
  app.post("/api/admin/orders/:id/unhide", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Access denied. Admin only." });
      const tenantId = req.tenantId;
      if (!tenantId) return res.status(400).json({ message: "Tenant context required." });
      const orderId = parseInt(req.params.id);
      const order = await storage.unhideOrderFromAdmin(orderId, tenantId);
      res.json({ success: true, order });
    } catch (error: any) {
      console.error("Error unhiding order:", error);
      res.status(error.message?.includes('not found') ? 404 : 500).json({ message: error.message || "Failed to unhide order" });
    }
  });

  // Apply discount to an order before approval
  app.post("/api/admin/orders/:id/discount", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const orderId = parseInt(req.params.id);
      const { discountAmount, discountReason } = req.body;
      
      const parsedDiscount = parseFloat(discountAmount);
      if (!discountAmount || !Number.isFinite(parsedDiscount) || parsedDiscount <= 0) {
        return res.status(400).json({ message: "Please enter a valid discount amount greater than $0." });
      }
      
      if (!discountReason || !discountReason.trim()) {
        return res.status(400).json({ message: "Please enter a reason for the discount." });
      }
      
      const order = await storage.getOrder(orderId, tenantId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      if (order.approvalStatus !== 'pending_approval') {
        return res.status(400).json({ message: "Discounts can only be applied to pending orders." });
      }
      
      const updated = await storage.applyOrderDiscount(orderId, discountAmount, discountReason.trim(), tenantId);
      
      console.log(`Discount applied to order #${orderId}: $${discountAmount} - "${discountReason}" by admin ${userId}`);
      
      res.json({ success: true, order: updated });
    } catch (error) {
      console.error("Error applying discount:", error);
      res.status(500).json({ message: "Failed to apply discount" });
    }
  });

  // Update order items (for editing before approval)
  app.put("/api/admin/orders/:id/items", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }
      
      const orderId = parseInt(req.params.id);
      const { items } = req.body;
      
      // Verify the order belongs to this tenant before mutating
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const orderToEdit = await storage.getOrder(orderId, tenantId);
      if (!orderToEdit) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Delete existing order items — safe because orderId ownership is verified above
      await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
      
      // Insert updated items and calculate new total
      let newTotal = 0;
      for (const item of items) {
        if (item.quantity > 0) {
          await db.insert(orderItems).values({
            orderId,
            supplyId: item.supplyId || null,
            petId: item.petId || null,
            quantity: item.quantity,
            price: item.price,
            productName: item.productName || item.itemName,
            category: item.category || 'uncategorized',
            tenantId,
          });
          newTotal += parseFloat(item.price) * item.quantity;
        }
      }
      
      // Recalculate totals (preserving any existing discount)
      const taxRate = orderToEdit.taxRate ? parseFloat(orderToEdit.taxRate) : 10.99;
      const taxAmount = (newTotal * taxRate / 100);
      const convenienceFee = parseFloat(orderToEdit.convenienceFee || "0");
      const loyaltyCredits = parseFloat(orderToEdit.loyaltyCreditsApplied || "0");
      const discount = parseFloat(orderToEdit.discountAmount || "0");
      const totalWithTax = Math.max(0, newTotal + taxAmount + convenienceFee - loyaltyCredits - discount);
      
      // Update order total — tenant-scoped predicate
      const orderWhere = tenantId ? and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)) : eq(orders.id, orderId);
      await db.update(orders)
        .set({ 
          subtotal: newTotal.toFixed(2),
          taxAmount: taxAmount.toFixed(2),
          totalAmount: totalWithTax.toFixed(2),
          updatedAt: new Date()
        })
        .where(orderWhere);
      
      res.json({ success: true, message: "Order items updated" });
    } catch (error) {
      console.error("Error updating order items:", error);
      res.status(500).json({ message: "Failed to update order items" });
    }
  });

  // Get all orders with items for admin
  // Return all appointments that were paid online via Stripe
  app.get("/api/admin/grooming-payments", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) return res.status(403).json({ message: "Access denied. Admin only." });

      const allAppts = await storage.getAppointments(undefined, (req as any).tenantId);
      const paid = allAppts
        .filter((a: any) => a.isPaid && a.paidOnline)
        .sort((a: any, b: any) => new Date(b.appointmentDate).getTime() - new Date(a.appointmentDate).getTime());

      // Enrich each appointment with the linked user's email if available
      const enriched = await Promise.all(paid.map(async (a: any) => {
        let email = (a as any).ownerEmail || null;
        if (!email && a.userId) {
          const u = await storage.getUser(a.userId);
          email = u?.email || null;
        }
        return { ...a, customerEmail: email };
      }));

      res.json(enriched);
    } catch (error) {
      console.error("Error fetching grooming payments:", error);
      res.status(500).json({ message: "Failed to fetch grooming payments" });
    }
  });

  app.get("/api/admin/orders-with-items", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }
      
      const orders = await storage.getAllOrdersWithItems((req as any).tenantId);
      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders with items:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // Search orders by customer name
  app.get("/api/admin/orders/search", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }
      
      const { q } = req.query;
      if (!q || typeof q !== 'string') {
        return res.status(400).json({ message: "Search query is required" });
      }
      
      const orders = await storage.searchOrders(q, (req as any).tenantId);
      res.json(orders);
    } catch (error) {
      console.error("Error searching orders:", error);
      res.status(500).json({ message: "Failed to search orders" });
    }
  });

  // Refund routes
  app.get("/api/admin/refunds", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }
      
      const { startDate, endDate } = req.query;
      
      if (startDate && endDate) {
        const refunds = await storage.getRefundsByDateRange(new Date(startDate as string), new Date(endDate as string), (req as any).tenantId);
        res.json(refunds);
      } else {
        const refunds = await storage.getRefunds((req as any).tenantId);
        res.json(refunds);
      }
    } catch (error) {
      console.error("Error fetching refunds:", error);
      res.status(500).json({ message: "Failed to fetch refunds" });
    }
  });

  app.post("/api/admin/refunds", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const { orderId, items, reason, notes, refundType, includeConvenienceFee } = req.body;
      
      // Support both batch format (items array) and legacy single-item format
      const refundItems: Array<{ orderItemId: number; quantity: number; subtotal: string; tax: string; total: string }> = items || [];
      
      // Legacy single-item support
      if (!items && req.body.orderItemId) {
        const subtotal = req.body.subtotal || req.body.amount || "0";
        const tax = req.body.tax || "0";
        const total = req.body.total || req.body.amount || subtotal;
        refundItems.push({
          orderItemId: req.body.orderItemId,
          quantity: req.body.quantity || 1,
          subtotal,
          tax,
          total,
        });
      }
      
      if (!orderId || refundItems.length === 0) {
        return res.status(400).json({ message: "Order ID and refund items are required" });
      }
      
      // Calculate total refund amount across all items
      const itemsRefundAmount = refundItems.reduce((sum, item) => sum + parseFloat(item.total), 0);
      const totalSubtotalRefund = refundItems.reduce((sum, item) => sum + parseFloat(item.subtotal), 0);
      const totalTaxRefund = refundItems.reduce((sum, item) => sum + parseFloat(item.tax), 0);
      // Look up the order to derive convenience fee and find Stripe payment intent
      const order = await storage.getOrder(orderId, (req as any).tenantId);
      // Derive convenience fee from order record (never trust client-provided amounts)
      const convFeeRefund = includeConvenienceFee && order?.convenienceFee ? parseFloat(order.convenienceFee) : 0;
      let totalRefundAmount = itemsRefundAmount + convFeeRefund;
      
      // Safety cap: never refund more than the order total minus already-refunded amounts
      if (order) {
        const orderTotal = parseFloat(order.totalAmount);
        const existingRefundsForCap = await storage.getRefundsByOrderId(orderId);
        const previouslyRefundedAmount = existingRefundsForCap.reduce((sum, r) => sum + parseFloat(r.totalRefunded || "0"), 0);
        const maxAllowedRefund = Math.max(0, orderTotal - previouslyRefundedAmount);
        if (totalRefundAmount > maxAllowedRefund) {
          console.warn(`[REFUND] Capping refund from $${totalRefundAmount.toFixed(2)} to $${maxAllowedRefund.toFixed(2)} (order total: $${orderTotal.toFixed(2)}, already refunded: $${previouslyRefundedAmount.toFixed(2)})`);
          totalRefundAmount = maxAllowedRefund;
        }
      }
      
      let stripeRefundId = null;
      let stripeRefundError = null;
      
      // Process ONE Stripe refund for the total amount (not per-item)
      if (order?.stripePaymentIntentId && order?.paymentStatus === 'paid') {
        try {
          const { getUncachableStripeClient } = await import('./stripeClient');
          const stripe = await getUncachableStripeClient();
          
          const refundAmountCents = Math.round(totalRefundAmount * 100);
          
          if (refundAmountCents > 0) {
            const stripeRefund = await stripe.refunds.create({
              payment_intent: order.stripePaymentIntentId,
              amount: refundAmountCents,
              reason: 'requested_by_customer',
              metadata: {
                orderId: orderId.toString(),
                reason: reason || 'Customer request',
                itemCount: refundItems.length.toString(),
                ...(convFeeRefund > 0 ? { convenienceFeeRefunded: convFeeRefund.toFixed(2) } : {}),
              },
            });
            
            stripeRefundId = stripeRefund.id;
            console.log(`Stripe refund processed for Order #${orderId}: ${stripeRefundId}, amount: $${totalRefundAmount.toFixed(2)} (${refundItems.length} items)`);
            
            // Check if total refunded (including previous refunds) covers the full order
            const existingRefunds = await storage.getRefundsByOrderId(orderId);
            const previouslyRefunded = existingRefunds.reduce((sum, r) => sum + parseFloat(r.totalRefunded || "0"), 0);
            const allTimeRefunded = previouslyRefunded + totalRefundAmount;
            
            if (allTimeRefunded >= parseFloat(order.totalAmount)) {
              await storage.updateOrderStripePayment(orderId, {
                paymentStatus: 'refunded',
              });
              await storage.updateOrderStatus(orderId, 'refunded', tenantId);
            }
          }
        } catch (stripeError: any) {
          console.error("Stripe refund failed:", stripeError);
          stripeRefundError = stripeError.message;
        }
      }
      
      // Create refund records for each item with correct schema fields
      const createdRefunds = [];
      for (const item of refundItems) {
        const reasonWithStripeInfo = stripeRefundId 
          ? `${reason || 'Customer request'} | Stripe Refund: ${stripeRefundId}${notes ? ' | Notes: ' + notes : ''}`
          : stripeRefundError 
            ? `${reason || 'Customer request'} | Stripe refund failed: ${stripeRefundError}${notes ? ' | Notes: ' + notes : ''}`
            : `${reason || 'Customer request'}${notes ? ' | Notes: ' + notes : ''}`;
        
        const refund = await storage.createRefund({
          orderId,
          orderItemId: item.orderItemId,
          quantity: item.quantity,
          subtotalRefunded: item.subtotal,
          taxRefunded: item.tax,
          totalRefunded: item.total,
          reason: reasonWithStripeInfo,
          refundType: refundType || 'partial',
          processedBy: userId,
        });
        
        // Update order item refund tracking
        if (item.orderItemId && item.quantity) {
          await storage.updateOrderItemRefund(item.orderItemId, item.quantity, item.total, tenantId);
        }
        
        createdRefunds.push(refund);
      }
      
      // Deduct refunded subtotal from loyalty rewards (only the product cost, not fees/tax)
      if (order?.userId && totalSubtotalRefund > 0) {
        try {
          const loyaltyResult = await storage.addToUserTotalSpent(order.userId, -totalSubtotalRefund);
          console.log(`[LOYALTY] Deducted $${totalSubtotalRefund.toFixed(2)} from user ${order.userId} total spent due to refund on Order #${orderId}`);
        } catch (loyaltyError) {
          console.error("Failed to update loyalty for refund:", loyaltyError);
        }
      }
      
      // Reverse Astro Loyalty purchase sync for refunded items
      let astroReversalResult: { voided: number; pointsDeducted: boolean; errors: string[] } | null = null;
      if (order?.userId) {
        try {
          const astroCustomer = await storage.getAstroCustomerByUserId(order.userId);
          if (astroCustomer) {
            const { voidTransaction } = await import('./astroLoyalty');
            const internalId = `animalhouse-${order.userId}`;
            const reversalErrors: string[] = [];
            let voidedCount = 0;
            
            // Check if order had Astro rewards applied (free bag items)
            let rewardedSupplyIds = new Set<number>();
            if (order?.discountReason?.startsWith('Astro Loyalty Reward:')) {
              try {
                const jsonStr = order.discountReason.replace('Astro Loyalty Reward: ', '');
                const rewardInfo = JSON.parse(jsonStr);
                if (rewardInfo.appliedRewards) {
                  for (const ar of rewardInfo.appliedRewards) {
                    if (ar.supplyId) rewardedSupplyIds.add(ar.supplyId);
                  }
                }
              } catch (e) {}
            }
            
            // Get order items to find supply IDs for transaction voiding
            const orderWithItems = await storage.getOrderWithItems(orderId, (req as any).tenantId);
            if (orderWithItems) {
              const refundedItemIds = new Set(refundItems.map(ri => ri.orderItemId));
              
              for (const orderItem of orderWithItems.items) {
                if (!refundedItemIds.has(orderItem.id)) continue;
                if (!orderItem.supplyId) continue;
                
                // Skip voiding for items that were covered by Astro rewards (they were never synced)
                if (rewardedSupplyIds.has(orderItem.supplyId)) {
                  console.log(`[ASTRO] Skipping void for supply #${orderItem.supplyId} (was covered by Astro reward, never synced)`);
                  continue;
                }
                
                // Transaction IDs follow the pattern: orderId-supplyId
                const txId = `${orderId}-${orderItem.supplyId}`;
                try {
                  const voided = await voidTransaction(
                    astroCustomer.astroCustomerId,
                    txId,
                    internalId
                  );
                  if (voided) {
                    voidedCount++;
                    console.log(`[ASTRO] Voided transaction ${txId} for refund on Order #${orderId}`);
                  } else {
                    reversalErrors.push(`Failed to void transaction ${txId}`);
                  }
                } catch (voidError: any) {
                  console.warn(`[ASTRO] Could not void transaction ${txId}:`, voidError.message);
                  reversalErrors.push(`Void failed for ${txId}: ${voidError.message}`);
                }
              }
            }
            
            astroReversalResult = { voided: voidedCount, errors: reversalErrors } as any;
            if (voidedCount > 0) {
              console.log(`[ASTRO] Refund reversal for Order #${orderId}: ${voidedCount} transactions voided`);
            }
          }
        } catch (astroError) {
          console.error("[ASTRO] Failed to reverse purchase on refund:", astroError);
        }
      }
      
      res.json({ 
        refunds: createdRefunds,
        stripeRefundId,
        stripeRefundError,
        paymentRefunded: !!stripeRefundId,
        totalRefunded: totalRefundAmount.toFixed(2),
        astroReversalResult,
      });
    } catch (error) {
      console.error("Error creating refund:", error);
      res.status(500).json({ message: "Failed to create refund" });
    }
  });

  app.get("/api/admin/refunds/order/:orderId", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }
      
      const orderId = parseInt(req.params.orderId);
      const refunds = await storage.getRefundsByOrderId(orderId);
      res.json(refunds);
    } catch (error) {
      console.error("Error fetching order refunds:", error);
      res.status(500).json({ message: "Failed to fetch refunds" });
    }
  });

  // Refund report email settings
  app.get("/api/admin/refund-report-emails", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }
      
      const emails = await storage.getRefundReportEmails((req as any).tenantId);
      res.json(emails);
    } catch (error) {
      console.error("Error fetching refund report emails:", error);
      res.status(500).json({ message: "Failed to fetch emails" });
    }
  });

  app.post("/api/admin/refund-report-emails", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }
      
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const setting = await storage.addRefundReportEmail(email, tenantId);
      res.json(setting);
    } catch (error) {
      console.error("Error adding refund report email:", error);
      res.status(500).json({ message: "Failed to add email" });
    }
  });

  app.delete("/api/admin/refund-report-emails/:id", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const id = parseInt(req.params.id);
      await storage.removeRefundReportEmail(id, tenantId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing refund report email:", error);
      res.status(500).json({ message: "Failed to remove email" });
    }
  });

  // Wishlist routes
  app.get("/api/wishlist", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const wishlistItems = await storage.getWishlistItems(userId);
      res.json(wishlistItems);
    } catch (error) {
      console.error("Error fetching wishlist:", error);
      res.status(500).json({ message: "Failed to fetch wishlist" });
    }
  });

  app.post("/api/wishlist", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { supplyId, petId } = req.body;
      
      if (!supplyId && !petId) {
        return res.status(400).json({ message: "Either supplyId or petId is required" });
      }
      
      const wishlistItem = await storage.addToWishlist({ userId, supplyId, petId });
      res.json(wishlistItem);
    } catch (error) {
      console.error("Error adding to wishlist:", error);
      res.status(500).json({ message: "Failed to add to wishlist" });
    }
  });

  app.delete("/api/wishlist/:id", authMiddleware, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user?.id;
      
      const removed = await storage.removeFromWishlist(id, userId);
      
      if (!removed) {
        return res.status(404).json({ message: "Wishlist item not found or access denied" });
      }
      
      res.json({ message: "Item removed from wishlist" });
    } catch (error) {
      console.error("Error removing from wishlist:", error);
      res.status(500).json({ message: "Failed to remove from wishlist" });
    }
  });

  // Appointment routes
  app.get("/api/appointments", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);

      // Stranded users (no tenant assigned) must not receive appointments from any store.
      // Without a tenantId the admin/groomer branch would call getAppointments(undefined, undefined)
      // which returns ALL appointments across all tenants — explicitly block that here.
      if (!req.tenantId) {
        return res.json([]);
      }
      
      // For regular customers: auto-link any phone-booked appointments so they show up by userId
      if (user && !user.isAdmin && !user.isGroomer && user.phoneNumber && (req as any).tenantId) {
        await storage.linkAppointmentsToUser(user.phoneNumber, userId, (req as any).tenantId);
      }

      // Both admins and groomers can see all appointments
      const appointments = (user?.isAdmin || user?.isGroomer)
        ? await storage.getAppointments(undefined, (req as any).tenantId)
        : await storage.getAppointments(userId, (req as any).tenantId);
      
      // Filter out old approved/completed/cancelled/rejected appointments (older than 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const filteredAppointments = appointments.filter((apt: any) => {
        // Keep all scheduled appointments regardless of isApproved value
        if (apt.status === 'scheduled') {
          return true;
        }
        
        // For confirmed, completed, cancelled, or rejected appointments: only keep recent ones (within 30 days)
        if (apt.status === 'confirmed' || apt.status === 'completed' || apt.status === 'cancelled' || apt.status === 'rejected') {
          const appointmentDate = new Date(apt.appointmentDate);
          return appointmentDate >= thirtyDaysAgo;
        }
        
        // Keep all other appointments
        return true;
      });
      
      // Enrich appointments with pets data using bulk query to avoid N+1
      const appointmentIds = filteredAppointments.map((apt: any) => apt.id);
      const petsByAppointmentId = await storage.getAppointmentPetsByAppointmentIds(appointmentIds);
      
      // Get all contacts for looking up notes by phone number
      // Index contacts by all their phone numbers (supports comma-separated)
      const allContacts = await storage.getAllContacts((req as any).tenantId);
      const contactsByPhone = new Map<string, any>();
      for (const contact of allContacts) {
        if (contact.phoneNumber) {
          // Split by comma to handle multiple phone numbers
          const phoneNumbers = contact.phoneNumber.split(',').map((p: string) => p.trim());
          for (const phone of phoneNumbers) {
            const normalizedPhone = phone.replace(/\D/g, '');
            if (normalizedPhone.length >= 10) {
              contactsByPhone.set(normalizedPhone, contact);
            }
          }
        }
      }
      
      // Fetch all items for these appointments in one bulk query
      const allItems = await storage.getAppointmentItemsBulk(appointmentIds);
      const itemsByApptId = new Map<number, any[]>();
      for (const item of allItems) {
        if (!itemsByApptId.has(item.appointmentId)) itemsByApptId.set(item.appointmentId, []);
        itemsByApptId.get(item.appointmentId)!.push(item);
      }

      const appointmentsWithPets = filteredAppointments.map((apt: any) => {
        let pets = petsByAppointmentId.get(apt.id);
        
        // Backfill pets array from main appointment record for legacy single-pet appointments
        if (!pets || pets.length === 0) {
          if (apt.petName && apt.petType) {
            pets = [{
              appointmentId: apt.id,
              petName: apt.petName,
              petType: apt.petType,
              serviceType: apt.serviceType,
              price: apt.price,
              specialNotes: apt.specialNotes
            }];
          } else {
            pets = [];
          }
        }
        
        // Look up contact notes by phone number (supports multiple comma-separated numbers)
        let contactNotes = null;
        if (apt.ownerPhoneNumber) {
          // Split by comma and check each phone number
          const phoneNumbers = apt.ownerPhoneNumber.split(',').map((p: string) => p.trim());
          for (const phone of phoneNumbers) {
            const normalizedPhone = phone.replace(/\D/g, '');
            const contact = contactsByPhone.get(normalizedPhone);
            if (contact?.notes) {
              contactNotes = contact.notes;
              break; // Use first matching contact's notes
            }
          }
        }

        const items = itemsByApptId.get(apt.id) || [];
        const itemsTotal = items.reduce((sum: number, it: any) => sum + parseFloat(it.price) * it.quantity, 0);
        
        return {
          ...apt,
          pets,
          contactNotes,
          items,
          itemsTotal: itemsTotal > 0 ? itemsTotal.toFixed(2) : null,
        };
      });
      
      res.json(appointmentsWithPets);
    } catch (error) {
      console.error("Error fetching appointments:", error);
      res.status(500).json({ message: "Failed to fetch appointments" });
    }
  });

  // Get available appointment slots for a date range (public endpoint for calendar display)
  app.get("/api/appointments/available-slots", async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "startDate and endDate query parameters are required" });
      }
      
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ message: "Invalid date format" });
      }
      
      // Get all weekly limits
      const weeklyLimits = await storage.getAllWeeklyAppointmentLimits((req as any).tenantId);
      const limitsByDay = new Map<number, { bathLimit: number; groomLimit: number }>();
      for (const limit of weeklyLimits) {
        limitsByDay.set(limit.dayOfWeek, {
          bathLimit: limit.maxBathAppointments,
          groomLimit: limit.maxGroomAppointments
        });
      }
      
      // Get all appointments that consume capacity (not cancelled or rejected)
      const allAppointments = await storage.getAppointments(undefined, (req as any).tenantId);
      const activeAppointments = allAppointments.filter((apt: any) => 
        apt.status !== 'cancelled' && apt.status !== 'rejected' && apt.appointmentDate
      );
      
      // Count booked slots per date
      const bookedByDate = new Map<string, { bathCount: number; groomCount: number }>();
      
      for (const apt of activeAppointments) {
        // Handle both string and Date types for appointmentDate
        const aptDateRaw = apt.appointmentDate;
        const dateStr = typeof aptDateRaw === 'string' 
          ? aptDateRaw.split('T')[0] 
          : aptDateRaw.toISOString().split('T')[0];
        const aptDate = new Date(dateStr);
        
        if (aptDate >= start && aptDate <= end) {
          // Get pets for this appointment to count services
          const pets = await storage.getAppointmentPets(apt.id);
          let bathCount = 0;
          let groomCount = 0;
          
          for (const pet of pets) {
            // Use substring matching like the rest of the capacity logic
            const serviceType = (pet.serviceType || '').toLowerCase();
            if (serviceType.includes('bath')) {
              bathCount++;
            } else if (serviceType.includes('full') || (serviceType.includes('groom') && !serviceType.includes('bath'))) {
              groomCount++;
            }
          }
          
          const existing = bookedByDate.get(dateStr) || { bathCount: 0, groomCount: 0 };
          bookedByDate.set(dateStr, {
            bathCount: existing.bathCount + bathCount,
            groomCount: existing.groomCount + groomCount
          });
        }
      }
      
      // Build response with available slots for each date
      const availableSlots: Record<string, { bathAvailable: number; groomAvailable: number; totalAvailable: number; isOpen: boolean }> = {};
      
      const currentDate = new Date(start);
      while (currentDate <= end) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const dayOfWeek = currentDate.getDay();
        
        const limits = limitsByDay.get(dayOfWeek);
        const booked = bookedByDate.get(dateStr) || { bathCount: 0, groomCount: 0 };
        
        if (limits) {
          const bathAvailable = Math.max(0, limits.bathLimit - booked.bathCount);
          const groomAvailable = Math.max(0, limits.groomLimit - booked.groomCount);
          
          availableSlots[dateStr] = {
            bathAvailable,
            groomAvailable,
            totalAvailable: bathAvailable + groomAvailable,
            isOpen: bathAvailable > 0 || groomAvailable > 0
          };
        } else {
          // No limits set for this day = unlimited (treat as open, no cap applied)
          availableSlots[dateStr] = {
            bathAvailable: -1,
            groomAvailable: -1,
            totalAvailable: -1,
            isOpen: true
          };
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      res.json(availableSlots);
    } catch (error) {
      console.error("Error fetching available slots:", error);
      res.status(500).json({ message: "Failed to fetch available slots" });
    }
  });

  // Get single appointment with pets (for editing)
  app.get("/api/appointments/:id", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const appointmentId = parseInt(req.params.id);
      const user = await storage.getUser(userId);
      
      const appointment = await storage.getAppointment(appointmentId, (req as any).tenantId);
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }
      
      // Check access: admin/groomer can see all, customer can only see their own
      if (!user?.isAdmin && !user?.isGroomer && appointment.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Fetch appointment_pets
      const pets = await storage.getAppointmentPets(appointmentId);
      
      // Return appointment with pets array
      res.json({
        ...appointment,
        pets: pets.length > 0 ? pets : undefined
      });
    } catch (error) {
      console.error("Error fetching appointment:", error);
      res.status(500).json({ message: "Failed to fetch appointment" });
    }
  });

  // Get unapproved appointments (admin and groomer access)
  app.get("/api/admin/appointments/unapproved", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const unapprovedAppointments = await storage.getUnapprovedAppointments((req as any).tenantId);
      res.json(unapprovedAppointments);
    } catch (error) {
      console.error("Error fetching unapproved appointments:", error);
      res.status(500).json({ message: "Failed to fetch unapproved appointments" });
    }
  });

  // Approve an appointment (admin only)
  app.put("/api/admin/appointments/:id/approve", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      
      // Get appointment to check capacity before approving
      const appointmentToApprove = await storage.getAppointment(id, (req as any).tenantId);
      if (!appointmentToApprove) {
        return res.status(404).json({ message: "Appointment not found" });
      }
      
      // CAPACITY CHECK: Ensure we don't exceed limits when approving
      const { getLocalDayOfWeek } = await import('./scheduler');
      // Parse date string as noon local time to avoid UTC midnight shifting day backward in CST
      const rawApproveDate = String(appointmentToApprove.appointmentDate).split('T')[0];
      const appointmentDateStr = rawApproveDate;
      const [aYear, aMon, aDay] = rawApproveDate.split('-').map(Number);
      const appointmentDateLocal = new Date(aYear, aMon - 1, aDay, 12, 0, 0);
      const dayOfWeek = getLocalDayOfWeek(appointmentDateLocal);
      
      // Get appointment pets to count service types
      const appointmentPets = await storage.getAppointmentPets(id);
      
      // Check weekly limits for Monday-Saturday (1-6)
      if (dayOfWeek >= 1 && dayOfWeek <= 6) {
        const weeklyLimit = await storage.getWeeklyAppointmentLimit(dayOfWeek, (req as any).tenantId);
        
        if (weeklyLimit) {
          // Count existing appointments on this date (excluding cancelled/rejected and THIS appointment)
          const allAppointments = await storage.getAppointments(undefined, (req as any).tenantId);
          const appointmentsOnDate = allAppointments.filter((apt: any) => {
            const aptDateStr = new Date(apt.appointmentDate).toISOString().split('T')[0];
            return aptDateStr === appointmentDateStr && 
                   apt.id !== id && // Exclude the appointment being approved
                   apt.status !== 'cancelled' && 
                   apt.status !== 'rejected';
          });
          
          // Count existing dogs by service type
          let bathDogs = 0;
          let groomDogs = 0;
          
          for (const apt of appointmentsOnDate) {
            const aptPets = await storage.getAppointmentPets(apt.id);
            if (aptPets && aptPets.length > 0) {
              for (const p of aptPets) {
                const serviceType = (p.serviceType || '').toLowerCase();
                if (serviceType.includes('bath')) {
                  bathDogs++;
                } else if (serviceType.includes('full') || serviceType.includes('groom')) {
                  groomDogs++;
                }
              }
            } else {
              const serviceType = (apt.serviceType || '').toLowerCase();
              if (serviceType.includes('bath')) {
                bathDogs++;
              } else if (serviceType.includes('full') || serviceType.includes('groom')) {
                groomDogs++;
              }
            }
          }
          
          // Count pets in the appointment being approved
          let requestedBaths = 0;
          let requestedGrooms = 0;
          
          if (appointmentPets && appointmentPets.length > 0) {
            for (const p of appointmentPets) {
              const serviceType = (p.serviceType || '').toLowerCase();
              if (serviceType.includes('bath')) {
                requestedBaths++;
              } else if (serviceType.includes('full') || serviceType.includes('groom')) {
                requestedGrooms++;
              }
            }
          } else {
            const serviceType = (appointmentToApprove.serviceType || '').toLowerCase();
            if (serviceType.includes('bath')) {
              requestedBaths++;
            } else if (serviceType.includes('full') || serviceType.includes('groom')) {
              requestedGrooms++;
            }
          }
          
          // HARD LIMIT: Cannot approve if it would exceed capacity
          // Bath and full groom are separate, independent capacities - only check the one(s) actually being requested
          if (requestedBaths > 0 && bathDogs + requestedBaths > weeklyLimit.maxBathAppointments) {
            return res.status(400).json({
              message: `Cannot approve: Bath grooming capacity is full for this date (limit: ${weeklyLimit.maxBathAppointments} dogs, ${bathDogs} already booked). Please reject this appointment or move it to a different date.`
            });
          }
          
          if (requestedGrooms > 0 && groomDogs + requestedGrooms > weeklyLimit.maxGroomAppointments) {
            return res.status(400).json({
              message: `Cannot approve: Full grooming capacity is full for this date (limit: ${weeklyLimit.maxGroomAppointments} dogs, ${groomDogs} already booked). Please reject this appointment or move it to a different date.`
            });
          }
        }
      }

      const appointment = await storage.approveAppointment(id);
      
      res.json(appointment);
    } catch (error) {
      console.error("Error approving appointment:", error);
      res.status(500).json({ message: "Failed to approve appointment" });
    }
  });

  // Reject an appointment (admin only)
  app.put("/api/admin/appointments/:id/reject", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      const appointment = await storage.getAppointment(id, (req as any).tenantId);
      
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      // Reject the appointment in the database
      const rejectedAppointment = await storage.rejectAppointment(id);
      
      // Get the user's email to send rejection notification
      const customer = await storage.getUser(appointment.userId);
      if (customer?.email) {
        try {
          // Use sendgrid.ts (same as password reset - uses connector)
          const { sendAppointmentRejectionEmail } = await import('./sendgrid');
          const ownerName = appointment.ownerFirstName 
            ? `${appointment.ownerFirstName} ${appointment.ownerLastName}`
            : appointment.ownerLastName;
          
          await sendAppointmentRejectionEmail(
            customer.email,
            ownerName,
            appointment.petName,
            new Date(appointment.appointmentDate).toLocaleDateString(),
            appointment.appointmentTime
          );
          console.log(`Rejection email sent successfully to ${customer.email} for appointment #${id}`);
        } catch (emailError) {
          console.error(`Failed to send rejection email for appointment #${id}:`, emailError);
          // Don't fail the rejection if email fails
        }
      } else {
        console.warn(`No customer email found for appointment #${id} (userId: ${appointment.userId})`);
      }
      
      res.json(rejectedAppointment);
    } catch (error) {
      console.error("Error rejecting appointment:", error);
      res.status(500).json({ message: "Failed to reject appointment" });
    }
  });

  // Retry sending rejection email for an appointment (admin only)
  app.post("/api/admin/appointments/:id/resend-rejection-email", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      const appointment = await storage.getAppointment(id, (req as any).tenantId);
      
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      // Get the user's email
      const customer = await storage.getUser(appointment.userId);
      if (!customer?.email) {
        return res.status(400).json({ message: "No customer email found for this appointment" });
      }

      // Use sendgrid.ts (same as password reset - uses connector)
      const { sendAppointmentRejectionEmail } = await import('./sendgrid');
      const ownerName = appointment.ownerFirstName 
        ? `${appointment.ownerFirstName} ${appointment.ownerLastName}`
        : appointment.ownerLastName;
      
      await sendAppointmentRejectionEmail(
        customer.email,
        ownerName,
        appointment.petName,
        new Date(appointment.appointmentDate).toLocaleDateString(),
        appointment.appointmentTime
      );
      
      console.log(`Rejection email resent successfully to ${customer.email} for appointment #${id}`);
      res.json({ message: "Rejection email sent successfully", email: customer.email });
    } catch (error) {
      console.error("Error resending rejection email:", error);
      res.status(500).json({ message: "Failed to send rejection email", error: (error as Error).message });
    }
  });

  // Delete an appointment (admin only)
  app.delete("/api/admin/appointments/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const id = parseInt(req.params.id);
      await storage.deleteAppointment(id, tenantId);
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting appointment:", error);
      res.status(500).json({ message: "Failed to delete appointment" });
    }
  });

  // Update appointment details with multi-pet support (admin and groomer)
  app.patch("/api/admin/appointments/:id/details", authMiddleware, async (req: any, res) => {
    console.log(`[EDIT DEBUG] ===== PATCH /api/admin/appointments/${req.params.id}/details CALLED =====`);
    console.log(`[EDIT DEBUG] Request body keys: ${Object.keys(req.body).join(', ')}`);
    try {
      const user = await storage.getUser(req.user?.id);
      console.log(`[EDIT DEBUG] User: ${user?.email}, isAdmin: ${user?.isAdmin}, isGroomer: ${user?.isGroomer}`);
      if (!user?.isAdmin && !user?.isGroomer) {
        console.log(`[EDIT DEBUG] Access denied - not admin or groomer`);
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const id = parseInt(req.params.id);
      const { ownerFirstName: rawOwnerFirst, ownerLastName: rawOwnerLast, ownerPhoneNumber, pets, pricingMode, price, appointmentDate, appointmentTime } = req.body;
      const ownerFirstName = rawOwnerFirst ? cleanName(rawOwnerFirst) : rawOwnerFirst;
      const ownerLastName = rawOwnerLast ? cleanName(rawOwnerLast) : rawOwnerLast;
      console.log(`[EDIT DEBUG] Editing appointment ${id}, appointmentDate: ${appointmentDate}`);

      // VALIDATION: Ensure pets array has at least one pet if provided
      if (pets !== undefined) {
        if (!Array.isArray(pets) || pets.length === 0) {
          return res.status(400).json({ message: "At least one pet is required" });
        }
        
        // Validate each pet has required fields
        for (const pet of pets) {
          if (!pet.petName || !pet.petType || !pet.serviceType) {
            return res.status(400).json({ message: "Each pet must have name, type, and service" });
          }
        }
      }

      console.log(`Updating appointment ${id} - Pets: ${pets?.length || 0}, Pricing Mode: ${pricingMode}`);

      // Get the current appointment
      const currentAppointment = await storage.getAppointment(id, (req as any).tenantId);
      if (!currentAppointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      // Validate price if provided
      if (price !== undefined) {
        const priceNum = parseFloat(price);
        if (isNaN(priceNum) || priceNum < 0) {
          return res.status(400).json({ message: "Price must be a valid positive number" });
        }
      }

      // ONLY CHECK CAPACITY when date or services are ACTUALLY changing
      // If just editing owner info, notes, price, time - skip capacity check
      const { serviceType } = req.body; // Get serviceType from request body for inline edits
      
      // Check if date is actually changing (not just present in request)
      const currentDateStr = new Date(currentAppointment.appointmentDate).toISOString().split('T')[0];
      const newDateStr = appointmentDate ? new Date(appointmentDate).toISOString().split('T')[0] : currentDateStr;
      const isDateChanging = newDateStr !== currentDateStr;
      
      // Check if services are actually changing (compare old vs new)
      let isServiceChanging = serviceType !== undefined; // Inline edit always means service change
      if (pets !== undefined && !isServiceChanging) {
        // Full edit dialog - check if services actually changed
        const existingPets = await storage.getAppointmentPets(id);
        if (existingPets && existingPets.length > 0) {
          // Compare service types - only count as change if different
          const oldServices = existingPets.map((p: any) => (p.serviceType || '').toLowerCase()).sort().join(',');
          const newServices = pets.map((p: any) => (p.serviceType || '').toLowerCase()).sort().join(',');
          isServiceChanging = oldServices !== newServices || existingPets.length !== pets.length;
        } else {
          // Legacy single-pet - compare with appointment's serviceType
          const oldService = (currentAppointment.serviceType || '').toLowerCase();
          const newService = pets.length > 0 ? (pets[0].serviceType || '').toLowerCase() : '';
          isServiceChanging = oldService !== newService || pets.length !== 1;
        }
      }
      
      const needsCapacityCheck = isDateChanging || isServiceChanging;
      
      console.log(`[EDIT DEBUG] needsCapacityCheck=${needsCapacityCheck} (dateChanging=${isDateChanging}, serviceChanging=${isServiceChanging})`);
      
      // Use new date if provided, otherwise use current
      // Parse as noon local time to avoid UTC midnight shifting Saturday→Friday in CST
      const rawEditDateStr = appointmentDate
        ? String(appointmentDate).split('T')[0]
        : String(currentAppointment.appointmentDate).split('T')[0];
      const [eYear, eMon, eDay] = rawEditDateStr.split('-').map(Number);
      const dateToCheck = new Date(eYear, eMon - 1, eDay, 12, 0, 0);
      // Use stored date for matching (consistent with SQL atomic check)
      const { getLocalDayOfWeek } = await import('./scheduler');
      const appointmentDateStr = rawEditDateStr;
      const dayOfWeek = getLocalDayOfWeek(dateToCheck);
      
      // Get the pets/services that will be in this appointment after the update
      let finalPets;
      if (pets !== undefined) {
        // Using new pets array from full edit dialog
        finalPets = pets;
      } else if (serviceType !== undefined) {
        // Inline edit: serviceType changed directly without pets array
        // Use the new serviceType for capacity check
        finalPets = [{
          serviceType: serviceType,
          petName: currentAppointment.petName,
          petType: currentAppointment.petType
        }];
      } else {
        // No service change - use existing pets/service
        const existingPets = await storage.getAppointmentPets(id);
        if (existingPets && existingPets.length > 0) {
          finalPets = existingPets;
        } else {
          // Legacy single-pet appointment
          finalPets = [{
            serviceType: currentAppointment.serviceType
          }];
        }
      }
      
      // Only check capacity if date or services are changing
      // Skip capacity check for edits that don't affect capacity (owner info, notes, price, time, groomer)
      if (needsCapacityCheck && dayOfWeek >= 1 && dayOfWeek <= 6) {
        console.log(`[EDIT DEBUG] ===== CAPACITY CHECK =====`);
        console.log(`[EDIT DEBUG] dayOfWeek=${dayOfWeek}, dateStr=${appointmentDateStr}, appointmentId=${id}`);
        console.log(`[EDIT DEBUG] finalPets count: ${finalPets?.length}, services: ${finalPets?.map((p: any) => p.serviceType).join(', ')}`);
        const weeklyLimit = await storage.getWeeklyAppointmentLimit(dayOfWeek, (req as any).tenantId);
        console.log(`[EDIT DEBUG] Weekly limit for day ${dayOfWeek}:`, JSON.stringify(weeklyLimit));
        
        if (weeklyLimit) {
          // Count existing appointments on the target date (excluding this one and cancelled/rejected)
          const allAppointments = await storage.getAppointments(undefined, (req as any).tenantId);
          const appointmentsOnDate = allAppointments.filter((apt: any) => {
            // Use stored date for matching (consistent with SQL atomic check)
            const aptDateStr = new Date(apt.appointmentDate).toISOString().split('T')[0];
            return aptDateStr === appointmentDateStr && 
                   apt.id !== id && // Exclude current appointment being updated
                   apt.status !== 'cancelled' && 
                   apt.status !== 'rejected';
          });
          console.log(`[EDIT DEBUG] Appointments on ${appointmentDateStr} (excluding id=${id}): ${appointmentsOnDate.length}`);
          
          // Count existing dogs by service type with substring matching
          let bathDogs = 0;
          let groomDogs = 0;
          
          for (const apt of appointmentsOnDate) {
            const aptPets = await storage.getAppointmentPets(apt.id);
            if (aptPets && aptPets.length > 0) {
              for (const p of aptPets) {
                const svcType = (p.serviceType || '').toLowerCase();
                if (svcType.includes('bath')) {
                  bathDogs++;
                } else if (svcType.includes('full') || svcType.includes('groom')) {
                  groomDogs++;
                }
              }
            } else {
              // Legacy single-pet with substring matching
              const svcType = (apt.serviceType || '').toLowerCase();
              if (svcType.includes('bath')) {
                bathDogs++;
              } else if (svcType.includes('full') || svcType.includes('groom')) {
                groomDogs++;
              }
            }
          }
          
          // Count dogs in the updated appointment with substring matching
          let requestedBaths = 0;
          let requestedGrooms = 0;
          for (const p of finalPets) {
            const svcType = (p.serviceType || '').toLowerCase();
            if (svcType.includes('bath')) {
              requestedBaths++;
            } else if (svcType.includes('full') || svcType.includes('groom')) {
              requestedGrooms++;
            }
          }
          
          // Log final counts before capacity check
          console.log(`[EDIT DEBUG] Capacity counts - bathDogs=${bathDogs}, groomDogs=${groomDogs}, requestedBaths=${requestedBaths}, requestedGrooms=${requestedGrooms}`);
          console.log(`[EDIT DEBUG] Limits - maxBath=${weeklyLimit.maxBathAppointments}, maxGroom=${weeklyLimit.maxGroomAppointments}`);
          
          // Check if update would exceed capacity
          // Bath and full groom are separate, independent capacities - only check the one(s) actually being requested
          if (requestedBaths > 0 && bathDogs + requestedBaths > weeklyLimit.maxBathAppointments) {
            console.log(`[EDIT DEBUG] *** CAPACITY BLOCKED - BATH: ${bathDogs + requestedBaths} > ${weeklyLimit.maxBathAppointments} ***`);
            return res.status(400).json({
              message: `Cannot update: Bath grooming capacity would be exceeded for this date (limit: ${weeklyLimit.maxBathAppointments} dogs, ${bathDogs} already booked by other appointments). Please select a different date or reduce the number of bath services.`
            });
          }
          
          if (requestedGrooms > 0 && groomDogs + requestedGrooms > weeklyLimit.maxGroomAppointments) {
            console.log(`[EDIT DEBUG] *** CAPACITY BLOCKED - GROOM: ${groomDogs + requestedGrooms} > ${weeklyLimit.maxGroomAppointments} ***`);
            return res.status(400).json({
              message: `Cannot update: Full grooming capacity would be exceeded for this date (limit: ${weeklyLimit.maxGroomAppointments} dogs, ${groomDogs} already booked by other appointments). Please select a different date or reduce the number of full groom services.`
            });
          }
          
          console.log(`[EDIT DEBUG] Capacity check PASSED`);
        }
      }

      // Build appointment-level update object
      const updates: any = {};
      if (ownerFirstName !== undefined) updates.ownerFirstName = ownerFirstName;
      if (ownerLastName !== undefined) updates.ownerLastName = ownerLastName;
      if (ownerPhoneNumber !== undefined) updates.ownerPhoneNumber = ownerPhoneNumber;
      if (price !== undefined) {
        let safePrice = price;
        if (typeof safePrice === 'string' && safePrice.includes('-')) {
          safePrice = safePrice.split('-')[0].trim();
        }
        updates.price = safePrice;
        updates.priceConfirmed = true; // Admin explicitly reviewed/set this price
      }
      if (pricingMode !== undefined) updates.pricingMode = pricingMode;
      if (appointmentDate !== undefined) updates.appointmentDate = appointmentDate;
      if (appointmentTime !== undefined) updates.appointmentTime = appointmentTime;
      
      // If pets array is provided, update first pet in appointment table for backward compatibility
      if (pets && pets.length > 0) {
        const firstPet = pets[0];
        updates.petName = firstPet.petName;
        updates.petType = firstPet.petType;
        updates.serviceType = firstPet.serviceType;
        try { const s = firstPet.specialNotes; updates.specialNotes = s ? decodeURIComponent(escape(Buffer.from(s.replace(/-/g,'+').replace(/_/g,'/') + '=='.slice(0,(4-s.replace(/-/g,'+').replace(/_/g,'/').length%4)%4), 'base64').toString('binary'))) : ''; } catch { updates.specialNotes = firstPet.specialNotes || ''; }
        updates.groomerId = firstPet.groomerId || null;
      }

      // TRANSACTION: Update appointment and pets atomically with retry for connection issues
      const appointment = await withRetry(async () => {
        return await db.transaction(async (tx) => {
          // Update appointment
          const updatedAppointment = await storage.updateAppointmentDetails(id, updates, (req as any).tenantId);
          
          // Update appointment_pets if pets array provided
          if (pets && Array.isArray(pets)) {
            // Delete existing appointment_pets
            await storage.deleteAppointmentPets(id);
            
            // Create new appointment_pets records
            const petsWithPrice = pets.map((pet: any) => {
              let petPrice = pet.price ? pet.price.toString() : '0';
              if (petPrice.includes('-')) {
                petPrice = petPrice.split('-')[0].trim();
              }
              let decodedNotes = '';
              try { const s = pet.specialNotes; decodedNotes = s ? decodeURIComponent(escape(Buffer.from(s.replace(/-/g,'+').replace(/_/g,'/') + '=='.slice(0,(4-s.replace(/-/g,'+').replace(/_/g,'/').length%4)%4), 'base64').toString('binary'))) : ''; } catch { decodedNotes = pet.specialNotes || ''; }
              return {
                petName: pet.petName,
                petType: pet.petType,
                serviceType: pet.serviceType,
                specialNotes: decodedNotes,
                price: petPrice,
                groomerId: pet.groomerId || null,
                addOns: pet.addOns || null,
              };
            });
            
            await storage.createAppointmentPets(id, petsWithPrice);
          }
          
          return updatedAppointment;
        });
      });
      
      // Update corresponding contact (outside transaction to avoid blocking)
      if (ownerFirstName !== undefined || ownerLastName !== undefined || ownerPhoneNumber !== undefined || pets) {
        try {
          const oldPhone = currentAppointment.ownerPhoneNumber;
          const newPhone = ownerPhoneNumber || currentAppointment.ownerPhoneNumber;
          
          const normalizedOldPhone = normalizePhoneNumber(oldPhone);
          const allContacts = await storage.getAllContacts((req as any).tenantId);
          let contact = allContacts.find((c: any) => normalizePhoneNumber(c.phoneNumber || '') === normalizedOldPhone);
          
          if (contact) {
            const contactUpdates: any = {};
            
            if (ownerFirstName !== undefined || ownerLastName !== undefined) {
              const firstName = ownerFirstName || currentAppointment.ownerFirstName;
              const lastName = ownerLastName || currentAppointment.ownerLastName;
              contactUpdates.name = `${firstName} ${lastName}`;
            }
            
            if (ownerPhoneNumber !== undefined) {
              contactUpdates.phoneNumber = ownerPhoneNumber;
            }
            
            // Update pet names from pets array
            if (pets && pets.length > 0) {
              const petNames = pets.map((p: any) => p.petName).filter(Boolean);
              if (petNames.length > 0) {
                contactUpdates.petNames = petNames;
              }
              // Use first pet's type
              if (pets[0].petType) {
                contactUpdates.animalType = pets[0].petType;
              }
            }
            
            if (Object.keys(contactUpdates).length > 0) {
              await storage.updateContact(contact.id, contactUpdates, tenantId);
              console.log(`Updated contact ${contact.id} based on appointment ${id} changes`);
            }
          }
        } catch (contactError) {
          console.error("Error updating corresponding contact:", contactError);
          // Don't fail the appointment update if contact update fails
        }
      }
      
      console.log(`[EDIT DEBUG] ===== APPOINTMENT ${id} UPDATED SUCCESSFULLY =====`);
      res.json(appointment);
    } catch (error: any) {
      console.error(`[EDIT DEBUG] ===== ERROR UPDATING APPOINTMENT =====`);
      console.error(`[EDIT DEBUG] Error type: ${error?.constructor?.name}`);
      console.error(`[EDIT DEBUG] Error message: ${error?.message}`);
      console.error(`[EDIT DEBUG] Error stack: ${error?.stack}`);
      res.status(500).json({ message: "Failed to update appointment details" });
    }
  });

  // Appointment items (items sold/used during grooming for inventory tracking)
  app.get("/api/appointments/:id/items", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) return res.status(403).json({ message: "Admin or groomer access required" });
      const items = await storage.getAppointmentItems(parseInt(req.params.id));
      res.json(items);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/appointments/:id/items", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) return res.status(403).json({ message: "Admin or groomer access required" });
      const tenantId: number | undefined = req.tenantId;
      if (!tenantId) return res.status(400).json({ message: "Tenant context required" });
      const id = parseInt(req.params.id);
      const existing = await storage.getAppointment(id, tenantId);
      if (!existing) return res.status(404).json({ message: "Appointment not found" });
      const { supplyId, name, sku, brand, category, price, quantity } = req.body;
      if (!name || !price) return res.status(400).json({ message: "name and price are required" });
      const item = await storage.addAppointmentItem({
        appointmentId: id,
        supplyId: supplyId || null,
        name,
        sku: sku || null,
        brand: brand || null,
        category: category || null,
        price: String(price),
        quantity: quantity || 1,
      });
      res.json(item);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/appointments/:id/items/:itemId", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) return res.status(403).json({ message: "Admin or groomer access required" });
      const tenantId: number | undefined = req.tenantId;
      if (!tenantId) return res.status(400).json({ message: "Tenant context required" });
      const id = parseInt(req.params.id);
      const itemId = parseInt(req.params.itemId);
      // Verify the appointment belongs to this tenant
      const existing = await storage.getAppointment(id, tenantId);
      if (!existing) return res.status(404).json({ message: "Appointment not found" });
      // Verify the item belongs to this appointment (prevents mixed-ID IDOR attacks)
      const [targetItem] = await db.select().from(appointmentItems).where(
        and(eq(appointmentItems.id, itemId), eq(appointmentItems.appointmentId, id))
      );
      if (!targetItem) return res.status(404).json({ message: "Appointment item not found" });
      const { price } = req.body;
      if (!price) return res.status(400).json({ message: "price is required" });
      const item = await storage.updateAppointmentItemPrice(itemId, String(price), tenantId);
      res.json(item);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/appointments/:id/items/:itemId", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) return res.status(403).json({ message: "Admin or groomer access required" });
      const tenantId: number | undefined = req.tenantId;
      if (!tenantId) return res.status(400).json({ message: "Tenant context required" });
      const id = parseInt(req.params.id);
      const itemId = parseInt(req.params.itemId);
      // Verify the appointment belongs to this tenant
      const existing = await storage.getAppointment(id, tenantId);
      if (!existing) return res.status(404).json({ message: "Appointment not found" });
      // Verify the item belongs to this appointment (prevents mixed-ID IDOR attacks)
      const [targetItem] = await db.select().from(appointmentItems).where(
        and(eq(appointmentItems.id, itemId), eq(appointmentItems.appointmentId, id))
      );
      if (!targetItem) return res.status(404).json({ message: "Appointment item not found" });
      await storage.removeAppointmentItem(itemId);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/appointments/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const id = parseInt(req.params.id);
      const { status } = req.body;
      
      // Get appointment details before updating for customer notification
      const oldAppointment = await storage.getAppointment(id, tenantId);
      
      if (!oldAppointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }
      
      // Groomers can only edit already-approved appointments, not approve pending ones
      if (user?.isGroomer && !user?.isAdmin && oldAppointment?.status === 'scheduled') {
        return res.status(403).json({ message: "Only admins can approve pending appointments" });
      }
      
      // CAPACITY CHECK: When changing status to 'confirmed', check capacity limits
      if (status === 'confirmed' && oldAppointment.status !== 'confirmed') {
        const { getLocalDayOfWeek } = await import('./scheduler');
        // Parse as noon local time to avoid UTC midnight shifting Saturday→Friday in CST
        const rawConfirmDateStr = String(oldAppointment.appointmentDate).split('T')[0];
        const appointmentDateStr = rawConfirmDateStr;
        const [cYear, cMon, cDay] = rawConfirmDateStr.split('-').map(Number);
        const appointmentDateLocal = new Date(cYear, cMon - 1, cDay, 12, 0, 0);
        const dayOfWeek = getLocalDayOfWeek(appointmentDateLocal);
        
        // Get appointment pets to count service types
        const appointmentPets = await storage.getAppointmentPets(id);
        
        // Check weekly limits for Monday-Saturday (1-6)
        if (dayOfWeek >= 1 && dayOfWeek <= 6) {
          const weeklyLimit = await storage.getWeeklyAppointmentLimit(dayOfWeek, (req as any).tenantId);
          
          if (weeklyLimit) {
            // Count existing appointments on this date (excluding cancelled/rejected and THIS appointment)
            const allAppointments = await storage.getAppointments(undefined, (req as any).tenantId);
            const appointmentsOnDate = allAppointments.filter((apt: any) => {
              // Use stored date for matching (consistent with SQL atomic check)
              const aptDateStr = new Date(apt.appointmentDate).toISOString().split('T')[0];
              return aptDateStr === appointmentDateStr && 
                     apt.id !== id && // Exclude the appointment being confirmed
                     apt.status !== 'cancelled' && 
                     apt.status !== 'rejected';
            });
            
            // Count existing dogs by service type
            let bathDogs = 0;
            let groomDogs = 0;
            
            for (const apt of appointmentsOnDate) {
              const aptPets = await storage.getAppointmentPets(apt.id);
              if (aptPets && aptPets.length > 0) {
                for (const p of aptPets) {
                  const serviceType = (p.serviceType || '').toLowerCase();
                  if (serviceType.includes('bath')) {
                    bathDogs++;
                  } else if (serviceType.includes('full') || serviceType.includes('groom')) {
                    groomDogs++;
                  }
                }
              } else {
                const serviceType = (apt.serviceType || '').toLowerCase();
                if (serviceType.includes('bath')) {
                  bathDogs++;
                } else if (serviceType.includes('full') || serviceType.includes('groom')) {
                  groomDogs++;
                }
              }
            }
            
            // Count pets in the appointment being confirmed
            let requestedBaths = 0;
            let requestedGrooms = 0;
            
            if (appointmentPets && appointmentPets.length > 0) {
              for (const p of appointmentPets) {
                const serviceType = (p.serviceType || '').toLowerCase();
                if (serviceType.includes('bath')) {
                  requestedBaths++;
                } else if (serviceType.includes('full') || serviceType.includes('groom')) {
                  requestedGrooms++;
                }
              }
            } else {
              const serviceType = (oldAppointment.serviceType || '').toLowerCase();
              if (serviceType.includes('bath')) {
                requestedBaths++;
              } else if (serviceType.includes('full') || serviceType.includes('groom')) {
                requestedGrooms++;
              }
            }
            
            // HARD LIMIT: Cannot confirm if it would exceed capacity
            // Bath and full groom are separate, independent capacities - only check the one(s) actually being requested
            if (requestedBaths > 0 && bathDogs + requestedBaths > weeklyLimit.maxBathAppointments) {
              return res.status(400).json({
                message: `Cannot confirm: Bath grooming capacity is full for this date (limit: ${weeklyLimit.maxBathAppointments} dogs, ${bathDogs} already booked). Please reject this appointment or move it to a different date.`
              });
            }
            
            if (requestedGrooms > 0 && groomDogs + requestedGrooms > weeklyLimit.maxGroomAppointments) {
              return res.status(400).json({
                message: `Cannot confirm: Full grooming capacity is full for this date (limit: ${weeklyLimit.maxGroomAppointments} dogs, ${groomDogs} already booked). Please reject this appointment or move it to a different date.`
              });
            }
          }
        }
      }
      
      const appointment = await storage.updateAppointmentStatus(id, status, tenantId);
      
      // Send customer + groomer notification for confirmed or rejected appointments
      if (oldAppointment && (status === 'confirmed' || status === 'rejected')) {
        const customerUser = await storage.getUser(oldAppointment.userId);
        if (customerUser) {
          console.log(`Sending appointment ${status} notification to customer: ${customerUser.email}`);

          // Fetch groomer emails
          let groomerEmails: string[] = [];
          try {
            const allUsers = await storage.getAllUsers(tenantId);
            groomerEmails = allUsers
              .filter((u: any) => u.isGroomer && !u.isAdmin)
              .map((u: any) => u.email)
              .filter((e: any): e is string => !!e);
          } catch { /* ignore */ }

          const customerName = `${customerUser.firstName || ''} ${customerUser.lastName || ''}`.trim();

          try {
            if (status === 'confirmed') {
              await notificationService.sendAppointmentConfirmedNotification(
                customerUser.email || '',
                customerUser.firstName || 'Customer',
                id,
                oldAppointment.serviceType,
                oldAppointment.appointmentDate,
                oldAppointment.appointmentTime,
                groomerEmails,
                customerName,
                tenantId
              );
            } else if (status === 'rejected') {
              await notificationService.sendAppointmentRejectedNotification(
                customerUser.email || '',
                customerUser.firstName || 'Customer',
                id,
                oldAppointment.serviceType,
                oldAppointment.appointmentDate,
                oldAppointment.appointmentTime,
                groomerEmails,
                customerName,
                tenantId
              );
            }
          } catch (notificationError) {
            console.error('Failed to send customer notification:', notificationError);
          }
        }
      }
      
      res.json(appointment);
    } catch (error: any) {
      console.error("Error updating appointment:", error);
      if (error?.message === "Appointment not found or access denied") {
        return res.status(404).json({ message: "Appointment not found" });
      }
      res.status(500).json({ message: "Failed to update appointment" });
    }
  });

  // Customer self-check-in: marks their own appointment as arrived (isHere = true)
  app.patch("/api/appointments/:id/arrive", authMiddleware, async (req: any, res) => {
    try {
      const tenantId: number | undefined = (req as any).tenantId;
      const id = parseInt(req.params.id);
      const userId = req.user?.id;

      // Verify the appointment belongs to this user
      const appt = await storage.getAppointment(id, tenantId);
      if (!appt) return res.status(404).json({ message: "Appointment not found" });
      if (appt.userId !== userId) return res.status(403).json({ message: "Not your appointment" });
      if (appt.status === "cancelled") return res.status(400).json({ message: "Appointment is cancelled" });

      const updated = await storage.updateAppointmentIsHere(id, true, tenantId);
      res.json(updated);
    } catch (error: any) {
      console.error("Error on customer self-check-in:", error);
      res.status(500).json({ message: "Failed to check in" });
    }
  });

  app.patch("/api/appointments/:id/is-here", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const id = parseInt(req.params.id);
      const { isHere } = req.body;
      
      if (typeof isHere !== 'boolean') {
        return res.status(400).json({ message: "isHere must be a boolean" });
      }

      const appointment = await storage.updateAppointmentIsHere(id, isHere, tenantId);
      res.json(appointment);
    } catch (error: any) {
      console.error("Error updating appointment arrival status:", error);
      if (error?.message === "Appointment not found or access denied") {
        return res.status(404).json({ message: "Appointment not found" });
      }
      res.status(500).json({ message: "Failed to update appointment arrival status" });
    }
  });

  app.patch("/api/appointments/:id/is-paid", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const id = parseInt(req.params.id);
      const { isPaid } = req.body;
      
      if (typeof isPaid !== 'boolean') {
        return res.status(400).json({ message: "isPaid must be a boolean" });
      }

      const appointment = await storage.updateAppointmentIsPaid(id, isPaid, tenantId);
      res.json(appointment);
    } catch (error: any) {
      console.error("Error updating appointment payment status:", error);
      if (error?.message === "Appointment not found or access denied") {
        return res.status(404).json({ message: "Appointment not found" });
      }
      res.status(500).json({ message: "Failed to update appointment payment status" });
    }
  });

  // Admin/groomer marks appointment ready for online payment with final amount
  app.patch("/api/admin/appointments/:id/ready-for-payment", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const id = parseInt(req.params.id);
      const { finalAmount, readyForPayment } = req.body;
      if (readyForPayment && (finalAmount === undefined || isNaN(parseFloat(finalAmount)))) {
        return res.status(400).json({ message: "finalAmount is required when marking ready for payment" });
      }
      const appointment = await storage.updateAppointmentReadyForPayment(id, String(parseFloat(finalAmount || "0").toFixed(2)), readyForPayment ?? true, tenantId);
      res.json(appointment);
    } catch (error: any) {
      console.error("Error marking appointment ready for payment:", error);
      if (error?.message === "Appointment not found or access denied") {
        return res.status(404).json({ message: "Appointment not found" });
      }
      res.status(500).json({ message: "Failed to update appointment" });
    }
  });

  // Customer creates Stripe checkout session to pay for grooming appointment
  app.post("/api/appointments/:id/pay-online", authMiddleware, async (req: any, res) => {
    try {
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const id = parseInt(req.params.id);
      const userId = req.user?.id;
      const appointment = await storage.getAppointment(id, tenantId);
      if (!appointment) return res.status(404).json({ message: "Appointment not found" });

      // Allow if userId matches, OR if appointment is unlinked and phone number matches
      const isOwnerById = appointment.userId === userId;
      let isOwnerByPhone = false;
      if (!isOwnerById && !appointment.userId) {
        const reqUser = await storage.getUser(userId);
        if (reqUser?.phoneNumber) {
          const norm = (p: string) => p.replace(/\D/g, '');
          isOwnerByPhone = norm(appointment.ownerPhoneNumber) === norm(reqUser.phoneNumber);
        }
      }
      if (!isOwnerById && !isOwnerByPhone) return res.status(403).json({ message: "Forbidden" });
      // Auto-link unlinked appointment to this user now that we've verified phone ownership
      if (isOwnerByPhone) {
        await db.update(appointments).set({ userId }).where(eq(appointments.id, id));
      }

      if (!appointment.readyForPayment) return res.status(400).json({ message: "Appointment is not ready for payment" });
      if (appointment.isPaid) return res.status(400).json({ message: "Appointment is already paid" });

      const serviceAmount = parseFloat(appointment.finalAmount || "0");
      if (serviceAmount <= 0) return res.status(400).json({ message: "Invalid payment amount" });

      // Optional tip the customer chose to add
      const tipNum = parseFloat(req.body?.tipAmount || "0") || 0;
      const totalAmount = serviceAmount + tipNum;

      const { getUncachableStripeClient } = await import('./stripeClient');
      const stripe = await getUncachableStripeClient();

      // Prefer charging the saved card directly (same as order payments — no redirect needed)
      const customer = await storage.getUser(req.user.id);
      if (customer?.stripeCustomerId && customer?.stripeDefaultPaymentMethod) {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(totalAmount * 100),
          currency: 'usd',
          customer: customer.stripeCustomerId,
          payment_method: customer.stripeDefaultPaymentMethod,
          off_session: true,
          confirm: true,
          description: `Grooming appointment #${id} — ${appointment.petName}${tipNum > 0 ? ` (incl. $${tipNum.toFixed(2)} tip)` : ''}`,
          metadata: { appointmentId: String(id), type: 'grooming', tipAmount: String(tipNum) },
        });

        if (paymentIntent.status === 'succeeded') {
          await storage.updateAppointmentPaidOnline(id, paymentIntent.id, tenantId);
          if (tipNum > 0) {
            await storage.updateAppointmentTip(id, tipNum.toFixed(2), paymentIntent.id);
          }
          return res.json({ success: true, charged: true });
        }
        // If PaymentIntent didn't immediately succeed, fall through to Checkout redirect
      }

      // Fallback: no saved card — redirect to Stripe Checkout so customer can enter one
      const origin = req.headers.origin || `https://${req.headers.host}`;
      const lineItems: any[] = [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Grooming — ${appointment.petName}`,
            description: `${appointment.serviceType === 'grooming' ? 'Full Grooming' : appointment.serviceType} on ${appointment.appointmentDate}`,
          },
          unit_amount: Math.round(serviceAmount * 100),
        },
        quantity: 1,
      }];
      if (tipNum > 0) {
        lineItems.push({
          price_data: {
            currency: 'usd',
            product_data: { name: 'Tip for groomer' },
            unit_amount: Math.round(tipNum * 100),
          },
          quantity: 1,
        });
      }
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: 'payment',
        success_url: `${origin}/my-appointments?groomingPaid=${id}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/my-appointments`,
        metadata: { appointmentId: String(id), type: 'grooming', tipAmount: String(tipNum) },
      });

      res.json({ checkoutUrl: session.url, sessionId: session.id });
    } catch (error) {
      console.error("Error creating grooming checkout session:", error);
      res.status(500).json({ message: "Failed to create payment session" });
    }
  });

  // Confirm grooming payment after Stripe checkout redirect
  app.post("/api/appointments/:id/confirm-payment", authMiddleware, async (req: any, res) => {
    try {
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const id = parseInt(req.params.id);
      const { sessionId } = req.body;
      if (!sessionId) return res.status(400).json({ message: "sessionId is required" });

      const appointment = await storage.getAppointment(id, tenantId);
      if (!appointment) return res.status(404).json({ message: "Appointment not found" });
      const confirmUserId = req.user?.id;
      const confirmOwnerById = appointment.userId === confirmUserId;
      let confirmOwnerByPhone = false;
      if (!confirmOwnerById && !appointment.userId) {
        const confirmUser = await storage.getUser(confirmUserId);
        if (confirmUser?.phoneNumber) {
          const norm = (p: string) => p.replace(/\D/g, '');
          confirmOwnerByPhone = norm(appointment.ownerPhoneNumber) === norm(confirmUser.phoneNumber);
        }
      }
      if (!confirmOwnerById && !confirmOwnerByPhone) return res.status(403).json({ message: "Forbidden" });
      if (confirmOwnerByPhone) {
        const apptWhere = and(eq(appointments.id, id), eq(appointments.tenantId, tenantId));
        await db.update(appointments).set({ userId: confirmUserId }).where(apptWhere);
      }
      if (appointment.isPaid) return res.json({ success: true, alreadyPaid: true });

      const { getUncachableStripeClient } = await import('./stripeClient');
      const stripe = await getUncachableStripeClient();

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status !== 'paid') {
        return res.status(400).json({ message: "Payment not completed" });
      }
      if (String(session.metadata?.appointmentId) !== String(id)) {
        return res.status(400).json({ message: "Session does not match appointment" });
      }

      const updated = await storage.updateAppointmentPaidOnline(id, sessionId, tenantId);
      res.json({ success: true, appointment: updated });
    } catch (error) {
      console.error("Error confirming grooming payment:", error);
      res.status(500).json({ message: "Failed to confirm payment" });
    }
  });

  // Update appointment grooming completed status and send SMS notification
  app.patch("/api/appointments/:id/grooming-completed", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const id = parseInt(req.params.id);
      const { groomingCompleted, customMessage } = req.body;
      
      if (typeof groomingCompleted !== 'boolean') {
        return res.status(400).json({ message: "groomingCompleted must be a boolean" });
      }

      // Capture state BEFORE update so we only send SMS on true→false→true transition (first time only)
      const existingAppointment = await storage.getAppointment(id, tenantId);
      const wasAlreadyCompleted = existingAppointment?.groomingCompleted === true;

      const appointment = await storage.updateAppointmentGroomingCompleted(id, groomingCompleted, tenantId);

      // Auto-create or update contact when grooming is marked completed (pet showed up = number is real)
      if (groomingCompleted && appointment.ownerPhoneNumber) {
        const allPetNames = appointment.petName ? [appointment.petName] : [];
        // Capture tenantId before entering the fire-and-forget callback
        const groomingContactTenantId: number = tenantId;
        if (!groomingContactTenantId) {
          console.warn('[Contact auto-create] Skipping: no tenant context on request');
        } else {
        storage.getContactByPhoneNumber(appointment.ownerPhoneNumber, groomingContactTenantId).then(async existingContact => {
          if (!existingContact) {
            const contactName = `${appointment.ownerFirstName || ''} ${appointment.ownerLastName || ''}`.trim() || 'Unknown';
            await storage.createContact({
              name: contactName,
              phoneNumber: appointment.ownerPhoneNumber!,
              email: (appointment as any).ownerEmail || null,
              petNames: allPetNames.length > 0 ? allPetNames : null,
              animalType: appointment.petType || null,
              breed: null,
              source: appointment.source || 'manual',
              notes: null,
              linkedUserId: null,
              tenantId: groomingContactTenantId,
            });
          } else {
            const existingPetNames: string[] = existingContact.petNames || [];
            const merged = Array.from(new Set([...existingPetNames, ...allPetNames]));
            if (merged.length > existingPetNames.length) {
              await storage.updateContact(existingContact.id, { petNames: merged }, groomingContactTenantId);
            }
          }
        }).catch(err => console.error('Failed to auto-create contact on grooming completion:', err));
        } // end else (groomingContactTenantId present)
      }

      // Send SMS notification when grooming is marked as completed for the FIRST time only.
      // wasAlreadyCompleted guards against re-sending if someone clears and re-marks ready
      // on an appointment that was already done (e.g. paid in-store then "Mark Ready" tapped again).
      if (groomingCompleted && !wasAlreadyCompleted && appointment.ownerPhoneNumber) {
        try {
          // Use custom message if provided, otherwise use default
          const smsMessage = customMessage || "Your Fur Baby is ready for pick-up, unless you've already spoken to a groomer, please give us a call to let us know you're on your way. PilotHouse 318-323-6090. Reply STOP to opt out.";
          
          const smsSent = await notificationService.sendCustomSMS(
            appointment.ownerPhoneNumber,
            smsMessage,
            id,
            (req as any).tenantId
          );
          
          if (smsSent) {
            console.log(`Grooming completed SMS sent for appointment ${id}`);
          }
        } catch (smsError) {
          console.error('Failed to send grooming completed SMS:', smsError);
          // Don't fail the request if SMS fails
        }
      }

      res.json(appointment);
    } catch (error: any) {
      console.error("Error updating appointment grooming completed status:", error);
      if (error?.message === "Appointment not found or access denied") {
        return res.status(404).json({ message: "Appointment not found" });
      }
      res.status(500).json({ message: "Failed to update appointment grooming completed status" });
    }
  });

  // Send "Pet Ready" SMS notification for grooming appointment
  app.post("/api/appointments/:id/notify-ready", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const id = parseInt(req.params.id);
      const appointment = await storage.getAppointment(id, (req as any).tenantId);
      
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      // Get the phone number from the appointment
      const phoneNumber = appointment.ownerPhoneNumber;
      if (!phoneNumber) {
        return res.status(400).json({ message: "No phone number found for this appointment" });
      }

      // Get customer first name
      const firstName = appointment.ownerFirstName || 'Customer';
      
      // Get pet name(s)
      const appointmentPets = await storage.getAppointmentPets(id);
      let petNames: string;
      if (appointmentPets && appointmentPets.length > 0) {
        petNames = appointmentPets.map(p => p.petName).join(' and ');
      } else {
        petNames = appointment.petName || 'your pet';
      }

      // Send the SMS notification
      const success = await notificationService.sendPetReadyNotification(
        phoneNumber,
        firstName,
        petNames,
        (req as any).tenantId
      );

      if (success) {
        res.json({ message: `Pet ready notification sent to ${phoneNumber}` });
      } else {
        res.status(400).json({ 
          message: "SMS service not configured. Please set up Twilio credentials.",
          setupRequired: true
        });
      }
    } catch (error) {
      console.error("Error sending pet ready notification:", error);
      res.status(500).json({ message: "Failed to send pet ready notification" });
    }
  });

  app.post("/api/appointments", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      
      // Check if user is admin
      const user = await storage.getUser(userId);
      const isAdmin = user?.isAdmin;
      const isAdminOrGroomer = user?.isAdmin || user?.isGroomer;
      
      // Validate past-date booking restriction for customers (not admins/groomers)
      if (!isAdminOrGroomer) {
        const appointmentDate = new Date(req.body.appointmentDate + 'T00:00:00');
        const nowCentral = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        const todayCentral = new Date(nowCentral.getFullYear(), nowCentral.getMonth(), nowCentral.getDate());
        
        if (appointmentDate < todayCentral) {
          return res.status(400).json({ 
            message: "Past-date appointments are not allowed. Please select today or a future date." 
          });
        }

        // Also block same-day bookings where the time slot has already passed
        if (appointmentDate.getTime() === todayCentral.getTime()) {
          const appointmentTime: string = req.body.appointmentTime || '';
          const timeMatch = appointmentTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
          if (timeMatch) {
            let hours = parseInt(timeMatch[1]);
            const minutes = parseInt(timeMatch[2]);
            const period = timeMatch[3].toUpperCase();
            if (period === 'PM' && hours !== 12) hours += 12;
            if (period === 'AM' && hours === 12) hours = 0;
            const slotTime = new Date(nowCentral.getFullYear(), nowCentral.getMonth(), nowCentral.getDate(), hours, minutes, 0);
            if (slotTime <= nowCentral) {
              return res.status(400).json({
                message: "This time slot has already passed. Please select a future time."
              });
            }
          }
        }
        
        // LIMIT: Only 1 appointment per customer per day
        const userAppointments = await storage.getAppointments(undefined, (req as any).tenantId);
        const requestedDateStr = req.body.appointmentDate; // "YYYY-MM-DD" format
        const sameDayAppointments = userAppointments.filter((apt: any) => {
          if (apt.userId !== userId) return false;
          if (apt.status === 'cancelled' || apt.status === 'rejected') return false;
          
          // Compare date strings directly (both in YYYY-MM-DD format)
          const aptDateStr = typeof apt.appointmentDate === 'string' 
            ? apt.appointmentDate.split('T')[0] 
            : new Date(apt.appointmentDate).toISOString().split('T')[0];
          return aptDateStr === requestedDateStr;
        });
        
        if (sameDayAppointments.length > 0) {
          return res.status(400).json({ 
            message: `You already have an appointment booked for this date. Only one appointment per day is allowed.` 
          });
        }
      }

      // Use timezone-aware date functions to prevent UTC/CST mismatch bugs
      const { getLocalDateString, getLocalDayOfWeek } = await import('./scheduler');
      
      // CRITICAL FIX: The frontend sends a date string like "2025-12-11" which represents
      // the user's selected date in their local timezone (CST). We must NOT let JavaScript
      // reinterpret this as UTC midnight (which would shift it back one day when converted to CST).
      // Instead, parse the date string directly and use those components.
      const rawDateStr = req.body.appointmentDate; // "YYYY-MM-DD" format from frontend
      let appointmentDateStr: string;
      let dayOfWeek: number;
      
      // Parse the date string directly to get the intended date components
      if (typeof rawDateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDateStr)) {
        // Date string format - use it directly as the date
        appointmentDateStr = rawDateStr;
        // Parse year, month, day from string
        const [year, month, day] = rawDateStr.split('-').map(Number);
        // Create date in local timezone (noon to avoid any edge cases)
        const localDate = new Date(year, month - 1, day, 12, 0, 0);
        dayOfWeek = localDate.getDay(); // 0=Sunday, 1=Monday, etc.
        console.log(`[DATE PARSING] Raw: ${rawDateStr}, Parsed local date: ${localDate.toDateString()}, Day of week: ${dayOfWeek}`);
      } else {
        // Fallback for other date formats - use timezone conversion
        const appointmentDate = new Date(rawDateStr);
        appointmentDateStr = getLocalDateString(appointmentDate);
        dayOfWeek = getLocalDayOfWeek(appointmentDate);
        console.log(`[DATE PARSING] Fallback - Raw: ${rawDateStr}, Converted: ${appointmentDateStr}, Day of week: ${dayOfWeek}`);
      }
      
      // Check special date settings first (overrides weekly limits)
      const appointmentDate = new Date(rawDateStr);
      const specialDate = await storage.getSpecialDateWithTimes(appointmentDateStr, (req as any).tenantId);
      
      if (specialDate) {
        // This is a special date - only allowed times can be booked
        const requestedTime = req.body.appointmentTime;
        const allowedTimes = specialDate.times.map((t: any) => t.allowedTime);
        
        if (!allowedTimes.includes(requestedTime)) {
          return res.status(400).json({
            message: `This is a special date (${specialDate.setting.name}). Only the following times are available: ${allowedTimes.join(', ')}`
          });
        }
      }

      // Support both old single-pet format and new multi-pet format
      const petsArray = req.body.pets || [{ 
        petName: req.body.petName, 
        petType: req.body.petType, 
        serviceType: req.body.serviceType,
        specialNotes: req.body.specialNotes 
      }];

      // Check weekly appointment limits for the selected day of week
      // dayOfWeek was already calculated above using the raw date string
      console.log(`[CAPACITY CHECK] Date: ${appointmentDateStr}, Day of week: ${dayOfWeek}, isAdmin: ${isAdmin}`);
      
      // SAFEGUARD #1: Block Sunday bookings (day 0) - no grooming on Sundays
      if (dayOfWeek === 0) {
        return res.status(400).json({
          message: "Sorry, grooming appointments are not available on Sundays. Please select a different day."
        });
      }
      
      // SAFEGUARD #1b: Check if the day of week is enabled in grooming settings
      const groomingSettings = await storage.getGroomingSettings((req as any).tenantId);
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayEnabledSetting = groomingSettings.find(s => s.setting === `${dayNames[dayOfWeek]}_enabled`);
      if (dayEnabledSetting && dayEnabledSetting.value === 'false') {
        return res.status(400).json({
          message: `Sorry, grooming appointments are not available on ${dayNames[dayOfWeek].charAt(0).toUpperCase() + dayNames[dayOfWeek].slice(1)}s. Please select a different day.`
        });
      }
      
      // SAFEGUARD #1c: Check if this specific date is in the blocked dates list
      const blockedDatesSetting = groomingSettings.find(s => s.setting === 'blocked_dates');
      if (blockedDatesSetting && blockedDatesSetting.value) {
        const blockedList = blockedDatesSetting.value.split(',').map((d: string) => d.trim()).filter((d: string) => d);
        if (blockedList.includes(appointmentDateStr)) {
          return res.status(400).json({
            message: "Sorry, this date has been blocked for grooming appointments. Please select a different date."
          });
        }
      }
      
      // SAFEGUARD #1d-cat: Cat-specific day + time restrictions
      // Cats are only accepted Mon (1), Tue (2), Thu (4) and must arrive by 9:00 AM.
      // These apply to the whole appointment if ANY pet being booked is a cat.
      const hasCat = petsArray.some((p: any) =>
        (p.petType || p.type || '').toLowerCase() === 'cat'
      );
      if (hasCat && !isAdminOrGroomer) {
        if (![1, 2, 4].includes(dayOfWeek)) {
          return res.status(400).json({
            message: "Cats are only accepted on Monday, Tuesday, and Thursday. Please select a valid day."
          });
        }
        const catTimeStr = req.body.appointmentTime;
        if (catTimeStr) {
          const tp = catTimeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
          if (tp) {
            let h = parseInt(tp[1]);
            const m = parseInt(tp[2]);
            const per = tp[3].toUpperCase();
            if (per === 'AM' && h === 12) h = 0;
            if (per === 'PM' && h !== 12) h += 12;
            if (h * 60 + m > 9 * 60) { // strictly after 9:00 AM
              return res.status(400).json({
                message: "Cats must arrive by 9:00 AM. Please select an earlier time."
              });
            }
          }
        }
      }

      // SAFEGUARD #1d: Validate appointment time is not after 1:30 PM cutoff
      // Skip this check for special dates (they have their own allowed times list)
      if (!specialDate) {
        const requestedTimeStr = req.body.appointmentTime;
        if (requestedTimeStr) {
          const timeParts = requestedTimeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
          if (timeParts) {
            let hours = parseInt(timeParts[1]);
            const minutes = parseInt(timeParts[2]);
            const period = timeParts[3].toUpperCase();
            if (period === 'PM' && hours !== 12) hours += 12;
            if (period === 'AM' && hours === 12) hours = 0;
            const totalMinutes = hours * 60 + minutes;
            const cutoffMinutes = 13 * 60 + 30; // 1:30 PM = 810 minutes
            if (totalMinutes > cutoffMinutes) {
              return res.status(400).json({
                message: "Sorry, grooming appointments are not available after 1:30 PM. Please select an earlier time."
              });
            }
          }
        }
      }
      
      // Get weekly limit for this day of week (1-6 for Monday-Saturday)
      if (dayOfWeek >= 1 && dayOfWeek <= 6) {
        const weeklyLimit = await storage.getWeeklyAppointmentLimit(dayOfWeek, (req as any).tenantId);
        
        console.log(`[CAPACITY CHECK] Weekly limit for day ${dayOfWeek}:`, weeklyLimit ? `bath=${weeklyLimit.maxBathAppointments}, groom=${weeklyLimit.maxGroomAppointments}` : 'NOT SET');
        
        // SAFEGUARD #2: Require weekly limits to be configured - prevents bypassing capacity
        if (!weeklyLimit) {
          console.error(`[CAPACITY CHECK] BLOCKED - No weekly limit configured for day ${dayOfWeek}`);
          return res.status(400).json({
            message: `Booking is not available for this day. Please contact the store or select a different date.`
          });
        }
        
        // Weekly limit exists - proceed with capacity check
        if (weeklyLimit) {
          // Count existing appointments for this date by service type
          // Include all appointments except cancelled/rejected ones
          // IMPORTANT: Only match the stored date (not timezone-converted) to match SQL atomic check behavior
          const allAppointments = await storage.getAppointments(undefined, (req as any).tenantId);
          const appointmentsOnDate = allAppointments.filter((apt: any) => {
            const aptDate = new Date(apt.appointmentDate);
            // Only use the stored date, not timezone-converted - matches SQL: DATE(a.appointment_date) = ${dateStr}::date
            const storedDateStr = aptDate.toISOString().split('T')[0];
            return storedDateStr === appointmentDateStr && 
                   apt.status !== 'cancelled' && 
                   apt.status !== 'rejected';
          });
          
          // Count total dogs/pets by service type (not appointments)
          let bathDogs = 0;
          let groomDogs = 0;
          
          for (const apt of appointmentsOnDate) {
            // Get appointment pets to count service types accurately
            const aptPets = await storage.getAppointmentPets(apt.id);
            if (aptPets && aptPets.length > 0) {
              // Multi-pet appointment - count each pet's service type with substring matching
              for (const p of aptPets) {
                const serviceType = (p.serviceType || '').toLowerCase();
                // Bath check first, then groom excludes bath to avoid any overlap
                if (serviceType.includes('bath')) {
                  bathDogs++;
                } else if (serviceType.includes('full') || (serviceType.includes('groom') && !serviceType.includes('bath'))) {
                  groomDogs++;
                }
              }
            } else {
              // Legacy single-pet appointment - use appointment's serviceType with substring matching
              const serviceType = (apt.serviceType || '').toLowerCase();
              // Bath check first, then groom excludes bath to avoid any overlap
              if (serviceType.includes('bath')) {
                bathDogs++;
              } else if (serviceType.includes('full') || (serviceType.includes('groom') && !serviceType.includes('bath'))) {
                groomDogs++;
              }
            }
          }
          
          // Count requested pets by service type with substring matching
          let requestedBaths = 0;
          let requestedGrooms = 0;
          for (const p of petsArray) {
            const serviceType = (p.serviceType || '').toLowerCase();
            if (serviceType.includes('bath')) {
              requestedBaths++;
            } else if (serviceType.includes('full') || serviceType.includes('groom')) {
              requestedGrooms++;
            }
          }
          
          console.log(`[CAPACITY CHECK] Existing: ${groomDogs} grooms, ${bathDogs} baths. Requested: ${requestedGrooms} grooms, ${requestedBaths} baths. Limits: ${weeklyLimit.maxGroomAppointments} grooms, ${weeklyLimit.maxBathAppointments} baths`);
          console.log(`[CAPACITY CHECK] Would total: ${groomDogs + requestedGrooms} grooms (limit ${weeklyLimit.maxGroomAppointments}), ${bathDogs + requestedBaths} baths (limit ${weeklyLimit.maxBathAppointments})`);
          
          // HARD LIMIT: Cannot be bypassed by anyone, including admins
          // This ensures grooming capacity is never exceeded
          // Bath and full groom are separate, independent capacities - only check the one(s) actually being requested
          if (requestedBaths > 0 && bathDogs + requestedBaths > weeklyLimit.maxBathAppointments) {
            return res.status(400).json({
              message: `Bath grooming capacity is fully booked for this date (limit: ${weeklyLimit.maxBathAppointments} dogs, ${bathDogs} already booked). Please select a different date.`
            });
          }
          
          if (requestedGrooms > 0 && groomDogs + requestedGrooms > weeklyLimit.maxGroomAppointments) {
            return res.status(400).json({
              message: `Full grooming capacity is fully booked for this date (limit: ${weeklyLimit.maxGroomAppointments} dogs, ${groomDogs} already booked). Please select a different date.`
            });
          }
        }
      }
      
      // Validate groomer availability for the selected date
      const appointmentDateObj = new Date(appointmentDateStr + 'T00:00:00');
      const appointmentDayOfWeek = appointmentDateObj.getDay();
      
      // Get groomer-specific blocked days for this date (sick days, vacation, etc.)
      const groomerBlockedDaysForDate = await storage.getGroomerBlockedDaysForDate(appointmentDateStr);
      const blockedGroomerIds = new Set(groomerBlockedDaysForDate.map((bd: any) => bd.groomerId));
      
      for (const pet of petsArray) {
        if (pet.groomerId) {
          const groomerId = typeof pet.groomerId === 'string' ? parseInt(pet.groomerId) : pet.groomerId;
          const groomer = await storage.getGroomer(groomerId);
          
          // Check weekly off-days
          if (groomer && groomer.offDays && groomer.offDays.includes(appointmentDayOfWeek)) {
            return res.status(400).json({
              message: `${groomer.name} is not available on ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][appointmentDayOfWeek]}s. Please select a different groomer or date.`
            });
          }
          
          // Check specific blocked days (sick days, vacation)
          if (blockedGroomerIds.has(groomerId)) {
            return res.status(400).json({
              message: `${groomer?.name || 'Selected groomer'} is not available on this date (blocked day). Please select a different groomer or date.`
            });
          }
        }
      }
      
      // GROOMER DAILY FULL-GROOM LIMIT: Max 5 full grooming appointments per groomer per day
      // Bath-only appointments do NOT count toward this limit
      const GROOMER_DAILY_FULL_GROOM_LIMIT = 5;
      {
      
      // Collect all groomer IDs assigned to full groom pets in this request
      const groomerFullGroomCounts: Record<number, number> = {};
      const appointmentLevelGroomerId = req.body.groomerId ? parseInt(req.body.groomerId) : null;
      
      for (const pet of petsArray) {
        const serviceType = (pet.serviceType || '').toLowerCase();
        const isFullGroom = serviceType.includes('full') || (serviceType.includes('groom') && !serviceType.includes('bath'));
        
        if (isFullGroom) {
          // Per-pet groomer takes priority, then appointment-level groomer
          const petGroomerId = pet.groomerId ? (typeof pet.groomerId === 'string' ? parseInt(pet.groomerId) : pet.groomerId) : appointmentLevelGroomerId;
          if (petGroomerId) {
            groomerFullGroomCounts[petGroomerId] = (groomerFullGroomCounts[petGroomerId] || 0) + 1;
          }
        }
      }
      
      // Check each groomer's existing full groom count for this date
      if (Object.keys(groomerFullGroomCounts).length > 0) {
        const allAppointmentsForGroomerCheck = await storage.getAppointments(undefined, (req as any).tenantId);
        const appointmentsOnDateForGroomer = allAppointmentsForGroomerCheck.filter((apt: any) => {
          const aptDateStr = typeof apt.appointmentDate === 'string' 
            ? apt.appointmentDate.split('T')[0] 
            : new Date(apt.appointmentDate).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
          return aptDateStr === appointmentDateStr && 
                 apt.status !== 'cancelled' && 
                 apt.status !== 'rejected';
        });
        
        for (const [groomerIdStr, requestedCount] of Object.entries(groomerFullGroomCounts)) {
          const gid = parseInt(groomerIdStr);
          let existingFullGrooms = 0;
          
          for (const apt of appointmentsOnDateForGroomer) {
            const aptPets = await storage.getAppointmentPets(apt.id);
            if (aptPets && aptPets.length > 0) {
              for (const p of aptPets) {
                const pGroomerId = p.groomerId || apt.groomerId;
                if (pGroomerId === gid) {
                  const sType = (p.serviceType || '').toLowerCase();
                  if (sType.includes('full') || (sType.includes('groom') && !sType.includes('bath'))) {
                    existingFullGrooms++;
                  }
                }
              }
            } else {
              if (apt.groomerId === gid) {
                const sType = (apt.serviceType || '').toLowerCase();
                if (sType.includes('full') || (sType.includes('groom') && !sType.includes('bath'))) {
                  existingFullGrooms++;
                }
              }
            }
          }
          
          if (existingFullGrooms + requestedCount > GROOMER_DAILY_FULL_GROOM_LIMIT) {
            const groomer = await storage.getGroomer(gid);
            const remaining = Math.max(0, GROOMER_DAILY_FULL_GROOM_LIMIT - existingFullGrooms);
            return res.status(400).json({
              message: `${groomer?.name || 'Selected groomer'} already has ${existingFullGrooms} full groom${existingFullGrooms !== 1 ? 's' : ''} booked for this date (limit: ${GROOMER_DAILY_FULL_GROOM_LIMIT}). ${remaining > 0 ? `Only ${remaining} more full groom slot${remaining !== 1 ? 's' : ''} available.` : 'No more full groom slots available.'} Bath appointments are still available with this groomer.`
            });
          }
        }
      }
      }
      
      // DUPLICATE CHECK: Prevent same customer + same pet + same date duplicates
      // Works for both admin and customer bookings, regardless of source
      const phoneForDupeCheck = req.body.ownerPhoneNumber || req.body.phone;
      if (phoneForDupeCheck) {
        const allAppointmentsForDupeCheck = await storage.getAppointments(undefined, (req as any).tenantId);
        const normalizedPhone = phoneForDupeCheck.replace(/\D/g, '').slice(-10);
        
        const sameDateSamePhone = allAppointmentsForDupeCheck.filter((apt: any) => {
          if (apt.status === 'cancelled' || apt.status === 'rejected') return false;
          const aptPhone = (apt.ownerPhoneNumber || '').replace(/\D/g, '').slice(-10);
          if (aptPhone !== normalizedPhone) return false;
          const aptDateStr = typeof apt.appointmentDate === 'string'
            ? apt.appointmentDate.split('T')[0]
            : new Date(apt.appointmentDate).toISOString().split('T')[0];
          return aptDateStr === appointmentDateStr;
        });
        
        if (sameDateSamePhone.length > 0) {
          const customerName = `${req.body.ownerFirstName || ''} ${req.body.ownerLastName || ''}`.trim() || 'This customer';
          return res.status(400).json({
            message: `${customerName} already has an appointment on this date. Please edit the existing appointment or review the information entered.`
          });
        }
      }

      // For multi-pet appointments, use first pet's info in main record for backward compatibility
      const firstPet = petsArray[0];
      const petNamesStr = petsArray.map((p: any) => p.petName).join(', ');
      
      // SAFEGUARD #3: Final atomic capacity check right before creating - prevents race conditions
      // Uses advisory lock to serialize concurrent booking attempts for the same date
      let requestedBathsFinal = 0;
      let requestedGroomsFinal = 0;
      for (const p of petsArray) {
        const serviceType = (p.serviceType || '').toLowerCase();
        if (serviceType.includes('bath')) {
          requestedBathsFinal++;
        } else if (serviceType.includes('full') || serviceType.includes('groom')) {
          requestedGroomsFinal++;
        }
      }
      
      // Acquire advisory lock for this date - serializes concurrent booking attempts
      // The lock is held until after the appointment + pets are fully inserted
      await storage.acquireBookingLock(appointmentDateStr);
      
      let appointment;
      try {
        const atomicCheck = await storage.checkAndReserveCapacity(
          appointmentDateStr,
          dayOfWeek,
          requestedBathsFinal,
          requestedGroomsFinal,
          (req as any).tenantId
        );
        
        if (!atomicCheck.withinCapacity) {
          console.error(`[FINAL CAPACITY CHECK] BLOCKED - ${atomicCheck.reason}`);
          return res.status(400).json({
            message: `This date is fully booked. ${atomicCheck.reason} Please select a different date.`
          });
        }
        
        console.log(`[FINAL CAPACITY CHECK] PASSED - proceeding with appointment creation (lock held)`);
        
        // All appointments are auto-approved with capacity safeguards in place
        // Parse price - handle range strings like "40-80" by taking the lower bound
        let parsedPrice = req.body.price;
        if (typeof parsedPrice === 'string' && parsedPrice.includes('-')) {
          const lowerBound = parsedPrice.split('-')[0].trim();
          parsedPrice = lowerBound || '0';
        }
        if (typeof parsedPrice === 'string' && parsedPrice.includes('+')) {
          const parts = parsedPrice.split('+').map((p: string) => {
            const trimmed = p.trim();
            if (trimmed.includes('-')) return trimmed.split('-')[0].trim();
            return trimmed;
          });
          parsedPrice = parts.reduce((sum: number, p: string) => sum + (parseFloat(p) || 0), 0).toString();
        }
        
        const firstGroomerId = firstPet.groomerId || req.body.groomerId || null;
        const cleanedOwnerFirst = req.body.ownerFirstName ? cleanName(req.body.ownerFirstName) : req.body.ownerFirstName;
        const cleanedOwnerLast = req.body.ownerLastName ? cleanName(req.body.ownerLastName) : req.body.ownerLastName;
        const apptTenantId = resolveWriteTenantId(req, res);
        if (apptTenantId === undefined) return;
        const appointmentData = insertAppointmentSchema.parse({ 
          ...req.body,
          ownerFirstName: cleanedOwnerFirst,
          ownerLastName: cleanedOwnerLast,
          price: parsedPrice,
          petName: firstPet.petName,
          petType: firstPet.petType,
          serviceType: firstPet.serviceType,
          specialNotes: firstPet.specialNotes,
          groomerId: firstGroomerId,
          userId,
          tenantId: apptTenantId,
          isApproved: true,
          status: 'confirmed',
          bookedByAdmin: !!isAdminOrGroomer
        });
        
        appointment = await storage.createAppointment(appointmentData);
        
        // Create appointment_pets records for all pets
        if (req.body.pets && req.body.pets.length > 0) {
          const SERVICES = [
            { id: 'grooming-full', price: 35 },
            { id: 'grooming-bath', price: 20 },
          ];
          
          const petsWithPrice = petsArray.map((pet: any) => {
            const service = SERVICES.find(s => s.id === pet.serviceType);
            const groomerId = pet.groomerId || req.body.groomerId;
            return {
              petName: pet.petName,
              petType: pet.petType,
              serviceType: pet.serviceType,
              specialNotes: pet.specialNotes,
              price: service ? service.price.toString() : '0',
              groomerId: groomerId || null,
              addOns: pet.addOns || null,
            };
          });
          
          await storage.createAppointmentPets(appointment.id, petsWithPrice);
        }
      } finally {
        // Always release the booking lock after appointment creation (or failure)
        await storage.releaseBookingLock(appointmentDateStr);
      }
      
      // Send admin notifications for new appointment (fire-and-forget, never block the response)
      const customerName = `${appointment.ownerFirstName} ${appointment.ownerLastName}`;
      const serviceInfo = petsArray.length > 1 
        ? `${petsArray.length} pets: ${petNamesStr}`
        : appointment.serviceType;
      const capturedAppointment = appointment;
      storage.getAllUsers((req as any).tenantId).then(allUsers => {
        const adminEmails = allUsers
          .filter(u => u.isAdmin && u.appointmentEmailsOptIn !== false)
          .map(u => u.email)
          .filter((email): email is string => !!email);
        const groomerEmails = allUsers
          .filter(u => u.isGroomer && !u.isAdmin)
          .map(u => u.email)
          .filter((email): email is string => !!email);
        const customerUser = allUsers.find(u => u.id === capturedAppointment.userId);
        return notificationService.sendAdminNewAppointmentNotifications(
          adminEmails,
          capturedAppointment.id,
          customerName,
          serviceInfo,
          capturedAppointment.appointmentDate,
          capturedAppointment.appointmentTime,
          groomerEmails,
          customerUser?.email ?? undefined,
          capturedAppointment.ownerFirstName || customerUser?.firstName || undefined,
          (req as any).tenantId
        );
      }).catch(notificationError => {
        console.error('Failed to send admin notifications for new appointment:', notificationError);
      });
      
      // Calculate remaining slots after booking
      let remainingSlots = null;
      try {
        const weeklyLimit = await storage.getWeeklyAppointmentLimit(dayOfWeek, (req as any).tenantId);
        if (weeklyLimit) {
          // Re-count existing appointments after this booking (all non-cancelled/rejected consume capacity)
          const updatedAppointments = await storage.getAppointments(undefined, (req as any).tenantId);
          const activeForDate = updatedAppointments.filter((apt: any) => {
            if (!apt.appointmentDate) return false;
            if (apt.status === 'cancelled' || apt.status === 'rejected') return false;
            // Handle both string and Date types
            const aptDateStr = typeof apt.appointmentDate === 'string' 
              ? apt.appointmentDate.split('T')[0] 
              : apt.appointmentDate.toISOString().split('T')[0];
            return aptDateStr === rawDateStr;
          });
          
          let bathCount = 0;
          let groomCount = 0;
          for (const apt of activeForDate) {
            const pets = await storage.getAppointmentPets(apt.id);
            for (const pet of pets) {
              // Use substring matching like the rest of the capacity logic
              const serviceType = (pet.serviceType || '').toLowerCase();
              if (serviceType.includes('bath')) {
                bathCount++;
              } else if (serviceType.includes('full') || (serviceType.includes('groom') && !serviceType.includes('bath'))) {
                groomCount++;
              }
            }
          }
          
          remainingSlots = {
            bathAvailable: Math.max(0, weeklyLimit.maxBathAppointments - bathCount),
            groomAvailable: Math.max(0, weeklyLimit.maxGroomAppointments - groomCount),
            totalAvailable: Math.max(0, weeklyLimit.maxBathAppointments - bathCount) + Math.max(0, weeklyLimit.maxGroomAppointments - groomCount)
          };
        }
      } catch (slotsError) {
        console.error('Failed to calculate remaining slots:', slotsError);
      }
      
      res.json({ ...appointment, remainingSlots });
    } catch (error) {
      console.error("Error creating appointment:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid appointment data", errors: error.errors });
      }
      // Return more specific error message for debugging production issues
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error("Appointment creation failed with:", errorMessage);
      res.status(500).json({ message: `Failed to create appointment: ${errorMessage}` });
    }
  });

  // Customer pet routes
  app.get("/api/customer-pets", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const pets = await storage.getCustomerPets(userId);
      res.json(pets);
    } catch (error) {
      console.error("Error fetching customer pets:", error);
      res.status(500).json({ message: "Failed to fetch customer pets" });
    }
  });

  app.post("/api/customer-pets", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const petData = insertCustomerPetSchema.parse({ ...req.body, userId });
      const pet = await storage.createCustomerPet(petData);
      res.json(pet);
    } catch (error) {
      console.error("Error creating customer pet:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid pet data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create customer pet" });
    }
  });

  app.patch("/api/customer-pets/:id", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const tenantId: number | undefined = req.tenantId;
      const petId = parseInt(req.params.id);
      const pets = await storage.getCustomerPets(userId);
      if (!pets.find((p: any) => p.id === petId)) {
        return res.status(403).json({ message: "Not your pet" });
      }
      const { name, species, breed, age, notes } = req.body;
      const updated = await storage.updateCustomerPet(petId, { name, species, breed, age, notes }, tenantId);
      res.json(updated);
    } catch (error) {
      console.error("Error updating customer pet:", error);
      res.status(500).json({ message: "Failed to update pet" });
    }
  });

  // Boarding/Babysitting routes
  app.get("/api/admin/boarding", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const records = await storage.getAllBoardingRecords((req as any).tenantId);
      res.json(records);
    } catch (error) {
      console.error("Error fetching boarding records:", error);
      res.status(500).json({ message: "Failed to fetch boarding records" });
    }
  });

  app.get("/api/admin/boarding/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const record = await storage.getBoardingRecord(parseInt(req.params.id), (req as any).tenantId);
      if (!record) {
        return res.status(404).json({ message: "Boarding record not found" });
      }
      res.json(record);
    } catch (error) {
      console.error("Error fetching boarding record:", error);
      res.status(500).json({ message: "Failed to fetch boarding record" });
    }
  });

  app.post("/api/admin/boarding", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const record = await storage.createBoardingRecord({ ...req.body, tenantId });
      res.json(record);
    } catch (error) {
      console.error("Error creating boarding record:", error);
      res.status(500).json({ message: "Failed to create boarding record" });
    }
  });

  app.put("/api/admin/boarding/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const record = await storage.updateBoardingRecord(parseInt(req.params.id), req.body, tenantId);
      res.json(record);
    } catch (error) {
      console.error("Error updating boarding record:", error);
      res.status(500).json({ message: "Failed to update boarding record" });
    }
  });

  app.patch("/api/admin/boarding/:id/check-in", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const record = await storage.checkInBoardingRecord(parseInt(req.params.id), tenantId);
      res.json(record);
    } catch (error) {
      console.error("Error checking in boarding record:", error);
      res.status(500).json({ message: "Failed to check in boarding record" });
    }
  });

  app.patch("/api/admin/boarding/:id/check-out", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const record = await storage.checkOutBoardingRecord(parseInt(req.params.id), tenantId);
      res.json(record);
    } catch (error) {
      console.error("Error checking out boarding record:", error);
      res.status(500).json({ message: "Failed to check out boarding record" });
    }
  });

  app.delete("/api/admin/boarding/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      await storage.deleteBoardingRecord(parseInt(req.params.id), tenantId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting boarding record:", error);
      res.status(500).json({ message: "Failed to delete boarding record" });
    }
  });

  // Schedule routes
  app.get("/api/admin/schedule", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const scheduleEntries = await storage.getAllScheduleEntries((req as any).tenantId);
      res.json(scheduleEntries);
    } catch (error) {
      console.error("Error fetching schedule entries:", error);
      res.status(500).json({ message: "Failed to fetch schedule entries" });
    }
  });

  app.post("/api/admin/schedule/batch", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const { entries } = req.body;
      const result = await storage.batchUpdateScheduleEntries(entries, tenantId);
      res.json(result);
    } catch (error) {
      console.error("Error batch updating schedule entries:", error);
      res.status(500).json({ message: "Failed to batch update schedule entries" });
    }
  });

  app.patch("/api/admin/schedule/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const updated = await storage.updateScheduleEntry(parseInt(req.params.id), req.body, tenantId);
      res.json(updated);
    } catch (error) {
      console.error("Error updating schedule entry:", error);
      res.status(500).json({ message: "Failed to update schedule entry" });
    }
  });

  app.delete("/api/admin/schedule/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      await storage.deleteScheduleEntry(parseInt(req.params.id), tenantId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting schedule entry:", error);
      res.status(500).json({ message: "Failed to delete schedule entry" });
    }
  });

  // ── Schedule overrides routes ─────────────────────────────────────────────
  app.get("/api/admin/schedule-overrides", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId: number = req.tenantId;
      const overrides = await storage.getScheduleOverrides(tenantId);
      res.json(overrides);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/schedule-overrides", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const { employeeName, specificDate, timeSlot, note } = req.body;
      if (!employeeName || !specificDate || !timeSlot) return res.status(400).json({ message: "employeeName, specificDate, and timeSlot are required" });
      const override = await storage.upsertScheduleOverride({ tenantId, employeeName, specificDate, timeSlot, note });
      res.json(override);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/admin/schedule-overrides/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      await storage.deleteScheduleOverride(parseInt(req.params.id), tenantId);
      res.status(204).send();
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ── Payroll report — weekly summary (schedule template + overrides) ────────
  app.get("/api/admin/payroll/report", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId: number = req.tenantId;
      const { startDate } = req.query as { startDate?: string };
      if (!startDate) return res.status(400).json({ message: "startDate (YYYY-MM-DD) is required" });

      // Build 7 dates for the week starting at startDate
      const start = new Date(startDate + "T00:00:00Z");
      const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
      const weekDates: { date: Date; iso: string; dayName: string }[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setUTCDate(start.getUTCDate() + i);
        weekDates.push({ date: d, iso: d.toISOString().slice(0, 10), dayName: DAY_NAMES[d.getUTCDay()] });
      }

      // Fetch template entries and overrides
      const [templateEntries, overrides] = await Promise.all([
        storage.getAllScheduleEntries(tenantId),
        storage.getScheduleOverrides(tenantId),
      ]);

      // Helper: parse hours from time slot string
      function parseHours(slot: string): number | null {
        if (!slot || slot.toUpperCase() === "OFF" || slot === "-") return 0;
        // Normalize: remove am/pm, collapse to "HH:MM-HH:MM"
        const norm = slot.toLowerCase().replace(/am|pm/g, "").trim();
        const m = norm.match(/^(\d{1,2})(?::(\d{2}))?[-–](\d{1,2})(?::(\d{2}))?$/);
        if (!m) return null;
        const startH = parseInt(m[1]), startM = parseInt(m[2] ?? "0");
        let endH = parseInt(m[3]), endM = parseInt(m[4] ?? "0");
        // If end < start, assume PM (e.g. 9-5 means 9am-5pm)
        if (endH < startH) endH += 12;
        return (endH * 60 + endM - startH * 60 - startM) / 60;
      }

      // Get all unique employee names appearing in template
      const employeeNames = [...new Set(templateEntries.map((e: any) => e.employeeName))];

      // Build per-employee report rows
      const rows = employeeNames.map(empName => {
        const days: Record<string, { timeSlot: string; hours: number | null; isOverride: boolean }> = {};
        let totalHours = 0;
        let hasUnknown = false;

        weekDates.forEach(({ iso, dayName }) => {
          // Check for override first
          const override = overrides.find((o: any) => o.employeeName === empName && o.specificDate === iso);
          if (override) {
            const h = parseHours(override.timeSlot);
            days[iso] = { timeSlot: override.timeSlot, hours: h, isOverride: true };
            if (h === null) hasUnknown = true; else totalHours += h;
          } else {
            // Use template (match by dayOfWeek name)
            const tmpl = templateEntries.find((e: any) => e.employeeName === empName && e.dayOfWeek === dayName);
            const slot = tmpl?.timeSlot ?? "OFF";
            const h = parseHours(slot);
            days[iso] = { timeSlot: slot, hours: h, isOverride: false };
            if (h === null) hasUnknown = true; else totalHours += h;
          }
        });

        return { employeeName: empName, days, totalHours, hasUnknown };
      });

      res.json({ startDate, weekDates: weekDates.map(d => ({ iso: d.iso, dayName: d.dayName })), rows });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Grooming schedule routes
  app.get("/api/admin/grooming-schedule", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const groomingScheduleEntries = await storage.getAllGroomingScheduleEntries((req as any).tenantId);
      res.json(groomingScheduleEntries);
    } catch (error) {
      console.error("Error fetching grooming schedule entries:", error);
      res.status(500).json({ message: "Failed to fetch grooming schedule entries" });
    }
  });

  app.post("/api/admin/grooming-schedule/batch", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const { entries } = req.body;
      const result = await storage.batchUpdateGroomingScheduleEntries(entries, tenantId);
      res.json(result);
    } catch (error) {
      console.error("Error batch updating grooming schedule entries:", error);
      res.status(500).json({ message: "Failed to batch update grooming schedule entries" });
    }
  });

  app.patch("/api/admin/grooming-schedule/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const updated = await storage.updateGroomingScheduleEntry(parseInt(req.params.id), req.body, tenantId);
      res.json(updated);
    } catch (error) {
      console.error("Error updating grooming schedule entry:", error);
      res.status(500).json({ message: "Failed to update grooming schedule entry" });
    }
  });

  app.delete("/api/admin/grooming-schedule/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      await storage.deleteGroomingScheduleEntry(parseInt(req.params.id), tenantId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting grooming schedule entry:", error);
      res.status(500).json({ message: "Failed to delete grooming schedule entry" });
    }
  });

  // Admin user management routes
  app.get("/api/admin/users", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const users = await storage.getAllUsers((req as any).tenantId);
      const safeUsers = users.map(user => sanitizeUser(user));
      res.json(safeUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.get("/api/admin/users/count", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const allUsers = await storage.getAllUsers((req as any).tenantId);
      res.json({ count: allUsers.length });
    } catch (error) {
      console.error("Error fetching user count:", error);
      res.status(500).json({ message: "Failed to fetch user count" });
    }
  });

  app.post("/api/admin/users/:userId/admin", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { userId } = req.params;
      const { isAdmin } = req.body;

      if (typeof isAdmin !== 'boolean') {
        return res.status(400).json({ message: "isAdmin must be a boolean" });
      }

      const updatedUser = await storage.updateUserAdmin(userId, isAdmin);
      await storage.incrementTokenVersion(userId);
      const { password, ...safeUser } = updatedUser;
      
      res.json(safeUser);
    } catch (error: any) {
      console.error("Error updating user admin status:", error);
      if (error.message === 'User not found') {
        return res.status(404).json({ message: "User not found" });
      }
      res.status(500).json({ message: "Failed to update user admin status" });
    }
  });

  app.post("/api/admin/users/:userId/groomer", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { userId } = req.params;
      const { isGroomer } = req.body;

      if (typeof isGroomer !== 'boolean') {
        return res.status(400).json({ message: "isGroomer must be a boolean" });
      }

      const updatedUser = await storage.updateUserGroomer(userId, isGroomer);
      await storage.incrementTokenVersion(userId);
      const { password, ...safeUser } = updatedUser;
      
      res.json(safeUser);
    } catch (error: any) {
      console.error("Error updating user groomer status:", error);
      if (error.message === 'User not found') {
        return res.status(404).json({ message: "User not found" });
      }
      res.status(500).json({ message: "Failed to update user groomer status" });
    }
  });

  app.post("/api/admin/users/:userId/charge-account", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { userId } = req.params;
      const { isChargeAccount } = req.body;

      if (typeof isChargeAccount !== 'boolean') {
        return res.status(400).json({ message: "isChargeAccount must be a boolean" });
      }

      const updatedUser = await storage.updateUserChargeAccount(userId, isChargeAccount);
      await storage.incrementTokenVersion(userId);
      const { password, ...safeUser } = updatedUser;
      
      res.json(safeUser);
    } catch (error: any) {
      console.error("Error updating charge account status:", error);
      if (error.message === 'User not found') {
        return res.status(404).json({ message: "User not found" });
      }
      res.status(500).json({ message: "Failed to update charge account status" });
    }
  });

  app.post("/api/admin/users/:userId/superior-manager", authMiddleware, async (req: any, res) => {
    try {
      const caller = await storage.getUser(req.user?.id);
      if (!caller?.isSuperiorManager) {
        return res.status(403).json({ message: "Superior Manager access required" });
      }

      const { userId } = req.params;
      const { isSuperiorManager } = req.body;

      if (typeof isSuperiorManager !== 'boolean') {
        return res.status(400).json({ message: "isSuperiorManager must be a boolean" });
      }

      const updatedUser = await storage.updateUserSuperiorManager(userId, isSuperiorManager);
      await storage.incrementTokenVersion(userId);
      const { password, ...safeUser } = updatedUser;
      res.json(safeUser);
    } catch (error: any) {
      console.error("Error updating superior manager status:", error);
      if (error.message === 'User not found') {
        return res.status(404).json({ message: "User not found" });
      }
      res.status(500).json({ message: "Failed to update superior manager status" });
    }
  });

  // GET /api/admin/charge-account-reports — all charge account orders grouped by user
  app.get("/api/admin/charge-account-reports", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const data = await storage.getChargeAccountOrdersByUser((req as any).tenantId);
      res.json(data);
    } catch (error: any) {
      console.error("Error fetching charge account reports:", error);
      res.status(500).json({ message: "Failed to fetch charge account reports" });
    }
  });

  // POST /api/admin/charge-account-reports/:userId/email — email the report to the account holder
  app.post("/api/admin/charge-account-reports/:userId/email", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { userId } = req.params;
      const data = await storage.getChargeAccountOrdersByUser((req as any).tenantId);
      const accountData = data.find((d) => d.user.id === userId);

      if (!accountData) {
        return res.status(404).json({ message: "No charge account orders found for this user" });
      }

      const { user, orders: userOrders } = accountData;
      const toEmail = user.email;
      if (!toEmail || toEmail.startsWith('temp_')) {
        return res.status(400).json({ message: "No valid email address for this account" });
      }

      const { getUncachableSendGridClient } = await import('./sendgridIntegration');
      const { client: sgMail, fromEmail, replyTo } = await getUncachableSendGridClient();

      const storeAddress = '2934 Cypress St, West Monroe, LA 71291';
      const storePhone = '(318) 322-3023';

      const { discountPercent = 0 } = req.body;
      const discountPct = Math.min(100, Math.max(0, Number(discountPercent) || 0));

      const grandTotal = userOrders.reduce((sum, { order }) => sum + parseFloat(order.totalAmount || '0'), 0);
      const discountAmount = grandTotal * (discountPct / 100);
      const finalTotal = grandTotal - discountAmount;

      const ordersHtml = userOrders.map(({ order, items }) => {
        const orderDate = order.orderDate
          ? new Date(order.orderDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
          : 'Unknown date';
        const itemsHtml = items.map((item) => `
          <tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #374151;">${item.itemName}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #374151; text-align: center;">${item.quantity}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #374151; text-align: right;">$${parseFloat(item.price || '0').toFixed(2)}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #374151; text-align: right;">$${(parseFloat(item.price || '0') * (item.quantity || 1)).toFixed(2)}</td>
          </tr>`).join('');
        return `
          <div style="margin-bottom: 28px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
            <div style="background: #f3f4f6; padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
              <strong style="color: #1f2937;">Order #${order.id}</strong>
              <span style="color: #6b7280; margin-left: 16px; font-size: 14px;">${orderDate}</span>
            </div>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background: #f9fafb;">
                  <th style="padding: 8px 12px; text-align: left; color: #6b7280; font-size: 12px; text-transform: uppercase; font-weight: 600;">Item</th>
                  <th style="padding: 8px 12px; text-align: center; color: #6b7280; font-size: 12px; text-transform: uppercase; font-weight: 600;">Qty</th>
                  <th style="padding: 8px 12px; text-align: right; color: #6b7280; font-size: 12px; text-transform: uppercase; font-weight: 600;">Unit Price</th>
                  <th style="padding: 8px 12px; text-align: right; color: #6b7280; font-size: 12px; text-transform: uppercase; font-weight: 600;">Line Total</th>
                </tr>
              </thead>
              <tbody>${itemsHtml}</tbody>
            </table>
            <div style="padding: 10px 16px; background: #f9fafb; border-top: 1px solid #e5e7eb; text-align: right;">
              ${order.discountAmount && parseFloat(order.discountAmount) > 0 ? `<div style="color: #374151; margin-bottom: 4px;">Discount: <strong>-$${parseFloat(order.discountAmount).toFixed(2)}</strong></div>` : ''}
              <div style="color: #374151; margin-bottom: 4px;">Tax: <strong>$${parseFloat(order.taxAmount || '0').toFixed(2)}</strong></div>
              <div style="color: #1f2937; font-size: 16px; font-weight: bold;">Order Total: $${parseFloat(order.totalAmount || '0').toFixed(2)}</div>
            </div>
          </div>`;
      }).join('');

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 28px 24px; text-align: center;">
            <h1 style="color: #f59e0b; margin: 0 0 6px 0; font-size: 26px;">PilotHouse</h1>
            <p style="color: #cbd5e1; margin: 0; font-size: 14px;">Charge Account Statement</p>
          </div>
          <div style="padding: 32px 24px; background: #ffffff;">
            <p style="color: #374151; margin: 0 0 8px 0;">Hello <strong>${user.firstName || 'Valued Customer'} ${user.lastName || ''}</strong>,</p>
            <p style="color: #374151; margin: 0 0 24px 0;">
              Please find below the statement of items charged to your account at PilotHouse.
              Payment is due in-store at your earliest convenience.
            </p>
            ${ordersHtml}
            <div style="background: #1f2937; color: #f9fafb; padding: 20px 24px; border-radius: 8px; margin-top: 8px; text-align: right;">
              ${discountPct > 0 ? `
              <div style="font-size: 14px; color: #9ca3af; margin-bottom: 6px;">
                Subtotal: <strong style="color: #f9fafb;">$${grandTotal.toFixed(2)}</strong>
              </div>
              <div style="font-size: 14px; color: #34d399; margin-bottom: 10px;">
                Courtesy Discount (${discountPct}%): <strong>−$${discountAmount.toFixed(2)}</strong>
              </div>
              <div style="border-top: 1px solid #374151; padding-top: 10px; font-size: 22px; font-weight: bold;">
                Amount Due: <span style="color: #f59e0b;">$${finalTotal.toFixed(2)}</span>
              </div>` : `
              <div style="font-size: 20px; font-weight: bold;">
                Grand Total Due: <span style="color: #f59e0b;">$${grandTotal.toFixed(2)}</span>
              </div>`}
              <div style="font-size: 13px; color: #9ca3af; margin-top: 6px;">
                ${userOrders.length} order${userOrders.length !== 1 ? 's' : ''} on file
              </div>
            </div>
            <p style="color: #6b7280; margin: 24px 0 0 0; font-size: 14px;">
              Please bring this statement or reference your account name when making payment.
              If you have any questions about your balance, please don't hesitate to call us.
            </p>
          </div>
          <div style="background-color: #1f2937; color: #d1d5db; padding: 18px 24px; text-align: center; font-size: 12px;">
            <p style="margin: 0 0 4px 0;"><strong>PilotHouse</strong></p>
            <p style="margin: 0 0 4px 0;">${storeAddress}</p>
            <p style="margin: 0;">Phone: ${storePhone}</p>
          </div>
        </div>`;

      await sgMail.send({
        to: toEmail,
        from: fromEmail,
        replyTo,
        subject: `Your Charge Account Statement — PilotHouse`,
        html,
      });

      res.json({ message: `Statement emailed to ${toEmail}`, grandTotal: grandTotal.toFixed(2), finalTotal: finalTotal.toFixed(2), discountPercent: discountPct });
    } catch (error: any) {
      console.error("Error emailing charge account report:", error);
      res.status(500).json({ message: "Failed to send charge account report email" });
    }
  });

  app.post("/api/admin/users/:userId/verify-email", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { userId } = req.params;

      const [updatedUser] = await db.update(users).set({
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiry: null,
      }).where(eq(users.id, userId)).returning();

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const { password, ...safeUser } = updatedUser;
      console.log(`Admin ${req.user.id} manually verified email for user ${userId}`);
      res.json(safeUser);
    } catch (error) {
      console.error("Error manually verifying user email:", error);
      res.status(500).json({ message: "Failed to verify user email" });
    }
  });

  app.delete("/api/admin/users/:userId", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { userId } = req.params;

      // Prevent admin from deleting themselves
      if (req.user.id === userId) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }

      await storage.deleteUser(userId);
      
      res.json({ message: "User deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting user:", error);
      if (error.message === 'User not found') {
        return res.status(404).json({ message: "User not found" });
      }
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // ── Specials / Deals ────────────────────────────────────────────────────────

  // Public: active specials only
  app.get("/api/specials", async (_req, res) => {
    try {
      const items = await storage.getActiveSpecials();
      res.json(items);
    } catch (error) {
      console.error("Error fetching specials:", error);
      res.status(500).json({ message: "Failed to fetch specials" });
    }
  });

  // Admin: all specials
  app.get("/api/admin/specials", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const items = await storage.getAllSpecialsAdmin();
      res.json(items);
    } catch (error) {
      console.error("Error fetching admin specials:", error);
      res.status(500).json({ message: "Failed to fetch specials" });
    }
  });

  app.post("/api/admin/specials", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const { title, description, imageUrl, imageUrls, badgeText, badgeColor, linkType, linkId, externalUrl, isActive, sortOrder } = req.body;
      if (!title?.trim()) return res.status(400).json({ message: "Title is required" });
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const created = await storage.createSpecial({
        title: title.trim(), description, imageUrl, imageUrls: imageUrls || [], badgeText, badgeColor: badgeColor || 'red',
        linkType: linkType || 'none', linkId: linkId || null, externalUrl,
        isActive: isActive !== false, sortOrder: sortOrder ?? 0,
        tenantId,
      });
      res.json(created);
    } catch (error) {
      console.error("Error creating special:", error);
      res.status(500).json({ message: "Failed to create special" });
    }
  });

  app.put("/api/admin/specials/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const id = parseInt(req.params.id);
      const { title, description, imageUrl, imageUrls, badgeText, badgeColor, linkType, linkId, externalUrl, isActive, sortOrder } = req.body;
      const updated = await storage.updateSpecial(id, {
        title, description, imageUrl, imageUrls: imageUrls || [], badgeText, badgeColor, linkType, linkId, externalUrl, isActive, sortOrder,
      });
      res.json(updated);
    } catch (error) {
      console.error("Error updating special:", error);
      res.status(500).json({ message: "Failed to update special" });
    }
  });

  app.delete("/api/admin/specials/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const id = parseInt(req.params.id);
      await storage.deleteSpecial(id);
      res.json({ message: "Special deleted" });
    } catch (error) {
      console.error("Error deleting special:", error);
      res.status(500).json({ message: "Failed to delete special" });
    }
  });

  app.post("/api/admin/specials/upload-image", authMiddleware, upload.single('image'), async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      if (!req.file) return res.status(400).json({ message: "No image file uploaded" });

      const fs = await import('fs/promises');
      const fileBuffer = await fs.readFile(req.file.path);
      const { ObjectStorageService } = await import('./objectStorageService');
      const objectStorageService = new ObjectStorageService();

      const uniqueSuffix = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
      const result = await objectStorageService.storeUploadedProductImage(
        fileBuffer,
        req.file.mimetype,
        0,
        `special-${uniqueSuffix}`,
        'specials'
      );

      await fs.unlink(req.file.path).catch(() => {});

      if (!result.success) {
        return res.status(400).json({ message: result.error || "Failed to store image" });
      }

      res.json({ storedPath: result.storedPath });
    } catch (error: any) {
      console.error("Error uploading special image:", error);
      res.status(500).json({ message: error.message || "Failed to upload image" });
    }
  });

  // Admin Email Center - Send emails to users
  app.post("/api/admin/email/send", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { recipients, subject, message, sendToAll, roleFilter, isMarketing } = req.body;

      if (!subject || !message) {
        return res.status(400).json({ message: "Subject and message are required" });
      }

      const { getUncachableSendGridClient } = await import('./sendgridIntegration');
      const { client: sgMail, fromEmail, replyTo, adminBcc } = await getUncachableSendGridClient();

      let targetUsers: any[] = [];

      if (sendToAll) {
        targetUsers = await storage.getAllUsers((req as any).tenantId);
        targetUsers = targetUsers.filter((u: any) => {
          if (!u.email || u.email.startsWith('temp_')) return false;
          
          if (roleFilter && roleFilter !== 'all') {
            const roles = Array.isArray(roleFilter) ? roleFilter : [roleFilter];
            const isCustomer = !u.isAdmin && !u.isGroomer;
            if (roles.includes('customers') && isCustomer) return true;
            if (roles.includes('groomers') && u.isGroomer) return true;
            if (roles.includes('admins') && u.isAdmin) return true;
            return false;
          }
          return true;
        });
      } else if (recipients && Array.isArray(recipients) && recipients.length > 0) {
        for (const userId of recipients) {
          const user = await storage.getUser(userId);
          if (user && user.email && !user.email.startsWith('temp_')) {
            targetUsers.push(user);
          }
        }
      } else {
        return res.status(400).json({ message: "No recipients specified" });
      }

      let skippedOptOut = 0;
      if (isMarketing) {
        const beforeCount = targetUsers.length;
        targetUsers = targetUsers.filter((u: any) => u.marketingEmailsOptIn !== false);
        skippedOptOut = beforeCount - targetUsers.length;
      }

      if (targetUsers.length === 0) {
        return res.status(400).json({ message: "No valid recipients found" });
      }

      // Send emails
      let successCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      for (const user of targetUsers) {
        try {
          const emailBaseUrl = getBaseUrl();
          
          const bccList = (adminBcc && user.email.toLowerCase() !== adminBcc.toLowerCase()) ? [{ email: adminBcc }] : [];
          
          await sgMail.send({
            to: user.email,
            from: fromEmail,
            replyTo,
            ...(bccList.length > 0 ? { bcc: bccList } : {}),
            subject: subject,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 20px; text-align: center;">
                  <h1 style="color: #f59e0b; margin: 0;">PilotHouse</h1>
                </div>
                <div style="padding: 30px; background: #ffffff;">
                  <p style="color: #374151;">Hello ${user.firstName || 'Valued Customer'},</p>
                  <div style="color: #374151; line-height: 1.6;">
                    ${message.replace(/\n/g, '<br>')}
                  </div>
                </div>
                <div style="background-color: #1f2937; color: #d1d5db; padding: 15px; text-align: center; font-size: 12px;">
                  <p style="margin: 0 0 5px 0;"><strong>PilotHouse</strong></p>
                  <p style="margin: 0 0 5px 0;">2934 Cypress St, West Monroe, LA 71291</p>
                  <p style="margin: 0 0 10px 0;">Phone: (318) 322-3023</p>
                  ${isMarketing ? `<p style="margin: 0 0 5px 0;">You are receiving this email because you have an account with PilotHouse.</p>
                  <p style="margin: 0;"><a href="${emailBaseUrl}/profile" style="color: #93c5fd; text-decoration: underline;">Unsubscribe from marketing emails</a></p>` : `<p style="margin: 0;">If you have any questions, please contact us.</p>`}
                </div>
              </div>
            `,
          });
          successCount++;
        } catch (emailError: any) {
          failedCount++;
          const sgErrors = emailError.response?.body?.errors;
          errors.push(`Failed to send to ${user.email}: ${emailError.message}`);
          console.error(`Failed to send email to ${user.email}:`, emailError.message, JSON.stringify(sgErrors));
        }
      }

      const optOutMsg = skippedOptOut > 0 ? `, ${skippedOptOut} skipped (opted out of marketing)` : '';
      res.json({
        message: `Emails sent: ${successCount} successful, ${failedCount} failed${optOutMsg}`,
        stats: {
          total: targetUsers.length,
          success: successCount,
          failed: failedCount,
          skippedOptOut,
          errors: errors.slice(0, 5)
        }
      });
    } catch (error: any) {
      console.error("Error sending bulk emails:", error);
      res.status(500).json({ message: error.message || "Failed to send emails" });
    }
  });

  // Get all users for email/SMS recipient selection
  app.get("/api/admin/email/recipients", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const allUsers = await storage.getAllUsers((req as any).tenantId);
      
      // Filter out users without valid emails and return data with role info
      const recipients = allUsers
        .filter((u: any) => u.email && !u.email.startsWith('temp_'))
        .map((u: any) => ({
          id: u.id,
          email: u.email,
          phoneNumber: u.phoneNumber || null,
          firstName: u.firstName,
          lastName: u.lastName,
          fullName: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
          isAdmin: u.isAdmin || false,
          isGroomer: u.isGroomer || false
        }));

      res.json(recipients);
    } catch (error) {
      console.error("Error fetching email recipients:", error);
      res.status(500).json({ message: "Failed to fetch recipients" });
    }
  });

  // Twilio inbound SMS webhook — auto-reply for customer replies to toll-free number
  app.post("/api/twilio/inbound-sms", async (req: any, res) => {
    try {
      const body: string = (req.body?.Body || '').trim().toUpperCase();
      // STOP/HELP/UNSTOP are handled automatically by Twilio at the carrier level — don't reply
      if (['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'HELP', 'INFO', 'UNSTOP', 'START'].includes(body)) {
        res.set('Content-Type', 'text/xml');
        return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
      }

      const autoReply = "Thanks for reaching out to PilotHouse! We're unable to monitor replies to this number. Please call us at (318) 322-3023 for assistance. Reply STOP to opt out of texts.";

      res.set('Content-Type', 'text/xml');
      return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${autoReply}</Message></Response>`);
    } catch (error) {
      console.error('Twilio inbound SMS webhook error:', error);
      res.set('Content-Type', 'text/xml');
      return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
    }
  });

  // Admin SMS Center - Send text messages to users
  app.post("/api/admin/sms/test", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const { phoneNumber } = req.body;
      if (!phoneNumber) return res.status(400).json({ message: "phoneNumber is required" });
      const result = await notificationService.sendTestSMS(phoneNumber);
      return res.json(result);
    } catch (error: any) {
      console.error("Test SMS error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/admin/sms/send", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { recipients, message, sendToAll, roleFilter } = req.body;

      if (!message) {
        return res.status(400).json({ message: "Message is required" });
      }

      // Check Twilio configuration
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
        return res.status(400).json({ 
          message: "SMS service not configured. Please set up Twilio credentials.",
          setupRequired: true
        });
      }

      let targetUsers: any[] = [];

      if (sendToAll) {
        // Get all users with phone numbers
        targetUsers = await storage.getAllUsers((req as any).tenantId);
        targetUsers = targetUsers.filter((u: any) => {
          if (!u.phoneNumber) return false;
          
          if (roleFilter && roleFilter !== 'all') {
            const roles = Array.isArray(roleFilter) ? roleFilter : [roleFilter];
            const isCustomer = !u.isAdmin && !u.isGroomer;
            if (roles.includes('customers') && isCustomer) return true;
            if (roles.includes('groomers') && u.isGroomer) return true;
            if (roles.includes('admins') && u.isAdmin) return true;
            return false;
          }
          return true;
        });
      } else if (recipients && Array.isArray(recipients) && recipients.length > 0) {
        for (const userId of recipients) {
          const user = await storage.getUser(userId);
          if (user && user.phoneNumber) {
            targetUsers.push(user);
          }
        }
      } else {
        return res.status(400).json({ message: "No recipients specified" });
      }

      if (targetUsers.length === 0) {
        return res.status(400).json({ message: "No valid recipients with phone numbers found" });
      }

      // Send SMS messages
      const twilio = await import('twilio');
      const client = twilio.default(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      
      let successCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      for (const user of targetUsers) {
        try {
          await client.messages.create({
            body: message,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: user.phoneNumber,
          });
          successCount++;
        } catch (smsError: any) {
          failedCount++;
          errors.push(`Failed to send to ${user.phoneNumber}: ${smsError.message}`);
          console.error(`Failed to send SMS to ${user.phoneNumber}:`, smsError);
        }
      }

      res.json({
        message: `Text messages sent: ${successCount} successful, ${failedCount} failed`,
        stats: {
          total: targetUsers.length,
          success: successCount,
          failed: failedCount,
          errors: errors.slice(0, 5)
        }
      });
    } catch (error: any) {
      console.error("Error sending bulk SMS:", error);
      res.status(500).json({ message: error.message || "Failed to send text messages" });
    }
  });

  // Automated Messages routes
  app.get("/api/admin/automated-messages", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const messages = await storage.getAllAutomatedMessages();
      res.json(messages);
    } catch (error) {
      console.error("Error fetching automated messages:", error);
      res.status(500).json({ message: "Failed to fetch automated messages" });
    }
  });

  app.post("/api/admin/automated-messages", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const message = await storage.createAutomatedMessage(req.body);
      res.status(201).json(message);
    } catch (error) {
      console.error("Error creating automated message:", error);
      res.status(500).json({ message: "Failed to create automated message" });
    }
  });

  app.put("/api/admin/automated-messages/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const id = parseInt(req.params.id);
      const message = await storage.updateAutomatedMessage(id, req.body);
      res.json(message);
    } catch (error) {
      console.error("Error updating automated message:", error);
      res.status(500).json({ message: "Failed to update automated message" });
    }
  });

  app.delete("/api/admin/automated-messages/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const id = parseInt(req.params.id);
      await storage.deleteAutomatedMessage(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting automated message:", error);
      res.status(500).json({ message: "Failed to delete automated message" });
    }
  });

  app.patch("/api/admin/automated-messages/:id/toggle", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const id = parseInt(req.params.id);
      const { isActive } = req.body;
      const message = await storage.updateAutomatedMessage(id, { isActive });
      res.json(message);
    } catch (error) {
      console.error("Error toggling automated message:", error);
      res.status(500).json({ message: "Failed to toggle automated message" });
    }
  });

  // Daily Sales Report Settings routes
  app.get("/api/admin/daily-report-settings", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const settings = await storage.getGroomingSettings((req as any).tenantId);
      const enabledSetting = settings.find((s: any) => s.setting === 'daily_report_enabled');
      const emailsSetting = settings.find((s: any) => s.setting === 'daily_report_emails');
      const timeSetting = settings.find((s: any) => s.setting === 'daily_report_time');

      res.json({
        enabled: enabledSetting?.value === 'true',
        emails: emailsSetting?.value || '',
        time: timeSetting?.value || '21:00'
      });
    } catch (error) {
      console.error("Error fetching daily report settings:", error);
      res.status(500).json({ message: "Failed to fetch daily report settings" });
    }
  });

  app.post("/api/admin/daily-report-settings", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;

      const { enabled, emails, time } = req.body;

      // Save settings using grooming_settings table
      await storage.upsertGroomingSetting({ setting: 'daily_report_enabled', value: enabled ? 'true' : 'false', tenantId});
      await storage.upsertGroomingSetting({ setting: 'daily_report_emails', value: emails || '', tenantId});
      await storage.upsertGroomingSetting({ setting: 'daily_report_time', value: time || '21:00', tenantId});

      res.json({ success: true, message: "Daily report settings saved" });
    } catch (error) {
      console.error("Error saving daily report settings:", error);
      res.status(500).json({ message: "Failed to save daily report settings" });
    }
  });

  app.post("/api/admin/daily-report-settings/test", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { emails, reportDate } = req.body;
      
      if (!emails || !emails.trim()) {
        return res.status(400).json({ message: "Email address is required" });
      }

      // Import and call the sendDailySalesReport function
      const { sendDailySalesReport } = await import('./dailySalesReport');
      await sendDailySalesReport(
        emails.split(',').map((e: string) => e.trim()).filter((e: string) => e),
        reportDate || undefined,
        (req as any).tenantId
      );

      res.json({ success: true, message: "Report sent successfully" });
    } catch (error: any) {
      console.error("Error sending test daily report:", error);
      res.status(500).json({ message: error.message || "Failed to send test report" });
    }
  });

  // ── Monthly Report Settings ──────────────────────────────────────────────────
  app.get("/api/admin/monthly-report-settings", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const settings = await storage.getGroomingSettings((req as any).tenantId);
      res.json({
        enabled: settings.find((s: any) => s.setting === 'monthly_report_enabled')?.value === 'true',
        emails:  settings.find((s: any) => s.setting === 'monthly_report_emails')?.value  || '',
        day:     settings.find((s: any) => s.setting === 'monthly_report_day')?.value     || '1',
        time:    settings.find((s: any) => s.setting === 'monthly_report_time')?.value    || '08:00',
      });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/monthly-report-settings", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const { enabled, emails, day, time } = req.body;
      await Promise.all([
        storage.upsertGroomingSetting({ setting: 'monthly_report_enabled', value: enabled ? 'true' : 'false', tenantId}),
        storage.upsertGroomingSetting({ setting: 'monthly_report_emails',  value: emails || '', tenantId}),
        storage.upsertGroomingSetting({ setting: 'monthly_report_day',     value: String(day || '1'), tenantId}),
        storage.upsertGroomingSetting({ setting: 'monthly_report_time',    value: time  || '08:00', tenantId}),
      ]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/monthly-report-settings/test", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const { emails, month } = req.body; // month = "YYYY-MM"
      if (!emails?.trim()) return res.status(400).json({ message: "Email address required" });
      const { sendMonthlySalesReport } = await import('./periodicSalesReport');
      await sendMonthlySalesReport(
        emails.split(',').map((e: string) => e.trim()).filter(Boolean),
        month || undefined,
        (req as any).tenantId
      );
      res.json({ success: true, message: "Monthly report sent" });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ── Yearly Report Settings ────────────────────────────────────────────────────
  app.get("/api/admin/yearly-report-settings", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const settings = await storage.getGroomingSettings((req as any).tenantId);
      res.json({
        enabled: settings.find((s: any) => s.setting === 'yearly_report_enabled')?.value === 'true',
        emails:  settings.find((s: any) => s.setting === 'yearly_report_emails')?.value  || '',
        time:    settings.find((s: any) => s.setting === 'yearly_report_time')?.value    || '08:00',
      });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/yearly-report-settings", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const { enabled, emails, time } = req.body;
      await Promise.all([
        storage.upsertGroomingSetting({ setting: 'yearly_report_enabled', value: enabled ? 'true' : 'false', tenantId}),
        storage.upsertGroomingSetting({ setting: 'yearly_report_emails',  value: emails || '', tenantId}),
        storage.upsertGroomingSetting({ setting: 'yearly_report_time',    value: time  || '08:00', tenantId}),
      ]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/yearly-report-settings/test", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const { emails, year } = req.body; // year = number e.g. 2025
      if (!emails?.trim()) return res.status(400).json({ message: "Email address required" });
      const { sendYearlySalesReport } = await import('./periodicSalesReport');
      await sendYearlySalesReport(
        emails.split(',').map((e: string) => e.trim()).filter(Boolean),
        year ? parseInt(year) : undefined,
        (req as any).tenantId
      );
      res.json({ success: true, message: "Yearly report sent" });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Send refund report email
  app.post("/api/admin/send-refund-report", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { email, startDate, endDate } = req.body;
      
      if (!email || !email.trim()) {
        return res.status(400).json({ message: "Email address is required" });
      }

      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Date range is required" });
      }

      // Fetch refunds from database - never trust client-provided refund data
      const refunds = await storage.getRefundsByDateRange(startDate, endDate, (req as any).tenantId);

      if (!refunds || refunds.length === 0) {
        return res.status(400).json({ message: "No refunds found for the selected date range" });
      }

      // Calculate totals from database data
      const totalRefunded = refunds.reduce((sum: number, r: any) => sum + parseFloat(r.refundAmount || 0), 0);

      // Build email content
      const refundRows = refunds.map((r: any) => 
        `<tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">#${r.orderId}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${new Date(r.refundDate).toLocaleDateString()}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${r.reason || 'N/A'}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; color: #d97706;">-$${parseFloat(r.refundAmount).toFixed(2)}</td>
        </tr>`
      ).join('');

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e3a8a;">PilotHouse - Refund Report</h2>
          <p style="color: #666;">Date Range: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}</p>
          
          <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; font-size: 18px; color: #92400e;">
              <strong>Total Refunded: -$${totalRefunded.toFixed(2)}</strong>
            </p>
            <p style="margin: 5px 0 0; color: #78350f; font-size: 14px;">
              ${refunds.length} refund${refunds.length !== 1 ? 's' : ''} processed
            </p>
          </div>

          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background-color: #f3f4f6;">
                <th style="padding: 10px; text-align: left;">Order</th>
                <th style="padding: 10px; text-align: left;">Date</th>
                <th style="padding: 10px; text-align: left;">Reason</th>
                <th style="padding: 10px; text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${refundRows}
            </tbody>
            <tfoot>
              <tr style="background-color: #fef3c7;">
                <td colspan="3" style="padding: 10px; font-weight: bold;">Total Refunded</td>
                <td style="padding: 10px; text-align: right; font-weight: bold; color: #d97706;">-$${totalRefunded.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>

          <p style="color: #666; font-size: 12px; margin-top: 20px;">
            This report is for ExaTouch POS reconciliation purposes.<br>
            Generated on ${new Date().toLocaleString()}
          </p>
        </div>
      `;

      // Send email using sendGrid
      const { getUncachableSendGridClient } = await import('./sendgridIntegration');
      const { client, fromEmail, replyTo } = await getUncachableSendGridClient();
      await client.send({
        to: email,
        from: { email: fromEmail, name: 'PilotHouse' },
        replyTo,
        subject: `Refund Report: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`,
        html: emailHtml
      });

      res.json({ success: true, message: "Refund report sent successfully" });
    } catch (error: any) {
      console.error("Error sending refund report:", error);
      res.status(500).json({ message: error.message || "Failed to send refund report" });
    }
  });

  // Grooming settings routes
  // Public read-only endpoint — used by the booking page (no auth required)
  app.get("/api/grooming-settings", async (req: any, res) => {
    try {
      const settings = await storage.getGroomingSettings((req as any).tenantId);
      res.json(settings);
    } catch (error) {
      console.error("Error fetching grooming settings:", error);
      res.status(500).json({ message: "Failed to fetch grooming settings" });
    }
  });

  app.get("/api/admin/grooming-settings", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const settings = await storage.getGroomingSettings((req as any).tenantId);
      res.json(settings);
    } catch (error) {
      console.error("Error fetching grooming settings:", error);
      res.status(500).json({ message: "Failed to fetch grooming settings" });
    }
  });

  app.put("/api/admin/grooming-settings", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { setting, value } = req.body;
      
      if (!setting || !value) {
        return res.status(400).json({ message: "Setting and value are required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const updatedSetting = await storage.upsertGroomingSetting({ setting, value, tenantId});
      res.json(updatedSetting);
    } catch (error) {
      console.error("Error updating grooming setting:", error);
      res.status(500).json({ message: "Failed to update grooming setting" });
    }
  });

  // Tax rate endpoint (public for cart checkout) - ExaTouch POS format
  app.get("/api/settings/tax-rate", async (req: any, res) => {
    try {
      const settings = await storage.getGroomingSettings((req as any).tenantId);
      const cityTax = settings.find(s => s.setting === 'tax_city')?.value || '0';
      const countyTax = settings.find(s => s.setting === 'tax_county')?.value || '0';
      const stateTax = settings.find(s => s.setting === 'tax_state')?.value || '5.0000';
      const federalTax = settings.find(s => s.setting === 'tax_federal')?.value || '5.9900';
      const showOnReceipt = settings.find(s => s.setting === 'tax_show_on_receipt')?.value !== 'false';
      const defaultForItems = settings.find(s => s.setting === 'tax_default_for_items')?.value !== 'false';
      const defaultForServices = settings.find(s => s.setting === 'tax_default_for_services')?.value !== 'false';
      
      // Calculate combined tax rate
      const taxRate = parseFloat(cityTax) + parseFloat(countyTax) + parseFloat(stateTax) + parseFloat(federalTax);
      
      res.json({ 
        taxRate,
        cityTax: parseFloat(cityTax),
        countyTax: parseFloat(countyTax),
        stateTax: parseFloat(stateTax),
        federalTax: parseFloat(federalTax),
        showOnReceipt,
        defaultForItems,
        defaultForServices
      });
    } catch (error) {
      console.error("Error fetching tax rate:", error);
      res.json({ taxRate: 10.99, cityTax: 0, countyTax: 0, stateTax: 5.0, federalTax: 5.99, showOnReceipt: true, defaultForItems: true, defaultForServices: true });
    }
  });

  // Set tax rate (Admin only) - ExaTouch POS format
  app.put("/api/admin/settings/tax-rate", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { cityTax, countyTax, stateTax, federalTax, showOnReceipt, defaultForItems, defaultForServices } = req.body;
      
      // Validate tax values
      const taxes = [cityTax, countyTax, stateTax, federalTax];
      for (const tax of taxes) {
        if (typeof tax !== 'number' || tax < 0 || tax > 100) {
          return res.status(400).json({ message: "Tax rates must be numbers between 0 and 100" });
        }
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;

      // Save individual tax rates
      await storage.upsertGroomingSetting({ setting: 'tax_city', value: cityTax.toFixed(4), tenantId});
      await storage.upsertGroomingSetting({ setting: 'tax_county', value: countyTax.toFixed(4), tenantId});
      await storage.upsertGroomingSetting({ setting: 'tax_state', value: stateTax.toFixed(4), tenantId});
      await storage.upsertGroomingSetting({ setting: 'tax_federal', value: federalTax.toFixed(4), tenantId});
      await storage.upsertGroomingSetting({ setting: 'tax_show_on_receipt', value: showOnReceipt ? 'true' : 'false', tenantId});
      await storage.upsertGroomingSetting({ setting: 'tax_default_for_items', value: defaultForItems ? 'true' : 'false', tenantId});
      await storage.upsertGroomingSetting({ setting: 'tax_default_for_services', value: defaultForServices ? 'true' : 'false', tenantId});
      
      // Calculate combined rate for backwards compatibility
      const taxRate = cityTax + countyTax + stateTax + federalTax;
      await storage.upsertGroomingSetting({ setting: 'tax_rate', value: taxRate.toString(), tenantId});
      
      res.json({ success: true, taxRate, cityTax, countyTax, stateTax, federalTax, showOnReceipt, defaultForItems, defaultForServices });
    } catch (error) {
      console.error("Error setting tax rate:", error);
      res.status(500).json({ message: "Failed to set tax rate" });
    }
  });

  app.get("/api/settings/alternate-reply-email", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const settings = await storage.getGroomingSettings((req as any).tenantId);
      const setting = settings.find(s => s.setting === 'alternate_reply_email');
      res.json({ email: setting?.value || '' });
    } catch (error) {
      res.json({ email: '' });
    }
  });

  app.put("/api/admin/settings/alternate-reply-email", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const { email } = req.body;
      if (email && typeof email === 'string' && email.trim()) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
          return res.status(400).json({ message: "Please enter a valid email address" });
        }
        await storage.upsertGroomingSetting({ setting: 'alternate_reply_email', value: email.trim(), tenantId});
      } else {
        await storage.upsertGroomingSetting({ setting: 'alternate_reply_email', value: '', tenantId});
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving alternate reply email:", error);
      res.status(500).json({ message: "Failed to save alternate reply email" });
    }
  });

  // Store Hours endpoints
  const DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const DEFAULT_STORE_HOURS: Record<string, { open: boolean; openTime: string; closeTime: string }> = {
    monday: { open: true, openTime: '07:00', closeTime: '18:00' },
    tuesday: { open: true, openTime: '07:00', closeTime: '18:00' },
    wednesday: { open: true, openTime: '07:00', closeTime: '18:00' },
    thursday: { open: true, openTime: '07:00', closeTime: '18:00' },
    friday: { open: true, openTime: '07:00', closeTime: '18:00' },
    saturday: { open: true, openTime: '07:00', closeTime: '18:00' },
    sunday: { open: true, openTime: '13:00', closeTime: '18:00' },
  };

  app.get("/api/settings/store-hours", async (req: any, res) => {
    try {
      const settings = await storage.getGroomingSettings((req as any).tenantId);
      const hours: Record<string, any> = {};
      for (const day of DAYS_OF_WEEK) {
        const setting = settings.find(s => s.setting === `store_hours_${day}`);
        if (setting) {
          try {
            hours[day] = JSON.parse(setting.value);
          } catch {
            hours[day] = DEFAULT_STORE_HOURS[day];
          }
        } else {
          hours[day] = DEFAULT_STORE_HOURS[day];
        }
      }
      res.json(hours);
    } catch (error) {
      console.error("Error fetching store hours:", error);
      res.json(DEFAULT_STORE_HOURS);
    }
  });

  app.put("/api/admin/settings/store-hours", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { hours } = req.body;
      if (!hours || typeof hours !== 'object') {
        return res.status(400).json({ message: "Invalid store hours data" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;

      for (const day of DAYS_OF_WEEK) {
        if (hours[day]) {
          const { open, openTime, closeTime } = hours[day];
          await storage.upsertGroomingSetting({
            setting: `store_hours_${day}`,
            value: JSON.stringify({ open: !!open, openTime: openTime || '07:00', closeTime: closeTime || '18:00' }),
            tenantId,
          });
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error saving store hours:", error);
      res.status(500).json({ message: "Failed to save store hours" });
    }
  });

  // Daily appointment limit routes
  app.get("/api/admin/daily-limits", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const limits = await storage.getAllDailyAppointmentLimits((req as any).tenantId);
      res.json(limits);
    } catch (error) {
      console.error("Error fetching daily limits:", error);
      res.status(500).json({ message: "Failed to fetch daily limits" });
    }
  });

  app.get("/api/admin/daily-limits/:date", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin && !req.user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const limit = await storage.getDailyAppointmentLimit(req.params.date, (req as any).tenantId);
      res.json(limit || null);
    } catch (error) {
      console.error("Error fetching daily limit:", error);
      res.status(500).json({ message: "Failed to fetch daily limit" });
    }
  });

  app.post("/api/admin/daily-limits", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { date, maxBathAppointments, maxGroomAppointments } = req.body;
      
      if (!date || maxBathAppointments === undefined || maxGroomAppointments === undefined) {
        return res.status(400).json({ message: "Date, maxBathAppointments, and maxGroomAppointments are required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const limit = await storage.upsertDailyAppointmentLimit({
        date,
        maxBathAppointments,
        maxGroomAppointments,
        tenantId,
      });
      
      res.json(limit);
    } catch (error) {
      console.error("Error upserting daily limit:", error);
      res.status(500).json({ message: "Failed to update daily limit" });
    }
  });

  app.delete("/api/admin/daily-limits/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      await storage.deleteDailyAppointmentLimit(parseInt(req.params.id), tenantId);
      res.json({ message: "Daily limit deleted successfully" });
    } catch (error) {
      console.error("Error deleting daily limit:", error);
      res.status(500).json({ message: "Failed to delete daily limit" });
    }
  });

  // Weekly appointment limit routes (day of week based)
  app.get("/api/admin/weekly-limits", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin && !req.user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const limits = await storage.getAllWeeklyAppointmentLimits((req as any).tenantId);
      res.json(limits);
    } catch (error) {
      console.error("Error fetching weekly limits:", error);
      res.status(500).json({ message: "Failed to fetch weekly limits" });
    }
  });

  app.get("/api/admin/weekly-limits/:dayOfWeek", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin && !req.user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const dayOfWeek = parseInt(req.params.dayOfWeek);
      if (isNaN(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 6) {
        return res.status(400).json({ message: "Invalid day of week (must be 1-6 for Monday-Saturday)" });
      }

      const limit = await storage.getWeeklyAppointmentLimit(dayOfWeek, (req as any).tenantId);
      res.json(limit || null);
    } catch (error) {
      console.error("Error fetching weekly limit:", error);
      res.status(500).json({ message: "Failed to fetch weekly limit" });
    }
  });

  app.post("/api/admin/weekly-limits", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { dayOfWeek, maxBathAppointments, maxGroomAppointments } = req.body;
      
      if (dayOfWeek === undefined || maxBathAppointments === undefined || maxGroomAppointments === undefined) {
        return res.status(400).json({ message: "dayOfWeek, maxBathAppointments, and maxGroomAppointments are required" });
      }

      if (dayOfWeek < 1 || dayOfWeek > 6) {
        return res.status(400).json({ message: "Invalid day of week (must be 1-6 for Monday-Saturday)" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const limit = await storage.upsertWeeklyAppointmentLimit({
        dayOfWeek,
        maxBathAppointments,
        maxGroomAppointments,
        tenantId,
      });
      
      res.json(limit);
    } catch (error) {
      console.error("Error upserting weekly limit:", error);
      res.status(500).json({ message: "Failed to update weekly limit" });
    }
  });

  app.delete("/api/admin/weekly-limits/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      await storage.deleteWeeklyAppointmentLimit(parseInt(req.params.id), tenantId);
      res.json({ message: "Weekly limit deleted successfully" });
    } catch (error) {
      console.error("Error deleting weekly limit:", error);
      res.status(500).json({ message: "Failed to delete weekly limit" });
    }
  });

  // Service prices endpoint (public - for booking page)
  app.get("/api/service-prices", async (req, res) => {
    try {
      const settings = await storage.getGroomingSettings((req as any).tenantId);
      const fullGroomingPrice = settings.find(s => s.setting === 'full_grooming_price')?.value || '35';
      const bathOnlyPrice = settings.find(s => s.setting === 'bath_only_price')?.value || '20';
      const nailGrindPrice = settings.find(s => s.setting === 'addon_nail_grind_price')?.value || '15';
      const teethBrushingPrice = settings.find(s => s.setting === 'addon_teeth_brushing_price')?.value || '10';
      const furminatorPrice = settings.find(s => s.setting === 'addon_furminator_price')?.value || '20';
      const scentPackagePrice = settings.find(s => s.setting === 'addon_scent_package_price')?.value || '5';

      res.json({
        fullGrooming: fullGroomingPrice,
        bathOnly: bathOnlyPrice,
        nailGrind: nailGrindPrice,
        teethBrushing: teethBrushingPrice,
        furminator: furminatorPrice,
        scentPackage: scentPackagePrice,
      });
    } catch (error) {
      console.error("Error fetching service prices:", error);
      res.status(500).json({ message: "Failed to fetch service prices" });
    }
  });

  // Groomer routes
  app.get("/api/groomers", async (req, res) => {
    try {
      const groomers = await storage.getActiveGroomers((req as any).tenantId);
      res.json(groomers);
    } catch (error) {
      console.error("Error fetching groomers:", error);
      res.status(500).json({ message: "Failed to fetch groomers" });
    }
  });

  app.get("/api/groomers/available/:dayOfWeek", async (req, res) => {
    try {
      const dayOfWeek = parseInt(req.params.dayOfWeek);
      if (isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
        return res.status(400).json({ message: "Invalid day of week" });
      }
      
      const groomers = await storage.getAvailableGroomersForDay(dayOfWeek, (req as any).tenantId);
      res.json(groomers);
    } catch (error) {
      console.error("Error fetching available groomers:", error);
      res.status(500).json({ message: "Failed to fetch available groomers" });
    }
  });

  app.get("/api/groomers/available-for-date/:date", async (req, res) => {
    try {
      const date = req.params.date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD" });
      }
      
      const groomers = await storage.getAvailableGroomersForDate(date, (req as any).tenantId);
      
      const GROOMER_DAILY_FULL_GROOM_LIMIT = 5;
      const allAppointments = await storage.getAppointments(undefined, (req as any).tenantId);
      const appointmentsOnDate = allAppointments.filter((apt: any) => {
        const aptDateStr = typeof apt.appointmentDate === 'string' 
          ? apt.appointmentDate.split('T')[0] 
          : new Date(apt.appointmentDate).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
        return aptDateStr === date && 
               apt.status !== 'cancelled' && 
               apt.status !== 'rejected';
      });
      
      const groomerFullGroomMap: Record<number, number> = {};
      for (const apt of appointmentsOnDate) {
        const aptPets = await storage.getAppointmentPets(apt.id);
        if (aptPets && aptPets.length > 0) {
          for (const p of aptPets) {
            const pGroomerId = p.groomerId || apt.groomerId;
            if (pGroomerId) {
              const sType = (p.serviceType || '').toLowerCase();
              if (sType.includes('full') || (sType.includes('groom') && !sType.includes('bath'))) {
                groomerFullGroomMap[pGroomerId] = (groomerFullGroomMap[pGroomerId] || 0) + 1;
              }
            }
          }
        } else {
          if (apt.groomerId) {
            const sType = (apt.serviceType || '').toLowerCase();
            if (sType.includes('full') || (sType.includes('groom') && !sType.includes('bath'))) {
              groomerFullGroomMap[apt.groomerId] = (groomerFullGroomMap[apt.groomerId] || 0) + 1;
            }
          }
        }
      }
      
      const groomersWithAvailability = groomers.map((g: any) => ({
        ...g,
        fullGroomsBooked: groomerFullGroomMap[g.id] || 0,
        fullGroomsRemaining: GROOMER_DAILY_FULL_GROOM_LIMIT - (groomerFullGroomMap[g.id] || 0),
        fullGroomLimit: GROOMER_DAILY_FULL_GROOM_LIMIT,
      }));
      
      res.json(groomersWithAvailability);
    } catch (error) {
      console.error("Error fetching available groomers for date:", error);
      res.status(500).json({ message: "Failed to fetch available groomers" });
    }
  });

  // Admin groomer management routes
  app.get("/api/admin/groomers", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin && !req.user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const groomers = await storage.getAllGroomers((req as any).tenantId);
      res.json(groomers);
    } catch (error) {
      console.error("Error fetching all groomers:", error);
      res.status(500).json({ message: "Failed to fetch groomers" });
    }
  });

  app.post("/api/admin/groomers", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const groomerData = req.body;
      const groomer = await storage.createGroomer({ ...groomerData, tenantId });
      
      // Automatically add default availability for new groomer (Mon-Sat, 8am-1:30pm)
      try {
        for (let dayOfWeek = 1; dayOfWeek <= 6; dayOfWeek++) {
          await storage.setGroomerAvailability({
            groomerId: groomer.id,
            dayOfWeek,
            isAvailable: true,
            startTime: '08:00',
            endTime: '13:30',
          });
        }
      } catch (availError) {
        console.error("Error setting default groomer availability:", availError);
        // Don't fail groomer creation if availability setup fails
      }
      
      // Try to link groomer with existing user account by email or phone
      if (groomerData.email || groomerData.phone) {
        try {
          const allUsers = await storage.getAllUsers((req as any).tenantId);
          let matchingUser = null;
          
          // Find user by email or phone
          if (groomerData.email) {
            matchingUser = allUsers.find((u: any) => 
              u.email?.toLowerCase() === groomerData.email.toLowerCase()
            );
          }
          
          if (!matchingUser && groomerData.phone) {
            const normalizedGroomerPhone = normalizePhoneNumber(groomerData.phone);
            matchingUser = allUsers.find((u: any) => 
              u.phone && normalizePhoneNumber(u.phone) === normalizedGroomerPhone
            );
          }
          
          // If matching user found, grant them groomer privileges
          if (matchingUser && !matchingUser.isGroomer) {
            await storage.updateUserGroomer(matchingUser.id, true);
            console.log(`Linked groomer ${groomer.id} to user account ${matchingUser.id} (${matchingUser.email})`);
          }
        } catch (linkError) {
          console.error("Error linking groomer to user account:", linkError);
          // Don't fail the groomer creation if linking fails
        }
      }
      
      res.json(groomer);
    } catch (error) {
      console.error("Error creating groomer:", error);
      res.status(500).json({ message: "Failed to create groomer" });
    }
  });

  app.put("/api/admin/groomers/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const id = parseInt(req.params.id);
      const groomerData = req.body;
      const groomer = await storage.updateGroomer(id, groomerData, tenantId);
      res.json(groomer);
    } catch (error) {
      console.error("Error updating groomer:", error);
      res.status(500).json({ message: "Failed to update groomer" });
    }
  });

  app.delete("/api/admin/groomers/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const id = parseInt(req.params.id);
      await storage.deleteGroomer(id, tenantId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting groomer:", error);
      res.status(500).json({ message: "Failed to delete groomer" });
    }
  });

  // Groomer availability routes
  app.get("/api/admin/groomers/:id/availability", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const groomerId = parseInt(req.params.id);
      const availability = await storage.getGroomerAvailability(groomerId);
      res.json(availability);
    } catch (error) {
      console.error("Error fetching groomer availability:", error);
      res.status(500).json({ message: "Failed to fetch groomer availability" });
    }
  });

  app.post("/api/admin/groomers/:id/availability", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const groomerId = parseInt(req.params.id);
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const availabilityData = { ...req.body, groomerId, tenantId };
      const availability = await storage.setGroomerAvailability(availabilityData);
      res.json(availability);
    } catch (error) {
      console.error("Error setting groomer availability:", error);
      res.status(500).json({ message: "Failed to set groomer availability" });
    }
  });

  app.put("/api/admin/groomer-availability/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const id = parseInt(req.params.id);
      const availabilityData = req.body;
      const availability = await storage.updateGroomerAvailability(id, availabilityData, tenantId);
      res.json(availability);
    } catch (error) {
      console.error("Error updating groomer availability:", error);
      res.status(500).json({ message: "Failed to update groomer availability" });
    }
  });

  app.delete("/api/admin/groomer-availability/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const id = parseInt(req.params.id);
      await storage.deleteGroomerAvailability(id, tenantId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting groomer availability:", error);
      res.status(500).json({ message: "Failed to delete groomer availability" });
    }
  });

  // Groomer blocked days routes (sick days, vacation, etc.)
  app.get("/api/admin/groomer-blocked-days", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const blockedDays = await storage.getAllGroomerBlockedDays();
      res.json(blockedDays);
    } catch (error) {
      console.error("Error fetching groomer blocked days:", error);
      res.status(500).json({ message: "Failed to fetch groomer blocked days" });
    }
  });

  app.get("/api/admin/groomers/:id/blocked-days", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const groomerId = parseInt(req.params.id);
      const blockedDays = await storage.getGroomerBlockedDays(groomerId);
      res.json(blockedDays);
    } catch (error) {
      console.error("Error fetching groomer blocked days:", error);
      res.status(500).json({ message: "Failed to fetch groomer blocked days" });
    }
  });

  app.post("/api/admin/groomer-blocked-days", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const blockedDayData = req.body;
      const blockedDay = await storage.createGroomerBlockedDay({ ...blockedDayData, tenantId });
      res.json(blockedDay);
    } catch (error) {
      console.error("Error creating groomer blocked day:", error);
      res.status(500).json({ message: "Failed to create groomer blocked day" });
    }
  });

  app.delete("/api/admin/groomer-blocked-days/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const id = parseInt(req.params.id);
      await storage.deleteGroomerBlockedDay(id, tenantId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting groomer blocked day:", error);
      res.status(500).json({ message: "Failed to delete groomer blocked day" });
    }
  });

  // Push notification subscription endpoint
  app.post("/api/push-subscription", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const subscription = req.body;
      console.log(`Push subscription saved for user ${userId}:`, subscription);
      
      // In a real app, you would save this subscription to the database
      // For now, we'll just log it and return success
      res.json({ success: true, message: "Push subscription saved" });
    } catch (error) {
      console.error("Error saving push subscription:", error);
      res.status(500).json({ message: "Failed to save push subscription" });
    }
  });

  // Manual contacts CRUD operations
  app.get("/api/contacts", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const contacts = await storage.getAllContacts((req as any).tenantId);
      res.json(contacts);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      res.status(500).json({ message: "Failed to fetch contacts" });
    }
  });

  app.post("/api/contacts", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { name, email, phoneNumber, petNames, notes, animalType, breed } = req.body;
      const trimmedName = name?.trim();
      const trimmedEmail = email?.trim();
      const trimmedPhone = phoneNumber?.trim();
      
      if (!trimmedName) {
        return res.status(400).json({ message: "Name is required" });
      }
      if (!trimmedPhone) {
        return res.status(400).json({ message: "Phone number is required" });
      }

      // Check for an existing contact with the same phone number
      const existingContact = await storage.getContactByPhoneNumber(trimmedPhone, (req as any).tenantId);
      if (existingContact) {
        return res.status(409).json({ 
          message: "That number already has a contact. Please search for them via the phone number.",
          duplicate: true,
          contactId: existingContact.id
        });
      }

      // Use phone as placeholder for email if email is not provided
      const contactEmail = trimmedEmail && trimmedEmail.includes('@') ? trimmedEmail : trimmedPhone;

      // Capitalize first letter of each word in name and pet names
      const capitalizedName = capitalizeWords(trimmedName);
      // petNames can come as array or string from frontend, convert to array for database
      let capitalizedPetNames: string[] | null = null;
      if (petNames) {
        if (Array.isArray(petNames)) {
          // Frontend sends as array - capitalize each name
          const filteredNames = petNames.filter(name => name && typeof name === 'string' && name.trim());
          capitalizedPetNames = filteredNames.length > 0 
            ? filteredNames.map(name => capitalizeWords(name.trim()) as string)
            : null;
        } else if (typeof petNames === 'string') {
          // Fallback for string format - trim and capitalize
          const trimmed = petNames.trim();
          capitalizedPetNames = trimmed ? [capitalizeWords(trimmed) as string] : null;
        }
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const contact = await storage.createContact({ 
        name: capitalizedName as string, 
        email: contactEmail, 
        phoneNumber: trimmedPhone,
        petNames: capitalizedPetNames,
        notes,
        animalType,
        breed,
        tenantId,
      });
      res.json(contact);
    } catch (error) {
      console.error("Error creating contact:", error);
      res.status(500).json({ message: "Failed to create contact" });
    }
  });

  app.put("/api/contacts/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const id = parseInt(req.params.id);
      const { name, email, phoneNumber, petNames, notes, animalType, breed } = req.body;
      const trimmedName = name?.trim();
      const trimmedEmail = email?.trim();
      const trimmedPhone = phoneNumber?.trim();
      
      if (trimmedName !== undefined && !trimmedName) {
        return res.status(400).json({ message: "Name cannot be empty" });
      }
      if (trimmedPhone !== undefined && !trimmedPhone) {
        return res.status(400).json({ message: "Phone number is required" });
      }
      
      // Use phone as placeholder for email if email is not provided or invalid
      let contactEmail = trimmedEmail;
      if (trimmedEmail !== undefined) {
        contactEmail = trimmedEmail && trimmedEmail.includes('@') ? trimmedEmail : trimmedPhone;
      }
      
      // Capitalize first letter of each word in name and pet names
      const capitalizedName = trimmedName ? capitalizeWords(trimmedName) : undefined;
      // petNames can come as array or string from frontend, convert to array for database
      let capitalizedPetNames: string[] | null | undefined = undefined;
      if (petNames !== undefined) {
        if (petNames === null || (Array.isArray(petNames) && petNames.length === 0)) {
          capitalizedPetNames = null;
        } else if (Array.isArray(petNames)) {
          // Frontend sends as array - capitalize each name
          const filteredNames = petNames.filter(name => name && typeof name === 'string' && name.trim());
          capitalizedPetNames = filteredNames.length > 0 
            ? filteredNames.map(name => capitalizeWords(name.trim()) as string)
            : null;
        } else if (typeof petNames === 'string') {
          // Fallback for string format - trim and capitalize
          const trimmed = petNames.trim();
          capitalizedPetNames = trimmed ? [capitalizeWords(trimmed) as string] : null;
        }
      }
      
      const contact = await storage.updateContact(id, { 
        name: capitalizedName as string | undefined, 
        email: contactEmail, 
        phoneNumber: trimmedPhone,
        petNames: capitalizedPetNames,
        notes,
        animalType,
        breed 
      }, tenantId);
      res.json(contact);
    } catch (error: any) {
      console.error("Error updating contact:", error);
      if (error?.message === "Contact not found or access denied") {
        return res.status(404).json({ message: "Contact not found" });
      }
      res.status(500).json({ message: "Failed to update contact" });
    }
  });

  // Get appointment history for a contact
  app.get("/api/contacts/:id/appointments", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const contactId = parseInt(req.params.id);
      const contact = await storage.getContact(contactId, (req as any).tenantId);
      
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }

      if (!contact.phoneNumber) {
        return res.json([]);
      }

      const appointments = await storage.getAppointmentsByPhoneNumber(contact.phoneNumber, (req as any).tenantId);
      
      const enrichedAppointments = await Promise.all(
        appointments.map(async (apt: any) => {
          const [pets, groomer] = await Promise.all([
            storage.getAppointmentPets(apt.id),
            apt.groomerId ? storage.getGroomer(apt.groomerId) : Promise.resolve(null),
          ]);
          // Collect all add-ons across all pets for this appointment
          const allAddOns: string[] = [];
          for (const pet of pets) {
            if (pet.addOns) {
              pet.addOns.split(',').filter(Boolean).forEach((a: string) => {
                if (!allAddOns.includes(a.trim())) allAddOns.push(a.trim());
              });
            }
          }
          const ADD_ON_LABELS: Record<string, string> = {
            'nail-grind': 'Nail Grind',
            'teeth-brushing': 'Brush Teeth',
            'furminator': 'Furminator (size dep.)',
            'scent-package': 'Scent Package',
          };
          const addOnLabels = allAddOns.map(id => ADD_ON_LABELS[id] || id);
          return {
            ...apt,
            groomerName: groomer?.name || null,
            pets,
            addOnLabels: addOnLabels.length > 0 ? addOnLabels : null,
          };
        })
      );
      
      res.json(enrichedAppointments);
    } catch (error) {
      console.error("Error fetching contact appointments:", error);
      res.status(500).json({ message: "Failed to fetch contact appointments" });
    }
  });

  // Get appointment history for a contact (admin/groomer only)
  app.get("/api/contacts/:id/history", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const contactId = parseInt(req.params.id);
      const contact = await storage.getContact(contactId, (req as any).tenantId);
      
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }

      const history = await storage.getAppointmentHistoryByContactId(contactId);
      res.json(history);
    } catch (error) {
      console.error("Error fetching contact appointment history:", error);
      res.status(500).json({ message: "Failed to fetch contact appointment history" });
    }
  });

  // Edit a history record (superior manager only)
  app.put("/api/contacts/history/:historyId", authMiddleware, async (req: any, res) => {
    try {
      const caller = await storage.getUser(req.user?.id);
      if (!caller?.isSuperiorManager) {
        return res.status(403).json({ message: "Superior Manager access required" });
      }
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const historyId = parseInt(req.params.historyId);
      const { appointmentDate, appointmentTime, petName, petType, breed, serviceType, groomerName, status, notes } = req.body;
      const updated = await storage.updateAppointmentHistoryRecord(historyId, {
        ...(appointmentDate !== undefined && { appointmentDate }),
        ...(appointmentTime !== undefined && { appointmentTime }),
        ...(petName !== undefined && { petName }),
        ...(petType !== undefined && { petType }),
        ...(breed !== undefined && { breed }),
        ...(serviceType !== undefined && { serviceType }),
        ...(groomerName !== undefined && { groomerName }),
        ...(status !== undefined && { status }),
        ...(notes !== undefined && { notes }),
      }, tenantId);
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating history record:", error);
      if (error?.message === 'Appointment history record not found or access denied') {
        return res.status(404).json({ message: "History record not found" });
      }
      res.status(500).json({ message: "Failed to update history record" });
    }
  });

  // Delete a history record (superior manager only)
  app.delete("/api/contacts/history/:historyId", authMiddleware, async (req: any, res) => {
    try {
      const caller = await storage.getUser(req.user?.id);
      if (!caller?.isSuperiorManager) {
        return res.status(403).json({ message: "Superior Manager access required" });
      }
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const historyId = parseInt(req.params.historyId);
      await storage.deleteAppointmentHistoryRecord(historyId, tenantId);
      res.json({ message: "History record deleted" });
    } catch (error) {
      console.error("Error deleting history record:", error);
      res.status(500).json({ message: "Failed to delete history record" });
    }
  });

  app.delete("/api/contacts/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const id = parseInt(req.params.id);
      await storage.deleteContact(id, tenantId);
      res.json({ message: "Contact deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting contact:", error);
      if (error?.message === "Contact not found or access denied") {
        return res.status(404).json({ message: "Contact not found" });
      }
      res.status(500).json({ message: "Failed to delete contact" });
    }
  });

  // Clean up duplicate contacts (by normalized phone number)
  app.post("/api/admin/contacts/cleanup-duplicates", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const { normalizePhoneNumber } = await import("./phoneUtils");
      const allContacts = await storage.getAllContacts(tenantId);
      
      // Group contacts by normalized phone number
      const phoneGroups = new Map<string, any[]>();
      
      for (const contact of allContacts) {
        if (!contact.phoneNumber) continue;
        
        const normalizedPhone = normalizePhoneNumber(contact.phoneNumber);
        if (!normalizedPhone || normalizedPhone.length < 10) continue;
        
        if (!phoneGroups.has(normalizedPhone)) {
          phoneGroups.set(normalizedPhone, []);
        }
        phoneGroups.get(normalizedPhone)!.push(contact);
      }
      
      // Find and delete duplicates (keep the oldest one)
      let deletedCount = 0;
      const duplicateGroups: any[] = [];
      
      for (const [phone, contacts] of Array.from(phoneGroups.entries())) {
        if (contacts.length > 1) {
          // Sort by creation date (oldest first)
          contacts.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          
          // Keep the first (oldest), delete the rest
          const toKeep = contacts[0];
          const toDelete = contacts.slice(1);
          
          duplicateGroups.push({
            phone,
            kept: { id: toKeep.id, name: toKeep.name, createdAt: toKeep.createdAt },
            deleted: toDelete.map((c: any) => ({ id: c.id, name: c.name, createdAt: c.createdAt }))
          });
          
          for (const contact of toDelete) {
            await storage.deleteContact(contact.id, tenantId);
            deletedCount++;
          }
        }
      }
      
      res.json({ 
        message: `Cleaned up ${deletedCount} duplicate contacts`,
        deletedCount,
        duplicateGroups
      });
    } catch (error) {
      console.error("Error cleaning up duplicate contacts:", error);
      res.status(500).json({ message: "Failed to cleanup duplicates", error: (error as Error).message });
    }
  });

  // Backfill contacts from completed appointments only (admin only)
  app.post("/api/admin/contacts/backfill-from-appointments", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const syncContactTenantId = resolveWriteTenantId(req, res);
      if (syncContactTenantId === undefined) return;

      console.log(`[ContactSync] Sync started by admin user id=${req.user?.id} (${user.username || user.email || 'unknown'})`);

      const allAppointments = await storage.getAppointments(undefined, syncContactTenantId);
      // Only process completed appointments — pet showed up, so the phone number is verified
      const completedAppointments = allAppointments.filter((apt: any) => apt.groomingCompleted === true);

      console.log(`[ContactSync] Found ${allAppointments.length} total appointments, ${completedAppointments.length} marked as completed (groomingCompleted=true)`);

      let created = 0;
      let updated = 0;
      let skipped = 0;
      const createdList: string[] = [];
      const updatedList: string[] = [];

      for (const apt of completedAppointments) {
        if (!apt.ownerPhoneNumber) {
          console.log(`[ContactSync] SKIP appt id=${apt.id} (${apt.petName || 'unknown pet'}) — no phone number`);
          skipped++;
          continue;
        }

        const existing = await storage.getContactByPhoneNumber(apt.ownerPhoneNumber, syncContactTenantId);
        const petName = apt.petName;

        if (!existing) {
          const contactName = `${apt.ownerFirstName || ''} ${apt.ownerLastName || ''}`.trim() || 'Unknown';
          await storage.createContact({
            name: contactName,
            phoneNumber: apt.ownerPhoneNumber,
            email: (apt as any).ownerEmail || null,
            petNames: petName ? [petName] : null,
            animalType: apt.petType || null,
            breed: null,
            source: apt.source || 'manual',
            notes: null,
            linkedUserId: null,
            tenantId: syncContactTenantId,
          });
          console.log(`[ContactSync] CREATED contact "${contactName}" phone=${apt.ownerPhoneNumber} pet="${petName || 'none'}" (appt id=${apt.id})`);
          createdList.push(`${contactName} (${apt.ownerPhoneNumber})`);
          created++;
        } else {
          const existingPetNames: string[] = existing.petNames || [];
          const merged = Array.from(new Set([...existingPetNames, ...(petName ? [petName] : [])]));
          if (merged.length > existingPetNames.length) {
            await storage.updateContact(existing.id, { petNames: merged }, syncContactTenantId);
            const addedPets = merged.filter(p => !existingPetNames.includes(p));
            console.log(`[ContactSync] UPDATED contact "${existing.name}" phone=${apt.ownerPhoneNumber} — added pet(s): ${addedPets.join(', ')} (appt id=${apt.id})`);
            updatedList.push(`${existing.name} (${apt.ownerPhoneNumber}) +pet: ${addedPets.join(', ')}`);
            updated++;
          } else {
            skipped++;
          }
        }
      }

      console.log(`[ContactSync] Sync complete — ${created} created, ${updated} updated, ${skipped} skipped`);
      if (createdList.length > 0) console.log(`[ContactSync] New contacts:\n  ${createdList.join('\n  ')}`);
      if (updatedList.length > 0) console.log(`[ContactSync] Updated contacts:\n  ${updatedList.join('\n  ')}`);

      res.json({
        message: `Synced from ${completedAppointments.length} completed appointments: ${created} contacts created, ${updated} updated, ${skipped} skipped`,
        created, updated, skipped
      });
    } catch (error) {
      console.error(`[ContactSync] ERROR during sync:`, error);
      res.status(500).json({ message: "Failed to backfill contacts", error: (error as Error).message });
    }
  });

  // SMS Opt-Out Management
  app.patch("/api/contacts/:id/sms-opt-out", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const contactId = parseInt(req.params.id);
      const { optOut } = req.body;
      
      if (typeof optOut !== 'boolean') {
        return res.status(400).json({ message: "optOut must be a boolean" });
      }

      const contact = await storage.updateContactSmsOptOut(contactId, optOut, tenantId);
      res.json(contact);
    } catch (error) {
      console.error("Error updating SMS opt-out:", error);
      res.status(500).json({ message: "Failed to update SMS opt-out status" });
    }
  });

  // Get SMS logs
  app.get("/api/admin/sms-logs", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const limit = parseInt(req.query.limit as string) || 100;
      const logs = await storage.getSmsLogs(limit);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching SMS logs:", error);
      res.status(500).json({ message: "Failed to fetch SMS logs" });
    }
  });

  // Get failed SMS logs only
  app.get("/api/admin/sms-logs/failed", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const logs = await storage.getFailedSmsLogs();
      res.json(logs);
    } catch (error) {
      console.error("Error fetching failed SMS logs:", error);
      res.status(500).json({ message: "Failed to fetch failed SMS logs" });
    }
  });

  // Manual cleanup of past appointments (with optional status filter)
  app.post("/api/admin/appointments/cleanup-past", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;

      const { statuses } = req.body; // Optional array of statuses to filter
      
      console.log('Running manual cleanup: Clearing past appointments and resetting "Here" status', statuses ? `for statuses: ${statuses.join(', ')}` : 'for all statuses');
      
      const allAppointments = await storage.getAppointments(undefined, tenantId);
      
      // Get today's date at start of day for comparison
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // First, reset isHere flag for ALL past appointments (regardless of status filter)
      const pastAppointmentsWithHere = allAppointments.filter((apt: any) => {
        if (!apt.isHere) return false;
        
        const appointmentDate = new Date(apt.appointmentDate);
        appointmentDate.setHours(0, 0, 0, 0);
        
        return appointmentDate < today;
      });
      
      console.log(`Resetting "Here" status for ${pastAppointmentsWithHere.length} past appointments`);
      
      for (const appointment of pastAppointmentsWithHere) {
        await storage.updateAppointmentIsHere(appointment.id, false, tenantId);
        console.log(`Reset "Here" status for appointment: ${appointment.id} from ${new Date(appointment.appointmentDate).toLocaleDateString()}`);
      }
      
      // Then, delete appointments that match the filter criteria
      const pastAppointments = allAppointments.filter((apt: any) => {
        // If statuses filter is provided, check if appointment matches
        if (statuses && Array.isArray(statuses) && statuses.length > 0) {
          if (!statuses.includes(apt.status)) return false;
        }
        
        const appointmentDate = new Date(apt.appointmentDate);
        appointmentDate.setHours(0, 0, 0, 0);
        
        return appointmentDate < today;
      });
      
      console.log(`Saving ${pastAppointments.length} past appointments to history before deletion`);
      
      let savedCount = 0;
      for (const appointment of pastAppointments) {
        try {
          // Save to history before deleting
          const history = await storage.saveAppointmentToHistory(appointment, { tenantId });
          console.log(`Saved appointment ${appointment.id} to history (history ID: ${history.id})`);
          savedCount++;
        } catch (error) {
          console.error(`Failed to save appointment ${appointment.id} to history:`, error);
          // Continue with deletion even if history save fails
        }
        
        await storage.deleteAppointment(appointment.id, tenantId);
        console.log(`Deleted past appointment: ${appointment.id} (${appointment.status}) from ${new Date(appointment.appointmentDate).toLocaleDateString()}`);
      }
      
      res.json({ 
        message: `Successfully saved ${savedCount} and deleted ${pastAppointments.length} past appointments, reset ${pastAppointmentsWithHere.length} "Here" statuses`,
        deletedCount: pastAppointments.length,
        savedCount: savedCount,
        hereResetCount: pastAppointmentsWithHere.length
      });
    } catch (error) {
      console.error('Error cleaning up past appointments:', error);
      res.status(500).json({ 
        message: "Failed to cleanup past appointments", 
        error: (error as Error).message 
      });
    }
  });

  // Reset ALL isHere flags across all appointments (for fixing stale data)
  app.post("/api/admin/appointments/reset-all-here", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      console.log('Running manual reset: Resetting ALL "Here" statuses across all appointments');
      
      const allAppointments = await storage.getAppointments(undefined, tenantId);
      
      // Find all appointments with isHere = true
      const appointmentsWithHere = allAppointments.filter((apt: any) => apt.isHere === true);
      
      console.log(`Found ${appointmentsWithHere.length} appointments with "Here" status set to true`);
      
      // Reset all of them
      for (const appointment of appointmentsWithHere) {
        await storage.updateAppointmentIsHere(appointment.id, false, tenantId);
        console.log(`Reset "Here" status for appointment: ${appointment.id} (${appointment.ownerLastName}) from ${new Date(appointment.appointmentDate).toLocaleDateString()}`);
      }
      
      res.json({ 
        message: `Successfully reset ${appointmentsWithHere.length} "Here" statuses`,
        resetCount: appointmentsWithHere.length
      });
    } catch (error) {
      console.error('Error resetting all "Here" statuses:', error);
      res.status(500).json({ 
        message: "Failed to reset all 'Here' statuses", 
        error: (error as Error).message 
      });
    }
  });

  // Reset ALL isPaid flags across all appointments (for fixing stale data)
  app.post("/api/admin/appointments/reset-all-paid", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      console.log('Running manual reset: Resetting today\'s in-store "Paid" statuses');
      
      const allAppointments = await storage.getAppointments(undefined, tenantId);
      const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
      
      // Only reset TODAY's in-store-paid appointments — same scope as the nightly scheduler.
      // Past paid records are permanent history and must never be wiped.
      const appointmentsWithPaid = allAppointments.filter((apt: any) =>
        apt.isPaid === true &&
        !apt.paidOnline &&
        apt.appointmentDate >= todayStr
      );
      
      console.log(`Found ${appointmentsWithPaid.length} today/upcoming in-store-paid appointments to reset`);
      
      for (const appointment of appointmentsWithPaid) {
        await storage.updateAppointmentIsPaid(appointment.id, false, tenantId);
        console.log(`Reset "Paid" status for appointment: ${appointment.id} (${appointment.ownerLastName}) from ${appointment.appointmentDate}`);
      }
      
      res.json({ 
        message: `Successfully reset ${appointmentsWithPaid.length} "Paid" statuses`,
        resetCount: appointmentsWithPaid.length
      });
    } catch (error) {
      console.error('Error resetting all "Paid" statuses:', error);
      res.status(500).json({ 
        message: "Failed to reset all 'Paid' statuses", 
        error: (error as Error).message 
      });
    }
  });

  // Bulk dismiss all Non-Payment appointments (mark all as paid to start fresh)
  app.post("/api/admin/appointments/dismiss-all-nonpayment", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const allAppointments = await storage.getAppointments(undefined, tenantId);
      const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

      const nonPayment = allAppointments.filter((apt: any) =>
        (apt.status === 'confirmed' || apt.status === 'completed') &&
        !apt.isPaid &&
        !apt.paidOnline &&
        apt.checkedIn === true &&
        apt.appointmentDate <= todayStr
      );

      console.log(`Dismissing ${nonPayment.length} Non-Payment appointments (bulk mark paid)`);
      for (const apt of nonPayment) {
        await storage.updateAppointmentIsPaid(apt.id, true, tenantId);
        console.log(`Dismissed Non-Payment appointment: ${apt.id} (${apt.ownerLastName}) from ${apt.appointmentDate}`);
      }

      res.json({ message: `Dismissed ${nonPayment.length} appointments`, count: nonPayment.length });
    } catch (error) {
      console.error('Error dismissing Non-Payment appointments:', error);
      res.status(500).json({ message: "Failed to dismiss appointments", error: (error as Error).message });
    }
  });

  // Charge a tip to a customer's saved Stripe card for a grooming appointment
  app.post("/api/appointments/:id/tip", authMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.user?.id);
      if (!currentUser?.isAdmin && !currentUser?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const id = parseInt(req.params.id);
      const { tipAmount } = req.body;

      const tipNum = parseFloat(tipAmount);
      if (!tipAmount || isNaN(tipNum) || tipNum <= 0) {
        return res.status(400).json({ message: "Valid tip amount required" });
      }

      const appointment = await storage.getAppointment(id, (req as any).tenantId);
      if (!appointment) return res.status(404).json({ message: "Appointment not found" });

      const customer = await storage.getUser(appointment.userId);
      if (!customer?.stripeCustomerId || !customer?.stripeDefaultPaymentMethod) {
        return res.status(400).json({ message: "No saved payment method on file for this customer" });
      }

      const { getUncachableStripeClient } = await import('./stripeClient');
      const stripeClient = getUncachableStripeClient();

      const amountCents = Math.round(tipNum * 100);
      const paymentIntent = await stripeClient.paymentIntents.create({
        amount: amountCents,
        currency: 'usd',
        customer: customer.stripeCustomerId,
        payment_method: customer.stripeDefaultPaymentMethod,
        confirm: true,
        off_session: true,
        description: `Grooming tip — ${appointment.ownerFirstName} ${appointment.ownerLastName} (appt #${appointment.id})`,
      });

      await storage.updateAppointmentTip(id, tipAmount.toString(), paymentIntent.id);
      console.log(`Tip of $${tipNum.toFixed(2)} charged for appointment ${id} (${appointment.ownerLastName}), PI: ${paymentIntent.id}`);

      res.json({ success: true, paymentIntentId: paymentIntent.id, amount: tipNum });
    } catch (error: any) {
      console.error('Error charging tip:', error);
      const msg = error?.raw?.message || error?.message || "Failed to charge tip";
      res.status(500).json({ message: msg });
    }
  });

  // Special date settings routes
  app.get("/api/admin/special-dates", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const specialDates = await storage.getAllSpecialDateSettings((req as any).tenantId);
      
      // Get allowed times for each special date
      const specialDatesWithTimes = await Promise.all(
        specialDates.map(async (setting) => {
          const times = await storage.getSpecialDateAllowedTimes(setting.id);
          return { ...setting, allowedTimes: times };
        })
      );

      res.json(specialDatesWithTimes);
    } catch (error) {
      console.error('Error fetching special dates:', error);
      res.status(500).json({ message: "Failed to fetch special dates" });
    }
  });

  app.post("/api/admin/special-dates", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { date, name, allowedTimes } = req.body;

      if (!date || !name || !allowedTimes || !Array.isArray(allowedTimes)) {
        return res.status(400).json({ message: "Date, name, and allowedTimes array are required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;

      // Create the special date setting
      const setting = await storage.createSpecialDateSetting({ date, name, tenantId });

      // Add allowed times
      const times = await Promise.all(
        allowedTimes.map((time: string) =>
          storage.addSpecialDateAllowedTime({
            specialDateId: setting.id,
            allowedTime: time,
          })
        )
      );

      res.json({ ...setting, allowedTimes: times });
    } catch (error) {
      console.error('Error creating special date:', error);
      res.status(500).json({ message: "Failed to create special date" });
    }
  });

  app.put("/api/admin/special-dates/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;

      const { id } = req.params;
      const { date, name, allowedTimes } = req.body;

      // Update the special date setting
      const setting = await storage.updateSpecialDateSetting(parseInt(id), { date, name }, tenantId);

      // If allowedTimes is provided, update them
      if (allowedTimes && Array.isArray(allowedTimes)) {
        // Delete existing times
        const existingTimes = await storage.getSpecialDateAllowedTimes(setting.id);
        await Promise.all(
          existingTimes.map((time) => storage.deleteSpecialDateAllowedTime(time.id))
        );

        // Add new times
        const times = await Promise.all(
          allowedTimes.map((time: string) =>
            storage.addSpecialDateAllowedTime({
              specialDateId: setting.id,
              allowedTime: time,
            })
          )
        );

        return res.json({ ...setting, allowedTimes: times });
      }

      const times = await storage.getSpecialDateAllowedTimes(setting.id);
      res.json({ ...setting, allowedTimes: times });
    } catch (error) {
      console.error('Error updating special date:', error);
      res.status(500).json({ message: "Failed to update special date" });
    }
  });

  app.delete("/api/admin/special-dates/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const { id } = req.params;
      await storage.deleteSpecialDateSetting(parseInt(id), tenantId);

      res.json({ message: "Special date deleted successfully" });
    } catch (error) {
      console.error('Error deleting special date:', error);
      res.status(500).json({ message: "Failed to delete special date" });
    }
  });

  // Get special date settings for a specific date (used by booking page)
  app.get("/api/special-dates/:date", async (req, res) => {
    try {
      const { date } = req.params;
      const result = await storage.getSpecialDateWithTimes(date, (req as any).tenantId);
      
      if (!result) {
        return res.json(null);
      }

      res.json({ ...result.setting, allowedTimes: result.times });
    } catch (error) {
      console.error('Error fetching special date:', error);
      res.status(500).json({ message: "Failed to fetch special date" });
    }
  });

  // Download unmatched invoice items CSV (Admin only)
  app.get("/api/admin/unmatched-invoice-items", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const filePath = path.join(process.cwd(), 'attached_assets', 'unmatched_invoice_items.csv');
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "Unmatched invoice items file not found" });
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="unmatched_invoice_items.csv"');
      res.sendFile(filePath);
    } catch (error) {
      console.error('Error downloading unmatched invoice items:', error);
      res.status(500).json({ message: "Failed to download file" });
    }
  });

  // Export entire database to JSON (Admin only)
  app.get("/api/admin/database/export", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      console.log("Starting database export...");

      // Export all data in dependency order (parents before children)
      const allSupplies = await storage.getAllSupplies((req as any).tenantId);
      const allOrders = await storage.getOrders(undefined, (req as any).tenantId);
      const allAppointments = await storage.getAppointments(undefined, (req as any).tenantId);
      const allGroomers = await storage.getAllGroomers((req as any).tenantId);
      const allSpecialDateSettings = await storage.getAllSpecialDateSettings((req as any).tenantId);
      
      // Get dependent data — all scoped to the requesting tenant
      const tid = (req as any).tenantId;
      const orderItemsData = await storage.getAllOrderItems(tid);
      const wishlistData = await storage.getAllWishlistItems(tid);
      const customerPetsData = await storage.getAllCustomerPets(tid);
      const groomerAvailabilityData = await storage.getAllGroomerAvailability(tid);
      const weeklyLimitsData = await storage.getAllWeeklyLimits(tid);
      const dailyLimitsData = await storage.getAllDailyLimits(tid);
      const specialDateTimesData = await storage.getAllSpecialDateTimes(tid);

      const exportData = {
        version: "1.0",
        exportDate: new Date().toISOString(),
        environment: process.env.NODE_ENV || "development",
        data: {
          // Independent tables first
          users: await storage.getAllUsers((req as any).tenantId),
          groomers: allGroomers,
          pets: await storage.getAllPets((req as any).tenantId),
          supplies: allSupplies,
          contacts: await storage.getAllContacts((req as any).tenantId),
          
          // Dependent tables
          customerPets: customerPetsData,
          appointments: allAppointments,
          orders: allOrders,
          orderItems: orderItemsData,
          wishlistItems: wishlistData,
          groomerAvailability: groomerAvailabilityData,
          weeklyAppointmentLimits: weeklyLimitsData,
          dailyAppointmentLimits: dailyLimitsData,
          specialDateSettings: allSpecialDateSettings,
          specialDateAllowedTimes: specialDateTimesData,
        }
      };

      console.log(`Exported: ${exportData.data.users.length} users, ${exportData.data.supplies.length} supplies, ${exportData.data.appointments.length} appointments, ${exportData.data.orders.length} orders`);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="database-export-${Date.now()}.json"`);
      res.json(exportData);
    } catch (error) {
      console.error('Error exporting database:', error);
      res.status(500).json({ message: "Failed to export database" });
    }
  });

  // Import inventory from Excel file (Admin only)
  app.post("/api/admin/inventory/import", authMiddleware, excelUpload.single('file'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const importTenantId = resolveWriteTenantId(req, res);
      if (importTenantId === undefined) return;

      const updateExisting = req.body.updateExisting === 'true';
      const fullSync = req.body.fullSync === 'true'; // Delete items not in import file
      
      // Parse Excel file from buffer using exceljs
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      const worksheet = workbook.worksheets[0];
      
      // Convert worksheet to JSON format
      const data: any[] = [];
      const headers: any = {};
      
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          // First row is headers
          row.eachCell((cell, colNumber) => {
            headers[colNumber] = cell.value?.toString() || '';
          });
        } else {
          // Data rows
          const rowData: any = {};
          row.eachCell((cell, colNumber) => {
            const header = headers[colNumber];
            if (header) {
              rowData[header] = cell.value;
            }
          });
          data.push(rowData);
        }
      });

      console.log(`Processing ${data.length} rows from Excel file...`);
      console.log(`Mode: ${updateExisting ? 'Update Existing' : 'Add New Only'}${fullSync ? ' + Full Sync (delete missing)' : ''}`);

      // Get existing supplies if updating
      let existingSuppliesMap = new Map();
      if (updateExisting) {
        const existingSupplies = await storage.getAllSupplies((req as any).tenantId);
        existingSupplies.forEach((supply: any) => {
          existingSuppliesMap.set(supply.name.toLowerCase().trim(), supply);
        });
      } else {
        const existingSupplies = await storage.getAllSupplies((req as any).tenantId);
        existingSupplies.forEach((supply: any) => {
          existingSuppliesMap.set(supply.name.toLowerCase().trim(), supply);
        });
      }

      let stats = {
        added: 0,
        updated: 0,
        skipped: 0,
        deleted: 0,
        errors: [] as string[]
      };
      
      // Track names from import file for full sync deletion
      const importedNames = new Set<string>();

      for (let i = 0; i < data.length; i++) {
        const row: any = data[i];

        try {
          // Skip header row
          if (row.Description === 'Description') {
            continue;
          }

          // Skip inactive items - default to active if TRUE column is missing
          // Only skip if explicitly set to false or FALSE string
          const isActive = row.TRUE === undefined || row.TRUE === true || String(row.TRUE).toLowerCase() === 'true';
          if (!isActive) {
            stats.skipped++;
            continue;
          }

          // Extract data from Excel columns
          const name = (row.Description || '').toString().trim();
          const category = (row['Category '] || row.Category || 'accessories').toString().trim().toLowerCase();
          const brand = (row.Mfg || row.Vendor || '').toString().trim();
          const price = parseFloat(row.Price || '0');
          const stockQuantity = parseInt(row.QtyOnHand || '0', 10) || 0;
          const size = (row.Size || '').toString().trim();
          const description = (row.DescLong || row.Description || '').toString().trim();
          const sku = (row.SKU || '').toString().trim() || null;

          // Skip if no name or price
          if (!name || name === '' || price <= 0) {
            stats.skipped++;
            continue;
          }
          
          // Track this name for full sync deletion
          importedNames.add(name.toLowerCase().trim());

          // Preserve Excel category as-is, only normalize known variants
          // The Excel file is the authoritative source for categories
          let normalizedCategory = category;
          
          // Normalize known category name variants
          const categoryMap: Record<string, string> = {
            'cat toy': 'toys',
            'dog toy': 'toys',
            'kennel': 'dogCages',
            'smallanimalsupplies': 'smallanimal',
            'health': 'healthcare',
            'treats': 'dogTreats',
            'doghouse': 'dogCages',
          };
          
          // Check if category needs normalization
          const lowerCategory = category.toLowerCase();
          if (categoryMap[lowerCategory]) {
            normalizedCategory = categoryMap[lowerCategory];
          } else {
            // Keep the Excel category as-is (leashes, aquatics, reptiles, etc.)
            normalizedCategory = category;
          }

          // Generate image URL (placeholder)
          const imageUrl = '/placeholder-supply.jpg';

          const existingSupply = existingSuppliesMap.get(name.toLowerCase().trim());

          if (existingSupply && updateExisting) {
            // Update existing supply
            await storage.updateSupply(existingSupply.id, {
              name,
              description,
              price,
              category: normalizedCategory,
              imageUrl: existingSupply.imageUrl || imageUrl,
              stockQuantity,
              brand,
              size,
              sku
            }, importTenantId);
            stats.updated++;
          } else if (!existingSupply) {
            // Add new supply
            await storage.createSupply({
              name,
              description,
              price,
              category: normalizedCategory,
              imageUrl,
              stockQuantity,
              brand,
              size,
              sku,
              tenantId: importTenantId,
            });
            stats.added++;
          } else {
            // Skip if exists and not updating
            stats.skipped++;
          }
        } catch (error: any) {
          console.error(`Error processing row ${i}:`, error);
          stats.errors.push(`Row ${i}: ${error.message}`);
          if (stats.errors.length > 10) break; // Stop if too many errors
        }
      }

      // Full sync: Delete items that exist in database but not in import file
      if (fullSync && importedNames.size > 0) {
        const allExistingSupplies = await storage.getAllSupplies(importTenantId);
        for (const supply of allExistingSupplies) {
          const supplyNameLower = supply.name.toLowerCase().trim();
          if (!importedNames.has(supplyNameLower)) {
            try {
              await storage.deleteSupply(supply.id, importTenantId);
              stats.deleted++;
              console.log(`Deleted supply not in import: ${supply.name}`);
            } catch (err: any) {
              stats.errors.push(`Failed to delete ${supply.name}: ${err.message}`);
            }
          }
        }
      }

      console.log(`Import complete: ${stats.added} added, ${stats.updated} updated, ${stats.deleted} deleted, ${stats.skipped} skipped, ${stats.errors.length} errors`);

      res.json({
        success: true,
        stats,
        message: `Import complete: ${stats.added} added, ${stats.updated} updated${fullSync ? `, ${stats.deleted} deleted` : ''}, ${stats.skipped} skipped`
      });
    } catch (error: any) {
      console.error('Excel import error:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to import Excel file",
        error: error.message 
      });
    }
  });

  // STAGING WORKFLOW: Stage Excel import with duplicate detection
  app.post("/api/admin/inventory/stage-import", authMiddleware, excelUpload.single('file'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Generate unique session ID for this import
      const sessionId = `import_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      // Parse Excel file from buffer using exceljs
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      const worksheet = workbook.worksheets[0];
      
      // Convert worksheet to JSON format
      const data: any[] = [];
      const headers: any = {};
      
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          // First row is headers
          row.eachCell((cell, colNumber) => {
            headers[colNumber] = cell.value?.toString() || '';
          });
        } else {
          // Data rows
          const rowData: any = {};
          row.eachCell((cell, colNumber) => {
            const header = headers[colNumber];
            if (header) {
              rowData[header] = cell.value;
            }
          });
          if (Object.keys(rowData).length > 0) {
            data.push(rowData);
          }
        }
      });

      console.log(`Staging ${data.length} rows from Excel file...`);

      // Process and stage the supplies
      const suppliesData = data.map((row: any) => {
        const name = row['Description']?.toString().trim() || '';
        const category = row['Category']?.toString().toLowerCase().trim() || '';
        const price = parseFloat(row['Unit Price']?.toString().replace(/[^0-9.-]+/g, '') || '0');
        const description = row['Description']?.toString().trim() || '';
        const stockQuantity = parseInt(row['Quantity']?.toString() || '0');
        const brand = row['Brand']?.toString().trim() || null;
        const size = row['Size']?.toString().trim() || null;
        const sku = row['SKU']?.toString().trim() || null;

        return {
          name,
          category,
          brand,
          price,
          description,
          stockQuantity,
          size,
          sku
        };
      }).filter((supply: any) => supply.name && supply.price > 0);

      // Stage the imports with duplicate detection
      const result = await storage.stageSupplyImports(sessionId, suppliesData);

      console.log(`Staging complete: ${result.staged} new, ${result.updates} updates, ${result.duplicates} duplicates`);

      res.json({
        success: true,
        sessionId: result.sessionId,
        stats: {
          total: suppliesData.length,
          new: result.staged,
          updates: result.updates,
          duplicates: result.duplicates
        },
        message: `Import staged: ${result.staged} new items, ${result.updates} updates, ${result.duplicates} exact duplicates`
      });
    } catch (error: any) {
      console.error('Excel staging error:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to stage Excel file",
        error: error.message 
      });
    }
  });

  // Get staged imports for preview
  app.get("/api/admin/inventory/staged/:sessionId", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { sessionId } = req.params;
      const stagedItems = await storage.getStagedImports(sessionId);

      res.json({
        success: true,
        sessionId,
        items: stagedItems,
        summary: {
          total: stagedItems.length,
          new: stagedItems.filter(i => i.status === 'new').length,
          updates: stagedItems.filter(i => i.status === 'update').length,
          duplicates: stagedItems.filter(i => i.status === 'duplicate').length
        }
      });
    } catch (error: any) {
      console.error('Get staged imports error:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to get staged imports",
        error: error.message 
      });
    }
  });

  // Approve staged imports and apply to production
  app.post("/api/admin/inventory/approve/:sessionId", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { sessionId } = req.params;
      const result = await storage.approveStagedImports(sessionId);

      res.json({
        success: true,
        message: `Import approved: ${result.created} created, ${result.updated} updated`,
        stats: result
      });
    } catch (error: any) {
      console.error('Approve staged imports error:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to approve imports",
        error: error.message 
      });
    }
  });

  // Reject staged imports
  app.delete("/api/admin/inventory/reject/:sessionId", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { sessionId } = req.params;
      await storage.rejectStagedImports(sessionId);

      res.json({
        success: true,
        message: "Staged imports rejected and deleted"
      });
    } catch (error: any) {
      console.error('Reject staged imports error:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to reject imports",
        error: error.message 
      });
    }
  });

  // Import database from JSON (Admin only - DEVELOPMENT ONLY)
  app.post("/api/admin/database/import", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Safety check: only allow in development
      if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ message: "Database import is disabled in production for safety" });
      }

      const importData = req.body;
      
      // Validate import data format
      if (!importData || !importData.version || !importData.data) {
        return res.status(400).json({ message: "Invalid import data format - missing version or data" });
      }

      console.log("Starting database import...");
      console.log("Import data version:", importData.version);
      console.log("Source environment:", importData.environment);

      let stats = {
        users: 0,
        supplies: 0,
        pets: 0,
        groomers: 0,
        contacts: 0,
        customerPets: 0,
        appointments: 0,
        orders: 0,
        orderItems: 0,
        wishlistItems: 0,
        groomerAvailability: 0,
        weeklyLimits: 0,
        dailyLimits: 0,
        specialDateSettings: 0,
        specialDateAllowedTimes: 0,
      };

      // Import in dependency order: parents before children
      
      // 0. Users first (many tables reference userId)
      if (importData.data.users) {
        for (const user of importData.data.users) {
          try {
            await storage.upsertUserForImport(user);
            stats.users++;
          } catch (err) {
            console.error(`Failed to import user ${user.id}:`, err);
          }
        }
      }
      
      // 1. Independent tables (no foreign keys to users)
      if (importData.data.supplies) {
        for (const supply of importData.data.supplies) {
          try {
            await storage.upsertSupply(supply);
            stats.supplies++;
          } catch (err) {
            console.error(`Failed to import supply ${supply.id}:`, err);
          }
        }
      }

      if (importData.data.pets) {
        for (const pet of importData.data.pets) {
          try {
            await storage.upsertPet(pet);
            stats.pets++;
          } catch (err) {
            console.error(`Failed to import pet ${pet.id}:`, err);
          }
        }
      }

      if (importData.data.groomers) {
        for (const groomer of importData.data.groomers) {
          try {
            await storage.upsertGroomer(groomer);
            stats.groomers++;
          } catch (err) {
            console.error(`Failed to import groomer ${groomer.id}:`, err);
          }
        }
      }

      if (importData.data.contacts) {
        for (const contact of importData.data.contacts) {
          try {
            await storage.upsertContact(contact);
            stats.contacts++;
          } catch (err) {
            console.error(`Failed to import contact ${contact.id}:`, err);
          }
        }
      }

      // 2. Tables with foreign keys to above tables
      if (importData.data.customerPets) {
        for (const customerPet of importData.data.customerPets) {
          try {
            await storage.upsertCustomerPet(customerPet);
            stats.customerPets++;
          } catch (err) {
            console.error(`Failed to import customer pet ${customerPet.id}:`, err);
          }
        }
      }

      if (importData.data.groomerAvailability) {
        for (const availability of importData.data.groomerAvailability) {
          try {
            await storage.upsertGroomerAvailability(availability);
            stats.groomerAvailability++;
          } catch (err) {
            console.error(`Failed to import groomer availability ${availability.id}:`, err);
          }
        }
      }

      if (importData.data.appointments) {
        for (const appointment of importData.data.appointments) {
          try {
            await storage.upsertAppointment(appointment);
            stats.appointments++;
          } catch (err) {
            console.error(`Failed to import appointment ${appointment.id}:`, err);
          }
        }
      }

      if (importData.data.orders) {
        for (const order of importData.data.orders) {
          try {
            await storage.upsertOrder(order);
            stats.orders++;
          } catch (err) {
            console.error(`Failed to import order ${order.id}:`, err);
          }
        }
      }

      // 3. Child tables (depend on orders)
      if (importData.data.orderItems) {
        for (const orderItem of importData.data.orderItems) {
          try {
            await storage.upsertOrderItem(orderItem);
            stats.orderItems++;
          } catch (err) {
            console.error(`Failed to import order item ${orderItem.id}:`, err);
          }
        }
      }

      if (importData.data.wishlistItems) {
        for (const wishlistItem of importData.data.wishlistItems) {
          try {
            await storage.upsertWishlistItem(wishlistItem);
            stats.wishlistItems++;
          } catch (err) {
            console.error(`Failed to import wishlist item ${wishlistItem.id}:`, err);
          }
        }
      }

      // 4. Settings tables
      if (importData.data.weeklyAppointmentLimits) {
        for (const limit of importData.data.weeklyAppointmentLimits) {
          try {
            await storage.upsertWeeklyLimit(limit);
            stats.weeklyLimits++;
          } catch (err) {
            console.error(`Failed to import weekly limit ${limit.id}:`, err);
          }
        }
      }

      if (importData.data.dailyAppointmentLimits) {
        for (const limit of importData.data.dailyAppointmentLimits) {
          try {
            await storage.upsertDailyLimit(limit);
            stats.dailyLimits++;
          } catch (err) {
            console.error(`Failed to import daily limit ${limit.id}:`, err);
          }
        }
      }

      if (importData.data.specialDateSettings) {
        for (const setting of importData.data.specialDateSettings) {
          try {
            await storage.upsertSpecialDateSetting(setting);
            stats.specialDateSettings++;
          } catch (err) {
            console.error(`Failed to import special date setting ${setting.id}:`, err);
          }
        }
      }

      if (importData.data.specialDateAllowedTimes) {
        for (const allowedTime of importData.data.specialDateAllowedTimes) {
          try {
            await storage.upsertSpecialDateAllowedTime(allowedTime);
            stats.specialDateAllowedTimes++;
          } catch (err) {
            console.error(`Failed to import special date allowed time ${allowedTime.id}:`, err);
          }
        }
      }

      console.log("Import complete:", stats);

      res.json({ 
        message: "Database imported successfully",
        stats 
      });
    } catch (error) {
      console.error('Error importing database:', error);
      res.status(500).json({ message: "Failed to import database", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Export ONLY supplies to JSON (Admin only - Safe for production)
  app.get("/api/admin/supplies/export", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      console.log("Starting supplies-only export...");

      const allSupplies = await storage.getAllSupplies((req as any).tenantId);

      const exportData = {
        version: "1.0",
        type: "supplies-only",
        exportDate: new Date().toISOString(),
        environment: process.env.NODE_ENV || "development",
        data: {
          supplies: allSupplies
        }
      };

      console.log(`Exported: ${exportData.data.supplies.length} supplies`);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="supplies-export-${Date.now()}.json"`);
      res.json(exportData);
    } catch (error) {
      console.error('Error exporting supplies:', error);
      res.status(500).json({ message: "Failed to export supplies" });
    }
  });

  // Create backup file on server (Admin only)
  app.post("/api/admin/supplies/backup", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const fs = await import('fs');
      const path = await import('path');
      
      console.log("Creating supplies backup...");
      const allSupplies = await storage.getAllSupplies((req as any).tenantId);

      const backupData = {
        version: "1.0",
        type: "supplies-only",
        exportDate: new Date().toISOString(),
        environment: process.env.NODE_ENV || "development",
        totalProducts: allSupplies.length,
        data: {
          supplies: allSupplies
        }
      };

      const backupDir = path.join(process.cwd(), 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `rollback-inventory-${dateStr}.json`;
      const filepath = path.join(backupDir, filename);
      
      fs.writeFileSync(filepath, JSON.stringify(backupData, null, 2));
      
      console.log(`Backup created: ${filename} with ${allSupplies.length} products`);

      res.json({ 
        message: "Backup created successfully",
        filename,
        totalProducts: allSupplies.length,
        path: filepath
      });
    } catch (error) {
      console.error('Error creating backup:', error);
      res.status(500).json({ message: "Failed to create backup" });
    }
  });

  // Import ONLY supplies from JSON (Admin only - SAFE FOR PRODUCTION)
  app.post("/api/admin/supplies/import", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const importData = req.body;
      
      // Validate import data format
      if (!importData || !importData.version || !importData.data) {
        return res.status(400).json({ message: "Invalid import data format - missing version or data" });
      }

      // Ensure this is a supplies-only export
      if (importData.type !== "supplies-only") {
        return res.status(400).json({ message: "This endpoint only accepts supplies-only export files. Use the full database import for complete exports." });
      }

      // Validate supplies array exists and is an array
      if (!importData.data.supplies || !Array.isArray(importData.data.supplies)) {
        return res.status(400).json({ message: "Invalid import data format - supplies must be an array" });
      }

      const fullSync = importData.fullSync === true; // Delete items not in import
      
      console.log("Starting supplies-only import...");
      console.log("Import data version:", importData.version);
      console.log("Source environment:", importData.environment);
      console.log(`Processing ${importData.data.supplies.length} supplies...`);
      console.log(`Full Sync mode: ${fullSync ? 'YES - will delete missing items' : 'NO'}`);

      // Sanitize all supplies data first (convert timestamp strings to Date objects)
      const sanitizedSupplies = importData.data.supplies.map((supply: any) => ({
        ...supply,
        createdAt: supply.createdAt ? new Date(supply.createdAt) : undefined,
        updatedAt: supply.updatedAt ? new Date(supply.updatedAt) : undefined
      }));

      // Use bulk upsert for performance
      const result = await storage.bulkUpsertSupplies(sanitizedSupplies);
      
      // Full sync: Delete items not in import file
      let deletedCount = 0;
      const deleteErrors: string[] = [];
      
      if (fullSync) {
        // Create set of IDs from import file
        const importedIds = new Set(sanitizedSupplies.map((s: any) => s.id));
        
        // Get all existing supplies
        const existingSupplies = await storage.getAllSupplies(tenantId);
        
        // Delete supplies that are not in the import
        for (const supply of existingSupplies) {
          if (!importedIds.has(supply.id)) {
            try {
              await storage.deleteSupply(supply.id, tenantId);
              deletedCount++;
              console.log(`Deleted supply not in import: ${supply.name} (ID: ${supply.id})`);
            } catch (err: any) {
              deleteErrors.push(`Failed to delete ${supply.name}: ${err.message}`);
            }
          }
        }
        console.log(`Full sync: deleted ${deletedCount} supplies not in import`);
      }

      console.log(`Supplies import complete: ${result.imported} imported, ${result.failed} failed, ${deletedCount} deleted, ${result.errors.length} errors`);

      res.json({ 
        message: result.errors.length === 0 && deleteErrors.length === 0
          ? `Supplies import completed successfully${fullSync ? ` (${deletedCount} deleted)` : ''}`
          : `Supplies import completed with ${result.errors.length + deleteErrors.length} error(s)`,
        stats: {
          supplies: result.imported,
          failed: result.failed,
          deleted: deletedCount,
          errorCount: result.errors.length + deleteErrors.length,
          errors: [...result.errors.slice(0, 10), ...deleteErrors.slice(0, 10)]
        }
      });
    } catch (error) {
      console.error('Error importing supplies:', error);
      res.status(500).json({ message: "Failed to import supplies" });
    }
  });

  // Assign SKUs from spreadsheet data (Admin only)
  app.post("/api/admin/supplies/assign-skus", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const { skuData } = req.body;
      if (!skuData || !Array.isArray(skuData)) {
        return res.status(400).json({ message: "skuData array required" });
      }

      console.log(`[SKU-ASSIGN] Starting SKU assignment for ${skuData.length} items...`);
      
      const { expandAbbreviations } = await import('./abbreviationExpansion');
      
      // Get all supplies from database
      const allSupplies = await storage.getAllSupplies(tenantId);
      console.log(`[SKU-ASSIGN] Found ${allSupplies.length} supplies in database`);
      
      // Create normalized lookup maps for matching
      const supplyByNormalizedName = new Map<string, typeof allSupplies[0]>();
      const supplyByExactName = new Map<string, typeof allSupplies[0]>();
      
      for (const supply of allSupplies) {
        // Store by exact lowercase name
        const exactKey = supply.name.toLowerCase().trim();
        supplyByExactName.set(exactKey, supply);
        
        // Also create normalized version without special chars
        const normalizedName = supply.name
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        supplyByNormalizedName.set(normalizedName, supply);
      }
      
      let matched = 0;
      let notFound = 0;
      const errors: string[] = [];
      const notFoundItems: string[] = [];
      
      for (const item of skuData) {
        const { sku, abbreviatedName } = item;
        if (!sku || !abbreviatedName) continue;
        
        // Expand the abbreviated name using our abbreviation system
        const expandedName = expandAbbreviations(abbreviatedName);
        
        // Try multiple matching strategies
        let foundSupply = null;
        
        // Strategy 1: Exact match on expanded name
        const expandedLower = expandedName.toLowerCase().trim();
        foundSupply = supplyByExactName.get(expandedLower);
        
        // Strategy 2: Normalized match
        if (!foundSupply) {
          const normalizedExpanded = expandedName
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          foundSupply = supplyByNormalizedName.get(normalizedExpanded);
        }
        
        // Strategy 3: Fuzzy match - find best match by similarity
        if (!foundSupply) {
          const expandedWords = expandedName.toLowerCase().split(/\s+/).filter(w => w.length > 1);
          let bestMatch = null;
          let bestScore = 0;
          
          for (const supply of allSupplies) {
            const supplyWords = supply.name.toLowerCase().split(/\s+/).filter(w => w.length > 1);
            let matchCount = 0;
            
            for (const word of expandedWords) {
              if (supplyWords.some(sw => sw.includes(word) || word.includes(sw))) {
                matchCount++;
              }
            }
            
            const score = matchCount / Math.max(expandedWords.length, 1);
            if (score > bestScore && score >= 0.6) {
              bestScore = score;
              bestMatch = supply;
            }
          }
          
          if (bestMatch) {
            foundSupply = bestMatch;
          }
        }
        
        if (foundSupply) {
          // Update SKU
          try {
            await storage.updateSupply(foundSupply.id, { sku }, tenantId);
            matched++;
            console.log(`[SKU-ASSIGN] Matched: "${abbreviatedName}" -> "${foundSupply.name}" (SKU: ${sku})`);
          } catch (err: any) {
            errors.push(`Failed to update ${foundSupply.name}: ${err.message}`);
          }
        } else {
          notFound++;
          notFoundItems.push(`${sku}: ${abbreviatedName}`);
        }
      }
      
      console.log(`[SKU-ASSIGN] Complete: ${matched} matched, ${notFound} not found`);
      
      res.json({
        message: `SKU assignment complete: ${matched} matched, ${notFound} not found`,
        stats: {
          matched,
          notFound,
          total: skuData.length
        },
        notFoundItems: notFoundItems.slice(0, 50),
        errors: errors.slice(0, 20)
      });
    } catch (error) {
      console.error('[SKU-ASSIGN] Error:', error);
      res.status(500).json({ message: "Failed to assign SKUs" });
    }
  });

  // Fix Kong toys in Reptiles section (One-time fix - Admin only)
  app.post("/api/admin/supplies/fix-kong-reptiles", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      console.log("[FIX-KONG] Clearing Kong toys from reptile category...");
      
      // Direct SQL update to fix Kong products
      const result = await storage.fixKongReptiles();
      
      console.log(`[FIX-KONG] Fixed ${result.count} Kong products`);

      res.json({
        message: `Successfully cleared ${result.count} Kong products from reptile category`,
        count: result.count
      });
    } catch (error) {
      console.error('[FIX-KONG] Error fixing Kong reptiles:', error);
      res.status(500).json({ message: "Failed to fix Kong reptiles" });
    }
  });

  // Get all brand catalog entries (Admin only)
  app.get("/api/admin/brand-catalog", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const entries = await storage.getAllBrandCatalogEntries();
      return res.json(entries);
    } catch (error) {
      console.error("Error fetching brand catalog:", error);
      return res.status(500).json({ message: "Failed to fetch brand catalog" });
    }
  });

  // Create brand catalog entry (Admin only)
  app.post("/api/admin/brand-catalog", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Validate request body with zod schema
      const { insertBrandCatalogSchema } = await import('@shared/schema');
      const validated = insertBrandCatalogSchema.parse(req.body);

      const entry = await storage.createBrandCatalogEntry(validated);
      return res.json(entry);
    } catch (error) {
      console.error("Error creating brand catalog entry:", error);
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Validation failed",
          error: error.message
        });
      }
      return res.status(500).json({ 
        message: "Failed to create brand catalog entry",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Update brand catalog entry (Admin only)
  app.patch("/api/admin/brand-catalog/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Validate request body with partial zod schema
      const { insertBrandCatalogSchema } = await import('@shared/schema');
      const validated = insertBrandCatalogSchema.partial().parse(req.body);

      const entry = await storage.updateBrandCatalogEntry(parseInt(req.params.id), validated);
      return res.json(entry);
    } catch (error) {
      console.error("Error updating brand catalog entry:", error);
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Validation failed",
          error: error.message
        });
      }
      return res.status(500).json({ message: "Failed to update brand catalog entry" });
    }
  });

  // Delete brand catalog entry (Admin only)
  app.delete("/api/admin/brand-catalog/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      await storage.deleteBrandCatalogEntry(parseInt(req.params.id));
      return res.json({ message: "Brand catalog entry deleted successfully" });
    } catch (error) {
      console.error("Error deleting brand catalog entry:", error);
      return res.status(500).json({ message: "Failed to delete brand catalog entry" });
    }
  });

  // Seed brand catalog with validated research (Admin only)
  app.post("/api/admin/brand-catalog/seed", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      console.log("Seeding brand catalog with validated research...");
      const { seedBrandCatalog } = await import('./seedBrandCatalog');
      
      await seedBrandCatalog(storage);
      
      return res.json({ 
        message: "Brand catalog seeded successfully",
        success: true 
      });
    } catch (error) {
      console.error("Error seeding brand catalog:", error);
      return res.status(500).json({ 
        message: "Failed to seed brand catalog",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Process All: Expand abbreviations → Auto-categorize → Cleanup → Audit (Admin only)
  app.post("/api/admin/supplies/process-all", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      console.log("Starting 'Process All' - Step 1/3: Expanding abbreviations...");
      const startTime = Date.now();
      
      // Expand abbreviations using brand catalog
      const { expandAbbreviationsAsync } = await import('./abbreviationExpansion');
      const supplies = await storage.getAllSupplies((req as any).tenantId);
      const totalSupplies = supplies.length;
      let expandChanged = 0;
      let expandUnchanged = 0;
      let catalogHits = 0;
      let processed = 0;

      console.log(`Processing ${totalSupplies} supplies...`);

      // Import standardization functions
      const { standardizeProductName, standardizeBrandName } = await import('./productCategorization');
      
      for (const supply of supplies) {
        const nameResult = await expandAbbreviationsAsync(supply.name, storage);
        const descResult = await expandAbbreviationsAsync(supply.description, storage);

        if (nameResult.catalogUsed || descResult.catalogUsed) {
          catalogHits++;
        }

        // Apply standardization (spelling fixes, abbreviation expansion)
        let finalName = standardizeProductName(nameResult.expanded);
        const finalBrand = standardizeBrandName(supply.brand || '');
        
        // Truncate name if it exceeds 255 characters (database column limit)
        if (finalName.length > 255) {
          console.log(`Truncating long name (${finalName.length} chars): ${finalName.substring(0, 50)}...`);
          finalName = finalName.substring(0, 252) + '...';
        }

        const needsUpdate = 
          finalName !== supply.name || 
          descResult.expanded !== supply.description ||
          (finalBrand && finalBrand !== supply.brand);

        if (needsUpdate) {
          await storage.updateSupply(supply.id, {
            name: finalName,
            description: descResult.expanded,
            ...(finalBrand && finalBrand !== supply.brand ? { brand: finalBrand } : {})
          }, tenantId);
          expandChanged++;
        } else {
          expandUnchanged++;
        }
        
        processed++;
        // Log progress every 500 products
        if (processed % 500 === 0) {
          console.log(`Step 1/3 Progress: ${processed}/${totalSupplies} (${Math.round(processed/totalSupplies*100)}%)`);
        }
      }
      console.log(`Step 1/3 Complete: ${expandChanged} changed, ${expandUnchanged} unchanged, ${catalogHits} catalog hits`);
      
      console.log("Step 2/3: Auto-categorizing supplies...");
      
      // Step 0: Remove invalid pets (toys/supplies that shouldn't be in pets table)
      const { detectLiveAnimal } = await import('./productCategorization');
      const allPets = await storage.getAllPets(tenantId);
      let invalidPetsRemoved = 0;
      let invalidPetsSkipped = 0;
      
      for (const pet of allPets) {
        const detection = detectLiveAnimal(pet.name);
        if (!detection.isLiveAnimal) {
          const hasReferences = await storage.hasPetReferences(pet.id);
          if (hasReferences) {
            invalidPetsSkipped++;
          } else {
            try {
              await storage.deletePet(pet.id, tenantId);
              invalidPetsRemoved++;
            } catch (error) {
              invalidPetsSkipped++;
            }
          }
        }
      }

      const allSupplies = await storage.getAllSupplies(tenantId);
      let movedToPets = 0;
      let skippedDueToReferences = 0;
      
      for (const supply of allSupplies) {
        const detection = detectLiveAnimal(supply.name);
        if (detection.isLiveAnimal && detection.species) {
          try {
            const moveTenantId = tenantId;
            await storage.createPet({
              name: supply.name,
              species: detection.species,
              breed: detection.detectedKeywords.join(' ') || null,
              price: supply.price,
              description: supply.description || null,
              imageUrl: supply.imageUrl || null,
              imageUrls: supply.imageUrls || [],
              priceSource: supply.priceSource || 'default',
              tenantId: moveTenantId,
            });
            
            try {
              await storage.deleteSupply(supply.id, tenantId);
              movedToPets++;
            } catch (deleteError: any) {
              skippedDueToReferences++;
            }
          } catch (error) {
            console.error(`Error moving "${supply.name}" to pets:`, error);
          }
        }
      }

      // Step 2a: Assign brands to products without brands
      console.log("Step 2a: Assigning brands to products without brands...");
      const { extractBrand } = await import('./brandCatalog');
      const freshSupplies = await storage.getAllSupplies(tenantId);
      let brandsAssigned = 0;
      
      for (const supply of freshSupplies) {
        if (!supply.brand || supply.brand.trim() === '') {
          const detectedBrand = extractBrand(supply.name);
          if (detectedBrand) {
            await storage.updateSupply(supply.id, { brand: detectedBrand }, tenantId);
            brandsAssigned++;
          }
        }
      }
      console.log(`Brand assignment complete: ${brandsAssigned} products updated`);

      // Step 2b: Auto-categorize specialty sections
      const filterStats = await storage.autoCategorizeAllSupplies();
      
      // Step 2c: Auto-categorize product types
      const categoryStats = await storage.autoCategorizeProductCategories();
      
      // Step 2d: Cleanup categories - fix mismatches, normalize names, split food
      console.log("Step 2d: Cleaning up categories...");
      const cleanupStats = await storage.cleanupCategories();
      
      console.log("Step 3/3: Auditing unknown abbreviations...");
      const { auditUnknownAbbreviations } = await import('./abbreviationAudit');
      const auditResults = await auditUnknownAbbreviations();

      const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
      
      res.json({
        message: "All processing completed successfully",
        stats: {
          expand: {
            changed: expandChanged,
            unchanged: expandUnchanged,
            catalogHits: catalogHits,
          },
          invalidPetsRemoved,
          invalidPetsSkipped,
          liveAnimals: { movedToPets, skippedDueToReferences },
          brandsAssigned: brandsAssigned,
          filterType: filterStats,
          categories: categoryStats,
          cleanup: cleanupStats,
          audit: {
            total: auditResults.total,
            catalogHits: auditResults.catalogHits,
            unknownCount: auditResults.unknownAbbreviations.length,
          },
        },
        totalDuration: `${totalDuration}s`
      });
    } catch (error) {
      console.error('Error in process-all:', error);
      res.status(500).json({ message: "Failed to complete processing" });
    }
  });

  // Get distinct supply categories with item counts (Admin only)
  app.get("/api/admin/supplies/categories", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId = (req as any).tenantId;
      const rows = await db.execute(tenantId
        ? sql`SELECT category, COUNT(*)::int AS count FROM supplies WHERE price > 0 AND tenant_id = ${tenantId} GROUP BY category ORDER BY category`
        : sql`SELECT category, COUNT(*)::int AS count FROM supplies WHERE price > 0 GROUP BY category ORDER BY category`
      );
      res.json(rows.rows);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  // ── Employee default schedule + schedule overrides migration ─────────────
  (async () => {
    try {
      await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS default_work_days JSONB`);
      await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS default_time_slot VARCHAR(50)`);
      await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS default_day_slots JSONB`);
      await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS pos_pin_plain VARCHAR(10)`);
      await db.execute(sql`ALTER TABLE groomers ADD COLUMN IF NOT EXISTS group_id VARCHAR(100) DEFAULT 'default'`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS schedule_overrides (
          id SERIAL PRIMARY KEY,
          tenant_id INTEGER REFERENCES tenants(id),
          employee_name VARCHAR(255) NOT NULL,
          specific_date DATE NOT NULL,
          time_slot VARCHAR(100) NOT NULL,
          note TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE (tenant_id, employee_name, specific_date)
        )
      `);
    } catch (e) {
      console.error("Failed to run schedule overrides migration:", e);
    }
  })();

  // Ensure supply_categories table exists (tenant_id column added via migration)
  (async () => {
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS supply_categories (
          id SERIAL PRIMARY KEY,
          key VARCHAR(100) NOT NULL,
          label VARCHAR(100) NOT NULL,
          tenant_id INTEGER REFERENCES tenants(id),
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE (key, tenant_id)
        )
      `);
    } catch (e) {
      console.error("Failed to initialize supply_categories table:", e);
    }
  })();

  // Public: list categories for the storefront (no auth, tenant-scoped via X-Tenant-Slug)
  app.get("/api/categories", async (req: any, res) => {
    try {
      const tenantId = (req as any).tenantId;
      if (!tenantId) return res.json([]);
      const rows = await db.execute(sql`SELECT key, label FROM supply_categories WHERE tenant_id = ${tenantId} ORDER BY label ASC`);
      res.json(rows.rows);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  // Admin: list categories (tenant-scoped)
  app.get("/api/admin/categories", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId = (req as any).tenantId;
      if (!tenantId) return res.json([]);
      const rows = await db.execute(sql`SELECT id, key, label FROM supply_categories WHERE tenant_id = ${tenantId} ORDER BY label ASC`);
      res.json(rows.rows);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  // Admin: create a new supply category (tenant-scoped)
  app.post("/api/admin/categories", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId = (req as any).tenantId;
      if (!tenantId) return res.status(400).json({ message: "No tenant context" });
      const { key, label } = req.body;
      if (!key || !label) return res.status(400).json({ message: "key and label are required" });
      const safeKey = key.trim().replace(/[^a-zA-Z0-9_]/g, '');
      const safeLabel = label.trim().slice(0, 100);
      if (!safeKey) return res.status(400).json({ message: "Key must contain alphanumeric characters" });
      await db.execute(sql`INSERT INTO supply_categories (key, label, tenant_id) VALUES (${safeKey}, ${safeLabel}, ${tenantId})`);
      res.json({ key: safeKey, label: safeLabel });
    } catch (error: any) {
      if (error?.message?.includes('unique') || error?.message?.includes('duplicate')) {
        return res.status(409).json({ message: "A category with that key already exists" });
      }
      res.status(500).json({ message: "Failed to create category" });
    }
  });

  // Admin: delete a supply category (tenant-scoped)
  app.delete("/api/admin/categories/:key", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const key = req.params.key;
      const tenantId = (req as any).tenantId;
      if (!tenantId) return res.status(400).json({ message: "No tenant context" });
      const inUse = await db.execute(sql`SELECT COUNT(*)::int AS count FROM supplies WHERE category = ${key} AND tenant_id = ${tenantId}`);
      const count = Number((inUse.rows[0] as any).count);
      if (count > 0) {
        return res.status(409).json({ message: `Cannot delete — ${count} product(s) still use this category` });
      }
      await db.execute(sql`DELETE FROM supply_categories WHERE key = ${key} AND tenant_id = ${tenantId}`);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete category" });
    }
  });

  // Price adjustment by category or entire inventory (Admin only)
  app.post("/api/admin/price-adjustment", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const { target, category, percentage, direction, rounding } = req.body;

      if (!percentage || isNaN(parseFloat(percentage)) || parseFloat(percentage) <= 0) {
        return res.status(400).json({ message: "Percentage must be a positive number" });
      }
      if (!['increase', 'decrease'].includes(direction)) {
        return res.status(400).json({ message: "Direction must be 'increase' or 'decrease'" });
      }
      if (!['x9', 'standard'].includes(rounding)) {
        return res.status(400).json({ message: "Rounding must be 'x9' or 'standard'" });
      }

      const pct = parseFloat(percentage);
      const multiplier = direction === 'increase' ? 1 + pct / 100 : 1 - pct / 100;

      // Build the new price expression based on rounding choice
      let priceExpr: string;
      if (rounding === 'x9') {
        // Round up to nearest X.X9 (e.g. $8.09 → $8.79)
        if (direction === 'increase') {
          priceExpr = `(FLOOR(CEIL(price * ${multiplier} * 100.0) / 10) * 10 + 9) / 100.0`;
        } else {
          // For decreases, floor toward X.X9
          priceExpr = `(FLOOR(price * ${multiplier} * 100.0 / 10) * 10 + 9) / 100.0`;
        }
      } else {
        // Standard 2-decimal rounding
        priceExpr = `ROUND(price * ${multiplier}, 2)`;
      }

      let updatedCount = 0;
      const tenantClause = ` AND tenant_id = ${Number(tenantId)}`;
      const petsTenantClause = ` AND tenant_id = ${Number(tenantId)}`;

      if (target === 'pets') {
        const result = await db.execute(sql.raw(`UPDATE pets SET price = ${priceExpr} WHERE price > 0${petsTenantClause}`));
        updatedCount = (result as any).rowCount ?? 0;
      } else if (target === 'all') {
        const r1 = await db.execute(sql.raw(`UPDATE supplies SET price = ${priceExpr} WHERE price > 0${tenantClause}`));
        const r2 = await db.execute(sql.raw(`UPDATE pets SET price = ${priceExpr} WHERE price > 0${petsTenantClause}`));
        updatedCount = ((r1 as any).rowCount ?? 0) + ((r2 as any).rowCount ?? 0);
      } else if (target === 'category' && category) {
        const result = await db.execute(
          sql.raw(`UPDATE supplies SET price = ${priceExpr} WHERE price > 0 AND category = '${category.replace(/'/g, "''")}'${tenantClause}`)
        );
        updatedCount = (result as any).rowCount ?? 0;
      } else {
        return res.status(400).json({ message: "Invalid target or missing category" });
      }

      console.log(`[PRICE ADJUSTMENT] ${direction} ${pct}% on ${target === 'category' ? category : target}, rounding=${rounding}, updated=${updatedCount} items`);
      res.json({ updatedCount, percentage: pct, direction, target: target === 'category' ? category : target, rounding });
    } catch (error) {
      console.error("Price adjustment error:", error);
      res.status(500).json({ message: "Price adjustment failed", error: (error as Error).message });
    }
  });

  // Sync categories from Excel file (Admin only)
  // Uses the Excel file as the authoritative source for product categories
  app.post("/api/admin/supplies/sync-categories-from-excel", authMiddleware, excelUpload.single('file'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      console.log("Syncing categories from Excel file...");

      // Parse Excel file
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      const worksheet = workbook.worksheets[0];

      // Build map of product name -> category from Excel
      const excelCategories = new Map<string, string>();
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header

        const name = row.getCell(2).value?.toString().trim().toLowerCase();
        const category = row.getCell(4).value?.toString().trim();

        if (name && category && !category.startsWith('$')) {
          excelCategories.set(name, category);
        }
      });

      console.log(`Found ${excelCategories.size} products in Excel file`);

      // Get all supplies and update categories
      const allSupplies = await storage.getAllSupplies(tenantId);
      let updated = 0;
      let unchanged = 0;
      let notFound = 0;

      for (const supply of allSupplies) {
        const nameLower = supply.name.toLowerCase().trim();
        const excelCategory = excelCategories.get(nameLower);

        if (excelCategory) {
          // Normalize category names
          let normalizedCategory = excelCategory;
          const categoryNormalization: Record<string, string> = {
            'cat toy': 'toys',
            'dog toy': 'toys',
            'kennel': 'dogCages',
            'smallanimalsupplies': 'smallanimal',
            'health': 'healthcare',
            'doghouse': 'dogCages',
          };
          if (categoryNormalization[excelCategory.toLowerCase()]) {
            normalizedCategory = categoryNormalization[excelCategory.toLowerCase()];
          }

          if (supply.category !== normalizedCategory) {
            await storage.updateSupply(supply.id, { category: normalizedCategory }, tenantId);
            updated++;
          } else {
            unchanged++;
          }
        } else {
          notFound++;
        }
      }

      console.log(`Category sync complete: ${updated} updated, ${unchanged} unchanged, ${notFound} not in Excel`);

      res.json({
        message: "Category sync completed",
        stats: {
          excelProducts: excelCategories.size,
          updated,
          unchanged,
          notFound
        }
      });
    } catch (error) {
      console.error('Error syncing categories from Excel:', error);
      res.status(500).json({ message: "Failed to sync categories from Excel" });
    }
  });

  // Search for product image from major distributors (Admin only)















  // Sync images by product name/brand (for production sync where IDs differ)
  // Matches Object Storage images to products by name slug instead of ID
  app.post("/api/admin/supplies/sync-images-by-name", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { ObjectStorageService } = await import('./objectStorageService');
      const objectStorageService = new ObjectStorageService();

      // Check if Object Storage is configured
      if (!objectStorageService.isObjectStorageConfigured()) {
        return res.status(400).json({ 
          message: "Object Storage is not configured in this environment. Please set up Object Storage in the Replit tools panel first, or ensure the PUBLIC_OBJECT_SEARCH_PATHS secret is set.",
          error: "OBJECT_STORAGE_NOT_CONFIGURED"
        });
      }

      console.log('Starting image sync by name...');

      // Step 1: List all images from Object Storage
      const allImages = await objectStorageService.listAllProductImages();
      console.log(`Found ${allImages.length} images in Object Storage`);

      // Step 2: Build a map of brandSlug/productSlug -> storedPath
      // Handle multiple images with same slug (different IDs) by keeping the first one
      const imageMap = new Map<string, string>();
      const duplicates: string[] = [];
      
      for (const img of allImages) {
        const key = `${img.brandSlug}/${img.productSlug}`;
        if (!imageMap.has(key)) {
          imageMap.set(key, img.storedPath);
        } else {
          duplicates.push(key);
        }
      }
      console.log(`Built image map with ${imageMap.size} unique entries, ${duplicates.length} duplicates ignored`);

      // Step 3: Get all products from database
      const { db } = await import('./db');
      const { sql } = await import('drizzle-orm');
      
      const imgSyncTenantId = resolveWriteTenantId(req, res);
      if (imgSyncTenantId === undefined) return;
      const result = await db.execute(
        sql`SELECT id, name, brand FROM supplies WHERE tenant_id = ${imgSyncTenantId} ORDER BY id`
      );
      
      const products = result.rows as Array<{ id: number; name: string; brand: string | null }>;
      console.log(`Found ${products.length} products in database`);

      // Step 4: Match products to images and update
      let matched = 0;
      let unmatched = 0;
      const unmatchedProducts: Array<{ id: number; name: string; brand: string | null }> = [];

      for (const product of products) {
        const { brandSlug, productSlug } = objectStorageService.generateProductSlug(
          product.name,
          product.brand || 'unknown'
        );
        const key = `${brandSlug}/${productSlug}`;
        
        if (imageMap.has(key)) {
          const storedPath = imageMap.get(key)!;
          await db.execute(sql`
            UPDATE supplies SET image_url = ${storedPath} WHERE id = ${product.id}
              AND tenant_id = ${imgSyncTenantId}
          `);
          matched++;
        } else {
          unmatched++;
          if (unmatchedProducts.length < 100) {
            unmatchedProducts.push(product);
          }
        }
      }

      console.log(`Sync complete: ${matched} matched, ${unmatched} unmatched`);

      res.json({
        success: true,
        totalImages: allImages.length,
        uniqueImageSlugs: imageMap.size,
        totalProducts: products.length,
        matched,
        unmatched,
        duplicatesIgnored: duplicates.length,
        sampleUnmatched: unmatchedProducts.slice(0, 20),
        message: `Successfully matched ${matched} products to images`
      });
    } catch (error: any) {
      console.error('Error syncing images by name:', error);
      res.status(500).json({ message: "Failed to sync images by name", error: error.message });
    }
  });

  // Direct file upload for supply images (Admin only)
  // Also applies abbreviation expansion to correct product names
  app.post("/api/admin/supplies/:id/upload-image", authMiddleware, upload.single('image'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const { id } = req.params;
      
      if (!req.file) {
        return res.status(400).json({ message: "No image file uploaded" });
      }

      const supply = await storage.getSupply(parseInt(id), tenantId);
      if (!supply) {
        return res.status(404).json({ message: "Product not found" });
      }

      const fs = await import('fs/promises');
      const fileBuffer = await fs.readFile(req.file.path);
      
      const { ObjectStorageService } = await import('./objectStorageService');
      const objectStorageService = new ObjectStorageService();
      
      const result = await objectStorageService.storeUploadedProductImage(
        fileBuffer,
        req.file.mimetype,
        supply.id,
        supply.name,
        supply.brand || 'unknown'
      );

      await fs.unlink(req.file.path).catch(() => {});

      if (!result.success) {
        return res.status(400).json({ message: result.error || "Failed to store image" });
      }

      // Apply abbreviation expansion to correct product name
      const { expandAbbreviationsAsync } = await import('./abbreviationExpansion');
      const nameResult = await expandAbbreviationsAsync(supply.name, storage);
      const correctedName = nameResult.expanded;
      const nameWasCorrected = correctedName !== supply.name;

      // Determine where to place the new image:
      // - If no main image exists, new image becomes main
      // - If main image exists, append new image to imageUrls array
      const hasMainImage = supply.imageUrl && supply.imageUrl.trim() !== '';
      
      let updateData: any = {
        ...(nameWasCorrected ? { name: correctedName } : {})
      };
      
      if (!hasMainImage) {
        // First image: set as main
        updateData.imageUrl = result.storedPath!;
      } else {
        // Additional image: append to imageUrls array
        const existingUrls = supply.imageUrls || [];
        updateData.imageUrls = [...existingUrls, result.storedPath!];
      }
      
      await storage.updateSupply(supply.id, updateData, tenantId);

      res.json({
        success: true,
        productId: supply.id,
        productName: nameWasCorrected ? correctedName : supply.name,
        storedPath: result.storedPath,
        isMainImage: !hasMainImage,
        nameCorrected: nameWasCorrected,
        originalName: nameWasCorrected ? supply.name : undefined
      });
    } catch (error: any) {
      console.error('Error uploading supply image:', error);
      res.status(500).json({ message: "Failed to upload image", error: error.message });
    }
  });

  // ============================================
  // ORDER PHOTO UPLOAD & EXTRACTION ROUTES
  // ============================================

  // Upload order photo and extract items using AI Vision (Admin only)
  app.post("/api/admin/order-photos", requireAdminMiddleware, upload.single('photo'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const priceMultiplier = parseFloat(req.body.priceMultiplier || "1.0");
      
      if (isNaN(priceMultiplier) || priceMultiplier <= 0) {
        return res.status(400).json({ message: "Invalid price multiplier" });
      }

      // Create the order photo record
      const orderPhoto = await storage.createOrderPhoto({
        userId: user.id,
        imageUrl: `/uploads/${req.file.filename}`,
        priceMultiplier: priceMultiplier.toString(),
        status: "processing"
      });

      // Process the image with AI Vision in background
      const imagePath = req.file.path;
      
      try {
        const extractionResult = await extractOrderFromPhoto(imagePath);
        
        if (!extractionResult.success) {
          // Update status to error
          await storage.updateOrderPhoto(orderPhoto.id, {
            status: "error",
            errorMessage: extractionResult.error || "Failed to extract items"
          });
          return res.status(500).json({ 
            message: "Failed to extract items from photo",
            error: extractionResult.error 
          });
        }

        // Save extracted items to database
        const itemsToCreate = extractionResult.items.map(item => ({
          orderPhotoId: orderPhoto.id,
          itemName: item.itemName,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toString(),
          markedUpPrice: apply99Pricing(item.unitPrice * priceMultiplier).toFixed(2),
          category: item.category || "accessories",
          brand: item.brand || null,
          notes: item.notes || null,
          addedToInventory: false
        }));

        const extractedItems = await storage.bulkCreateExtractedOrderItems(itemsToCreate);

        // Update status to completed
        await storage.updateOrderPhoto(orderPhoto.id, {
          status: "completed",
          aiResponse: extractionResult.rawResponse || null
        });

        res.json({
          success: true,
          orderPhoto: {
            ...orderPhoto,
            status: "completed"
          },
          extractedItems,
          itemCount: extractedItems.length
        });

      } catch (processingError: any) {
        console.error("Error processing order photo:", processingError);
        await storage.updateOrderPhoto(orderPhoto.id, {
          status: "error",
          errorMessage: processingError.message
        });
        res.status(500).json({ 
          message: "Failed to process order photo",
          error: processingError.message 
        });
      }
    } catch (error: any) {
      console.error("Error uploading order photo:", error);
      res.status(500).json({ message: "Failed to upload order photo" });
    }
  });

  // Get all order photos (Admin only)
  app.get("/api/admin/order-photos", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const orderPhotos = await storage.getAllOrderPhotos();
      res.json(orderPhotos);
    } catch (error) {
      console.error("Error fetching order photos:", error);
      res.status(500).json({ message: "Failed to fetch order photos" });
    }
  });

  // Get a single order photo with its extracted items (Admin only)
  app.get("/api/admin/order-photos/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      const orderPhoto = await storage.getOrderPhoto(id);
      
      if (!orderPhoto) {
        return res.status(404).json({ message: "Order photo not found" });
      }

      const extractedItems = await storage.getExtractedOrderItems(id);
      
      res.json({
        orderPhoto,
        extractedItems
      });
    } catch (error) {
      console.error("Error fetching order photo:", error);
      res.status(500).json({ message: "Failed to fetch order photo" });
    }
  });

  // Update an order photo (Admin only)
  app.put("/api/admin/order-photos/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      const { name } = req.body;
      
      const updatedPhoto = await storage.updateOrderPhoto(id, { name });
      res.json(updatedPhoto);
    } catch (error) {
      console.error("Error updating order photo:", error);
      res.status(500).json({ message: "Failed to update order photo" });
    }
  });

  // Update an extracted order item (Admin only)
  app.put("/api/admin/extracted-items/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      const { itemName, quantity, unitPrice, markedUpPrice, category, brand, notes } = req.body;
      
      // When manually updating, preserve the exact price without .99 pricing adjustment
      const updatedItem = await storage.updateExtractedOrderItem(id, {
        itemName,
        quantity,
        unitPrice,
        markedUpPrice: parseFloat(markedUpPrice).toFixed(2),
        category,
        brand,
        notes
      });

      res.json(updatedItem);
    } catch (error) {
      console.error("Error updating extracted item:", error);
      res.status(500).json({ message: "Failed to update extracted item" });
    }
  });

  // Delete an extracted order item (Admin only)
  app.delete("/api/admin/extracted-items/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      await storage.deleteExtractedOrderItem(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting extracted item:", error);
      res.status(500).json({ message: "Failed to delete extracted item" });
    }
  });

  // Add extracted items to supplies inventory (Admin only)
  app.post("/api/admin/extracted-items/add-to-inventory", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const { itemIds } = req.body;
      
      if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ message: "Item IDs array is required" });
      }

      const results = [];
      
      for (const itemId of itemIds) {
        try {
          const extractedItem = await storage.getExtractedOrderItem(parseInt(itemId));
          
          if (!extractedItem) {
            results.push({ itemId, success: false, error: "Item not found" });
            continue;
          }

          if (extractedItem.addedToInventory) {
            results.push({ itemId, success: false, error: "Already added to inventory" });
            continue;
          }

          // Skip non-inventory items like truck fuel charge
          if (extractedItem.itemName.toLowerCase().includes('truck fuel charge')) {
            results.push({ itemId, success: false, error: "Skipped - non-inventory expense item" });
            continue;
          }

          // Detect if this is a live animal (should go to pets, not supplies)
          const liveAnimalDetection = detectLiveAnimal(extractedItem.itemName);

          if (liveAnimalDetection.isLiveAnimal) {
            // This is a live animal - add to pets instead of supplies
            const speciesMap: Record<string, string> = {
              mice: 'Small Animals',
              mouse: 'Small Animals',
              hamster: 'Small Animals',
              guineapig: 'Small Animals',
              gerbil: 'Small Animals',
              chinchilla: 'Small Animals',
              ferret: 'Small Animals',
              rabbit: 'Small Animals',
              rat: 'Small Animals',
              hedgehog: 'Small Animals',
              goldfish: 'Fish',
              betta: 'Fish',
              guppy: 'Fish',
              molly: 'Fish',
              platy: 'Fish',
              swordtail: 'Fish',
              tetra: 'Fish',
              angelfish: 'Fish',
              gourami: 'Fish',
              barb: 'Fish',
              danio: 'Fish',
              rasbora: 'Fish',
              loach: 'Fish',
              catfish: 'Fish',
              cichlid: 'Fish',
              discus: 'Fish',
              koi: 'Fish',
              shrimp: 'Other',
              algaeeater: 'Other',
              feederfish: 'Fish',
              arowana: 'Fish',
              gecko: 'Reptiles',
              beardeddragon: 'Reptiles',
              chameleon: 'Reptiles',
              iguana: 'Reptiles',
              snake: 'Reptiles',
              turtle: 'Reptiles',
              frog: 'Reptiles',
              salamander: 'Reptiles',
              parakeet: 'Birds',
              cockatiel: 'Birds',
              canary: 'Birds',
              finch: 'Birds',
              parrot: 'Birds'
            };

            const species = speciesMap[liveAnimalDetection.species || ''] || 'Other';

            // Create pet from extracted item
            const pet = await storage.createPet({
              name: extractedItem.itemName,
              species: species,
              breed: liveAnimalDetection.detectedKeywords.join(', ') || null,
              price: extractedItem.markedUpPrice,
              age: null,
              description: extractedItem.notes || null,
              isActive: true,
              tenantId,
            });

            // Mark item as added to inventory (linked to pet instead of supply)
            await storage.updateExtractedOrderItem(extractedItem.id, {
              addedToInventory: true,
              supplyId: null // No supply ID since it's a pet
            });

            results.push({ 
              itemId: extractedItem.id, 
              success: true, 
              petId: pet.id,
              petName: pet.name,
              isLiveAnimal: true,
              detectedAs: liveAnimalDetection.species
            });
            continue;
          }

          // Apply auto-categorization to determine filterType and category
          const categorizationResult = categorizeProduct({
            name: extractedItem.itemName,
            brand: extractedItem.brand || '',
            description: extractedItem.notes || ''
          });

          // Determine category based on filterType or fall back to extracted category
          let category = extractedItem.category || "accessories";
          if (categorizationResult.filterType === 'aquatic') {
            category = 'fish'; // Aquatic items are fish supplies
          } else if (categorizationResult.filterType === 'reptile') {
            category = 'reptile'; // Reptile items
          } else if (categorizationResult.filterType === 'smallanimal') {
            category = 'smallanimal'; // Small animal items (mice, ferrets, rabbits, etc.)
          }

          // Create supply from extracted item with auto-categorization applied
          const supply = await storage.createSupply({
            name: extractedItem.itemName,
            category: category,
            brand: extractedItem.brand || null,
            price: extractedItem.markedUpPrice,
            description: extractedItem.notes || null,
            stockQuantity: extractedItem.quantity,
            isActive: true,
            filterType: categorizationResult.filterType, // Set filterType for aquatic/reptile specialty sections
            tenantId,
          });

          // Mark item as added to inventory
          await storage.updateExtractedOrderItem(extractedItem.id, {
            addedToInventory: true,
            supplyId: supply.id
          });

          results.push({ 
            itemId: extractedItem.id, 
            success: true, 
            supplyId: supply.id,
            supplyName: supply.name,
            isLiveAnimal: false
          });
        } catch (itemError: any) {
          console.error(`Error adding item ${itemId} to inventory:`, itemError);
          results.push({ 
            itemId, 
            success: false, 
            error: itemError.message 
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      
      res.json({
        success: true,
        processed: results.length,
        successCount,
        results
      });
    } catch (error: any) {
      console.error("Error adding items to inventory:", error);
      res.status(500).json({ message: "Failed to add items to inventory" });
    }
  });

  // Delete an order photo and all its extracted items (Admin only)
  app.delete("/api/admin/order-photos/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      await storage.deleteOrderPhoto(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting order photo:", error);
      res.status(500).json({ message: "Failed to delete order photo" });
    }
  });

  // ============================================
  // ASTRO LOYALTY INTEGRATION ROUTES
  // ============================================

  // Public status: is Astro Loyalty configured for this deployment?
  app.get("/api/astro/status", authMiddleware, async (_req, res) => {
    const { isAstroEnabled } = await import('./astroLoyalty');
    res.json({ enabled: isAstroEnabled() });
  });

  // Test Astro API connection (Admin only)
  app.get("/api/admin/astro/test-connection", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { testAstroConnection } = await import('./astroLoyalty');
      const result = await testAstroConnection();
      
      res.json(result);
    } catch (error) {
      console.error("Error testing Astro connection:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to test Astro connection",
        error: (error as Error).message
      });
    }
  });

  // Get Astro customer status for current user
  app.get("/api/astro/my-status", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const astroCustomer = await storage.getAstroCustomerByUserId(userId);
      
      if (!astroCustomer) {
        return res.json({
          linked: false,
          message: "Your account is not linked to Astro Loyalty yet"
        });
      }

      const { getCustomerStatus } = await import('./astroLoyalty');
      const internalId = `animalhouse-${astroCustomer.userId}`;
      console.log(`[ASTRO] Fetching live status for astro customer ${astroCustomer.astroCustomerId} with internalId ${internalId}`);
      const liveStatus = await getCustomerStatus(astroCustomer.astroCustomerId, false, internalId);
      console.log(`[ASTRO] Live status result:`, liveStatus ? `points=${liveStatus.pointsBalance}, cards=${liveStatus.frequentBuyerCards?.length}, offers=${liveStatus.offerRewards?.length}` : 'null');

      if (liveStatus) {
        const currentPoints = parseFloat(String(astroCustomer.loyaltyPoints) || '0');
        if (liveStatus.pointsBalance !== currentPoints) {
          await storage.updateAstroCustomer(astroCustomer.id, {
            loyaltyPoints: String(liveStatus.pointsBalance),
            lastSyncedAt: new Date(),
            syncStatus: 'synced',
          });
        }

        res.json({
          linked: true,
          loyaltyPoints: liveStatus.pointsBalance,
          email: astroCustomer.email,
          lastSyncedAt: new Date(),
          syncStatus: 'synced',
          frequentBuyerCards: liveStatus.frequentBuyerCards,
          offerRewards: liveStatus.offerRewards,
          pointsTransactions: liveStatus.pointsTransactions,
          eligiblePointsRewards: liveStatus.eligiblePointsRewards,
        });
      } else {
        const progress = await storage.getFrequentBuyerProgressByCustomer(astroCustomer.id);
        res.json({
          linked: true,
          loyaltyPoints: astroCustomer.loyaltyPoints,
          email: astroCustomer.email,
          lastSyncedAt: astroCustomer.lastSyncedAt,
          syncStatus: astroCustomer.syncStatus,
          frequentBuyerPrograms: progress
        });
      }
    } catch (error) {
      console.error("Error getting Astro status:", error);
      res.status(500).json({ message: "Failed to get loyalty status" });
    }
  });

  app.get("/api/astro/cart-deals", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const astroCustomer = await storage.getAstroCustomerByUserId(userId);
      
      if (!astroCustomer) {
        return res.json({ deals: [], totalDiscount: 0 });
      }

      const cartItems = await storage.getCartItems(userId);
      if (cartItems.length === 0) {
        return res.json({ deals: [], totalDiscount: 0 });
      }

      const supplyIds = cartItems.filter((item: any) => item.supplyId).map((item: any) => item.supplyId);
      if (supplyIds.length === 0) {
        return res.json({ deals: [], totalDiscount: 0 });
      }

      const supplies = await Promise.all(
        supplyIds.map(id => storage.getSupply(id, (req as any).tenantId))
      );

      const cartItemsWithDetails = cartItems
        .filter((item: any) => item.supplyId)
        .map((item: any) => {
          const supply = supplies.find(s => s && s.id === item.supplyId);
          return {
            supplyId: item.supplyId,
            supplyName: supply?.name || 'Unknown',
            sku: supply?.sku || '',
            price: parseFloat(supply?.price || '0'),
            quantity: item.quantity,
            brand: supply?.brand || '',
          };
        })
        .filter(item => item.sku && item.sku.trim() !== '');

      if (cartItemsWithDetails.length === 0) {
        return res.json({ deals: [], totalDiscount: 0 });
      }

      const { evaluateCartDeals } = await import('./astroLoyalty');
      const deals = await evaluateCartDeals(cartItemsWithDetails);
      
      const totalDiscount = Math.round(
        deals.filter(d => d.autoApply).reduce((sum, d) => sum + d.calculatedDiscount, 0) * 100
      ) / 100;

      res.json({ deals, totalDiscount });
    } catch (error) {
      console.error("Error getting cart deals:", error);
      res.json({ deals: [], totalDiscount: 0 });
    }
  });

  // Get eligible Astro rewards for cart items
  app.get("/api/astro/cart-rewards", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const astroCustomer = await storage.getAstroCustomerByUserId(userId);
      
      if (!astroCustomer) {
        return res.json({ rewards: [] });
      }

      const { getCustomerStatus } = await import('./astroLoyalty');
      const internalId = `animalhouse-${userId}`;
      const status = await getCustomerStatus(astroCustomer.astroCustomerId, false, internalId);
      
      if (!status) {
        return res.json({ rewards: [] });
      }

      const readyRewards: any[] = [];

      for (const card of status.frequentBuyerCards) {
        const purchaseCount = card.purchases?.length || 0;
        if (purchaseCount >= card.requiredPurchases) {
          const unredeemedGoods = (card.freeGoods || []).filter(fg => !fg.redeemedOn);
          for (const fg of unredeemedGoods) {
            readyRewards.push({
              rewardId: fg.rewardId,
              programId: card.programId,
              programTitle: card.programTitle,
              manufacturer: card.manufacturer,
              itemDescription: fg.itemDescription,
              freeQty: fg.freeQty,
              programImage: card.programImage,
            });
          }
        }
      }

      // Also include offer rewards
      for (const offer of (status.offerRewards || [])) {
        readyRewards.push({
          rewardId: offer.rewardId,
          programTitle: offer.title,
          type: 'offer',
          rebateAmount: offer.rebateAmount,
        });
      }

      res.json({ rewards: readyRewards });
    } catch (error) {
      console.error("Error getting cart rewards:", error);
      res.json({ rewards: [] });
    }
  });

  // Link customer to Astro Loyalty (creates account if needed)
  app.post("/api/astro/link-account", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if already linked
      const existing = await storage.getAstroCustomerByUserId(userId);
      if (existing) {
        return res.status(400).json({ 
          message: "Account is already linked to Astro Loyalty",
          astroCustomer: existing
        });
      }

      // Lookup or create customer in Astro.
      // SECURITY: Only search by email, never by phone, to prevent phone-number hijacking
      // of third-party loyalty accounts. Phone is still stored on newly-created accounts
      // but is never used as a match key when claiming an existing Astro record.
      const { lookupOrCreateAstroCustomer } = await import('./astroLoyalty');
      const astroData = await lookupOrCreateAstroCustomer({
        email: user.email || '',
        firstName: user.firstName || undefined,
        lastName: user.lastName || undefined,
        phoneNumber: user.phoneNumber || undefined,
      }, { lookupByEmailOnly: true });

      if (!astroData) {
        return res.status(503).json({ 
          message: "Astro Loyalty integration is not currently enabled. Please contact store admin."
        });
      }

      // Create local Astro customer record
      const astroCustomer = await storage.createAstroCustomer({
        userId,
        astroCustomerId: astroData.customerId,
        email: user.email || '',
        phoneNumber: user.phoneNumber || null,
        loyaltyPoints: astroData.loyaltyPoints,
        lastSyncedAt: new Date(),
        syncStatus: 'synced',
      });

      res.json({
        success: true,
        message: "Successfully linked to Astro Loyalty!",
        astroCustomer
      });
    } catch (error) {
      console.error("Error linking Astro account:", error);
      res.status(500).json({ message: "Failed to link Astro account" });
    }
  });

  // Sync a purchase to Astro (called automatically on order completion)
  app.post("/api/astro/sync-purchase/:orderId", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const orderId = parseInt(req.params.orderId);

      // Get the order
      const order = await storage.getOrder(orderId, (req as any).tenantId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Verify ownership (unless admin)
      const user = await storage.getUser(userId);
      if (order.userId !== userId && !user?.isAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Check if customer is linked to Astro
      const astroCustomer = await storage.getAstroCustomerByUserId(order.userId);
      if (!astroCustomer) {
        return res.status(400).json({ 
          message: "Customer account is not linked to Astro Loyalty"
        });
      }

      // Check if already synced
      const existingSync = await storage.getPurchaseSyncLogByOrder(orderId);
      if (existingSync.length > 0 && existingSync[0].syncStatus === 'success') {
        return res.status(400).json({ 
          message: "This purchase has already been synced to Astro"
        });
      }

      // Get order items
      const orderWithItems = await storage.getOrderWithItems(orderId, (req as any).tenantId);
      const orderItemsList = orderWithItems?.items || [];
      if (orderItemsList.length === 0) {
        return res.status(400).json({ message: "Order has no items" });
      }

      const { syncPurchaseToAstro } = await import('./astroLoyalty');
      const items = [];
      
      for (const item of orderItemsList) {
        if (item.supplyId) {
          const supply = await storage.getSupply(item.supplyId, (req as any).tenantId);
          if (supply) {
            items.push({
              productId: supply.id.toString(),
              productName: supply.name,
              brand: supply.brand || undefined,
              sku: supply.sku || undefined,
              quantity: item.quantity,
              unitPrice: parseFloat(item.price),
              totalPrice: parseFloat(item.price) * item.quantity,
            });
          }
        }
      }

      const syncResult = await syncPurchaseToAstro({
        customerId: astroCustomer.astroCustomerId,
        internalCustomerId: `animalhouse-${order.userId}`,
        transactionId: orderId.toString(),
        items,
        purchaseDate: order.orderDate,
        totalAmount: parseFloat(order.totalAmount),
      });

      if (!syncResult) {
        // Log failed sync
        await storage.createPurchaseSyncLog({
          orderId,
          astroCustomerId: astroCustomer.id,
          supplyId: null,
          quantity: items.reduce((sum, item) => sum + item.quantity, 0),
          syncStatus: 'failed',
          syncError: 'Astro integration not enabled',
        });

        return res.status(503).json({ 
          message: "Astro Loyalty integration is not currently enabled"
        });
      }

      // Log successful sync for each item
      for (const item of items) {
        await storage.createPurchaseSyncLog({
          orderId,
          astroCustomerId: astroCustomer.id,
          supplyId: parseInt(item.productId),
          quantity: item.quantity,
          syncStatus: 'success',
          astroTransactionId: syncResult.transactionId,
        });
      }

      res.json({
        success: true,
        message: "Purchase synced to Astro Loyalty successfully!",
        astroTransactionId: syncResult.transactionId
      });
    } catch (error) {
      console.error("Error syncing purchase to Astro:", error);
      res.status(500).json({ message: "Failed to sync purchase" });
    }
  });

  // Get active Astro offers/programs (Admin only)
  app.get("/api/admin/astro/offers", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { listOffers } = await import('./astroLoyalty');
      const offers = await listOffers();
      res.json(offers);
    } catch (error) {
      console.error("Error getting Astro offers:", error);
      res.status(500).json({ message: "Failed to get Astro offers" });
    }
  });

  // Get detailed Astro customer status (Admin only)
  app.get("/api/admin/astro/customer-status/:astroCustomerId", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { getCustomerStatus } = await import('./astroLoyalty');
      const astroCustomer = await storage.getAstroCustomerByAstroId(req.params.astroCustomerId);
      const internalId = astroCustomer?.userId ? `animalhouse-${astroCustomer.userId}` : undefined;
      const status = await getCustomerStatus(req.params.astroCustomerId, false, internalId);
      if (!status) {
        return res.status(404).json({ message: "Customer not found in Astro" });
      }
      res.json(status);
    } catch (error) {
      console.error("Error getting Astro customer status:", error);
      res.status(500).json({ message: "Failed to get customer status" });
    }
  });

  // Redeem a points reward for a customer
  app.post("/api/astro/redeem-points", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { rewardId } = req.body;

      if (!rewardId) {
        return res.status(400).json({ message: "Reward ID is required" });
      }

      const astroCustomer = await storage.getAstroCustomerByUserId(userId);
      if (!astroCustomer) {
        return res.status(400).json({ message: "Account is not linked to Astro Loyalty" });
      }

      const { redeemPoints } = await import('./astroLoyalty');
      const result = await redeemPoints(astroCustomer.astroCustomerId, rewardId);

      if (!result) {
        return res.status(503).json({ message: "Failed to redeem reward" });
      }

      res.json({ success: true, message: "Reward redeemed successfully!", ...result });
    } catch (error) {
      console.error("Error redeeming points:", error);
      res.status(500).json({ message: "Failed to redeem points" });
    }
  });

  // Admin: Diagnose reward card data - just fetches and returns raw card info
  app.get("/api/admin/astro/diagnose-rewards/:userId", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { getCustomerStatus } = await import('./astroLoyalty');
      const targetUserId = req.params.userId;
      const astroCustomer = await storage.getAstroCustomerByUserId(targetUserId);
      if (!astroCustomer) {
        return res.json({ error: 'No Astro customer found for this user' });
      }
      const internalId = `animalhouse-${targetUserId}`;
      
      // Run both calls in parallel to save time
      const [statusWith, statusWithout] = await Promise.all([
        getCustomerStatus(astroCustomer.astroCustomerId, true, internalId).catch((e: any) => ({ error: e.message })),
        getCustomerStatus(astroCustomer.astroCustomerId, false, internalId).catch((e: any) => ({ error: e.message }))
      ]);
      
      const cardsWithCompleted = (statusWith as any)?.frequentBuyerCards || [];
      const cardsWithoutCompleted = (statusWithout as any)?.frequentBuyerCards || [];
      
      const allFreeGoods: any[] = [];
      for (const card of [...cardsWithCompleted, ...cardsWithoutCompleted]) {
        if (card.freeGoods?.length > 0) {
          for (const fg of card.freeGoods) {
            allFreeGoods.push({
              cardId: card.cardId,
              cardName: card.programName,
              rewardId: fg.rewardId,
              itemId: fg.itemId,
              redeemedOn: fg.redeemedOn || null,
              source: cardsWithCompleted.includes(card) ? 'completed_cards=1' : 'completed_cards=0'
            });
          }
        }
      }
      
      res.json({
        astroCustomerId: astroCustomer.astroCustomerId,
        internalId,
        cardsFromCompleted1: cardsWithCompleted.length,
        cardsFromCompleted0: cardsWithoutCompleted.length,
        freeGoods: allFreeGoods,
        rawCompleted1Cards: cardsWithCompleted.map((c: any) => ({ cardId: c.cardId, programName: c.programName, freeGoodsCount: c.freeGoods?.length || 0 })),
        rawCompleted0Cards: cardsWithoutCompleted.map((c: any) => ({ cardId: c.cardId, programName: c.programName, freeGoodsCount: c.freeGoods?.length || 0 }))
      });
    } catch (error: any) {
      console.error("Error diagnosing rewards:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Admin: Fix unredeemed rewards - Step 2: actually redeem with known itemId
  app.post("/api/admin/astro/fix-unredeemed-rewards", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { rewardId, itemId, userId } = req.body;
      if (!rewardId || !itemId || !userId) {
        return res.status(400).json({ message: "rewardId, itemId, and userId are required" });
      }

      const { addRedemption } = await import('./astroLoyalty');
      const astroCustomer = await storage.getAstroCustomerByUserId(userId);
      if (!astroCustomer) {
        return res.status(404).json({ message: "No Astro customer found" });
      }
      
      const internalId = `animalhouse-${userId}`;
      console.log(`[ASTRO FIX] Attempting redemption: reward=${rewardId} item=${itemId} customer=${astroCustomer.astroCustomerId}`);
      
      const redeemed = await addRedemption(
        astroCustomer.astroCustomerId,
        rewardId,
        itemId,
        undefined,
        internalId
      );
      
      console.log(`[ASTRO FIX] Result: ${redeemed ? 'SUCCESS' : 'FAILED'}`);
      res.json({ success: redeemed, rewardId, itemId });
    } catch (error: any) {
      console.error("Error fixing reward:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/recalculate-loyalty", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = (req as any).tenantId;
      const allOrdersQuery = tenantId
        ? db.select().from(orders).where(eq(orders.tenantId, tenantId))
        : db.select().from(orders);
      const allOrders = await allOrdersQuery;
      const completedOrders = allOrders.filter((o: any) => o.status === 'completed');
      console.log(`[LOYALTY RECALC] Processing ${completedOrders.length} completed orders (including hidden)`);

      const userSpending: Record<string, number> = {};
      const userCreditsUsed: Record<string, number> = {};

      const FOOD_CATEGORIES_RECALC = ['dogFood', 'catFood'];
      const FOOD_LOYALTY_RATE_RECALC = 0.25;

      for (const order of completedOrders) {
        if (!order.userId) continue;
        const loyaltyCreditsApplied = parseFloat(order.loyaltyCreditsApplied || '0');
        const discountAmount = parseFloat(order.discountAmount || '0');

        // Apply 25% loyalty rate for food items (dogFood/catFood)
        const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
        let foodSubtotalR = 0;
        let nonFoodSubtotalR = 0;
        for (const item of items) {
          const itemTotal = parseFloat(item.price) * (item.quantity || 1);
          if (item.supplyId) {
            const supply = await storage.getSupply(item.supplyId, (req as any).tenantId);
            if (supply && FOOD_CATEGORIES_RECALC.includes(supply.category || '')) {
              foodSubtotalR += itemTotal;
            } else {
              nonFoodSubtotalR += itemTotal;
            }
          } else {
            nonFoodSubtotalR += itemTotal;
          }
        }
        // If no items found, fall back to raw subtotal as non-food
        if (items.length === 0) {
          nonFoodSubtotalR = parseFloat(order.subtotal || order.totalAmount || '0');
        }
        const adjustedSubtotalR = nonFoodSubtotalR + (foodSubtotalR * FOOD_LOYALTY_RATE_RECALC);
        const amountForLoyalty = Math.max(0, adjustedSubtotalR - loyaltyCreditsApplied - discountAmount);

        console.log(`[LOYALTY RECALC] Order #${order.id} user=${order.userId}: food=$${foodSubtotalR.toFixed(2)}, non-food=$${nonFoodSubtotalR.toFixed(2)}, adjusted=$${adjustedSubtotalR.toFixed(2)}, credits=${loyaltyCreditsApplied}, discount=${discountAmount} → amountForLoyalty=${amountForLoyalty.toFixed(2)}`);

        if (!userSpending[order.userId]) userSpending[order.userId] = 0;
        if (!userCreditsUsed[order.userId]) userCreditsUsed[order.userId] = 0;
        userSpending[order.userId] += amountForLoyalty;
        userCreditsUsed[order.userId] += loyaltyCreditsApplied;
      }

      const settings = await storage.getLoyaltySettings((req as any).tenantId);
      const threshold = parseFloat(settings.spendingThreshold);
      const reward = parseFloat(settings.rewardAmount);
      const results: any[] = [];

      for (const [userId, correctTotal] of Object.entries(userSpending)) {
        const u = await storage.getUser(userId);
        if (!u) continue;

        const oldTotal = parseFloat(u.totalSpent || '0');
        const oldCredits = parseFloat(u.loyaltyCredits || '0');

        const correctRewardCount = Math.floor(correctTotal / threshold);
        const totalCreditsEarned = correctRewardCount * reward;
        const totalCreditsUsed = userCreditsUsed[userId] || 0;
        const newCredits = Math.max(0, totalCreditsEarned - totalCreditsUsed);

        await db.update(users)
          .set({
            totalSpent: correctTotal.toFixed(2),
            loyaltyCredits: newCredits.toFixed(2),
            updatedAt: new Date()
          })
          .where(eq(users.id, userId));

        results.push({
          userId,
          name: u.firstName ? `${u.firstName} ${u.lastName || ''}`.trim() : u.email || userId,
          oldTotalSpent: oldTotal.toFixed(2),
          newTotalSpent: correctTotal.toFixed(2),
          oldCredits: oldCredits.toFixed(2),
          newCredits: newCredits.toFixed(2),
          changed: oldTotal.toFixed(2) !== correctTotal.toFixed(2)
        });
      }

      res.json({ results, ordersProcessed: completedOrders.length });
    } catch (error) {
      console.error("Error recalculating loyalty:", error);
      res.status(500).json({ message: "Failed to recalculate loyalty" });
    }
  });

  // Get all Astro customers (Admin only)
  app.get("/api/admin/astro/customers", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const customers = await storage.getAllAstroCustomers();
      
      // Enrich with user data
      const enrichedCustomers = await Promise.all(
        customers.map(async (astroCustomer) => {
          const user = await storage.getUser(astroCustomer.userId);
          return {
            ...astroCustomer,
            userName: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
            userEmail: user?.email
          };
        })
      );

      res.json(enrichedCustomers);
    } catch (error) {
      console.error("Error getting Astro customers:", error);
      res.status(500).json({ message: "Failed to get Astro customers" });
    }
  });

  // ========================================
  // POS INTEGRATION ENDPOINTS
  // ========================================

  // POS Webhook - Receive real-time product updates from POS system
  app.post("/api/pos/webhook", async (req, res) => {
    try {
      // Validate shared secret before trusting any payload data
      const posWebhookSecret = process.env.POS_WEBHOOK_SECRET;
      if (!posWebhookSecret) {
        console.error("POS_WEBHOOK_SECRET is not configured — rejecting webhook request");
        return res.status(503).json({ message: "Webhook endpoint is not configured" });
      }
      const providedSecret = req.headers['x-pos-webhook-secret'];
      if (!providedSecret || providedSecret !== posWebhookSecret) {
        return res.status(401).json({ message: "Unauthorized: invalid or missing webhook secret" });
      }

      const { products, type } = req.body; // type: 'supply' or 'pet'
      
      if (!products || !Array.isArray(products)) {
        return res.status(400).json({ message: "Invalid products data" });
      }

      // Import POS sync functions
      const { bulkSyncFromPOS } = await import('./posSync');
      
      const result = await bulkSyncFromPOS(products, type || 'supply');
      
      console.log(`POS Webhook: Updated=${result.updated}, Created=${result.created}, Skipped=${result.skipped}, Errors=${result.errors.length}`);
      
      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error("Error processing POS webhook:", error);
      res.status(500).json({ message: "Failed to process POS webhook" });
    }
  });

  // Manual POS Sync - Admin can trigger manual sync
  app.post("/api/admin/pos/sync", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const { products, type } = req.body;
      
      if (!products || !Array.isArray(products)) {
        return res.status(400).json({ message: "Invalid products data" });
      }

      const { bulkSyncFromPOS } = await import('./posSync');
      const result = await bulkSyncFromPOS(products, type || 'supply');
      
      res.json({
        success: true,
        message: `Synced ${result.updated + result.created} items from POS`,
        ...result
      });
    } catch (error) {
      console.error("Error manual POS sync:", error);
      res.status(500).json({ message: "Failed to sync from POS" });
    }
  });

  // Set manual override flags for a supply
  app.post("/api/admin/supplies/:id/manual-override", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const { id } = req.params;
      const { overridePrice, overrideQuantity } = req.body;

      const { setSupplyManualOverride } = await import('./posSync');
      await setSupplyManualOverride(
        parseInt(id),
        overridePrice ?? false,
        overrideQuantity ?? false
      );

      res.json({ 
        success: true,
        message: "Manual override flags updated"
      });
    } catch (error) {
      console.error("Error setting manual override:", error);
      res.status(500).json({ message: "Failed to set manual override" });
    }
  });

  // Set manual override flag for a pet
  app.post("/api/admin/pets/:id/manual-override", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const { id } = req.params;
      const { overridePrice } = req.body;

      const { setPetManualOverride } = await import('./posSync');
      await setPetManualOverride(parseInt(id), overridePrice ?? false);

      res.json({ 
        success: true,
        message: "Manual override flag updated"
      });
    } catch (error) {
      console.error("Error setting manual override:", error);
      res.status(500).json({ message: "Failed to set manual override" });
    }
  });

  // Get POS sync status
  app.get("/api/admin/pos/status", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { getSuppliesPOSSyncStatus } = await import('./posSync');
      const status = await getSuppliesPOSSyncStatus();
      
      res.json(status);
    } catch (error) {
      console.error("Error getting POS status:", error);
      res.status(500).json({ message: "Failed to get POS status" });
    }
  });

  // Download CSV endpoint for unbranded products
  app.get("/api/download-csv", (req, res) => {
    const filePath = path.join(process.cwd(), 'FINAL-UNBRANDED-PRODUCTS-UPDATED.csv');
    res.download(filePath, 'FINAL-UNBRANDED-PRODUCTS-UPDATED.csv', (err) => {
      if (err) {
        console.error('Download error:', err);
        res.status(500).json({ error: 'Failed to download file' });
      }
    });
  });

  // ============================================
  // IMAGE URL SYNC (Dev to Production)
  // ============================================
  
  // Export all product image URLs for syncing to production (Admin only)


  // ========== USER-SPECIFIC APPOINTMENTS (for profile page) ==========
  // This endpoint ALWAYS returns only the logged-in user's own appointments
  // regardless of whether they are admin/groomer (for profile page use)
  app.get("/api/user/appointments", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const user = await storage.getUser(userId);
      let merged: any[] = [];

      if (user?.isAdmin || user?.isGroomer) {
        // Admins/groomers: use phone number as primary lookup (staff-booked appointments
        // have their phone stored as ownerPhoneNumber). Also include any userId-linked
        // appointments that share their phone (covers app-booked while logged in).
        // Exclude userId-linked appointments WITHOUT their phone to avoid showing
        // customer appointments that got historically linked via the auto-link bug.
        const normalizedAdminPhone = user.phoneNumber
          ? normalizePhoneNumber(user.phoneNumber)
          : null;

        if (normalizedAdminPhone) {
          // Primary: all appointments with admin's phone number
          const byPhone = await storage.getAppointmentsByPhoneNumber(user.phoneNumber!, (req as any).tenantId);
          // Secondary: userId-linked appointments that also have admin's phone (app-booked)
          const byUserId = await storage.getAppointments(userId, (req as any).tenantId);
          const byUserIdFiltered = byUserId.filter((a: any) =>
            normalizePhoneNumber(a.ownerPhoneNumber || '') === normalizedAdminPhone
          );
          // Merge, deduplicate by id
          const seen = new Set(byPhone.map((a: any) => a.id));
          for (const a of byUserIdFiltered) {
            if (!seen.has(a.id)) { byPhone.push(a); seen.add(a.id); }
          }
          merged = byPhone;
        } else {
          // No phone stored — fall back to userId only
          merged = await storage.getAppointments(userId, (req as any).tenantId);
        }
      } else {
        // Regular customers: query by userId (primary) then merge any unlinked phone-matched
        // appointments so phone-booked history shows up after account creation.
        const byUserId = await storage.getAppointments(userId, (req as any).tenantId);
        merged = [...byUserId];
        if (user?.phoneNumber) {
          const byPhone = await storage.getAppointmentsByPhoneNumber(user.phoneNumber, (req as any).tenantId);
          const existingIds = new Set(byUserId.map((a: any) => a.id));
          const phoneOnly = byPhone.filter((a: any) => !existingIds.has(a.id) && !a.userId);
          merged = [...byUserId, ...phoneOnly];
        }
      }

      // Also pull archived appointment history (completed appointments moved out of
      // the appointments table into appointment_history, linked by contact phone).
      if (user?.phoneNumber) {
        const historyRecords = await storage.getAppointmentHistoryForPhone(user.phoneNumber, (req as any).tenantId);
        for (const h of historyRecords) {
          // Skip if already covered by an active appointment with same date+pet+service
          const alreadyCovered = merged.some((a: any) =>
            a.appointmentDate === h.appointmentDate &&
            (a.petName || '').toLowerCase() === (h.petName || '').toLowerCase() &&
            (a.serviceType || '') === (h.serviceType || '')
          );
          if (!alreadyCovered) {
            merged.push({
              id: h.id + 9000000, // offset to avoid React key collision with active appointment ids
              _fromHistory: true,
              status: h.status || 'completed',
              isApproved: true,
              appointmentDate: h.appointmentDate,
              appointmentTime: h.appointmentTime,
              petName: h.petName,
              petType: h.petType,
              pets: h.petName ? [{ name: h.petName, petType: h.petType }] : [],
              serviceType: h.serviceType,
              groomerName: h.groomerName,
              ownerFirstName: h.ownerFirstName,
              ownerLastName: h.ownerLastName,
              ownerPhoneNumber: h.ownerPhoneNumber || user?.phoneNumber,
              specialNotes: h.notes,
              readyForPayment: false,
              isPaid: true,
              paidOnline: false,
              price: null,
              finalAmount: null,
              createdAt: h.createdAt,
            });
          }
        }
      }

      // Show all appointments — customers should see their full grooming history.
      // Scheduled appointments always shown; completed/cancelled kept indefinitely
      // so pre-account history is visible after linking by phone number.
      const filteredAppointments = merged.filter((apt: any) => {
        // Drop past cancelled appointments (no reason to show those)
        if (apt.status === 'cancelled') {
          const aptDate = new Date(apt.appointmentDate);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          return aptDate >= today;
        }
        return true;
      });

      // Enrich each appointment with its pets array (same as admin view)
      const enriched = await Promise.all(
        filteredAppointments.map(async (apt: any) => {
          const pets = await storage.getAppointmentPets(apt.id);
          return { ...apt, pets };
        })
      );

      res.json(enriched);
    } catch (error) {
      console.error("Error fetching user appointments:", error);
      res.status(500).json({ message: "Failed to fetch appointments" });
    }
  });

  // Customer-facing reschedule — validates all the same rules as booking
  app.patch("/api/user/appointments/:id/reschedule", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const id = parseInt(req.params.id);
      const { appointmentDate: rawDateStr, appointmentTime } = req.body;

      if (!rawDateStr || !appointmentTime) {
        return res.status(400).json({ message: "appointmentDate and appointmentTime are required" });
      }

      const appointment = await storage.getAppointment(id, (req as any).tenantId);
      if (!appointment) return res.status(404).json({ message: "Appointment not found" });
      const reschedOwnerById = appointment.userId === userId;
      let reschedOwnerByPhone = false;
      if (!reschedOwnerById && !appointment.userId) {
        const reschedUser = await storage.getUser(userId);
        if (reschedUser?.phoneNumber) {
          const norm = (p: string) => p.replace(/\D/g, '');
          reschedOwnerByPhone = norm(appointment.ownerPhoneNumber) === norm(reschedUser.phoneNumber);
        }
      }
      if (!reschedOwnerById && !reschedOwnerByPhone) return res.status(403).json({ message: "Not your appointment" });
      if (reschedOwnerByPhone) {
        const reschedWhere = (req as any).tenantId
          ? and(eq(appointments.id, id), eq(appointments.tenantId, (req as any).tenantId))
          : eq(appointments.id, id);
        await db.update(appointments).set({ userId }).where(reschedWhere);
      }
      if (appointment.status === 'cancelled' || appointment.status === 'completed') {
        return res.status(400).json({ message: "Cannot reschedule a " + appointment.status + " appointment" });
      }

      // Parse date safely (avoid UTC midnight shifting)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDateStr)) {
        return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD." });
      }
      const [year, month, day] = rawDateStr.split('-').map(Number);
      const localDate = new Date(year, month - 1, day, 12, 0, 0);
      const dayOfWeek = localDate.getDay();
      const appointmentDateStr = rawDateStr;

      // Block past dates
      const now = new Date();
      const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (localDate < todayLocal) {
        return res.status(400).json({ message: "Cannot reschedule to a past date." });
      }

      // No Sundays
      if (dayOfWeek === 0) {
        return res.status(400).json({ message: "Grooming is not available on Sundays. Please select a different day." });
      }

      // Check enabled days and blocked dates from grooming settings
      const groomingSettings = await storage.getGroomingSettings((req as any).tenantId);
      const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
      const dayEnabledSetting = groomingSettings.find((s: any) => s.setting === `${dayNames[dayOfWeek]}_enabled`);
      if (dayEnabledSetting && dayEnabledSetting.value === 'false') {
        return res.status(400).json({ message: `Grooming is not available on ${dayNames[dayOfWeek].charAt(0).toUpperCase() + dayNames[dayOfWeek].slice(1)}s. Please select a different day.` });
      }

      const blockedDatesSetting = groomingSettings.find((s: any) => s.setting === 'blocked_dates');
      if (blockedDatesSetting?.value) {
        const blockedList = blockedDatesSetting.value.split(',').map((d: string) => d.trim()).filter(Boolean);
        if (blockedList.includes(appointmentDateStr)) {
          return res.status(400).json({ message: "This date is blocked for grooming. Please select a different date." });
        }
      }

      // Time cutoff — must be on or before 1:30 PM
      const timeParts = appointmentTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (timeParts) {
        let hours = parseInt(timeParts[1]);
        const minutes = parseInt(timeParts[2]);
        const period = timeParts[3].toUpperCase();
        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
        if (hours * 60 + minutes > 13 * 60 + 30) {
          return res.status(400).json({ message: "Appointments are not available after 1:30 PM. Please select an earlier time." });
        }
      }

      // Capacity check — exclude THIS appointment from the existing count
      if (dayOfWeek >= 1 && dayOfWeek <= 6) {
        const weeklyLimit = await storage.getWeeklyAppointmentLimit(dayOfWeek, (req as any).tenantId);
        if (!weeklyLimit) {
          return res.status(400).json({ message: "Booking is not available for this day. Please select a different date." });
        }

        const allAppointments = await storage.getAppointments(undefined, (req as any).tenantId);
        const appointmentsOnDate = allAppointments.filter((apt: any) => {
          if (apt.id === id) return false; // exclude self
          const storedDateStr = typeof apt.appointmentDate === 'string'
            ? apt.appointmentDate.split('T')[0]
            : new Date(apt.appointmentDate).toISOString().split('T')[0];
          return storedDateStr === appointmentDateStr &&
                 apt.status !== 'cancelled' &&
                 apt.status !== 'rejected';
        });

        let bathDogs = 0, groomDogs = 0;
        for (const apt of appointmentsOnDate) {
          const aptPets = await storage.getAppointmentPets(apt.id);
          if (aptPets && aptPets.length > 0) {
            for (const p of aptPets) {
              const st = (p.serviceType || '').toLowerCase();
              if (st.includes('bath')) bathDogs++;
              else if (st.includes('full') || (st.includes('groom') && !st.includes('bath'))) groomDogs++;
            }
          } else {
            const st = (apt.serviceType || '').toLowerCase();
            if (st.includes('bath')) bathDogs++;
            else if (st.includes('full') || (st.includes('groom') && !st.includes('bath'))) groomDogs++;
          }
        }

        // Count what this appointment needs
        const myPets = await storage.getAppointmentPets(id);
        let myBaths = 0, myGrooms = 0;
        if (myPets && myPets.length > 0) {
          for (const p of myPets) {
            const st = (p.serviceType || '').toLowerCase();
            if (st.includes('bath')) myBaths++;
            else if (st.includes('full') || (st.includes('groom') && !st.includes('bath'))) myGrooms++;
          }
        } else {
          const st = (appointment.serviceType || '').toLowerCase();
          if (st.includes('bath')) myBaths++;
          else if (st.includes('full') || (st.includes('groom') && !st.includes('bath'))) myGrooms++;
        }

        if (bathDogs + myBaths > weeklyLimit.maxBathAppointments) {
          return res.status(400).json({ message: `Bath grooming is fully booked for this date (limit: ${weeklyLimit.maxBathAppointments}). Please select a different date.` });
        }
        if (groomDogs + myGrooms > weeklyLimit.maxGroomAppointments) {
          return res.status(400).json({ message: `Full grooming is fully booked for this date (limit: ${weeklyLimit.maxGroomAppointments}). Please select a different date.` });
        }
      }

      await db.update(appointments)
        .set({ appointmentDate: appointmentDateStr, appointmentTime, status: 'confirmed', isApproved: true })
        .where(eq(appointments.id, id));

      res.json({ message: "Appointment rescheduled successfully" });
    } catch (error) {
      console.error("Error rescheduling appointment:", error);
      res.status(500).json({ message: "Failed to reschedule appointment" });
    }
  });

  // Customer-facing cancel — only the owner can cancel their own pending appointment
  app.patch("/api/user/appointments/:id/cancel", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const id = parseInt(req.params.id);
      const appointment = await storage.getAppointment(id, (req as any).tenantId);

      if (!appointment) return res.status(404).json({ message: "Appointment not found" });

      // Allow if userId matches, OR if appointment is unlinked and phone number matches
      const cancelOwnerById = appointment.userId === userId;
      let cancelOwnerByPhone = false;
      if (!cancelOwnerById && !appointment.userId) {
        const cancelUser = await storage.getUser(userId);
        if (cancelUser?.phoneNumber) {
          const norm = (p: string) => p.replace(/\D/g, '');
          cancelOwnerByPhone = norm(appointment.ownerPhoneNumber) === norm(cancelUser.phoneNumber);
        }
      }
      if (!cancelOwnerById && !cancelOwnerByPhone) {
        return res.status(403).json({ message: "Not your appointment" });
      }
      const cancelApptWhere = (req as any).tenantId
        ? and(eq(appointments.id, id), eq(appointments.tenantId, (req as any).tenantId))
        : eq(appointments.id, id);
      if (cancelOwnerByPhone) {
        await db.update(appointments).set({ userId }).where(cancelApptWhere);
      }

      // Don't allow cancelling already-finished/cancelled appointments
      if (appointment.status === 'cancelled' || appointment.status === 'completed') {
        return res.status(400).json({ message: "Appointment is already " + appointment.status });
      }

      await db.update(appointments).set({ status: 'cancelled' }).where(cancelApptWhere);
      res.json({ message: "Appointment cancelled successfully" });
    } catch (error) {
      console.error("Error cancelling appointment:", error);
      res.status(500).json({ message: "Failed to cancel appointment" });
    }
  });

  // ========== LOYALTY PROGRAM ROUTES ==========

  // Get loyalty settings
  app.get("/api/loyalty-settings", async (req, res) => {
    try {
      const settings = await storage.getLoyaltySettings((req as any).tenantId);
      res.json(settings);
    } catch (error) {
      console.error('Error fetching loyalty settings:', error);
      res.status(500).json({ message: "Failed to fetch loyalty settings" });
    }
  });

  // Update loyalty settings (admin only)
  app.put("/api/loyalty-settings", authMiddleware, requireProPlan, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { spendingThreshold, rewardAmount, isActive } = req.body;
      const settings = await storage.updateLoyaltySettings({
        spendingThreshold,
        rewardAmount,
        isActive
      }, (req as any).tenantId);
      res.json(settings);
    } catch (error) {
      console.error('Error updating loyalty settings:', error);
      res.status(500).json({ message: "Failed to update loyalty settings" });
    }
  });

  // Get user's loyalty status
  app.get("/api/user/loyalty", authMiddleware, requireProPlan, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const loyaltyStatus = await storage.getUserLoyaltyStatus(userId);
      res.json(loyaltyStatus);
    } catch (error) {
      console.error('Error fetching loyalty status:', error);
      res.status(500).json({ message: "Failed to fetch loyalty status" });
    }
  });

  // Apply loyalty credit to order
  app.post("/api/apply-loyalty-credit", authMiddleware, requireProPlan, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const { amount } = req.body;
      const result = await storage.applyLoyaltyCredit(userId, parseFloat(amount));
      res.json(result);
    } catch (error: any) {
      console.error('Error applying loyalty credit:', error);
      res.status(400).json({ message: error.message || "Failed to apply loyalty credit" });
    }
  });

  // Admin: Update user loyalty credits manually
  app.put("/api/admin/users/:id/loyalty", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { loyaltyCredits, totalSpent } = req.body;
      const result = await storage.updateUserLoyalty(req.params.id, { loyaltyCredits, totalSpent });
      res.json(result);
    } catch (error) {
      console.error('Error updating user loyalty:', error);
      res.status(500).json({ message: "Failed to update user loyalty" });
    }
  });

  // Appointment email opt-in/out (for admin users only)
  app.put("/api/user/appointment-emails", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { optIn } = req.body;
      if (typeof optIn !== 'boolean') {
        return res.status(400).json({ message: "optIn must be a boolean" });
      }
      await db.update(users).set({ 
        appointmentEmailsOptIn: optIn,
        updatedAt: new Date()
      }).where(eq(users.id, userId));
      res.json({ success: true, appointmentEmailsOptIn: optIn });
    } catch (error) {
      console.error('Error updating appointment email preference:', error);
      res.status(500).json({ message: "Failed to update preference" });
    }
  });

  // Marketing email opt-in/out
  app.put("/api/user/marketing-emails", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const { optIn } = req.body;
      await db.update(users).set({ 
        marketingEmailsOptIn: !!optIn,
        updatedAt: new Date()
      }).where(eq(users.id, userId));
      res.json({ success: true, marketingEmailsOptIn: !!optIn });
    } catch (error) {
      console.error('Error updating marketing preference:', error);
      res.status(500).json({ message: "Failed to update preference" });
    }
  });

  // Push notification endpoints
  app.get("/api/push/vapid-key", (_req, res) => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    if (!publicKey) {
      return res.status(500).json({ message: "Push notifications not configured" });
    }
    res.json({ publicKey });
  });

  app.post("/api/push/subscribe", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const { subscription } = req.body;
      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return res.status(400).json({ message: "Invalid subscription data" });
      }
      const { saveSubscription } = await import('./pushNotifications');
      const saved = await saveSubscription(userId, subscription);
      res.json({ success: true, id: saved.id });
    } catch (error) {
      console.error('Error saving push subscription:', error);
      res.status(500).json({ message: "Failed to save subscription" });
    }
  });

  app.post("/api/push/unsubscribe", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const { endpoint } = req.body;
      if (endpoint) {
        const { removeSubscription } = await import('./pushNotifications');
        await removeSubscription(userId, endpoint);
      } else {
        const { removeAllSubscriptions } = await import('./pushNotifications');
        await removeAllSubscriptions(userId);
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Error removing push subscription:', error);
      res.status(500).json({ message: "Failed to remove subscription" });
    }
  });

  app.post("/api/push/test", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const { notifyCustomerOrderReady } = await import('./pushNotifications');
      await notifyCustomerOrderReady(userId, 0);
      res.json({ success: true, message: "Test notification sent" });
    } catch (error) {
      console.error('Error sending test notification:', error);
      res.status(500).json({ message: "Failed to send test notification" });
    }
  });

  app.post("/api/admin/email/test", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { getUncachableSendGridClient } = await import('./sendgridIntegration');
      const { client: sgMail, fromEmail, replyTo } = await getUncachableSendGridClient();
      const toEmail = req.body.email || req.user.email;
      await sgMail.send({
        to: toEmail,
        from: { email: fromEmail, name: 'PilotHouse' },
        replyTo,
        subject: 'PilotHouse - Test Email',
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#b45309;">PilotHouse</h2>
          <p>This is a test email confirming that your SendGrid email system is working correctly.</p>
          <p style="color:#666;font-size:12px;">Sent at: ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CST</p>
        </div>`,
      });
      res.json({ success: true, message: `Test email sent to ${toEmail}` });
    } catch (error: any) {
      console.error('Error sending test email:', error);
      res.status(500).json({ message: error.message || "Failed to send test email" });
    }
  });

  // Legal pages API (public read, admin write)
  app.get("/api/legal/:slug", async (req, res) => {
    try {
      const page = await storage.getLegalPage(req.params.slug);
      if (!page) {
        return res.status(404).json({ message: "Page not found" });
      }
      res.json(page);
    } catch (error) {
      console.error('Error fetching legal page:', error);
      res.status(500).json({ message: "Failed to fetch page" });
    }
  });

  app.get("/api/admin/legal-pages", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const pages = await storage.getAllLegalPages();
      res.json(pages);
    } catch (error) {
      console.error('Error fetching legal pages:', error);
      res.status(500).json({ message: "Failed to fetch pages" });
    }
  });

  app.put("/api/admin/legal/:slug", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { title, content } = req.body;
      if (!title || !content) {
        return res.status(400).json({ message: "Title and content are required" });
      }
      const page = await storage.upsertLegalPage({
        slug: req.params.slug,
        title,
        content,
        lastUpdatedBy: req.user.id,
      });
      res.json(page);
    } catch (error) {
      console.error('Error saving legal page:', error);
      res.status(500).json({ message: "Failed to save page" });
    }
  });

  // Feedback routes
  app.post("/api/feedback", authMiddleware, async (req: any, res) => {
    try {
      const { rating, category, message } = req.body;
      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ message: "Rating must be between 1 and 5" });
      }
      const entry = await storage.createFeedback({
        userId: req.user.id,
        rating: parseInt(rating),
        category: category || null,
        message: message || null,
      });
      res.json(entry);
    } catch (error) {
      console.error("Error saving feedback:", error);
      res.status(500).json({ message: "Failed to save feedback" });
    }
  });

  app.get("/api/admin/feedback", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const entries = await storage.getAllFeedback();
      res.json(entries);
    } catch (error) {
      console.error("Error fetching feedback:", error);
      res.status(500).json({ message: "Failed to fetch feedback" });
    }
  });

  // ─── Client-side scanner diagnostics ──────────────────────────────────────
  // No auth required — the scanner is used by both customers and staff.
  // Events are fire-and-forget from the client; we just log them server-side
  // so they appear in deployment logs and can be fetched with fetch_deployment_logs.
  app.post("/api/log/scanner", (req, res) => {
    try {
      const body = req.body || {};
      const SKIP = new Set(['event', 'platform']);
      const parts = [
        `[Scanner]`,
        body.event ? `event=${body.event}` : null,
        body.platform ? `platform=${body.platform}` : null,
        ...Object.entries(body)
          .filter(([k, v]) => !SKIP.has(k) && v != null && v !== '')
          .map(([k, v]) => `${k}=${v}`),
      ].filter(Boolean).join(' ');
      console.log(parts);
      res.json({ ok: true });
    } catch {
      res.json({ ok: false });
    }
  });

  // ─── Hiring Open Setting ───────────────────────────────────────────────────

  // Public: check if applications are open
  app.get("/api/settings/hiring-open", async (req: any, res) => {
    try {
      const setting = await storage.getGroomingSetting("hiring_open", (req as any).tenantId);
      const open = setting ? setting.value === "true" : false; // default closed
      res.json({ open });
    } catch (error) {
      res.json({ open: false });
    }
  });

  // Admin: toggle hiring open/closed
  app.post("/api/admin/settings/hiring-open", authMiddleware, async (req: any, res) => {
    if (!req.user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
    const { open } = req.body;
    if (typeof open !== "boolean") return res.status(400).json({ message: "open must be a boolean" });
    try {
      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      await storage.upsertGroomingSetting({ setting: "hiring_open", value: String(open), tenantId });
      res.json({ open });
    } catch (error) {
      res.status(500).json({ message: "Failed to update hiring setting" });
    }
  });

  // ─── Job Applications ──────────────────────────────────────────────────────

  // Public: submit an application (no auth required, but scoped to current tenant via X-Tenant-Slug)
  app.post("/api/job-applications", async (req: any, res) => {
    try {
      const { insertJobApplicationSchema } = await import("@shared/schema");
      const parsed = insertJobApplicationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid application data", errors: parsed.error.flatten() });
      }
      // Attach tenantId when available (resolved by tenantMiddleware from X-Tenant-Slug header)
      const data: any = { ...parsed.data };
      if (req.tenantId) data.tenantId = req.tenantId;
      const application = await storage.createJobApplication(data);
      console.log(`[JobApplication] New application submitted: ${application.firstName} ${application.lastName} for "${application.positionApplied}" (id=${application.id}, tenantId=${application.tenantId ?? 'none'})`);
      res.status(201).json({ message: "Application submitted successfully", id: application.id });
    } catch (error) {
      console.error("[JobApplication] Error submitting application:", error);
      res.status(500).json({ message: "Failed to submit application" });
    }
  });

  // Admin: get all applications (scoped to the authenticated admin's tenant; super-admins may pass ?tenantId=N)
  app.get("/api/admin/job-applications", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) return res.status(403).json({ message: "Forbidden" });
      // Super-admins can view all applications or filter by a specific tenant
      let filterTenantId: number | undefined;
      if (req.isSuperAdmin) {
        const qTenantId = req.query.tenantId ? parseInt(req.query.tenantId as string, 10) : undefined;
        filterTenantId = qTenantId && !isNaN(qTenantId) ? qTenantId : undefined;
      } else {
        filterTenantId = req.tenantId;
      }
      const applications = await storage.getAllJobApplications(filterTenantId);
      res.json(applications);
    } catch (error) {
      console.error("[JobApplication] Error fetching applications:", error);
      res.status(500).json({ message: "Failed to fetch applications" });
    }
  });

  // Admin: get single application (scoped to tenant)
  app.get("/api/admin/job-applications/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const tenantFilter = req.isSuperAdmin ? undefined : req.tenantId;
      const application = await storage.getJobApplication(parseInt(req.params.id), tenantFilter);
      if (!application) return res.status(404).json({ message: "Application not found" });
      res.json(application);
    } catch (error) {
      console.error("[JobApplication] Error fetching application:", error);
      res.status(500).json({ message: "Failed to fetch application" });
    }
  });

  // Admin: update application status / notes (scoped to tenant)
  app.patch("/api/admin/job-applications/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const tenantFilter = req.isSuperAdmin ? undefined : req.tenantId;
      const { status, adminNotes } = req.body;
      const updated = await storage.updateJobApplicationStatus(parseInt(req.params.id), status, adminNotes, tenantFilter);
      if (!updated) return res.status(404).json({ message: "Application not found" });
      console.log(`[JobApplication] Application id=${updated.id} (${updated.firstName} ${updated.lastName}) status updated to "${status}"`);
      res.json(updated);
    } catch (error) {
      console.error("[JobApplication] Error updating application:", error);
      res.status(500).json({ message: "Failed to update application" });
    }
  });

  // Admin: Invoice Scanner - scan an invoice image and match UPC codes to products
  // UPC-A check digit helpers
  function calcUPCCheckDigit(first11: string): number {
    let sum = 0;
    for (let i = 0; i < 11; i++) {
      sum += i % 2 === 0 ? parseInt(first11[i]) * 3 : parseInt(first11[i]);
    }
    return (10 - (sum % 10)) % 10;
  }
  function isValidUPC(upc: string): boolean {
    if (!/^\d{12}$/.test(upc)) return false;
    return calcUPCCheckDigit(upc.slice(0, 11)) === parseInt(upc[11]);
  }
  // For an invalid UPC, generate every single-digit substitution that produces a valid check digit
  function getSingleDigitCandidates(upc: string): string[] {
    const candidates = new Set<string>();
    for (let pos = 0; pos < 11; pos++) {
      for (let d = 0; d <= 9; d++) {
        if (d === parseInt(upc[pos])) continue;
        const prefix = upc.slice(0, pos) + d + upc.slice(pos + 1, 11);
        const corrected = prefix + calcUPCCheckDigit(prefix);
        if (corrected !== upc) candidates.add(corrected);
      }
    }
    // Also try adjacent-digit transpositions (swap two neighboring digits), positions 0-10 only
    for (let pos = 0; pos < 10; pos++) {
      const arr = upc.slice(0, 11).split('');
      [arr[pos], arr[pos + 1]] = [arr[pos + 1], arr[pos]];
      const prefix = arr.join('');
      const corrected = prefix + calcUPCCheckDigit(prefix);
      if (corrected !== upc) candidates.add(corrected);
    }
    return [...candidates];
  }

  app.post("/api/admin/invoice-scan", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) return res.status(403).json({ message: "Forbidden" });

      const { imageBase64, mimeType } = req.body;
      if (!imageBase64 || !mimeType) {
        return res.status(400).json({ message: "imageBase64 and mimeType are required" });
      }

      const openai = new OpenAI({
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      });

      const prompt = `You are extracting UPC codes and item descriptions from a supplier invoice image for a pet store.

Your ONLY job is to find every 12-digit UPC code on the page and the item description next to it.

STEP 1 — Scan the entire image for any column containing 12-digit numbers. That is the UPC column.
STEP 2 — For each row that has a 12-digit UPC, read the item description from that row.
STEP 3 — Output every row that has a UPC — do not skip any.

Return ONLY this JSON (no other text):
{
  "items": [
    { "upc": "015561232609", "qty": 1, "description": "EXO TERRA CRESTD GECKO 8CUP" }
  ]
}

CRITICAL RULES:
- NEVER return an error message or refuse to parse. Always return items.
- Do not worry about quantity columns at all — just set qty to 1 for every item.
- Do not stop before the last row on the page.
- UPCs are exactly 12 digits — no dashes, no spaces.
- Copy each UPC digit by digit exactly as printed. Do not guess, infer, or "correct" any digit.`;

      // ── Preprocess image: normalize contrast + sharpen so digits are crisper ─
      const rawBuf = Buffer.from(imageBase64, 'base64');
      const imgBuf = await sharp(rawBuf)
        .normalize()                                   // auto-level histogram for max contrast
        .sharpen({ sigma: 1.2, m1: 0.5, m2: 2.5 })   // sharpen text edges
        .jpeg({ quality: 95 })
        .toBuffer();

      const fullBase64 = imgBuf.toString('base64');

      // ── Single full-page scan with up to 3 retries on empty/error response ─────
      // Retry whenever GPT returns 0 items (empty array OR error JSON). The retry
      // condition must check parsed items, not raw content length, because
      // {"items":[]} is valid JSON that passes a length check but means nothing.
      let resp: any = null;
      let parsedItems: { upc: string; qty: number; description: string }[] = [];

      for (let attempt = 1; attempt <= 3; attempt++) {
        resp = await openai.chat.completions.create({
          model: "gpt-5",
          messages: [{ role: "user", content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${fullBase64}`, detail: "high" } }
          ]}],
          response_format: { type: "json_object" },
          max_completion_tokens: 16000,
        });

        const rawContent = resp?.choices?.[0]?.message?.content ?? '';
        console.log(`[InvoiceScan] Attempt ${attempt} finish_reason: ${resp?.choices?.[0]?.finish_reason}`);
        console.log(`[InvoiceScan] Raw response (first 300): ${rawContent.slice(0, 300)}`);

        try {
          const parsed = JSON.parse(rawContent);
          if (parsed.error) {
            console.log(`[InvoiceScan] AI returned error on attempt ${attempt}: ${parsed.error}`);
            parsedItems = [];
          } else {
            parsedItems = Array.isArray(parsed.items) ? parsed.items : [];
            console.log(`[InvoiceScan] Parsed ${parsedItems.length} items`);
          }
        } catch (e: any) {
          parsedItems = [];
          console.log(`[InvoiceScan] JSON parse error — ${e.message}`);
        }

        if (parsedItems.length > 0) break;
        console.log(`[InvoiceScan] Attempt ${attempt} returned 0 items — ${attempt < 3 ? 'retrying' : 'giving up'}`);
      }

      // Deduplicate by normalized UPC — single scan should produce none, but guard anyway
      const seenUPCs = new Set<string>();
      const invoiceItems: { upc: string; qty: number; description: string }[] = [];
      for (const item of parsedItems) {
        const upc = String(item.upc).replace(/[-\s]/g, '').trim();
        if (!seenUPCs.has(upc)) {
          seenUPCs.add(upc);
          invoiceItems.push({ ...item, upc });
        }
      }
      console.log(`[InvoiceScan] Extracted ${invoiceItems.length} unique items from invoice`);

      // Normalize UPCs (remove dashes/spaces, trim)
      const normalizedItems = invoiceItems.map((item: any) => ({
        ...item,
        upc: String(item.upc).replace(/[-\s]/g, '').trim(),
      })).filter((item: any) => item.upc.length >= 8);

      // Validate check digits and collect correction candidates for invalid UPCs
      const validItems: { upc: string; qty: number; description: string; correctedFrom?: string }[] = [];
      const candidateMap = new Map<string, { upc: string; qty: number; description: string }>(); // candidate → original item

      for (const item of normalizedItems) {
        if (isValidUPC(item.upc)) {
          validItems.push(item);
        } else {
          console.log(`[InvoiceScan] Invalid check digit: ${item.upc} (${item.description}) — generating correction candidates`);
          const candidates = getSingleDigitCandidates(item.upc);
          for (const c of candidates) candidateMap.set(c, item);
          // Keep original as fallback (marked invalid)
          validItems.push({ ...item, correctedFrom: 'invalid-checkdigit' });
        }
      }

      console.log(`[InvoiceScan] UPCs found: ${validItems.map(i => i.upc).join(', ')}`);
      console.log(`[InvoiceScan] Correction candidates: ${candidateMap.size}`);

      // Collect all UPCs to look up: originals + correction candidates
      const originalUPCs = [...new Set(validItems.map(i => i.upc))];
      const candidateUPCs = [...candidateMap.keys()];
      const allUPCs = [...new Set([...originalUPCs, ...candidateUPCs])];

      // Single DB query for all UPCs (both upc and sku fields)
      const dbProducts = await db.select({
        id: supplies.id,
        name: supplies.name,
        brand: supplies.brand,
        upc: supplies.upc,
        sku: supplies.sku,
        stockQuantity: supplies.stockQuantity,
        price: supplies.price,
      }).from(supplies).where(
        or(
          inArray(supplies.upc, allUPCs),
          inArray(supplies.sku, allUPCs)
        )
      );

      // Build lookup map keyed by both upc and sku values.
      // Store ALL products per key — duplicate UPCs in the DB (e.g. two products sharing
      // the same barcode) are kept so the description cross-check can pick the best one.
      const productByUpc = new Map<string, (typeof dbProducts[0])[]>();
      for (const p of dbProducts) {
        const addKey = (key: string) => {
          const k = key.replace(/[-\s]/g, '').trim();
          if (!productByUpc.has(k)) productByUpc.set(k, []);
          productByUpc.get(k)!.push(p);
        };
        if (p.upc) addKey(p.upc);
        if (p.sku) addKey(p.sku);
      }

      // ── Description keyword helpers (used for both product selection and cross-check) ──
      const CROSS_CHECK_EXPAND: Record<string, string> = {
        'pp': 'pro plan', 'provi': 'pro plan', 'roycan': 'royal canin',
        'kong': 'kong', 'bionic': 'bionic', 'catit': 'catit',
        'whlsm': 'wholesome', 'whslm': 'wholesome',
        'ckn': 'chicken', 'chkn': 'chicken', 'chx': 'chicken',
        'bf': 'beef', 'slm': 'salmon', 'salm': 'salmon', 'trky': 'turkey',
        'pnbt': 'peanut', 'bck': 'bacon', 'chz': 'cheese',
        'germ': 'german', 'shphrd': 'shepherd', 'shprd': 'shepherd',
        'sm': 'small', 'lg': 'large', 'md': 'medium',
        'crestd': 'crested', 'gecko': 'gecko', 'airdog': 'air',
        'urban': 'urban', 'stik': 'stick', 'sqkr': 'squeak',
        'asst': 'assorted', 'assn': 'assorted', 'orig': 'original', 'bendeez': 'bendeez',
        'flwr': 'flower', 'ftn': 'fountain', 'stsl': 'stainless',
        'contour': 'contour', 'dbl': 'double', 'crate': 'crate',
        'wave': 'wave', 'terr': 'terrarium', 'smartsift': 'smartsift',
        'midwe': 'midwest', 'midpet': 'midwest',
        'sb': 'shredded',
        // Brand abbreviations used by distributors
        'kon': 'kong', 'coa': 'coastal', 'ims': 'iams', 'gre': 'greenies',
        'ori': 'orijen', 'dos': 'petmate', 'gar': 'naturvet', 'zup': 'zupreem',
        'ptg': 'petag', 'pbg': 'fresh', 'kmp': 'kaylor', 'jel': 'jelly',
        'pup': 'puppy', 'kttn': 'kitten', 'ktt': 'kitten',
        'grmg': 'grooming', 'cllr': 'collar', 'cllrs': 'collar',
        'brsh': 'brush', 'slkr': 'slicker', 'trm': 'trimmer', 'trmr': 'trimmer',
        'ezclear': 'ezclear', 'ziggie': 'ziggie', 'ziggies': 'ziggies',
      };
      const NOISE_WORDS = new Set([
        'esntl','cmplt','shrd','blnd','repl','bisc','adlt','adt',
        'snk','trt','rwrd','dog','cat','pet','snack','treat','adult',
        'ea','cas','rc','ce','fd','u/a',
      ]);

      // Compute cross-check keywords for an invoice description
      const getDescKeywords = (description: string): string[] => {
        const words = (description || '').toLowerCase().split(/[\s\/\-\#\.\(\)\*'\=]+/).filter((t: string) => t.length >= 2 && !/^\d+$/.test(t));
        return words.map((w: string) => CROSS_CHECK_EXPAND[w] || w).filter((w: string) => !NOISE_WORDS.has(w) && w.length >= 2);
      };

      // Score how well a product name/brand matches the description keywords
      const scoreProduct = (p: typeof dbProducts[0], descKeywords: string[]): number => {
        const nameL = (p.name || '').toLowerCase();
        const brandL = (p.brand || '').toLowerCase();
        return descKeywords.filter(kw => nameL.includes(kw) || brandL.includes(kw)).length;
      };

      // Pick the best-matching product from a list using description keywords.
      // Returns the product with the highest keyword score, or null if score is 0.
      const pickBest = (products: (typeof dbProducts[0])[], descKeywords: string[]): typeof dbProducts[0] | null => {
        if (!products || products.length === 0) return null;
        if (products.length === 1) return products[0];
        let best: typeof dbProducts[0] | null = null;
        let bestScore = -1;
        for (const p of products) {
          const score = scoreProduct(p, descKeywords);
          if (score > bestScore) { bestScore = score; best = p; }
        }
        return best;
      };

      const matched: any[] = [];
      const stillUnmatched: any[] = [];
      const seenIds = new Set<number>();

      for (const item of validItems) {
        // Compute keywords first — needed both for best-product selection and cross-check
        const descKeywords = getDescKeywords(item.description);

        const candidates_raw = productByUpc.get(item.upc);
        let product = candidates_raw ? pickBest(candidates_raw, descKeywords) : null;
        let resolvedUpc = item.upc;
        let corrected = false;

        // If no direct match and this UPC was flagged as invalid, try correction candidates.
        // Only accept the correction if it resolves to exactly ONE unique product across all
        // candidates — multiple candidates hitting different products means it's ambiguous,
        // and we must NOT guess (e.g. PP 13oz cans vs PP Beef Shredded 5lb vs 15lb).
        if (!product && item.correctedFrom === 'invalid-checkdigit') {
          const candidates = getSingleDigitCandidates(item.upc);
          const candidateMatches = new Map<number, { cp: any; resolvedUpc: string }>();
          for (const c of candidates) {
            const cps = productByUpc.get(c);
            if (cps) {
              for (const cp of cps) {
                if (!candidateMatches.has(cp.id)) {
                  candidateMatches.set(cp.id, { cp, resolvedUpc: c });
                }
              }
            }
          }
          if (candidateMatches.size === 1) {
            const [{ cp, resolvedUpc: ru }] = [...candidateMatches.values()];
            product = cp; resolvedUpc = ru; corrected = true;
          } else if (candidateMatches.size > 1) {
            const names = [...candidateMatches.values()].map(m => m.cp.name).join(', ');
            console.log(`[InvoiceScan] CORRECTION AMBIGUOUS: ${item.upc} → ${candidateMatches.size} candidates (${names}) — sending to manual`);
          }
        }

        if (product && !seenIds.has(product.id)) {
          // Cross-check: for CORRECTED items only — the repaired UPC might not be the right one,
          // so require ≥2 keyword matches to confirm. A single generic word like "bed" is not
          // enough to validate a correction (prevents Wave Bed → Cuddle Bed false matches).
          // For DIRECT UPC hits, skip the check — the 12-digit UPC is authoritative. Rejecting
          // a direct hit because GPT also garbled the description text (e.g. "CATT SMARTSFT"
          // instead of "CATIT SMARTSIFT") would throw away a perfectly correct match.
          const matchScore = scoreProduct(product, descKeywords);
          const minRequired = corrected ? 2 : 0;
          const acceptMatch = descKeywords.length === 0 || matchScore >= minRequired;

          if (!acceptMatch) {
            const label = corrected ? 'CORRECTION REJECTED' : 'MATCH REJECTED (desc mismatch)';
            console.log(`[InvoiceScan] ${label}: scanned=${item.upc} resolved=${resolvedUpc} product="${product.name}" desc="${item.description}" keywords=[${descKeywords.join(',')}] score=${matchScore}/${minRequired}`);
          }

          if (acceptMatch) {
            seenIds.add(product.id);
            matched.push({
              id: product.id, name: product.name, brand: product.brand, upc: resolvedUpc,
              scannedUpc: item.upc !== resolvedUpc ? item.upc : undefined, corrected,
              currentStock: product.stockQuantity ?? 0, invoiceQty: item.qty,
              newStock: (product.stockQuantity ?? 0) + item.qty, description: item.description,
            });
            if (corrected) console.log(`[InvoiceScan] AUTO-CORRECTED: ${item.upc} → ${resolvedUpc} (${product.name})`);
            else console.log(`[InvoiceScan] MATCH OK: ${resolvedUpc} → "${product.name}" (desc="${item.description}")`);
          } else {
            stillUnmatched.push(item);
          }
        } else if (!product) {
          stillUnmatched.push(item);
        }
      }

      // Description-based fallback for items that completely failed UPC matching.
      // Rescues items where GPT garbled 3+ digits (beyond single-digit correction range),
      // as long as the description uniquely identifies exactly ONE product in the DB.
      // Uses OR to find candidates, then scores each by keyword count — accepts only when
      // there is a single clear best match with score ≥ 2.
      const SEARCH_STOP_WORDS = new Set(['small', 'large', 'medium', 'extra', 'black', 'white', 'grey', 'gray', 'brown', 'clear', 'natural', 'classic', 'premium', 'grain']);
      const finalUnmatched: any[] = [];
      for (const item of stillUnmatched) {
        const itemKws = getDescKeywords(item.description);
        // Only use keywords that are real words (≥4 chars), not generic size/color, and
        // either came from the expansion table or are long enough to be actual product terms.
        const searchKws = itemKws.filter(kw => kw.length >= 4 && !SEARCH_STOP_WORDS.has(kw));

        if (searchKws.length >= 1) {
          try {
            // Find all products whose name matches ANY of the search keywords
            const orConditions = searchKws.map(kw => ilike(supplies.name, `%${kw}%`));
            const descCandidates = await db.select({
              id: supplies.id, name: supplies.name, brand: supplies.brand,
              upc: supplies.upc, sku: supplies.sku,
              stockQuantity: supplies.stockQuantity, price: supplies.price,
            }).from(supplies).where(or(...orConditions));

            // Score each candidate against the FULL keyword list (itemKws), not just the
            // narrow searchKws — this catches size/color terms that were excluded from the
            // DB query but are still useful discriminators (e.g. "small" vs "large" collar).
            const scored = descCandidates
              .filter(p => !seenIds.has(p.id))
              .map(p => ({ p, score: scoreProduct(p, itemKws) }))
              .filter(x => x.score >= 2)
              .sort((a, b) => b.score - a.score);

            // Accept only if there is a single product at the top score, OR the best product
            // scores clearly higher than the runner-up (no ambiguity)
            const topScore = scored[0]?.score ?? 0;
            const topGroup = scored.filter(x => x.score === topScore);

            if (topGroup.length === 1 && topScore >= 2) {
              const p = topGroup[0].p;
              seenIds.add(p.id);
              matched.push({
                id: p.id, name: p.name, brand: p.brand,
                upc: (p.upc || p.sku || item.upc)!,
                scannedUpc: item.upc, corrected: false, matchedBy: 'description',
                currentStock: p.stockQuantity ?? 0, invoiceQty: item.qty,
                newStock: (p.stockQuantity ?? 0) + item.qty, description: item.description,
              });
              console.log(`[InvoiceScan] DESC-MATCH: "${item.description}" → "${p.name}" (keywords=[${searchKws.join(',')}] score=${topScore})`);
              continue;
            } else if (topGroup.length > 1) {
              console.log(`[InvoiceScan] DESC-AMBIGUOUS: "${item.description}" → ${topGroup.length} tied at score ${topScore} (${topGroup.map(x => x.p.name).join(', ')}) — manual`);
            }
          } catch (e) {
            // Fallback query failed — just leave as unmatched
          }
        }
        finalUnmatched.push(item);
      }

      // Send unmatched items as-is — do NOT guess or correct the check digit.
      // If the UPC was misread, the first 11 digits may also be wrong, so computing a
      // "corrected" last digit gives false confidence and could point to the wrong product.
      // Items with invalid check digits are flagged so the UI can warn the user.
      const unmatched: any[] = finalUnmatched.map(item => {
        return { upc: item.upc, qty: item.qty, description: item.description, validCheckDigit: isValidUPC(item.upc) };
      });

      console.log(`[InvoiceScan] Extracted ${invoiceItems.length} UPCs, matched ${matched.length} products, ${unmatched.length} unmatched`);
      if (matched.length > 0) console.log(`[InvoiceScan] MATCHED: ${matched.map((m: any) => `${m.upc} → ${m.name}${m.corrected ? ' [corrected]' : m.matchedBy === 'description' ? ' [desc]' : ''}`).join(' | ')}`);
      if (unmatched.length > 0) console.log(`[InvoiceScan] NOT IN SYSTEM: ${unmatched.map((u: any) => `${u.upc} (${u.description})`).join(' | ')}`);
      res.json({ matched, unmatched });
    } catch (error: any) {
      console.error("[InvoiceScan] Error:", error);
      res.status(500).json({ message: error.message || "Failed to scan invoice" });
    }
  });

  // Admin: Apply invoice scan edits in bulk (stock qty + optional price)
  app.post("/api/admin/invoice-scan/apply", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) return res.status(403).json({ message: "Forbidden" });

      const tenantId = resolveWriteTenantId(req, res);
      if (tenantId === undefined) return;
      const { updates } = req.body as { updates: { id: number; newStock: number; newPrice?: number }[] };
      if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ message: "updates array is required" });
      }

      let applied = 0;
      for (const u of updates) {
        const patch: any = { stockQuantity: u.newStock };
        if (u.newPrice !== undefined && !isNaN(u.newPrice)) patch.price = String(u.newPrice);
        await storage.updateSupply(u.id, patch, tenantId);
        applied++;
      }

      console.log(`[InvoiceScan] Applied ${applied} product updates`);
      res.json({ success: true, applied });
    } catch (error: any) {
      console.error("[InvoiceScan] Error applying updates:", error);
      res.status(500).json({ message: error.message || "Failed to apply updates" });
    }
  });

  // ─── Super-admin verification route ──────────────────────────────────────────
  // GET /api/super-admin/tenants — lists all tenants with row counts (super-admin only)
  // Optional ?search= query param filters by name or slug (case-insensitive substring match)
  app.get('/api/super-admin/tenants', requireSuperAdminMiddleware, async (req: any, res) => {
    try {
      const allTenants = await storage.getAllTenants();
      const searchQuery = (req.query.search as string | undefined)?.trim().toLowerCase();
      const filtered = searchQuery
        ? allTenants.filter(
            (t) =>
              t.name?.toLowerCase().includes(searchQuery) ||
              t.slug?.toLowerCase().includes(searchQuery)
          )
        : allTenants;
      const results = await Promise.all(
        filtered.map(async (tenant) => ({
          ...tenant,
          rowCounts: await storage.getTenantRowCounts(tenant.id),
        }))
      );
      res.json({ tenants: results });
    } catch (error: any) {
      console.error('Super-admin tenant listing error:', error);
      res.status(500).json({ message: 'Failed to list tenants' });
    }
  });

  // POST /api/super-admin/tenants — create a new tenant (super-admin only)
  app.post('/api/super-admin/tenants', requireSuperAdminMiddleware, async (req: any, res) => {
    try {
      const { name, slug, subscriptionStatus, subscriptionTier } = req.body;
      if (!name || !slug) {
        return res.status(400).json({ message: 'name and slug are required' });
      }
      const tenant = await storage.createTenant({ name, slug, subscriptionStatus, subscriptionTier });
      res.status(201).json(tenant);
    } catch (error: any) {
      console.error('Create tenant error:', error);
      res.status(500).json({ message: 'Failed to create tenant' });
    }
  });

  // PATCH /api/super-admin/users/:id/super-admin — toggle isSuperAdmin (super-admin only)
  app.patch('/api/super-admin/users/:id/super-admin', requireSuperAdminMiddleware, async (req: any, res) => {
    try {
      const { isSuperAdmin } = req.body;
      const user = await storage.updateUserSuperAdmin(req.params.id, !!isSuperAdmin);
      res.json(sanitizeUser(user));
    } catch (error: any) {
      res.status(500).json({ message: error.message || 'Failed to update user' });
    }
  });

  // PATCH /api/super-admin/users/:id/tenant — assign user to a tenant (super-admin only)
  app.patch('/api/super-admin/users/:id/tenant', requireSuperAdminMiddleware, async (req: any, res) => {
    try {
      const { tenantId } = req.body;
      if (!tenantId) return res.status(400).json({ message: 'tenantId is required' });
      const user = await storage.updateUserTenant(req.params.id, Number(tenantId));
      res.json(sanitizeUser(user));
    } catch (error: any) {
      res.status(500).json({ message: error.message || 'Failed to update user tenant' });
    }
  });

  // GET /api/super-admin/users — list users, optionally filtered to those with no tenant (super-admin only)
  app.get('/api/super-admin/users', requireSuperAdminMiddleware, async (req: any, res) => {
    try {
      const noTenant = req.query.noTenant === 'true';
      const allUsers = await storage.getAllUsers();
      const result = noTenant
        ? allUsers.filter((u: any) => !u.tenantId && !u.isSuperAdmin)
        : allUsers;
      res.json(result.map(sanitizeUser));
    } catch (error: any) {
      res.status(500).json({ message: error.message || 'Failed to fetch users' });
    }
  });

  /**
   * GET /api/super-admin/audit-log
   *
   * Returns paginated audit log entries for super-admin writes on behalf of tenants.
   * Query params:
   *   - targetTenantId  (number) — filter by the tenant that was written to
   *   - actorUserId     (string) — filter by the super-admin who acted
   *   - limit           (number, default 50, max 200)
   *   - offset          (number, default 0)
   */
  app.get('/api/super-admin/audit-log', requireSuperAdminMiddleware, async (req: any, res) => {
    try {
      const targetTenantId = req.query.targetTenantId ? parseInt(req.query.targetTenantId as string, 10) : undefined;
      const actorUserId = req.query.actorUserId as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string ?? '50', 10) || 50, 200);
      const offset = parseInt(req.query.offset as string ?? '0', 10) || 0;

      const result = await storage.getAuditLogs({ targetTenantId, actorUserId, limit, offset });
      res.json(result);
    } catch (error: any) {
      console.error('Failed to fetch audit log:', error);
      res.status(500).json({ message: error.message || 'Failed to fetch audit log' });
    }
  });

  // POST /api/super-admin/stripe/refresh-credentials — immediately clears the credential cache
  // and validates the new key, returning health status so the admin sees the result immediately.
  app.post('/api/super-admin/stripe/refresh-credentials', requireSuperAdminMiddleware, async (_req, res) => {
    try {
      const { clearCredentialCache, getUncachableStripeClient } = await import('./stripeClient');
      await clearCredentialCache();
      console.log('[Stripe] Credential cache manually cleared by super-admin');

      // Validate the newly-loaded key immediately so the admin sees the result in-UI.
      let keyValid = false;
      let validationError: string | null = null;
      try {
        const stripe = await getUncachableStripeClient();
        await stripe.accounts.retrieve();
        keyValid = true;
      } catch (err: any) {
        validationError = (err.message ?? 'Unknown error').substring(0, 200);
      }

      res.json({
        ok: true,
        keyValid,
        validationError,
        message: keyValid
          ? 'Stripe credentials refreshed and validated successfully.'
          : `Credentials refreshed but key validation failed: ${validationError}`,
      });
    } catch (error: any) {
      console.error('Failed to clear Stripe credential cache:', error);
      res.status(500).json({ ok: false, keyValid: false, message: error.message || 'Failed to clear credential cache' });
    }
  });

  // GET /api/super-admin/audit-log/csv — download the full audit log as a CSV file
  app.get('/api/super-admin/audit-log/csv', requireSuperAdminMiddleware, async (req: any, res) => {
    try {
      const targetTenantId = req.query.targetTenantId ? parseInt(req.query.targetTenantId as string, 10) : undefined;
      const actorUserId = req.query.actorUserId as string | undefined;
      // Fetch up to 10 000 rows for CSV export
      const { entries } = await storage.getAuditLogs({ targetTenantId, actorUserId, limit: 10000, offset: 0 });

      const escape = (v: unknown) => {
        const s = v == null ? '' : String(v).replace(/"/g, '""');
        return `"${s}"`;
      };
      const header = ['id', 'actorUserId', 'targetTenantId', 'actionType', 'recordType', 'metadata', 'createdAt'].join(',');
      const rows = entries.map(e =>
        [e.id, e.actorUserId, e.targetTenantId, e.actionType, e.recordType, JSON.stringify(e.metadata ?? {}), e.createdAt]
          .map(escape).join(',')
      );
      const csv = [header, ...rows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
      res.send(csv);
    } catch (error: any) {
      console.error('Failed to export audit log CSV:', error);
      res.status(500).json({ message: error.message || 'Failed to export audit log' });
    }
  });

  // ─── Waitlist Routes (admin-only) ─────────────────────────────────────────
  app.get("/api/admin/waitlist", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId: number | undefined = req.tenantId;
      res.json(await storage.getWaitlistEntries(tenantId));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/waitlist", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId = resolveWriteTenantId(req, res);
      if (!tenantId) return;
      const { name, email, phone, serviceType, notes } = req.body;
      if (!name) return res.status(400).json({ message: "name is required" });
      const entry = await storage.createWaitlistEntry({ tenantId, name, email, phone, serviceType, notes });
      res.json(entry);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/admin/waitlist/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const id = parseInt(req.params.id);
      const tenantId: number | undefined = req.tenantId;
      const updates: any = { ...req.body };
      if (updates.status === "notified" && !updates.notifiedAt) updates.notifiedAt = new Date();
      res.json(await storage.updateWaitlistEntry(id, updates, tenantId));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/admin/waitlist/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const id = parseInt(req.params.id);
      const tenantId: number | undefined = req.tenantId;
      await storage.deleteWaitlistEntry(id, tenantId);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── Internal Task Routes ──────────────────────────────────────────────────
  // GET: admins see all tasks; staff see only tasks assigned to them (explicit policy)
  app.get("/api/admin/tasks", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      const tenantId: number | undefined = req.tenantId;
      const tasks = user?.isAdmin
        ? await storage.getInternalTasks(tenantId)
        : await storage.getInternalTasksForUser(req.user?.id, tenantId);
      res.json(tasks);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // POST / PATCH / DELETE: admin-only (only admins create and assign tasks)
  app.post("/api/admin/tasks", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId = resolveWriteTenantId(req, res);
      if (!tenantId) return;
      const { title, description, assignedTo, dueDate, priority } = req.body;
      if (!title) return res.status(400).json({ message: "title is required" });
      const task = await storage.createInternalTask({ tenantId, title, description, assignedTo, dueDate, priority: priority || "medium", createdBy: req.user?.id });
      res.json(task);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // PATCH: admins can edit any field; staff can only update the status of tasks assigned to them
  app.patch("/api/admin/tasks/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      const id = parseInt(req.params.id);
      const tenantId: number | undefined = req.tenantId;
      if (!user?.isAdmin) {
        // Staff may only update the status on tasks assigned to them
        const assignedTasks = await storage.getInternalTasksForUser(req.user?.id, tenantId);
        const isAssigned = assignedTasks.some(t => t.id === id);
        if (!isAssigned) return res.status(403).json({ message: "You can only update tasks assigned to you" });
        // Limit updatable fields for non-admins
        const { status } = req.body;
        if (!status) return res.status(400).json({ message: "Staff may only update task status" });
        return res.json(await storage.updateInternalTask(id, { status }, tenantId));
      }
      res.json(await storage.updateInternalTask(id, req.body, tenantId));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/admin/tasks/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const id = parseInt(req.params.id);
      const tenantId: number | undefined = req.tenantId;
      await storage.deleteInternalTask(id, tenantId);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── Announcement Routes (admin-only) ──────────────────────────────────────
  app.get("/api/admin/announcements", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId: number | undefined = req.tenantId;
      res.json(await storage.getAnnouncements(tenantId));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/announcements", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId = resolveWriteTenantId(req, res);
      if (!tenantId) return;
      const { title, body, expiresAt, isPinned } = req.body;
      if (!title || !body) return res.status(400).json({ message: "title and body are required" });
      const a = await storage.createAnnouncement({ tenantId, title, body, createdBy: req.user?.id, expiresAt: expiresAt ? new Date(expiresAt) : undefined, isPinned: !!isPinned });
      res.json(a);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/admin/announcements/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const id = parseInt(req.params.id);
      const tenantId: number | undefined = req.tenantId;
      const updates: any = { ...req.body };
      if (updates.expiresAt) updates.expiresAt = new Date(updates.expiresAt);
      res.json(await storage.updateAnnouncement(id, updates, tenantId));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/admin/announcements/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const id = parseInt(req.params.id);
      const tenantId: number | undefined = req.tenantId;
      await storage.deleteAnnouncement(id, tenantId);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── Estimate / Quote Routes (admin-only) ──────────────────────────────────
  app.get("/api/admin/estimates", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId: number | undefined = req.tenantId;
      res.json(await storage.getEstimates(tenantId));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/estimates", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId = resolveWriteTenantId(req, res);
      if (!tenantId) return;
      const { title, contactId, lineItems, notes, expiresAt } = req.body;
      if (!title) return res.status(400).json({ message: "title is required" });
      const items: Array<{ description: string; qty: number; unitPrice: number }> = lineItems || [];
      const total = items.reduce((s, i) => s + i.qty * i.unitPrice, 0).toFixed(2);
      const e = await storage.createEstimate({ tenantId, title, contactId: contactId || null, lineItems: items, notes, total, expiresAt: expiresAt ? new Date(expiresAt) : undefined });
      res.json(e);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/admin/estimates/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const id = parseInt(req.params.id);
      const tenantId: number | undefined = req.tenantId;
      const updates: any = { ...req.body };
      if (updates.lineItems) {
        updates.total = updates.lineItems.reduce((s: number, i: any) => s + i.qty * i.unitPrice, 0).toFixed(2);
      }
      res.json(await storage.updateEstimate(id, updates, tenantId));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/admin/estimates/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const id = parseInt(req.params.id);
      const tenantId: number | undefined = req.tenantId;
      await storage.deleteEstimate(id, tenantId);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Convert estimate → mark converted (frontend creates order separately)
  app.post("/api/admin/estimates/:id/convert", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const id = parseInt(req.params.id);
      const tenantId: number | undefined = req.tenantId;
      res.json(await storage.updateEstimate(id, { status: "converted" }, tenantId));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── Invoice Routes (admin-only) ──────────────────────────────────────────
  app.get("/api/admin/invoices", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId: number | undefined = req.tenantId;
      res.json(await storage.getInvoices(tenantId));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/invoices", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId = resolveWriteTenantId(req, res);
      if (!tenantId) return;
      const { contactId, lineItems, notes, dueDate } = req.body;
      const invoiceNumber = await storage.getNextInvoiceNumber(tenantId);
      const items: Array<{ description: string; qty: number; unitPrice: number }> = lineItems || [];
      const total = items.reduce((s, i) => s + i.qty * i.unitPrice, 0).toFixed(2);
      const inv = await storage.createInvoice({ tenantId, contactId: contactId || null, invoiceNumber, lineItems: items, notes, total, dueDate, status: "draft" });
      res.json(inv);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/admin/invoices/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const id = parseInt(req.params.id);
      const tenantId: number | undefined = req.tenantId;
      const updates: any = { ...req.body };
      if (updates.lineItems) {
        updates.total = updates.lineItems.reduce((s: number, i: any) => s + i.qty * i.unitPrice, 0).toFixed(2);
      }
      if (updates.status === "paid" && !updates.paidAt) updates.paidAt = new Date();
      if (updates.status === "sent" && !updates.sentAt) updates.sentAt = new Date();
      res.json(await storage.updateInvoice(id, updates, tenantId));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/admin/invoices/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const id = parseInt(req.params.id);
      const tenantId: number | undefined = req.tenantId;
      await storage.deleteInvoice(id, tenantId);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── Time Clock Routes ─────────────────────────────────────────────────────
  // Admin-only: view all entries, edit/delete any entry
  app.get("/api/admin/time-clock", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId: number | undefined = req.tenantId;
      res.json(await storage.getTimeClockEntries(tenantId));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Staff policy: any authenticated tenant member may clock in/out for themselves
  app.post("/api/admin/time-clock/clock-in", authMiddleware, async (req: any, res) => {
    try {
      const tenantId = resolveWriteTenantId(req, res);
      if (!tenantId) return;
      const userId = req.user?.id;
      const open = await storage.getOpenTimeClockEntry(userId, tenantId);
      if (open) return res.status(400).json({ message: "Already clocked in", entry: open });
      res.json(await storage.clockIn(userId, tenantId));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/time-clock/clock-out", authMiddleware, async (req: any, res) => {
    try {
      const tenantId: number | undefined = req.tenantId;
      res.json(await storage.clockOut(req.user?.id, tenantId));
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // Returns the calling user's own open entry (no admin needed)
  app.get("/api/admin/time-clock/status", authMiddleware, async (req: any, res) => {
    try {
      const tenantId: number | undefined = req.tenantId;
      const entry = await storage.getOpenTimeClockEntry(req.user?.id, tenantId);
      res.json({ isClockedIn: !!entry, entry: entry || null });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Returns the calling user's own time-clock entries (no admin needed)
  app.get("/api/admin/time-clock/mine", authMiddleware, async (req: any, res) => {
    try {
      const tenantId: number | undefined = req.tenantId;
      res.json(await storage.getTimeClockEntries(tenantId, req.user?.id));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/admin/time-clock/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const id = parseInt(req.params.id);
      const tenantId: number | undefined = req.tenantId;
      const updates: any = { ...req.body };
      if (updates.clockIn) updates.clockIn = new Date(updates.clockIn);
      if (updates.clockOut) updates.clockOut = new Date(updates.clockOut);
      res.json(await storage.updateTimeClockEntry(id, updates, tenantId));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/admin/time-clock/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const id = parseInt(req.params.id);
      const tenantId: number | undefined = req.tenantId;
      await storage.deleteTimeClockEntry(id, tenantId);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── Intake Form Routes ────────────────────────────────────────────────────
  // Admin-only: manage forms
  app.get("/api/admin/intake-forms", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId: number | undefined = req.tenantId;
      res.json(await storage.getIntakeForms(tenantId));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Public: active forms for this tenant (customers fill these out)
  app.get("/api/intake-forms/active", async (req: any, res) => {
    try {
      const tenantId: number | undefined = req.tenantId;
      res.json(await storage.getActiveIntakeForms(tenantId));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/intake-forms", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId = resolveWriteTenantId(req, res);
      if (!tenantId) return;
      const { title, fields } = req.body;
      if (!title) return res.status(400).json({ message: "title is required" });
      res.json(await storage.createIntakeForm({ tenantId, title, fields: fields || [], isActive: true }));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/admin/intake-forms/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const id = parseInt(req.params.id);
      const tenantId: number | undefined = req.tenantId;
      res.json(await storage.updateIntakeForm(id, req.body, tenantId));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/admin/intake-forms/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const id = parseInt(req.params.id);
      const tenantId: number | undefined = req.tenantId;
      await storage.deleteIntakeForm(id, tenantId);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Submit a form response — any authenticated user may respond to an active form
  app.post("/api/intake-forms/:id/respond", authMiddleware, async (req: any, res) => {
    try {
      const formId = parseInt(req.params.id);
      const tenantId: number | undefined = req.tenantId;
      const { responses, appointmentId } = req.body;
      res.json(await storage.createIntakeFormResponse({ tenantId, formId, userId: req.user?.id, responses: responses || {}, appointmentId: appointmentId || null }));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Admin: view submissions for a form
  app.get("/api/admin/intake-forms/:id/responses", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const formId = parseInt(req.params.id);
      const tenantId: number | undefined = req.tenantId;
      res.json(await storage.getIntakeFormResponses(formId, tenantId));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── SMS Blast Routes (admin-only) ─────────────────────────────────────────
  app.get("/api/admin/sms-blasts", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId: number | undefined = req.tenantId;
      res.json(await storage.getSmsBlasts(tenantId));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/sms-blasts", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId = resolveWriteTenantId(req, res);
      if (!tenantId) return;
      const { message, segment } = req.body;
      if (!message) return res.status(400).json({ message: "message is required" });
      const seg = segment || "all";

      const allUsers = await storage.getAllUsers(tenantId);
      const contacts = await storage.getAllContacts(tenantId);
      let phones: string[] = [];
      if (seg === "all") {
        const userPhones = allUsers.filter(u => u.phoneNumber).map(u => u.phoneNumber!);
        const contactPhones = contacts.filter(c => c.phoneNumber && !c.smsOptOut).map(c => c.phoneNumber!);
        phones = [...new Set([...userPhones, ...contactPhones])];
      } else if (seg === "contacts") {
        phones = contacts.filter(c => c.phoneNumber && !c.smsOptOut).map(c => c.phoneNumber!);
      } else if (seg === "loyalty") {
        phones = allUsers.filter(u => u.phoneNumber && (parseFloat(u.totalSpent ?? "0") > 0 || parseFloat(u.loyaltyCredits ?? "0") > 0)).map(u => u.phoneNumber!);
      }

      let sent = 0;
      for (const phone of phones) {
        try {
          const ok = await notificationService.sendGenericSMS(phone, message, undefined, tenantId);
          if (ok) sent++;
        } catch { /* skip failed sends */ }
      }

      const blast = await storage.createSmsBlast({ tenantId, message, segment: seg, recipientCount: sent, sentBy: req.user?.id, status: sent > 0 ? "sent" : "failed" });
      res.json({ blast, sent, total: phones.length });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Preview recipient count (admin-only)
  app.get("/api/admin/sms-blasts/preview-count", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId: number | undefined = req.tenantId;
      const seg = (req.query.segment as string) || "all";
      const allUsers = await storage.getAllUsers(tenantId);
      const contacts = await storage.getAllContacts(tenantId);
      let phones: string[] = [];
      if (seg === "all") {
        const up = allUsers.filter(u => u.phoneNumber).map(u => u.phoneNumber!);
        const cp = contacts.filter(c => c.phoneNumber && !c.smsOptOut).map(c => c.phoneNumber!);
        phones = [...new Set([...up, ...cp])];
      } else if (seg === "contacts") {
        phones = contacts.filter(c => c.phoneNumber && !c.smsOptOut).map(c => c.phoneNumber!);
      } else if (seg === "loyalty") {
        phones = allUsers.filter(u => u.phoneNumber && (parseFloat(u.totalSpent ?? "0") > 0 || parseFloat(u.loyaltyCredits ?? "0") > 0)).map(u => u.phoneNumber!);
      }
      res.json({ count: phones.length });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── Membership Plan Routes (admin-only) ───────────────────────────────────
  app.get("/api/admin/membership-plans", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId: number | undefined = req.tenantId;
      res.json(await storage.getMembershipPlans(tenantId));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/membership-plans", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId = resolveWriteTenantId(req, res);
      if (!tenantId) return;
      const { name, description, price, billingInterval, visitCredits } = req.body;
      if (!name || !price) return res.status(400).json({ message: "name and price are required" });
      res.json(await storage.createMembershipPlan({ tenantId, name, description, price: String(price), billingInterval: billingInterval || "monthly", visitCredits: visitCredits || 0 }));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/admin/membership-plans/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const id = parseInt(req.params.id);
      const tenantId: number | undefined = req.tenantId;
      res.json(await storage.updateMembershipPlan(id, req.body, tenantId));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/admin/membership-plans/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const id = parseInt(req.params.id);
      const tenantId: number | undefined = req.tenantId;
      await storage.deleteMembershipPlan(id, tenantId);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── Member Subscription Routes (admin-only) ───────────────────────────────
  app.get("/api/admin/member-subscriptions", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId: number | undefined = req.tenantId;
      res.json(await storage.getMemberSubscriptions(tenantId));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/member-subscriptions", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId = resolveWriteTenantId(req, res);
      if (!tenantId) return;
      const { userId, planId, endsAt } = req.body;
      if (!userId || !planId) return res.status(400).json({ message: "userId and planId are required" });
      res.json(await storage.createMemberSubscription({ tenantId, userId, planId: parseInt(planId), status: "active", endsAt: endsAt ? new Date(endsAt) : undefined }));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/admin/member-subscriptions/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const id = parseInt(req.params.id);
      const tenantId: number | undefined = req.tenantId;
      const updates: any = { ...req.body };
      if (updates.endsAt) updates.endsAt = new Date(updates.endsAt);
      res.json(await storage.updateMemberSubscription(id, updates, tenantId));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/admin/member-subscriptions/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const id = parseInt(req.params.id);
      const tenantId: number | undefined = req.tenantId;
      await storage.deleteMemberSubscription(id, tenantId);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ── Employee management routes ───────────────────────────────────────────
  // GET /api/admin/employees — list employees for tenant (admin only)
  app.get("/api/admin/employees", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId: number = req.tenantId;
      res.json(await storage.getEmployees(tenantId));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // GET /api/admin/employees/sales-stats — per-employee sales totals (admin only)
  app.get("/api/admin/employees/sales-stats", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId: number = req.tenantId;
      res.json(await storage.getEmployeeSalesStats(tenantId));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // POST /api/admin/employees — create employee account (admin only)
  app.post("/api/admin/employees", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId: number = req.tenantId;
      const { email, password, firstName, lastName, phoneNumber, defaultWorkDays, defaultTimeSlot, defaultDaySlots } = req.body;
      if (!email || !password || !firstName) return res.status(400).json({ message: "email, password, and firstName are required" });
      const existing = await storage.getUserByEmail(email);
      if (existing) return res.status(409).json({ message: "An account with that email already exists" });
      const newEmp = await storage.createEmployee({ tenantId, email, password, firstName, lastName, phoneNumber, defaultWorkDays, defaultTimeSlot, defaultDaySlots });
      // PIN and password are unified for employees — store the PIN immediately so the keypad works right away
      await storage.setEmployeePin(newEmp.id, tenantId, String(password));
      res.status(201).json(newEmp);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // PATCH /api/admin/employees/:id — update employee info/password (admin only)
  app.patch("/api/admin/employees/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId: number = req.tenantId;
      const { firstName, lastName, email, password, phoneNumber, defaultWorkDays, defaultTimeSlot, defaultDaySlots } = req.body;
      const update: any = {};
      if (firstName !== undefined) update.firstName = firstName;
      if (lastName  !== undefined) update.lastName  = lastName;
      if (email     !== undefined) update.email     = email;
      if (password)                update.password  = password;
      if (phoneNumber !== undefined) update.phoneNumber = phoneNumber;
      if (defaultWorkDays !== undefined) update.defaultWorkDays = defaultWorkDays;
      if (defaultTimeSlot !== undefined) update.defaultTimeSlot = defaultTimeSlot;
      if (defaultDaySlots !== undefined) update.defaultDaySlots = defaultDaySlots;
      const updated = await storage.updateEmployee(req.params.id, update, tenantId);
      // Keep employee_pin in sync whenever the PIN is changed via the edit dialog
      if (password) await storage.setEmployeePin(req.params.id, tenantId, String(password));
      res.json(updated);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // DELETE /api/admin/employees/:id — remove employee (admin only)
  app.delete("/api/admin/employees/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId: number = req.tenantId;
      await storage.deleteEmployee(req.params.id, tenantId);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // GET /api/admin/employees/:id/permissions — get employee permissions (admin only)
  app.get("/api/admin/employees/:id/permissions", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId: number = req.tenantId;
      const perms = await storage.getEmployeePermissions(req.params.id, tenantId);
      res.json(perms ?? {});
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // PUT /api/admin/employees/:id/permissions — set employee permissions (admin only)
  app.put("/api/admin/employees/:id/permissions", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId: number = req.tenantId;
      const perms = req.body;
      res.json(await storage.upsertEmployeePermissions(req.params.id, tenantId, perms));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // GET /api/employee/my-permissions — employee fetches own permissions (any authenticated employee)
  app.get("/api/employee/my-permissions", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isEmployee) return res.status(403).json({ message: "Employee access only" });
      const tenantId: number = req.tenantId;
      const perms = await storage.getEmployeePermissions(user.id, tenantId);
      res.json(perms ?? {});
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // POST /api/admin/employees/:id/set-pin — owner sets/resets employee PIN (admin only)
  app.post("/api/admin/employees/:id/set-pin", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });
      const tenantId: number = req.tenantId;
      const { pin } = req.body;
      if (!pin || !/^\d{4,6}$/.test(String(pin))) return res.status(400).json({ message: "PIN must be 4–6 digits" });
      await storage.setEmployeePin(req.params.id, tenantId, String(pin));
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // GET /api/employee/roster — public-ish: list employees for PIN sign-in (by tenant slug, no auth needed)
  // Returns only id, firstName, lastName, employeeCode — no sensitive fields
  app.get("/api/employee/roster", async (req: any, res) => {
    try {
      const tenantId: number | undefined = req.tenantId;
      if (!tenantId) return res.status(400).json({ message: "Tenant required" });
      const emps = await storage.getEmployees(tenantId);
      res.json(emps.map(e => ({
        id: e.id,
        firstName: e.firstName,
        lastName: e.lastName,
        employeeCode: e.employeeCode,
      })));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // POST /api/auth/employee-pin-login — PIN-based employee login, creates full JWT session
  app.post("/api/auth/employee-pin-login", async (req: any, res) => {
    try {
      const tenantId: number | undefined = req.tenantId;
      if (!tenantId) return res.status(400).json({ message: "Tenant required" });
      const { employeeCode, pin } = req.body;
      if (!employeeCode || !pin) return res.status(400).json({ message: "Employee code and PIN are required" });
      const emp = await storage.authenticateEmployeeByPin(tenantId, String(employeeCode), String(pin));
      if (!emp) return res.status(401).json({ message: "Invalid employee code or PIN" });
      // Auto clock-in via time clock (if not already clocked in today)
      const token = generateToken(emp);
      setAuthCookie(res, token);
      res.json({ ...sanitizeUser(emp), token });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // POST /api/auth/pos-admin-pin-login — PIN-only login for admins/owners at the POS
  // Searches all admin-flagged users in the tenant for a matching employee_pin
  // and returns a full JWT session for the first match.
  app.post("/api/auth/pos-admin-pin-login", async (req: any, res) => {
    try {
      const tenantId: number | undefined = req.tenantId;
      if (!tenantId) return res.status(400).json({ message: "Tenant required" });
      const { pin } = req.body;
      if (!pin) return res.status(400).json({ message: "PIN required" });

      // 1. Check the store-wide Owner / Override PIN first (stored on the tenant row)
      const tenant = await storage.getTenant(tenantId);
      if (tenant?.adminOverridePin && await verifyPassword(String(pin), tenant.adminOverridePin)) {
        // Log in as the tenant's super-manager / owner
        const ownerRows = await db.execute(
          sql`SELECT id FROM users WHERE tenant_id = ${tenantId} AND is_superior_manager = true ORDER BY id ASC LIMIT 1`
        );
        const ownerId = (ownerRows.rows[0] as any)?.id;
        if (ownerId) {
          const owner = await storage.getUser(ownerId);
          if (owner) {
            const token = generateToken(owner);
            setAuthCookie(res, token);
            return res.json({ ...sanitizeUser(owner), token });
          }
        }
      }

      // 2. Check personal employee_pin on any admin or owner account
      const rows = await db.execute(
        sql`SELECT * FROM users WHERE tenant_id = ${tenantId} AND (is_admin = true OR is_superior_manager = true) AND employee_pin IS NOT NULL`
      );
      for (const row of rows.rows as any[]) {
        if (row.employee_pin && await verifyPassword(String(pin), row.employee_pin)) {
          const user = await storage.getUser(row.id);
          if (!user) continue;
          const token = generateToken(user);
          setAuthCookie(res, token);
          return res.json({ ...sanitizeUser(user), token });
        }
      }

      return res.status(401).json({ message: "Incorrect PIN" });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // POST /api/auth/admin-override — verify override PIN, log the action
  app.post("/api/auth/admin-override", authMiddleware, async (req: any, res) => {
    try {
      const { pin, action, purpose } = req.body;
      if (!pin || !action) return res.status(400).json({ message: "PIN and action are required" });
      const tenantId: number | undefined = req.tenantId;
      if (!tenantId) return res.status(400).json({ message: "No tenant context" });
      // Defense-in-depth: confirm the authenticated user actually belongs to this
      // tenant.  Without this check a stranded admin who knows a foreign store's
      // slug and PIN could write override_audit_log entries for that store.
      // Super-admins are exempt — they may act across tenants.
      if (!req.isSuperAdmin) {
        const actingUser = await storage.getUser(req.user?.id);
        if (!actingUser || actingUser.tenantId !== tenantId) {
          return res.status(403).json({ message: "You do not have access to this store's override PIN." });
        }
      }
      const tenant = await storage.getTenant(tenantId);
      let matched = false;
      let hasSomePinConfigured = false;

      // 1. Check the store-wide Owner PIN (highest authority)
      if (tenant?.adminOverridePin) {
        hasSomePinConfigured = true;
        matched = await verifyPassword(String(pin), tenant.adminOverridePin);
      }

      // 2. Always also check any admin/manager employee PINs (even when a store PIN exists)
      if (!matched) {
        const adminPinRows = await db.execute(
          sql`SELECT employee_pin FROM users WHERE tenant_id = ${tenantId} AND is_admin = true AND employee_pin IS NOT NULL`
        );
        if ((adminPinRows.rows as any[]).length > 0) hasSomePinConfigured = true;
        for (const row of (adminPinRows.rows as any[])) {
          if (row.employee_pin && await verifyPassword(String(pin), row.employee_pin)) {
            matched = true;
            break;
          }
        }
      }

      if (!hasSomePinConfigured) {
        return res.status(400).json({ message: "No override PIN configured. Ask the owner to set a store PIN or set an admin PIN in Staff Accounts." });
      }
      if (!matched) return res.status(401).json({ message: "Incorrect override PIN" });
      // Log the override action
      const userId = req.user?.id || 'unknown';
      await db.execute(sql`
        INSERT INTO override_audit_log (tenant_id, actor_user_id, action, purpose, created_at)
        VALUES (${tenantId}, ${userId}, ${action}, ${purpose || null}, NOW())
      `);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // PUT /api/admin/override-pin — owner/admin sets the store override PIN
  app.put("/api/admin/override-pin", requireAdminMiddleware, async (req: any, res) => {
    try {
      const { pin } = req.body;
      if (!pin || !/^\d{4,6}$/.test(String(pin))) return res.status(400).json({ message: "PIN must be 4–6 digits" });
      const tenantId: number | undefined = req.tenantId;
      if (!tenantId) return res.status(400).json({ message: "No tenant context" });
      const hashed = await hashPassword(String(pin));
      await db.execute(sql`UPDATE tenants SET admin_override_pin = ${hashed} WHERE id = ${tenantId}`);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // GET /api/admin/pos-override-config — get POS override requirements (readable by all authenticated tenant users, inc. employees)
  app.get("/api/admin/pos-override-config", authMiddleware, async (req: any, res) => {
    try {
      const tenantId: number | undefined = req.tenantId;
      if (!tenantId) return res.status(400).json({ message: "No tenant context" });
      const tenant = await storage.getTenant(tenantId);
      const features = (tenant?.enabledFeatures || {}) as any;
      res.json(features.posOverrideRequirements || {});
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // PUT /api/admin/pos-override-config — save POS override requirements
  app.put("/api/admin/pos-override-config", requireAdminMiddleware, async (req: any, res) => {
    try {
      const tenantId: number | undefined = req.tenantId;
      if (!tenantId) return res.status(400).json({ message: "No tenant context" });
      const tenant = await storage.getTenant(tenantId);
      const features = { ...(tenant?.enabledFeatures || {}) } as any;
      features.posOverrideRequirements = req.body;
      await storage.updateTenant(tenantId, { enabledFeatures: features });
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // PUT /api/admin/service-groups — save service group definitions (array of {id, name})
  app.put("/api/admin/service-groups", requireAdminMiddleware, async (req: any, res) => {
    try {
      const tenantId: number | undefined = req.tenantId;
      if (!tenantId) return res.status(400).json({ message: "No tenant context" });
      const groups = req.body;
      if (!Array.isArray(groups)) return res.status(400).json({ message: "Body must be an array of groups" });
      const tenant = await storage.getTenant(tenantId);
      const features = { ...(tenant?.enabledFeatures || {}) } as any;
      features.serviceGroups = groups;
      await storage.updateTenant(tenantId, { enabledFeatures: features });
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // PUT /api/admin/tab-labels — save custom tab/section label overrides (owner/admin only)
  app.put("/api/admin/tab-labels", requireAdminMiddleware, async (req: any, res) => {
    try {
      const tenantId: number | undefined = req.tenantId;
      if (!tenantId) return res.status(400).json({ message: "No tenant context" });
      const tenant = await storage.getTenant(tenantId);
      const features = { ...(tenant?.enabledFeatures || {}) } as any;
      features.tabLabels = req.body;
      await storage.updateTenant(tenantId, { enabledFeatures: features });
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // GET /api/homepage-config — public, returns homepage config for the tenant
  app.get("/api/homepage-config", async (req: any, res) => {
    try {
      const tenantId: number | undefined = req.tenantId;
      if (!tenantId) return res.json({});
      const tenant = await storage.getTenant(tenantId);
      const features = (tenant?.enabledFeatures || {}) as any;
      res.json(features.homepageConfig || {});
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // PUT /api/admin/homepage-config — owner (isAdmin) or employee with canEditHomepage
  app.put("/api/admin/homepage-config", authMiddleware, async (req: any, res) => {
    try {
      const tenantId: number | undefined = req.tenantId;
      if (!tenantId) return res.status(400).json({ message: "No tenant context" });
      const user = req.user as any;
      // Check permission: admin OR employee with canEditHomepage
      if (!user?.isAdmin) {
        if (!user?.isEmployee) return res.status(403).json({ message: "Access denied" });
        const perms = await storage.getEmployeePermissions(user.id, tenantId);
        if (!perms?.canEditHomepage) return res.status(403).json({ message: "Homepage editing not permitted for this account" });
      }
      const tenant = await storage.getTenant(tenantId);
      const features = { ...(tenant?.enabledFeatures || {}) } as any;
      features.homepageConfig = req.body;
      await storage.updateTenant(tenantId, { enabledFeatures: features });
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Server is now created externally in index.ts
}
