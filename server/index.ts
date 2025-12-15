import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import path from "path";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import NotificationWebSocketServer from "./websocket";
import { initializeScheduledTasks } from "./scheduler";

const app = express();
app.set("trust proxy", 1);

// Track initialization state for health checks
let isFullyInitialized = false;

// Immediate health check endpoint - responds before any heavy initialization
// This must be registered BEFORE any async middleware or database connections
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    ready: isFullyInitialized,
    timestamp: new Date().toISOString()
  });
});

// Enable CORS for cookies
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

// Serve uploaded images statically
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Serve stock images from attached_assets
app.use('/stock-images', express.static(path.join(process.cwd(), 'attached_assets/stock_images')));

// Add cache-busting headers for mobile devices
app.use((req, res, next) => {
  res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.header('Pragma', 'no-cache');
  res.header('Expires', '0');
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
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

(async () => {
  // Register routes - this creates the HTTP server
  const server = await registerRoutes(app);
  
  // ALWAYS serve the app on port 5000
  // Start listening IMMEDIATELY to pass health checks
  // (health check endpoint is already registered synchronously above)
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`Server listening on port ${port} - continuing initialization...`);
  });

  // Continue with remaining initialization asynchronously
  try {
    // Initialize WebSocket server for admin notifications
    const wsServer = new NotificationWebSocketServer(server);
    
    // Make WebSocket server available globally for notifications
    (global as any).wsServer = wsServer;

    // Initialize scheduled tasks (deferred)
    setImmediate(() => {
      initializeScheduledTasks();
    });

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      if (!res.headersSent) {
        res.status(status).json({ message });
      }
      console.error('Error:', err);
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // Mark as fully initialized
    isFullyInitialized = true;
    log(`Server fully initialized and ready`);
  } catch (error) {
    console.error('Failed to initialize server:', error);
  }
})();
