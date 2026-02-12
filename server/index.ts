import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import path from "path";
import http from "http";
import * as fs from "fs";
import { runMigrations } from 'stripe-replit-sync';
import { getStripeSync } from './stripeClient';
import { WebhookHandlers } from './webhookHandlers';

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
const trustedOrigins = [
  `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`,
  `https://${process.env.REPL_SLUG}--${process.env.REPL_OWNER}.repl.co`,
  process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null,
  process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : null,
  'https://animal-house-pet-store.replit.app',
].filter(Boolean) as string[];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && trustedOrigins.some(trusted => origin.startsWith(trusted.replace(/\/$/, '')))) {
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
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self' https://js.stripe.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https: http:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.stripe.com https://merchant-ui-api.stripe.com wss: ws:",
      "frame-src https://js.stripe.com https://hooks.stripe.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '));
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
        return res.status(500).json({ error: 'Webhook processing error' });
      }

      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('Webhook error:', error.message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));
app.use(cookieParser());

// Serve static files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use('/stock-images', express.static(path.join(process.cwd(), 'attached_assets/stock_images')));

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

app.get('/manifest.json', (_req, res) => {
  res.sendFile(getPwaFilePath('manifest.json'));
});

app.get('/sw.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(getPwaFilePath('sw.js'));
});

app.get('/sitemap.xml', (_req, res) => {
  const domain = process.env.REPLIT_DOMAINS?.split(',')[0] || 'animalhouseexperience.replit.app';
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
    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
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

// Heavy initialization - runs AFTER server is already listening
async function initializeApp() {
  try {
    log('Starting app initialization...');
    
    // Initialize Stripe
    await initStripe();
    
    // Dynamically import heavy modules
    const { registerRoutes } = await import('./routes');
    const { default: NotificationWebSocketServer } = await import('./websocket');
    const { initializeScheduledTasks } = await import('./scheduler');
    
    // Register all routes (this no longer creates server, just adds routes)
    await registerRoutes(app, server);
    
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
      serveStatic(app);
    }
    
    isFullyInitialized = true;
    log('Server fully initialized and ready');
  } catch (error) {
    console.error('Initialization error:', error);
    throw error;
  }
}
