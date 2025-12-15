import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import path from "path";
import http from "http";

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

// Basic middleware (lightweight, no heavy imports)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(cookieParser());

// Serve static files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use('/stock-images', express.static(path.join(process.cwd(), 'attached_assets/stock_images')));

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
      if (capturedJsonResponse) {
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

// Heavy initialization - runs AFTER server is already listening
async function initializeApp() {
  try {
    log('Starting app initialization...');
    
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
