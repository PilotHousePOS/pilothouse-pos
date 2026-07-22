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
  const domain = process.env.REPLIT_DOMAINS?.split(',')[0] || 'pilothouse.app';
  const baseUrl = `https://${domain}`;
  const today = new Date().toISOString().split('T')[0];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${baseUrl}/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>${baseUrl}/supplies</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>
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
<p>PilotHouse ("we," "us," or "our"), located at 2934 Cypress St, West Monroe, LA 71291, is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our website and mobile application (the "Service").</p>

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
<p><strong>PilotHouse</strong><br/>2934 Cypress St<br/>West Monroe, LA 71291<br/>Phone: (318) 322-3023</p>`,
      });
      log('Seeded privacy-policy legal page');
    }
    
    if (!slugs.includes('terms-of-service')) {
      await storage.upsertLegalPage({
        slug: 'terms-of-service',
        title: 'Terms of Service',
        content: `<p class="text-xs text-gray-500">Last Updated: February 10, 2026</p>

<h2>1. Acceptance of Terms</h2>
<p>By accessing or using the PilotHouse website and mobile application (the "Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.</p>

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
<p>All content on the Service, including text, images, logos, and software, is the property of PilotHouse and is protected by applicable intellectual property laws. You may not reproduce, distribute, or create derivative works without our express written permission.</p>

<h2>9. Limitation of Liability</h2>
<p>PilotHouse shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service. Our total liability shall not exceed the amount you paid for the specific product or service giving rise to the claim.</p>

<h2>10. Disclaimer of Warranties</h2>
<p>The Service is provided "as is" without warranties of any kind. We do not guarantee that the Service will be uninterrupted, error-free, or free of harmful components.</p>

<h2>11. Governing Law</h2>
<p>These Terms shall be governed by the laws of the State of Louisiana. Any disputes shall be resolved in the courts of Ouachita Parish, Louisiana.</p>

<h2>12. Changes to Terms</h2>
<p>We reserve the right to modify these Terms at any time. Changes will be effective immediately upon posting. Your continued use of the Service constitutes acceptance of the modified Terms.</p>

<h2>13. Contact Us</h2>
<p>If you have questions about these Terms of Service, please contact us:</p>
<p><strong>PilotHouse</strong><br/>2934 Cypress St<br/>West Monroe, LA 71291<br/>Phone: (318) 322-3023</p>`,
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

    // Schema additions (idempotent — safe to run every startup)
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
    // Startup cleanup: remove zero-stock items from pending queue (POS tracker)
    await migPool.query(`DELETE FROM pos_pending_new_items WHERE pos_stock <= 0`);

    await migPool.query(`ALTER TABLE supplies ADD COLUMN IF NOT EXISTS reorder_point INTEGER DEFAULT 1`);
    await migPool.query(`ALTER TABLE appointment_history ADD COLUMN IF NOT EXISTS tenant_id integer REFERENCES tenants(id)`);
    await migPool.query(`UPDATE appointment_history SET tenant_id = 1 WHERE tenant_id IS NULL`);

    await migPool.query(`CREATE TABLE IF NOT EXISTS pos_orders (
      id SERIAL PRIMARY KEY,
      order_number VARCHAR(50),
      items JSONB NOT NULL DEFAULT '[]',
      subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
      tax NUMERIC(10,2) NOT NULL DEFAULT 0,
      total NUMERIC(10,2) NOT NULL DEFAULT 0,
      payment_method VARCHAR(20) NOT NULL,
      amount_tendered NUMERIC(10,2),
      change_due NUMERIC(10,2),
      cashier_id VARCHAR(100),
      notes TEXT,
      tenant_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )`);
    await migPool.query(`ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS tenant_id INTEGER`);

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
