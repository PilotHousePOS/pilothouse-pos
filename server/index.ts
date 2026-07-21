import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import path from "path";
import http from "http";
import * as fs from "fs";
import { runMigrations } from 'stripe-replit-sync';
import { getStripeSync } from './stripeClient';
import { WebhookHandlers } from './webhookHandlers';
import { getBaseUrl } from './utils';

const app = express();
app.set("trust proxy", 1);

// Track initialization state
let isFullyInitialized = false;

// Simple logging function (avoid importing vite module early)
function log(message: string) {
  const time = new Date().toLocaleTimeString("en-US", { hour12: true });
  console.log(`${time} [express] ${message}`);
}

// Log ALL incoming requests (temporary diagnostic for root path 404 issue)
app.use((req, res, next) => {
  const url = req.originalUrl || req.url;
  if (!url.startsWith('/api')) {
    console.log(`[REQUEST] ${req.method} ${url} | host: ${req.hostname} | ip: ${req.ip || req.socket?.remoteAddress}`);
  }
  next();
});

// CRITICAL: Health check endpoints FIRST - must respond instantly
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', ready: isFullyInitialized });
});

app.get('/__health', (_req, res) => {
  res.status(200).send('OK');
});

// CORS middleware with trusted origins only
// Origins are canonicalized via URL parsing (scheme + host) to prevent prefix/suffix bypass attacks
function parseCanonicalOrigin(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return '';
  }
}

const trustedOriginSet = new Set<string>(
  [
    `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`,
    `https://${process.env.REPL_SLUG}--${process.env.REPL_OWNER}.repl.co`,
    process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null,
    process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : null,
    'https://animal-house-pet-store.replit.app',
  ]
    .filter(Boolean)
    .map(o => parseCanonicalOrigin(o as string))
    .filter(o => o !== ''),
);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && trustedOriginSet.has(parseCanonicalOrigin(origin))) {
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (process.env.NODE_ENV === 'production') {
    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://js.stripe.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https: http:",
      "media-src 'self' blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.stripe.com https://merchant-ui-api.stripe.com wss: ws:",
      "worker-src 'self' blob:",
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
      "frame-ancestors 'self' https://*.replit.com https://*.replit.dev https://*.repl.co https://*.replit.app",
      "base-uri 'self'",
      "form-action 'self'",
    ];
    res.setHeader('Content-Security-Policy', cspDirectives.join('; '));
  }
  next();
});

// CRITICAL: Stripe webhook MUST be registered BEFORE express.json()
// Webhook needs raw Buffer, not parsed JSON
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;

      if (!Buffer.isBuffer(req.body)) {
        console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer.');
        return res.status(400).json({ error: 'Webhook body parse error' });
      }

      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('Webhook error:', error.message);
      // Only return 400 for genuine signature/verification failures — Stripe will not retry 400s
      // for bad signatures, but WILL retry for 5xx. For any other error (DB hiccup, etc.)
      // return 200 so Stripe doesn't keep retrying — the Replit sync already processed the event.
      if (error.message && (error.message.includes('No signatures found') || error.message.includes('signature') || error.message.includes('Webhook signature'))) {
        return res.status(400).json({ error: 'Invalid webhook signature' });
      }
      res.status(200).json({ received: true });
    }
  }
);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));
app.use(cookieParser());

// Serve static files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use('/stock-images', express.static(path.join(process.cwd(), 'attached_assets/stock_images')));

// In production, serve the built frontend immediately at startup (before initializeApp finishes)
// This prevents "Not Found" during the initialization window
console.log('[STARTUP] NODE_ENV:', process.env.NODE_ENV);
if (process.env.NODE_ENV === 'production') {
  const prodPublicPath = path.join(process.cwd(), 'dist/public');
  const prodIndexPath = path.join(prodPublicPath, 'index.html');
  const dirExists = fs.existsSync(prodPublicPath);
  const fileExists = fs.existsSync(prodIndexPath);
  console.log('[STARTUP] prodPublicPath:', prodPublicPath, '| dirExists:', dirExists, '| fileExists:', fileExists);

  if (dirExists && fileExists) {
    // Serve static assets (JS, CSS, images, etc.)
    app.use(express.static(prodPublicPath, { index: false }));

    // Explicit root handler — registered BEFORE everything else
    const sendIndex = (res: Response) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(prodIndexPath, (err) => {
        if (err) {
          console.error('[STATIC] sendFile error for index.html:', err.message, '| path:', prodIndexPath);
          if (!res.headersSent) res.status(500).send('Error loading app');
        }
      });
    };

    app.get('/', (_req, res) => {
      console.log('[ROOT] GET / handler triggered — serving index.html');
      sendIndex(res);
    });

    // Catch-all for SPA routes — must NOT intercept image/object storage routes
    app.use((req, res, next) => {
      const url = req.originalUrl || req.url;
      if (
        url.startsWith('/api') ||
        url === '/health' ||
        url === '/__health' ||
        url.startsWith('/public-objects') ||
        url.startsWith('/objects') ||
        url.startsWith('/uploads') ||
        url.startsWith('/stock-images')
      ) {
        return next();
      }
      sendIndex(res);
    });

    console.log('[STARTUP] Static file serving registered for production');
  } else {
    console.error('[STARTUP] MISSING dist/public or index.html — static serving NOT registered');
  }
}

// Serve PWA files (manifest, service worker, icons) - works in both dev and production
const pwaDevPath = path.join(process.cwd(), 'client/public');
const pwaProdPath = path.join(process.cwd(), 'dist/public');

// Try dev path first, fall back to prod path
const getPwaFilePath = (filename: string) => {
  const devFile = path.join(pwaDevPath, filename);
  const prodFile = path.join(pwaProdPath, filename);
  return fs.existsSync(devFile) ? devFile : prodFile;
};

app.use('/icons', (req, res, next) => {
  const devIconsPath = path.join(pwaDevPath, 'icons');
  const prodIconsPath = path.join(pwaProdPath, 'icons');
  const iconsPath = fs.existsSync(devIconsPath) ? devIconsPath : prodIconsPath;
  express.static(iconsPath)(req, res, next);
});

app.get('/.well-known/assetlinks.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(getPwaFilePath('.well-known/assetlinks.json'));
});

app.get('/google4267b0cfa31092a0.html', (_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.sendFile(getPwaFilePath('google4267b0cfa31092a0.html'));
});

app.get('/manifest.json', (_req, res) => {
  res.sendFile(getPwaFilePath('manifest.json'));
});

app.get('/sw.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(getPwaFilePath('sw.js'));
});

app.get('/sitemap.xml', (_req, res) => {
  const domain = process.env.REPLIT_DOMAINS?.split(',')[0] || 'animalhousepetstore.com';
  const baseUrl = `https://${domain}`;
  const today = new Date().toISOString().split('T')[0];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${baseUrl}/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>${baseUrl}/supplies</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>
  <url><loc>${baseUrl}/reptiles</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>
  <url><loc>${baseUrl}/aquatics</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>
  <url><loc>${baseUrl}/booking</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>
  <url><loc>${baseUrl}/privacy-policy</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.3</priority></url>
  <url><loc>${baseUrl}/terms-of-service</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.3</priority></url>
</urlset>`;
  res.setHeader('Content-Type', 'application/xml');
  res.send(xml);
});

// Cache headers
app.use((_req, res, next) => {
  res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.header('Pragma', 'no-cache');
  res.header('Expires', '0');
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const reqPath = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (reqPath.startsWith("/api")) {
      let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
      const sensitiveEndpoints = ['/api/auth', '/api/admin/users', '/api/orders', '/api/admin/orders', '/api/contacts', '/api/appointments'];
      const isSensitive = sensitiveEndpoints.some(ep => reqPath.startsWith(ep));
      if (capturedJsonResponse && !isSensitive) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }
      log(logLine);
    }
  });

  next();
});

// Create HTTP server and START LISTENING IMMEDIATELY
const server = http.createServer(app);
const port = 5000;

server.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
  log(`Server listening on port ${port} - health checks ready`);
  
  // NOW start heavy initialization asynchronously
  initializeApp().catch(err => {
    console.error('Failed to initialize app:', err);
  });
});

// Initialize Stripe schema and sync data
async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    log('DATABASE_URL not set - skipping Stripe initialization');
    return;
  }

  try {
    log('Initializing Stripe schema...');
    await runMigrations({ databaseUrl, schema: 'stripe' });
    log('Stripe schema ready');

    const stripeSync = await getStripeSync();

    log('Setting up managed webhook...');
    const webhookBaseUrl = getBaseUrl();
    try {
      const result = await stripeSync.findOrCreateManagedWebhook(
        `${webhookBaseUrl}/api/stripe/webhook`
      );
      if (result?.webhook?.url) {
        log(`Stripe webhook configured: ${result.webhook.url}`);
      } else {
        log('Stripe webhook setup completed (no URL returned)');
      }
    } catch (webhookError: any) {
      console.error('Webhook setup error:', webhookError.message);
      log('Continuing without managed webhook - manual webhook may be needed');
    }

    // Sync all existing Stripe data in background
    stripeSync.syncBackfill()
      .then(() => log('Stripe data synced'))
      .catch((err: any) => console.error('Error syncing Stripe data:', err));
  } catch (error) {
    console.error('Failed to initialize Stripe:', error);
  }
}

async function seedLegalPages() {
  try {
    const { storage } = await import('./storage');
    const existing = await storage.getAllLegalPages();
    const slugs = existing.map(p => p.slug);
    
    if (!slugs.includes('privacy-policy')) {
      await storage.upsertLegalPage({
        slug: 'privacy-policy',
        title: 'Privacy Policy',
        content: `<p class="text-xs text-gray-500">Last Updated: February 10, 2026</p>

<h2>1. Introduction</h2>
<p>Animal House Pet Store ("we," "us," or "our"), located at 2934 Cypress St, West Monroe, LA 71291, is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our website and mobile application (the "Service").</p>

<h2>2. Information We Collect</h2>
<p><strong>Personal Information:</strong></p>
<ul>
<li>Name, email address, and phone number when you create an account</li>
<li>Pet information (name, breed, type) when you add pets to your profile</li>
<li>Payment information processed securely through Stripe (we do not store card numbers)</li>
<li>Order history and grooming appointment records</li>
<li>Communication preferences (email and SMS opt-in/opt-out)</li>
</ul>
<p><strong>Automatically Collected Information:</strong></p>
<ul>
<li>Device information and browser type</li>
<li>Push notification subscription data (if you opt in)</li>
<li>Usage data such as pages visited and features used</li>
</ul>

<h2>3. How We Use Your Information</h2>
<ul>
<li>To process orders and manage your account</li>
<li>To schedule and manage grooming appointments</li>
<li>To send transactional emails (order confirmations, appointment updates, password resets)</li>
<li>To send marketing communications (only with your consent; you may opt out at any time)</li>
<li>To send abandoned cart reminders (you may opt out of these)</li>
<li>To send SMS notifications about order and appointment status</li>
<li>To manage our loyalty rewards program</li>
<li>To improve our services and customer experience</li>
</ul>

<h2>4. Payment Processing</h2>
<p>All payment transactions are processed through Stripe, a PCI-compliant payment processor. We do not store your full credit card number, expiration date, or CVV on our servers. Please review <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">Stripe's Privacy Policy</a> for information about how they handle your payment data.</p>

<h2>5. Communication Preferences</h2>
<p>You can manage your communication preferences at any time through your Profile page:</p>
<ul>
<li><strong>Marketing Emails:</strong> Opt out via your profile settings or the unsubscribe link in any marketing email.</li>
<li><strong>SMS Notifications:</strong> Reply STOP to any text message to opt out.</li>
<li><strong>Push Notifications:</strong> Manage through your browser or device settings.</li>
<li><strong>Transactional Messages:</strong> Order confirmations and appointment updates cannot be opted out of as they are necessary for service delivery.</li>
</ul>

<h2>6. Data Sharing</h2>
<p>We do not sell your personal information. We may share your data with:</p>
<ul>
<li><strong>Stripe:</strong> For payment processing</li>
<li><strong>SendGrid:</strong> For sending emails</li>
<li><strong>Twilio:</strong> For sending SMS messages</li>
<li><strong>Google Calendar:</strong> For appointment scheduling</li>
</ul>
<p>These service providers are bound by their own privacy policies and are only permitted to use your information as necessary to provide services to us.</p>

<h2>7. Data Security</h2>
<p>We implement appropriate technical and organizational security measures to protect your personal information, including encrypted connections (HTTPS), secure password hashing, and token-based authentication. However, no method of transmission over the internet is 100% secure.</p>

<h2>8. Data Retention</h2>
<p>We retain your personal information for as long as your account is active or as needed to provide services. You may request account deletion by contacting us. Order and appointment records may be retained for legal and business purposes.</p>

<h2>9. Children's Privacy</h2>
<p>Our Service is not directed to children under 13. We do not knowingly collect personal information from children under 13. If you believe we have collected information from a child under 13, please contact us immediately.</p>

<h2>10. Changes to This Policy</h2>
<p>We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the "Last Updated" date.</p>

<h2>11. Contact Us</h2>
<p>If you have questions about this Privacy Policy, please contact us:</p>
<p><strong>Animal House Pet Store</strong><br/>2934 Cypress St<br/>West Monroe, LA 71291<br/>Phone: (318) 322-3023</p>`,
      });
      log('Seeded privacy-policy legal page');
    }
    
    if (!slugs.includes('terms-of-service')) {
      await storage.upsertLegalPage({
        slug: 'terms-of-service',
        title: 'Terms of Service',
        content: `<p class="text-xs text-gray-500">Last Updated: February 10, 2026</p>

<h2>1. Acceptance of Terms</h2>
<p>By accessing or using the Animal House Pet Store website and mobile application (the "Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.</p>

<h2>2. Account Registration</h2>
<ul>
<li>You must provide accurate and complete information when creating an account.</li>
<li>You are responsible for maintaining the security of your account credentials.</li>
<li>You must be at least 18 years old to create an account and make purchases.</li>
<li>One account per person; duplicate accounts may be merged or removed.</li>
</ul>

<h2>3. Orders and Purchases</h2>
<ul>
<li>All orders are subject to product availability and approval by store staff.</li>
<li>Live animals displayed on the Service are for viewing purposes only and cannot be purchased online.</li>
<li>Prices are listed in US dollars and are subject to change without notice.</li>
<li>Orders require in-store pickup; we do not currently offer shipping.</li>
<li>Payment is processed securely through Stripe at the time of order placement.</li>
<li>Orders may be cancelled or modified before they are approved by staff.</li>
</ul>

<h2>4. Grooming Services</h2>
<ul>
<li>Grooming appointments must be booked in advance through the Service.</li>
<li>We offer Bath Only and Full Grooming services.</li>
<li>Appointments are available Monday through Saturday, 7:00 AM to 1:30 PM (last appointment).</li>
<li>No appointments are available on Sundays.</li>
<li>Cancellations should be made at least 24 hours in advance.</li>
<li>We reserve the right to refuse service for the safety of pets or staff.</li>
<li>Pet owners must disclose any health conditions, behavioral issues, or special needs.</li>
</ul>

<h2>5. Loyalty Rewards Program</h2>
<ul>
<li>Rewards are earned on qualifying purchases and grooming services.</li>
<li>Points have no cash value and cannot be transferred between accounts.</li>
<li>We reserve the right to modify or discontinue the rewards program at any time.</li>
<li>Fraudulent activity will result in forfeiture of all rewards and account suspension.</li>
</ul>

<h2>6. User Conduct</h2>
<p>You agree not to:</p>
<ul>
<li>Use the Service for any unlawful purpose</li>
<li>Attempt to gain unauthorized access to any part of the Service</li>
<li>Interfere with or disrupt the Service or its servers</li>
<li>Submit false or misleading information</li>
<li>Harass or threaten other users or staff</li>
</ul>

<h2>7. Communications</h2>
<ul>
<li>By creating an account, you consent to receive transactional communications (order confirmations, appointment reminders).</li>
<li>Marketing emails require separate opt-in and can be disabled in your profile settings.</li>
<li>SMS notifications can be opted out of by replying STOP to any message.</li>
<li>Push notifications can be managed through your browser or device settings.</li>
</ul>

<h2>8. Intellectual Property</h2>
<p>All content on the Service, including text, images, logos, and software, is the property of Animal House Pet Store and is protected by applicable intellectual property laws. You may not reproduce, distribute, or create derivative works without our express written permission.</p>

<h2>9. Limitation of Liability</h2>
<p>Animal House Pet Store shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service. Our total liability shall not exceed the amount you paid for the specific product or service giving rise to the claim.</p>

<h2>10. Disclaimer of Warranties</h2>
<p>The Service is provided "as is" without warranties of any kind. We do not guarantee that the Service will be uninterrupted, error-free, or free of harmful components.</p>

<h2>11. Governing Law</h2>
<p>These Terms shall be governed by the laws of the State of Louisiana. Any disputes shall be resolved in the courts of Ouachita Parish, Louisiana.</p>

<h2>12. Changes to Terms</h2>
<p>We reserve the right to modify these Terms at any time. Changes will be effective immediately upon posting. Your continued use of the Service constitutes acceptance of the modified Terms.</p>

<h2>13. Contact Us</h2>
<p>If you have questions about these Terms of Service, please contact us:</p>
<p><strong>Animal House Pet Store</strong><br/>2934 Cypress St<br/>West Monroe, LA 71291<br/>Phone: (318) 322-3023</p>`,
      });
      log('Seeded terms-of-service legal page');
    }
  } catch (error) {
    console.error('Error seeding legal pages:', error);
  }
}

// Heavy initialization - runs AFTER server is already listening
async function runAppMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;
  try {
    const { Pool } = await import('@neondatabase/serverless');
    const ws = (await import('ws')).default;
    const { neonConfig } = await import('@neondatabase/serverless');
    neonConfig.webSocketConstructor = ws;
    const migPool = new Pool({ connectionString: databaseUrl });
    await migPool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_notes TEXT`);
    await migPool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_charge_account BOOLEAN DEFAULT false`);
    await migPool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 0`);
    await migPool.query(`CREATE TABLE IF NOT EXISTS specials (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      image_url TEXT,
      badge_text VARCHAR(50),
      badge_color VARCHAR(20) DEFAULT 'red',
      link_type VARCHAR(20) DEFAULT 'none',
      link_id INTEGER,
      external_url TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`);
    // One-time price sync from POS export (07/10/2026)
    await migPool.query(`CREATE TABLE IF NOT EXISTS data_migrations (key VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMP DEFAULT NOW())`);
    await migPool.query(`CREATE TABLE IF NOT EXISTS audit_keep_list (supply_id INTEGER PRIMARY KEY, saved_at TIMESTAMP DEFAULT NOW(), item_name TEXT, scanned_barcode TEXT)`);
    await migPool.query(`CREATE TABLE IF NOT EXISTS pos_zero_stock_tracker (
      supply_id INTEGER PRIMARY KEY,
      sku VARCHAR(50),
      item_name TEXT,
      zero_count INTEGER DEFAULT 0,
      last_scan_at TIMESTAMP,
      last_nonzero_at TIMESTAMP,
      deletion_eligible BOOLEAN DEFAULT FALSE,
      protected BOOLEAN DEFAULT FALSE,
      threshold INTEGER DEFAULT 16
    )`);
    await migPool.query(`ALTER TABLE pos_zero_stock_tracker ADD COLUMN IF NOT EXISTS threshold INTEGER DEFAULT 16`);
    await migPool.query(`CREATE TABLE IF NOT EXISTS pos_pending_new_items (
      sku VARCHAR(50) PRIMARY KEY,
      item_name TEXT,
      brand TEXT,
      price NUMERIC,
      mapped_category VARCHAR(100),
      pos_stock INTEGER,
      found_at TIMESTAMP DEFAULT NOW()
    )`);
    await migPool.query(`DELETE FROM pos_pending_new_items WHERE pos_stock <= 0`);
    await migPool.query(`INSERT INTO cart_items (user_id, supply_id, quantity) SELECT 'zz0b1cg81t', 9663, 1 WHERE NOT EXISTS (SELECT 1 FROM cart_items WHERE user_id = 'zz0b1cg81t' AND supply_id = 9663)`);
    const { rows: alreadyRan } = await migPool.query(`SELECT 1 FROM data_migrations WHERE key = 'price_sync_20260710'`);
    if (alreadyRan.length === 0) {
      try {
        const { readFileSync } = await import('fs');
        const { join } = await import('path');
        const priceData: { sku: string; price: number }[] = JSON.parse(readFileSync(join(process.cwd(), 'server/priceMigration20260710.json'), 'utf8'));
        // Build VALUES list — all values are numeric/alphanumeric from validated XLS data
        const valuesList = priceData.map(r => `('${r.sku.replace(/'/g, "''")}', ${r.price})`).join(',');
        await migPool.query(`
          UPDATE supplies AS s
          SET price = v.new_price::numeric, updated_at = NOW()
          FROM (VALUES ${valuesList}) AS v(sku, new_price)
          WHERE s.sku = v.sku
        `);
        await migPool.query(`INSERT INTO data_migrations (key) VALUES ('price_sync_20260710')`);
        log(`Price sync migration applied: ${priceData.length} items processed`);
      } catch (priceErr: any) {
        console.error('Price sync migration error (non-fatal):', priceErr.message);
      }
    }

    // One-time supply insert from POS export (07/11/2026) — 132 missing items
    const { rows: insertRan } = await migPool.query(`SELECT 1 FROM data_migrations WHERE key = 'supply_insert_20260711'`);
    if (insertRan.length === 0) {
      try {
        const { readFileSync } = await import('fs');
        const { join } = await import('path');
        const supplyData: any[] = JSON.parse(readFileSync(join(process.cwd(), 'server/supplyInsertMigration20260711.json'), 'utf8'));
        // First sync the sequence to avoid PK conflicts
        await migPool.query(`SELECT setval('supplies_id_seq', (SELECT MAX(id) FROM supplies))`);
        for (const r of supplyData) {
          const esc = (s: string) => s ? String(s).replace(/'/g, "''") : '';
          await migPool.query(`
            INSERT INTO supplies (name, category, brand, price, description, stock_quantity, size, sku, upc, is_active, filter_type)
            SELECT $1,$2,$3,$4,$5,$6,$7,$8::text,$9,true,$10
            WHERE NOT EXISTS (SELECT 1 FROM supplies WHERE sku = $8::text)
          `, [r.name, r.category, r.brand, r.price, r.description, r.stock_quantity,
              r.size || null, r.sku || null, r.upc || null, r.filter_type]);
        }
        await migPool.query(`INSERT INTO data_migrations (key) VALUES ('supply_insert_20260711')`);
        log(`Supply insert migration applied: ${supplyData.length} items processed`);
      } catch (insertErr: any) {
        console.error('Supply insert migration error (non-fatal):', insertErr.message);
      }
    }

    // One-time price sync from POS export (07/11/2026 batch B)
    const { rows: priceBRan } = await migPool.query(`SELECT 1 FROM data_migrations WHERE key = 'price_sync_20260711b'`);
    if (priceBRan.length === 0) {
      try {
        const { readFileSync: readFileSyncB } = await import('fs');
        const { join: joinB } = await import('path');
        const priceDataB: { sku: string; price: number }[] = JSON.parse(readFileSyncB(joinB(process.cwd(), 'server/priceMigration20260711b.json'), 'utf8'));
        const valuesList = priceDataB.map(r => `('${r.sku.replace(/'/g, "''")}', ${r.price})`).join(',');
        await migPool.query(`
          UPDATE supplies AS s
          SET price = v.new_price::numeric, updated_at = NOW()
          FROM (VALUES ${valuesList}) AS v(sku, new_price)
          WHERE s.sku = v.sku
        `);
        await migPool.query(`INSERT INTO data_migrations (key) VALUES ('price_sync_20260711b')`);
        log(`Price sync B migration applied: ${priceDataB.length} items processed`);
      } catch (priceBErr: any) {
        console.error('Price sync B migration error (non-fatal):', priceBErr.message);
      }
    }

    // One-time supply insert from POS export (07/11/2026 batch B) — 68 missing items
    const { rows: insertBRan } = await migPool.query(`SELECT 1 FROM data_migrations WHERE key = 'supply_insert_20260711b'`);
    if (insertBRan.length === 0) {
      try {
        const { readFileSync: readFileSyncC } = await import('fs');
        const { join: joinC } = await import('path');
        const supplyDataB: any[] = JSON.parse(readFileSyncC(joinC(process.cwd(), 'server/supplyInsertMigration20260711b.json'), 'utf8'));
        await migPool.query(`SELECT setval('supplies_id_seq', (SELECT MAX(id) FROM supplies))`);
        for (const r of supplyDataB) {
          await migPool.query(`
            INSERT INTO supplies (name, category, brand, price, description, stock_quantity, size, sku, upc, is_active, filter_type, color, style)
            SELECT $1,$2,$3,$4,$5,$6,$7,$8::text,$9,true,$10,$11,$12
            WHERE NOT EXISTS (SELECT 1 FROM supplies WHERE sku = $8::text)
          `, [r.name, r.category, r.brand, r.price, r.description, r.stock_quantity,
              r.size || null, r.sku || null, r.upc || null, r.filter_type, r.color || null, r.style || null]);
        }
        await migPool.query(`INSERT INTO data_migrations (key) VALUES ('supply_insert_20260711b')`);
        log(`Supply insert B migration applied: ${supplyDataB.length} items processed`);
      } catch (insertBErr: any) {
        console.error('Supply insert B migration error (non-fatal):', insertBErr.message);
      }
    }

    // One-time fix: batch A category display names were set to filter_type values instead of display names
    const { rows: catFixRan } = await migPool.query(`SELECT 1 FROM data_migrations WHERE key = 'category_fix_20260711a'`);
    if (catFixRan.length === 0) {
      try {
        await migPool.query(`
          UPDATE supplies SET category = 'Dog Food'   WHERE category = 'dogFood';
          UPDATE supplies SET category = 'Dog Treats' WHERE category = 'dogTreats';
          UPDATE supplies SET category = 'Cat Food'   WHERE category = 'catFood';
          UPDATE supplies SET category = 'Cat Treats' WHERE category = 'catTreats';
          UPDATE supplies SET category = 'Dog Supplies' WHERE category = 'dogSupplies';
          UPDATE supplies SET category = 'Cat Supplies' WHERE category = 'catSupplies';
          UPDATE supplies SET category = 'Fish'       WHERE category = 'fish';
          UPDATE supplies SET category = 'Bird'       WHERE category = 'bird';
          UPDATE supplies SET category = 'Small Animal' WHERE category = 'smallAnimal';
          UPDATE supplies SET category = 'Reptile'    WHERE category = 'reptile';
        `);
        await migPool.query(`INSERT INTO data_migrations (key) VALUES ('category_fix_20260711a')`);
        log('Category display name fix migration applied');
      } catch (catFixErr: any) {
        console.error('Category fix migration error (non-fatal):', catFixErr.message);
      }
    }

    // One-time fix: batch C aquatics items had filter_type='fish' and undifferentiated category
    const { rows: aquaticFixRan } = await migPool.query(`SELECT 1 FROM data_migrations WHERE key = 'aquatic_category_fix_20260711'`);
    if (aquaticFixRan.length === 0) {
      try {
        const foodSkus = ['042055335515','042055222150','015561165754','042055310901','698220011717','042055319201','698220700192','000945880286','042055305204','000945880842','042055044110','042055043113','698220833319','046798164821','046798783015','036274008626','036274008510','036274008527','036274008534','046798165071','000945880859','046798164562','036274008619','698220834316','042055301701'];
        const skuList = foodSkus.map(s => `'${s}'`).join(',');
        // Fix food items: category=FishFood, filter_type=aquatic
        await migPool.query(`
          UPDATE supplies SET category = 'FishFood', filter_type = 'aquatic'
          WHERE sku IN (${skuList})
        `);
        // Fix supply items: category=aquatics, filter_type=aquatic (all batch C non-food)
        await migPool.query(`
          UPDATE supplies SET category = 'aquatics', filter_type = 'aquatic'
          WHERE filter_type = 'fish' AND sku NOT IN (${skuList})
        `);
        await migPool.query(`INSERT INTO data_migrations (key) VALUES ('aquatic_category_fix_20260711')`);
        log('Aquatic category fix migration applied');
      } catch (aquaticFixErr: any) {
        console.error('Aquatic category fix migration error (non-fatal):', aquaticFixErr.message);
      }
    }

    // One-time price sync from POS export (07/11/2026 batch C — Aquatics)
    const { rows: priceCRan } = await migPool.query(`SELECT 1 FROM data_migrations WHERE key = 'price_sync_20260711c'`);
    if (priceCRan.length === 0) {
      try {
        const { readFileSync: readFileSyncD } = await import('fs');
        const { join: joinD } = await import('path');
        const priceDataC: { sku: string; price: number }[] = JSON.parse(readFileSyncD(joinD(process.cwd(), 'server/priceMigration20260711c.json'), 'utf8'));
        const valuesList = priceDataC.map(r => `('${r.sku.replace(/'/g, "''")}', ${r.price})`).join(',');
        await migPool.query(`
          UPDATE supplies AS s
          SET price = v.new_price::numeric, updated_at = NOW()
          FROM (VALUES ${valuesList}) AS v(sku, new_price)
          WHERE s.sku = v.sku
        `);
        await migPool.query(`INSERT INTO data_migrations (key) VALUES ('price_sync_20260711c')`);
        log(`Price sync C migration applied: ${priceDataC.length} items processed`);
      } catch (priceCErr: any) {
        console.error('Price sync C migration error (non-fatal):', priceCErr.message);
      }
    }

    // One-time supply insert from POS export (07/11/2026 batch C — Aquatics) — 333 missing items
    const { rows: insertCRan } = await migPool.query(`SELECT 1 FROM data_migrations WHERE key = 'supply_insert_20260711c'`);
    if (insertCRan.length === 0) {
      try {
        const { readFileSync: readFileSyncE } = await import('fs');
        const { join: joinE } = await import('path');
        const supplyDataC: any[] = JSON.parse(readFileSyncE(joinE(process.cwd(), 'server/supplyInsertMigration20260711c.json'), 'utf8'));
        await migPool.query(`SELECT setval('supplies_id_seq', (SELECT MAX(id) FROM supplies))`);
        for (const r of supplyDataC) {
          await migPool.query(`
            INSERT INTO supplies (name, category, brand, price, description, stock_quantity, size, sku, upc, is_active, filter_type, color, style)
            SELECT $1,$2,$3,$4,$5,$6,$7,$8::text,$9,true,$10,$11,$12
            WHERE NOT EXISTS (SELECT 1 FROM supplies WHERE sku = $8::text)
          `, [r.name, r.category, r.brand, r.price, r.description, r.stock_quantity,
              r.size || null, r.sku || null, r.upc || null, r.filter_type, r.color || null, r.style || null]);
        }
        await migPool.query(`INSERT INTO data_migrations (key) VALUES ('supply_insert_20260711c')`);
        log(`Supply insert C migration applied: ${supplyDataC.length} items processed`);
      } catch (insertCErr: any) {
        console.error('Supply insert C migration error (non-fatal):', insertCErr.message);
      }
    }

    // Fix appointments that have grooming_completed=true but ready_for_payment=false due to
    // the in-store payment auto-clear. Set ready_for_payment=true silently (no SMS) so the
    // card shows the correct "Clear" state instead of "Mark Ready".
    const { rows: apptFixRan } = await migPool.query(`SELECT 1 FROM data_migrations WHERE key = 'appt_ready_fix_20260711'`);
    if (!apptFixRan.length) {
      try {
        const result = await migPool.query(`
          UPDATE appointments
          SET ready_for_payment = true, updated_at = NOW()
          WHERE grooming_completed = true
            AND is_paid = true
            AND paid_online = false
            AND ready_for_payment = false
        `);
        await migPool.query(`INSERT INTO data_migrations (key) VALUES ('appt_ready_fix_20260711')`);
        log(`Appointment ready fix applied: ${result.rowCount} appointments corrected`);
      } catch (apptFixErr: any) {
        console.error('Appointment ready fix migration error (non-fatal):', apptFixErr.message);
      }
    }

    // Fix filter_type mismatches across all categories from fish batch bleed-over
    const { rows: filterFixRan } = await migPool.query(`SELECT 1 FROM data_migrations WHERE key = 'filter_type_fix_20260711'`);
    if (!filterFixRan.length) {
      try {
        // 1. Fish-flavored Dog Food incorrectly tagged aquatic → dogFood
        const r1 = await migPool.query(`UPDATE supplies SET filter_type = 'dogFood', updated_at = NOW() WHERE category = 'Dog Food' AND filter_type = 'aquatic'`);
        // 2. Fish-flavored Cat Food incorrectly tagged aquatic → catFood
        const r2 = await migPool.query(`UPDATE supplies SET filter_type = 'catFood', updated_at = NOW() WHERE category = 'Cat Food' AND filter_type = 'aquatic'`);
        // 3. Dog Treats with fish themes tagged aquatic → null (matches all other dog treats)
        const r3 = await migPool.query(`UPDATE supplies SET filter_type = NULL, updated_at = NOW() WHERE category = 'Dog Treats' AND filter_type = 'aquatic'`);
        // 4. Cat Treats with fish themes tagged aquatic → null
        const r4 = await migPool.query(`UPDATE supplies SET filter_type = NULL, updated_at = NOW() WHERE category = 'Cat Treats' AND filter_type = 'aquatic'`);
        // 5. Reptile products (turtles, hermit crabs) tagged aquatic → reptile
        const r5 = await migPool.query(`UPDATE supplies SET filter_type = 'reptile', updated_at = NOW() WHERE category = 'reptiles' AND filter_type = 'aquatic'`);
        // 6. Cat/dog toys with fish themes tagged aquatic → null
        const r6 = await migPool.query(`UPDATE supplies SET filter_type = NULL, updated_at = NOW() WHERE category = 'toys' AND filter_type = 'aquatic'`);
        // 7. Accessories (cat dishes, bowls) with fish themes tagged aquatic → null
        const r7 = await migPool.query(`UPDATE supplies SET filter_type = NULL, updated_at = NOW() WHERE category = 'accessories' AND filter_type = 'aquatic'`);
        // 8. Bird supplies tagged aquatic → null
        const r8 = await migPool.query(`UPDATE supplies SET filter_type = NULL, updated_at = NOW() WHERE category = 'birdSupplies' AND filter_type = 'aquatic'`);
        // 9. Leashes/collars tagged aquatic → null
        const r9 = await migPool.query(`UPDATE supplies SET filter_type = NULL, updated_at = NOW() WHERE category = 'leashesAndCollars' AND filter_type = 'aquatic'`);
        // 10. Aquatics items mistakenly tagged smallanimal → aquatic
        const r10 = await migPool.query(`UPDATE supplies SET filter_type = 'aquatic', updated_at = NOW() WHERE category = 'aquatics' AND filter_type = 'smallanimal'`);
        // 11. Single aquatics item tagged reptile (Fluval Red Lizard Tail Plant is an aquarium plant) → aquatic
        const r11 = await migPool.query(`UPDATE supplies SET filter_type = 'aquatic', updated_at = NOW() WHERE category = 'aquatics' AND filter_type = 'reptile'`);
        // 12. (Problem 6) All remaining aquatics items with no filter_type → aquatic
        const r12 = await migPool.query(`UPDATE supplies SET filter_type = 'aquatic', updated_at = NOW() WHERE category = 'aquatics' AND (filter_type IS NULL OR filter_type = '')`);

        await migPool.query(`INSERT INTO data_migrations (key) VALUES ('filter_type_fix_20260711')`);
        log(`Filter type fix applied — Dog Food: ${r1.rowCount}, Cat Food: ${r2.rowCount}, Dog Treats: ${r3.rowCount}, Cat Treats: ${r4.rowCount}, Reptiles: ${r5.rowCount}, Toys: ${r6.rowCount}, Accessories: ${r7.rowCount}, Bird: ${r8.rowCount}, Leashes: ${r9.rowCount}, Aquatics←smallanimal: ${r10.rowCount}, Aquatics←reptile: ${r11.rowCount}, Aquatics missing tag: ${r12.rowCount}`);
      } catch (filterFixErr: any) {
        console.error('Filter type fix migration error (non-fatal):', filterFixErr.message);
      }
    }

    // Fix miscategorized items: treats/Treats → Dog Treats/Cat Treats, food → Dog Food/Dog Treats, etc.
    const { rows: catFixRan2 } = await migPool.query(`SELECT 1 FROM data_migrations WHERE key = 'category_name_fix_20260712'`);
    if (!catFixRan2.length) {
      try {
        // --- Specific items that are NOT dog treats despite being in treats/Treats ---
        // Cat treats (Inaba Churu, Greenies Feline, Icelandic for Cats, Loving Pets Cat, Tiki Cat)
        const c1 = await migPool.query(`UPDATE supplies SET category='Cat Treats', updated_at=NOW() WHERE id IN (7772,7680,7677,7773,7678,7679,7681,7683,9666,9519,7816,7817,9668,9521)`);
        // KONG dog toys accidentally in treats
        const c2 = await migPool.query(`UPDATE supplies SET category='toys', updated_at=NOW() WHERE id IN (9581,9585)`);
        // Dog bowl in treats (Penn-Plax/Loving Pets Classic Dog Bowl)
        const c3 = await migPool.query(`UPDATE supplies SET category='accessories', updated_at=NOW() WHERE id=9650`);
        // Guinea pig treat in treats (Tiny Friends Farm)
        const c4 = await migPool.query(`UPDATE supplies SET category='smallanimal', updated_at=NOW() WHERE id=9676`);
        // --- Bulk move all remaining treats/Treats → Dog Treats ---
        const c5 = await migPool.query(`UPDATE supplies SET category='Dog Treats', updated_at=NOW() WHERE category IN ('treats','Treats')`);
        // --- food category: sort into Dog Food vs Dog Treats ---
        const c6 = await migPool.query(`UPDATE supplies SET category='Dog Food', updated_at=NOW() WHERE id IN (7761,7762,9208)`); // Eukanuba, Orijen
        const c7 = await migPool.query(`UPDATE supplies SET category='Dog Treats', updated_at=NOW() WHERE id IN (7396,7393)`);    // Dogswell jerky, Nylabone edibles
        // --- leashes → leashesAndCollars ---
        const c8 = await migPool.query(`UPDATE supplies SET category='leashesAndCollars', updated_at=NOW() WHERE category='leashes'`);
        // --- ReptileFood → reptiles ---
        const c9 = await migPool.query(`UPDATE supplies SET category='reptiles', updated_at=NOW() WHERE category='ReptileFood'`);
        // --- Cross-species fixes inside DogFoodCan/CatFoodCan ---
        // Catit Kitten Chicken Entrée 3oz is cat food, not dog
        const c10 = await migPool.query(`UPDATE supplies SET category='CatFoodCan', updated_at=NOW() WHERE id=9215`);
        // Inaba Dashi Delights Cat Treats is a treat, not can food
        const c11 = await migPool.query(`UPDATE supplies SET category='Cat Treats', updated_at=NOW() WHERE id=9532`);
        // --- Confirmed misplacements found in aquatics scan ---
        // "Medium Marshall & Sandcastle" is actually Bird Life™ 5-Step Ladder (UPC 030172902109)
        // Wrong name, wrong description, wrong category — fix all three
        const c12 = await migPool.query(`UPDATE supplies SET category='birdSupplies', name='Bird Life™ 5-Step Ladder', description='Bird Life™ 5-Step Ladder Bird Accessory', updated_at=NOW() WHERE id=5330`);
        // Dogo's Ice Cream Pumpkin: Dog-O's is a dog treat brand, description confirms it's a treat
        const c13 = await migPool.query(`UPDATE supplies SET category='Dog Treats', updated_at=NOW() WHERE id=6938`);
        // Fluker's Pothos Repta-Vines: description says "perfect addition to any terrarium" → reptiles
        const c14 = await migPool.query(`UPDATE supplies SET category='reptiles', updated_at=NOW() WHERE id=9594`);

        await migPool.query(`INSERT INTO data_migrations (key) VALUES ('category_name_fix_20260712')`);
        log(`Category name fix: CatTreats=${c1.rowCount}, ToysFromTreats=${c2.rowCount}, AccessoriesFromTreats=${c3.rowCount}, SmallAnimalFromTreats=${c4.rowCount}, DogTreats(bulk)=${c5.rowCount}, DogFood(food)=${c6.rowCount}, DogTreats(food)=${c7.rowCount}, Leashes=${c8.rowCount}, ReptileFood=${c9.rowCount}, CatFoodCanFix=${c10.rowCount}, InabaTreatFix=${c11.rowCount}, FerretFromAquatics=${c12.rowCount}, DogTreatFromAquatics=${c13.rowCount}, ReptileFromAquatics=${c14.rowCount}`);
      } catch (catFixErr2: any) {
        console.error('Category name fix migration error (non-fatal):', catFixErr2.message);
      }
    }

    // ── Comprehensive category fixes ──────────────────────────────────────────
    const comprehensiveCheck = await migPool.query(`SELECT key FROM data_migrations WHERE key='comprehensive_category_fix_20260712'`);
    if (comprehensiveCheck.rowCount === 0) {
      try {
        // Add catCages to supply_categories
        await migPool.query(`INSERT INTO supply_categories (key, label) VALUES ('catCages','Cat Cages') ON CONFLICT (key) DO NOTHING`);

        // Dog Food → other correct categories
        await migPool.query(`UPDATE supplies SET category='catFood', updated_at=NOW() WHERE id IN (6760,9173,6783)`);
        await migPool.query(`UPDATE supplies SET category='dogTreats', updated_at=NOW() WHERE id IN (4757,6452,6453,6454)`);
        await migPool.query(`UPDATE supplies SET category='birdSupplies', updated_at=NOW() WHERE id=1227`);

        // Cat Food → other correct categories
        await migPool.query(`UPDATE supplies SET category='dogFood', updated_at=NOW() WHERE id IN (9206,6330)`);
        await migPool.query(`UPDATE supplies SET category='catTreats', updated_at=NOW() WHERE id IN (9833,9832)`);

        // Accessories → other correct categories
        await migPool.query(`UPDATE supplies SET category='healthcare', updated_at=NOW() WHERE id IN (9385,1454)`);
        await migPool.query(`UPDATE supplies SET category='catTreats', updated_at=NOW() WHERE id=6828`);
        await migPool.query(`UPDATE supplies SET category='reptiles', updated_at=NOW() WHERE id IN (9684,9686)`);

        // Healthcare → other correct categories
        await migPool.query(`UPDATE supplies SET category='birdSupplies', updated_at=NOW() WHERE id IN (946,950)`);
        await migPool.query(`UPDATE supplies SET category='dogFood', updated_at=NOW() WHERE id=7551`);
        await migPool.query(`UPDATE supplies SET category='healthcare', updated_at=NOW() WHERE id=7422`);

        // smallanimal → other correct categories
        await migPool.query(`UPDATE supplies SET category='catFood', updated_at=NOW() WHERE id=4177`);
        await migPool.query(`UPDATE supplies SET category='toys', updated_at=NOW() WHERE id=2816`);

        // dogCages: Catit cat carriers → catCages, Prevue bird carrier → accessories
        await migPool.query(`UPDATE supplies SET category='catCages', updated_at=NOW() WHERE id IN (6029,6030,6031,6032,6033,6034,9252,9253)`);
        await migPool.query(`UPDATE supplies SET category='accessories', updated_at=NOW() WHERE id=6018`);

        // Blank category → correct categories
        await migPool.query(`UPDATE supplies SET category='birdSupplies', updated_at=NOW() WHERE id=9632`);
        await migPool.query(`UPDATE supplies SET category='smallAnimalSupplies', updated_at=NOW() WHERE id IN (9658,9596,9517)`);
        await migPool.query(`UPDATE supplies SET category='toys', updated_at=NOW() WHERE id IN (9640,9580)`);
        await migPool.query(`UPDATE supplies SET category='reptiles', updated_at=NOW() WHERE id IN (9460,9464,9462,9474,9475)`);
        await migPool.query(`UPDATE supplies SET category='healthcare', updated_at=NOW() WHERE id IN (9643,9589,9695)`);
        await migPool.query(`UPDATE supplies SET category='dogTreats', updated_at=NOW() WHERE id IN (9638,9454,9645)`);
        await migPool.query(`UPDATE supplies SET category='accessories', updated_at=NOW() WHERE id IN (9444,9452,9574)`);
        await migPool.query(`UPDATE supplies SET category='aquatics', updated_at=NOW() WHERE id IN (9628,9620,9621,9622)`);
        await migPool.query(`UPDATE supplies SET category='FishFood', updated_at=NOW() WHERE id=9459`);
        await migPool.query(`UPDATE supplies SET category='leashesAndCollars', updated_at=NOW() WHERE id=9793`);

        // Housekeeping: merge duplicate-cased categories
        await migPool.query(`UPDATE supplies SET category='accessories', updated_at=NOW() WHERE id IN (4930,4916,4912,4927,4907,4913,4909,4893)`);
        await migPool.query(`UPDATE supplies SET category='toys', updated_at=NOW() WHERE id IN (9817,9816,9818,9819)`);
        await migPool.query(`UPDATE supplies SET category='smallAnimalSupplies', updated_at=NOW() WHERE id=9481`);

        // Pet food key fix: 'Dog Food'/'Cat Food' (display names) → 'dogFood'/'catFood' (API keys)
        // Storage layer queries dogFood/catFood; without this fix the Pet Food section shows 0 items
        const pf1 = await migPool.query(`UPDATE supplies SET category='dogFood', updated_at=NOW() WHERE category='Dog Food'`);
        const pf2 = await migPool.query(`UPDATE supplies SET category='catFood', updated_at=NOW() WHERE category='Cat Food'`);

        await migPool.query(`INSERT INTO data_migrations (key) VALUES ('comprehensive_category_fix_20260712')`);
        log(`Comprehensive category fix complete. DogFood renamed=${pf1.rowCount}, CatFood renamed=${pf2.rowCount}`);
      } catch (compErr: any) {
        console.error('Comprehensive category fix migration error (non-fatal):', compErr.message);
      }
    }

    // Fix misc healthcare misfits (bird food, dog food, aquatics, toys, accessories)
    const healthcareMisfitCheck = await migPool.query(`SELECT key FROM data_migrations WHERE key='healthcare_misfit_fix_20260712'`);
    if (healthcareMisfitCheck.rowCount === 0) {
      try {
        // Bird food items (Hagen hand-feeding, Higgins parakeet, Kaylor Sweet Harvest) → birdSupplies
        const hm1 = await migPool.query(`UPDATE supplies SET category='birdSupplies', updated_at=NOW() WHERE id IN (1133,1134,1135,1144,1145,1146,1147,1148,1224,1393)`);
        // Natural Balance Ultra Protein 5lb → dogFood
        const hm2 = await migPool.query(`UPDATE supplies SET category='dogFood', updated_at=NOW() WHERE id = 9589`);
        // Aquatic items (Bio-Substrate, Fluval Betta Cleaner) → aquatics
        const hm3 = await migPool.query(`UPDATE supplies SET category='aquatics', updated_at=NOW() WHERE id IN (9695,9643)`);
        // Cat/dog toys → toys
        const hm4 = await migPool.query(`UPDATE supplies SET category='toys', updated_at=NOW() WHERE id IN (835,2748,2749)`);
        // Accessories (Titan tie-out, Petmate rake & pan, SodaPup ebowl) → accessories
        const hm5 = await migPool.query(`UPDATE supplies SET category='accessories', updated_at=NOW() WHERE id IN (1735,1832,1606)`);
        // Penn-Plax small animal cage combo → smallanimal
        const hm6 = await migPool.query(`UPDATE supplies SET category='smallanimal', updated_at=NOW() WHERE id = 2287`);
        await migPool.query(`INSERT INTO data_migrations (key) VALUES ('healthcare_misfit_fix_20260712')`);
        log(`Healthcare misfit fix: bird=${hm1.rowCount}, dogFood=${hm2.rowCount}, aquatics=${hm3.rowCount}, toys=${hm4.rowCount}, accessories=${hm5.rowCount}, smallanimal=${hm6.rowCount}`);
      } catch (hmErr: any) {
        console.error('Healthcare misfit fix migration error (non-fatal):', hmErr.message);
      }
    }

    // Move Greenies Pill Pockets out of healthcare → correct treat category
    const pillPocketCheck = await migPool.query(`SELECT key FROM data_migrations WHERE key='pill_pocket_fix_20260712'`);
    if (pillPocketCheck.rowCount === 0) {
      try {
        const pp1 = await migPool.query(`
          UPDATE supplies SET category='catTreats', updated_at=NOW()
          WHERE category='healthcare' AND LOWER(name) LIKE '%pill pocket%'
          AND (LOWER(name) LIKE '%feline%' OR LOWER(name) LIKE '%cat%')
        `);
        const pp2 = await migPool.query(`
          UPDATE supplies SET category='dogTreats', updated_at=NOW()
          WHERE category='healthcare' AND LOWER(name) LIKE '%pill pocket%'
        `);
        await migPool.query(`INSERT INTO data_migrations (key) VALUES ('pill_pocket_fix_20260712')`);
        log(`Pill Pocket fix: moved ${pp1.rowCount} cat + ${pp2.rowCount} dog pill pockets from healthcare → treats`);
      } catch (ppErr: any) {
        console.error('Pill Pocket fix migration error (non-fatal):', ppErr.message);
      }
    }

    // Move training/wee-wee pads out of beds → accessories
    const bedsPadCheck = await migPool.query(`SELECT key FROM data_migrations WHERE key='beds_pad_fix_20260712'`);
    if (bedsPadCheck.rowCount === 0) {
      try {
        const bp = await migPool.query(`
          UPDATE supplies SET category='accessories', updated_at=NOW()
          WHERE category='beds' AND (
            LOWER(name) LIKE '%training pad%'
            OR LOWER(name) LIKE '%wee-wee%'
            OR LOWER(name) LIKE '%wee wee%'
            OR LOWER(name) LIKE '%pee pad%'
            OR LOWER(name) LIKE '%puppy pad%'
          )
        `);
        await migPool.query(`INSERT INTO data_migrations (key) VALUES ('beds_pad_fix_20260712')`);
        log(`Beds pad fix: moved ${bp.rowCount} training/wee-wee pad items from beds → accessories`);
      } catch (bedsPadErr: any) {
        console.error('Beds pad fix migration error (non-fatal):', bedsPadErr.message);
      }
    }

    // Move 4 confirmed non-reptile items out of reptiles → aquatics
    const reptileAquaticCheck = await migPool.query(`SELECT key FROM data_migrations WHERE key='reptile_aquatic_fix_20260712'`);
    if (reptileAquaticCheck.rowCount === 0) {
      try {
        const r1 = await migPool.query(`
          UPDATE supplies SET category='aquatics', updated_at=NOW()
          WHERE id IN (9293, 7252, 9363, 5311)
        `);
        await migPool.query(`INSERT INTO data_migrations (key) VALUES ('reptile_aquatic_fix_20260712')`);
        log(`Reptile→aquatic fix: moved ${r1.rowCount} items (Active Betta Water, Zoo Med Betta Lounge, Marina Filter Cartridge, Swimming Sea Turtle)`);
      } catch (reptileAquaticErr: any) {
        console.error('Reptile→aquatic fix migration error (non-fatal):', reptileAquaticErr.message);
      }
    }

    // Fix treat category keys: 'Dog Treats' / 'Cat Treats' (display names) → 'dogTreats' / 'catTreats' (API keys)
    // The previous migration wrote display names; the storage layer queries by camelCase keys.
    const treatKeyCheck = await migPool.query(`SELECT key FROM data_migrations WHERE key='treat_key_fix_20260712'`);
    if (treatKeyCheck.rowCount === 0) {
      try {
        const t1 = await migPool.query(`UPDATE supplies SET category='dogTreats', updated_at=NOW() WHERE category='Dog Treats'`);
        const t2 = await migPool.query(`UPDATE supplies SET category='catTreats', updated_at=NOW() WHERE category='Cat Treats'`);
        await migPool.query(`INSERT INTO data_migrations (key) VALUES ('treat_key_fix_20260712')`);
        log(`Treat key fix: DogTreats=${t1.rowCount}, CatTreats=${t2.rowCount}`);
      } catch (treatKeyErr: any) {
        console.error('Treat key fix migration error (non-fatal):', treatKeyErr.message);
      }
    }

    // Fix Redbarn dog food items miscategorized as dogTreats/other — stews and recipes are dogFood
    const redbarnFoodCheck = await migPool.query(`SELECT key FROM data_migrations WHERE key='redbarn_dogfood_fix_20260716'`);
    if (redbarnFoodCheck.rowCount === 0) {
      try {
        const rb = await migPool.query(`
          UPDATE supplies SET category='dogFood', updated_at=NOW()
          WHERE (
            LOWER(brand) ILIKE '%redbarn%'
            OR LOWER(brand) ILIKE '%red barn%'
          )
          AND category NOT IN ('dogFood', 'catFood')
          AND LOWER(name) NOT LIKE '%bully%'
          AND LOWER(name) NOT LIKE '%collagen%'
          AND LOWER(name) NOT LIKE '%chew%'
          AND LOWER(name) NOT LIKE '%tendon%'
          AND LOWER(name) NOT LIKE '%ear%'
          AND LOWER(name) NOT LIKE '%esophagus%'
          AND LOWER(name) NOT LIKE '%tripe%'
          AND LOWER(name) NOT LIKE '%puff%'
          AND LOWER(name) NOT LIKE '%cat %'
          AND LOWER(name) NOT LIKE '% cat%'
        `);
        await migPool.query(`INSERT INTO data_migrations (key) VALUES ('redbarn_dogfood_fix_20260716')`);
        log(`Redbarn dogFood fix: moved ${rb.rowCount} Redbarn food items to dogFood`);
      } catch (redbarnErr: any) {
        console.error('Redbarn dogFood fix migration error (non-fatal):', redbarnErr.message);
      }
    }

    // Price sync from POS export (07/20/2026) — 4300 items updated by ID
    const { rows: price20Ran } = await migPool.query(`SELECT 1 FROM data_migrations WHERE key = 'price_sync_20260720'`);
    if (price20Ran.length === 0) {
      try {
        const { readFileSync: rfs20 } = await import('fs');
        const { join: j20 } = await import('path');
        const priceData20: { id: number; price: number }[] = JSON.parse(rfs20(j20(process.cwd(), 'server/priceMigration20260720.json'), 'utf8'));
        const BATCH = 500;
        let totalUpdated = 0;
        for (let i = 0; i < priceData20.length; i += BATCH) {
          const chunk = priceData20.slice(i, i + BATCH);
          const ids = chunk.map(r => r.id).join(',');
          const caseLines = chunk.map(r => `WHEN id = ${r.id} THEN ${r.price}`).join(' ');
          await migPool.query(`UPDATE supplies SET price = CASE ${caseLines} ELSE price END, updated_at = NOW() WHERE id IN (${ids})`);
          totalUpdated += chunk.length;
        }
        await migPool.query(`INSERT INTO data_migrations (key) VALUES ('price_sync_20260720')`);
        log(`Price sync 20260720: ${totalUpdated} items updated`);
      } catch (price20Err: any) {
        console.error('Price sync 20260720 migration error (non-fatal):', price20Err.message);
      }
    }

    // SKU dedup fix (07/20/2026) — DELETE items with misassigned SKUs; correct items will be re-imported from POS
    const { rows: skuClearRan } = await migPool.query(`SELECT 1 FROM data_migrations WHERE key = 'sku_clear_20260720'`);
    if (skuClearRan.length === 0) {
      try {
        const { readFileSync: rfsSkuClear } = await import('fs');
        const { join: jSkuClear } = await import('path');
        const clearIds: number[] = JSON.parse(rfsSkuClear(jSkuClear(process.cwd(), 'server/skuClearMigration20260720.json'), 'utf8'));
        const idList = clearIds.join(',');
        const skuDeleteResult = await migPool.query(`DELETE FROM supplies WHERE id IN (${idList})`);
        await migPool.query(`INSERT INTO data_migrations (key) VALUES ('sku_clear_20260720')`);
        log(`SKU dedup fix 20260720: deleted ${skuDeleteResult.rowCount} misassigned items`);
      } catch (skuClearErr: any) {
        console.error('SKU dedup delete 20260720 migration error (non-fatal):', skuClearErr.message);
      }
    }

    // Duplicate / wrong-SKU delete (07/20/2026) — 478 items: cross-cat collisions, exact dups, variant losers
    const { rows: dupDelRan } = await migPool.query(`SELECT 1 FROM data_migrations WHERE key = 'dup_delete_20260720'`);
    if (dupDelRan.length === 0) {
      try {
        const { readFileSync: rfsDup } = await import('fs');
        const { join: jDup } = await import('path');
        const dupIds: number[] = JSON.parse(rfsDup(jDup(process.cwd(), 'server/dupDeleteMigration20260720.json'), 'utf8'));
        const dupIdList = dupIds.join(',');
        // Never delete items referenced in order history — skip those entirely
        const { rows: orderedRows } = await migPool.query(`SELECT DISTINCT supply_id FROM order_items WHERE supply_id IN (${dupIdList})`);
        const orderedIds = new Set(orderedRows.map((r: any) => r.supply_id));
        const safeIds = dupIds.filter(id => !orderedIds.has(id));
        if (safeIds.length > 0) {
          const safeIdList = safeIds.join(',');
          await migPool.query(`DELETE FROM cart_items WHERE supply_id IN (${safeIdList})`);
          const dupDelResult = await migPool.query(`DELETE FROM supplies WHERE id IN (${safeIdList})`);
          log(`Dup/wrong-SKU delete 20260720: deleted ${dupDelResult.rowCount} items, skipped ${orderedIds.size} with order history`);
        } else {
          log(`Dup/wrong-SKU delete 20260720: all items have order history, skipped deletion`);
        }
        await migPool.query(`INSERT INTO data_migrations (key) VALUES ('dup_delete_20260720')`);

      } catch (dupDelErr: any) {
        console.error('Dup delete 20260720 migration error (non-fatal):', dupDelErr.message);
      }
    }

    // New items insert from XLS (07/20/2026) — 1,588 items with stock > 0, not already in production
    const { rows: newItemsRan } = await migPool.query(`SELECT 1 FROM data_migrations WHERE key = 'new_items_20260720'`);
    if (newItemsRan.length === 0) {
      try {
        const { readFileSync: rfsNew } = await import('fs');
        const { join: jNew } = await import('path');
        const newItems: any[] = JSON.parse(rfsNew(jNew(process.cwd(), 'server/newItemsMigration20260720.json'), 'utf8'));
        await migPool.query(`SELECT setval('supplies_id_seq', (SELECT MAX(id) FROM supplies))`);
        let inserted = 0;
        for (const r of newItems) {
          const skuVal = r.sku || null;
          await migPool.query(`
            INSERT INTO supplies (name, brand, sku, upc, price, category, filter_type, stock_quantity, color, size, style, is_active, updated_at)
            SELECT $1,$2,$3::text,$4::text,$5,$6,$7,$8,$9,$10,$11,true,NOW()
            WHERE NOT EXISTS (SELECT 1 FROM supplies WHERE sku = $3::text AND $3::text IS NOT NULL)
          `, [
            r.name, r.brand || null,
            skuVal, skuVal,
            r.price, r.category, r.filter_type,
            r.stock_quantity,
            r.color || null, r.size || null, r.style || null
          ]);
          inserted++;
        }
        await migPool.query(`INSERT INTO data_migrations (key) VALUES ('new_items_20260720')`);
        log(`New items insert 20260720: processed ${inserted} items`);
      } catch (newItemsErr: any) {
        console.error('New items insert 20260720 migration error (non-fatal):', newItemsErr.message);
      }
    }

    const { rows: photoDupFixRan } = await migPool.query(`SELECT 1 FROM data_migrations WHERE key = 'photo_dup_fix_20260720'`);
    if (photoDupFixRan.length === 0) {
      try {
        const { readFileSync: rfsPhotoFix } = await import('fs');
        const { join: jPhotoFix } = await import('path');
        const photoFix: { toDelete: number[]; toClearSku: number[] } = JSON.parse(rfsPhotoFix(jPhotoFix(process.cwd(), 'server/photoDupFixMigration20260720.json'), 'utf8'));
        let deleted = 0;
        for (const id of photoFix.toDelete) {
          await migPool.query(`DELETE FROM supplies WHERE id = $1`, [id]);
          deleted++;
        }
        let cleared = 0;
        for (const id of photoFix.toClearSku) {
          await migPool.query(`UPDATE supplies SET sku = NULL, upc = NULL WHERE id = $1`, [id]);
          cleared++;
        }
        await migPool.query(`INSERT INTO data_migrations (key) VALUES ('photo_dup_fix_20260720')`);
        log(`Photo dup fix 20260720: deleted ${deleted} wrong-product entries, cleared SKU on ${cleared} real products`);
      } catch (photoFixErr: any) {
        console.error('Photo dup fix 20260720 migration error (non-fatal):', photoFixErr.message);
      }
    }

    await migPool.end();
    log('App migrations complete');
  } catch (err: any) {
    console.error('App migration error (non-fatal):', err.message);
  }
}

async function initializeApp() {
  try {
    log('Starting app initialization...');
    
    // Run app-level schema migrations
    await runAppMigrations();
    
    // Initialize Stripe
    await initStripe();
    
    // Dynamically import heavy modules
    const { registerRoutes } = await import('./routes');
    const { default: NotificationWebSocketServer } = await import('./websocket');
    const { initializeScheduledTasks } = await import('./scheduler');
    
    // Register all routes (this no longer creates server, just adds routes)
    await registerRoutes(app, server);
    
    // Seed legal pages if they don't exist
    await seedLegalPages();
    
    // Initialize WebSocket server
    const wsServer = new NotificationWebSocketServer(server);
    (global as any).wsServer = wsServer;
    
    // Defer scheduled tasks
    setImmediate(() => {
      initializeScheduledTasks();
    });

    // Error handler
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      if (!res.headersSent) {
        res.status(status).json({ message });
      }
      console.error('Error:', err);
    });
    
    // Setup Vite (dev) or static serving (prod)
    if (app.get("env") === "development") {
      const { setupVite } = await import('./vite');
      await setupVite(app, server);
    } else {
      const { serveStatic } = await import('./vite');
      
      // Explicitly serve the built frontend for all non-API routes
      // This ensures the root "/" and all SPA routes always resolve to index.html
      const distPublicPath = path.join(process.cwd(), 'dist/public');
      if (fs.existsSync(distPublicPath)) {
        const indexHtmlPath = path.join(distPublicPath, 'index.html');
        app.use(express.static(distPublicPath, { index: false }));
        // Use app.use() with no path — guaranteed catch-all in Express
        app.use((_req, res) => {
          res.sendFile(indexHtmlPath, (err) => {
            if (err) console.error('[initializeApp] sendFile error:', err.message);
          });
        });
        log(`Serving static files from: ${distPublicPath}`);
      } else {
        log(`WARNING: dist/public not found at ${distPublicPath}, falling back to serveStatic`);
        serveStatic(app);
      }
    }
    
    isFullyInitialized = true;
    log('Server fully initialized and ready');
  } catch (error) {
    console.error('Initialization error:', error);
    throw error;
  }
}
