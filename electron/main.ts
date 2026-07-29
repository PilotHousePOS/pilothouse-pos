// ─── PilotHouse POS — Electron Main Process ──────────────────────────────────
//
// Architecture: local static server (bundled frontend) + proxy + local store.
//
// HOW IT WORKS
//   1. A lightweight HTTP server starts on a random localhost port.
//   2. The BrowserWindow loads http://localhost:{port} — the app shell and all
//      assets are served from the bundled dist/public/ folder.  No internet
//      required to see the UI.
//   3. API requests (/api/*) are proxied to the remote PilotHouse server when
//      online.  Every successful GET response is written to the local store
//      (plain JSON files in Electron's userData directory).
//   4. When the remote server is unreachable the proxy returns the locally
//      cached response for GETs.  POSTs/PUTs/PATCHes are queued and replayed
//      automatically when the connection returns.
//   5. A background health-check loop (every 15 s) detects reconnection and
//      drains the pending-mutations queue in FIFO order.
//
// RESULT
//   • Cold-start offline: app loads instantly from disk; all previously-seen
//     data is available from the local cache.
//   • Offline writes: appointment updates, supply adjustments, etc. are queued
//     and synced on reconnect.  Cash POS sales use the existing IndexedDB queue.
//   • Card payments still require an internet connection (Stripe requirement).
//
// BUILD
//   npm run build:electron          → frontend + main + packaging
//   npm run build:electron:main     → TypeScript compile only
//
// DEV
//   npm run dev:electron            → Vite dev server + Electron side-by-side

import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import path  from 'path';
import http  from 'http';
import https from 'https';
import fs    from 'fs';
import net   from 'net';
import { SerialPort } from 'serialport';
import {
  cacheResponse,
  getCachedResponse,
  queueMutation,
  pendingMutationCount,
  popMutation,
  bumpMutationAttempts,
  getOldestMutations,
  type PendingMutation,
} from './local-store';

// ── Environment ──────────────────────────────────────────────────────────────

const isDev = !app.isPackaged || process.env.NODE_ENV === 'development';

/**
 * The remote PilotHouse server.  API calls are proxied here when online.
 * Set PILOTHOUSE_SERVER_URL at build time via electron-builder.yml `env` block.
 */
const REMOTE_URL: string =
  process.env.PILOTHOUSE_SERVER_URL ?? 'https://pilothouse.replit.app';

/**
 * Bundled React frontend directory.
 * dist/electron/main.js → __dirname = dist/electron/
 * dist/public/          → path.join(__dirname, '../public')
 * This resolves correctly in both dev and the packaged app.
 */
const STATIC_DIR = path.join(__dirname, '../public');

// ── MIME types ────────────────────────────────────────────────────────────────

const MIME: Record<string, string> = {
  '.html':  'text/html; charset=utf-8',
  '.js':    'application/javascript; charset=utf-8',
  '.mjs':   'application/javascript; charset=utf-8',
  '.css':   'text/css; charset=utf-8',
  '.json':  'application/json',
  '.png':   'image/png',
  '.jpg':   'image/jpeg',
  '.jpeg':  'image/jpeg',
  '.svg':   'image/svg+xml',
  '.ico':   'image/x-icon',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':   'font/ttf',
  '.webp':  'image/webp',
  '.map':   'application/json',
  '.txt':   'text/plain',
  '.xml':   'application/xml',
};

// ── Local static file server ──────────────────────────────────────────────────

let localPort = 0;

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const tmp = net.createServer();
    tmp.unref();
    tmp.on('error', reject);
    tmp.listen(0, '127.0.0.1', () => {
      const addr = tmp.address() as net.AddressInfo;
      tmp.close(() => resolve(addr.port));
    });
  });
}

/** Serve a static file, falling back to index.html for SPA client-side routes. */
function serveStatic(filePath: string, res: http.ServerResponse): void {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(STATIC_DIR, 'index.html'), (err2, html) => {
        if (err2) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(html);
      });
      return;
    }
    const ext         = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';
    const cacheCtrl   = filePath.includes('/assets/') || filePath.includes('\\assets\\')
      ? 'public, max-age=31536000, immutable'   // content-hashed assets — cache forever
      : 'no-cache';
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': cacheCtrl });
    res.end(data);
  });
}

// ── Proxy helpers ─────────────────────────────────────────────────────────────

/**
 * URL paths that must NEVER be queued as offline mutations.
 * Stripe payment operations and auth flows require a live server response.
 */
function shouldQueueMutation(urlPath: string): boolean {
  const p = urlPath.split('?')[0];
  return ![
    '/api/stripe/',
    '/api/auth/',
    '/api/pos/offline-sync',   // this IS the POS sale sync endpoint
  ].some(prefix => p.startsWith(prefix));
}

/** Keep only the headers that are safe and useful to replay with a mutation. */
function sanitiseReqHeaders(
  headers: http.IncomingHttpHeaders,
): Record<string, string> {
  const keep   = ['content-type', 'x-tenant-slug', 'cookie', 'authorization'];
  const result: Record<string, string> = {};
  for (const k of keep) {
    const v = headers[k];
    if (v) result[k] = Array.isArray(v) ? v.join(', ') : v;
  }
  return result;
}

/**
 * Rewrite Set-Cookie response headers so cookies bound to the remote domain
 * are accepted by the browser when the page is served from http://localhost.
 */
function rewriteCookies(
  srcHeaders: http.IncomingHttpHeaders,
): http.OutgoingHttpHeaders {
  const out: http.OutgoingHttpHeaders = {};
  for (const [k, v] of Object.entries(srcHeaders)) {
    if (k.toLowerCase() === 'set-cookie') {
      out[k] = (Array.isArray(v) ? v : [String(v)]).map(c =>
        c
          .replace(/;\s*Domain=[^;]+/gi, '')     // remove Domain= so cookie binds to localhost
          .replace(/;\s*Secure\b/gi,    '')       // remove Secure (localhost is http)
          .replace(/;\s*SameSite=[^;]+/gi, '; SameSite=Lax'),
      );
    } else {
      out[k] = v as string | string[];
    }
  }
  return out;
}

/**
 * Proxy a request to REMOTE_URL.
 *
 * The request body is fully buffered before the upstream request is made so
 * that (a) POST/PUT/PATCH bodies can be forwarded correctly and (b) failed
 * mutations can be queued verbatim for later replay.
 *
 * Successful GET responses (2xx) are cached in the local store.
 * Failed GETs are served from the local store if a cached copy exists.
 * Failed mutations are queued in the local store (unless excluded above).
 */
function proxyToRemote(
  req:     http.IncomingMessage,
  res:     http.ServerResponse,
  urlPath: string,
): void {
  const isGet = req.method === 'GET' || req.method === 'HEAD';

  // Collect the full request body first.  For GET/HEAD this is empty and the
  // 'end' event fires immediately after headers are received.
  const reqChunks: Buffer[] = [];
  req.on('data', c => reqChunks.push(c));
  req.on('end', () => {
    const reqBody = Buffer.concat(reqChunks);
    dispatchProxy(req, res, urlPath, reqBody, isGet);
  });
  req.on('error', () => {
    if (!res.headersSent) { res.writeHead(400); res.end(); }
  });
}

function dispatchProxy(
  req:     http.IncomingMessage,
  res:     http.ServerResponse,
  urlPath: string,
  reqBody: Buffer,
  isGet:   boolean,
): void {
  const target  = new URL(REMOTE_URL);
  const isHttps = target.protocol === 'https:';

  // Build forwarding headers
  const reqHeaders = { ...req.headers };
  delete reqHeaders['connection'];
  delete reqHeaders['transfer-encoding'];
  delete reqHeaders['host'];
  reqHeaders['host'] = target.hostname;
  if (reqBody.length > 0) reqHeaders['content-length'] = String(reqBody.length);

  const options: https.RequestOptions = {
    hostname: target.hostname,
    port:     isHttps ? 443 : (Number(target.port) || 80),
    path:     urlPath,
    method:   req.method,
    headers:  reqHeaders,
    timeout:  15000,
  };

  const mod = isHttps ? https : http;

  const proxyReq = (mod as typeof https).request(options, (proxyRes) => {
    // Buffer the response body so we can (a) cache it, (b) send it as one chunk.
    // For typical JSON API payloads this is a few KB — well within memory budget.
    const resChunks: Buffer[] = [];
    proxyRes.on('data', c => resChunks.push(c));
    proxyRes.on('end', () => {
      if (res.headersSent) return;
      const resBody    = Buffer.concat(resChunks);
      const resHeaders = rewriteCookies(proxyRes.headers);

      // ── Cache successful GET responses for offline use ──────────────────
      if (isGet && (proxyRes.statusCode ?? 0) >= 200 && (proxyRes.statusCode ?? 0) < 300) {
        cacheResponse(urlPath, {
          statusCode: proxyRes.statusCode!,
          headers:    resHeaders as Record<string, string | string[]>,
          body:       resBody.toString('utf8'),
          cachedAt:   Date.now(),
        });
      }

      res.writeHead(proxyRes.statusCode!, resHeaders);
      res.end(resBody);
    });
    proxyRes.on('error', () => {
      if (!res.headersSent) { res.writeHead(502); res.end(); }
    });
  });

  proxyReq.on('timeout', () => proxyReq.destroy());

  // ── Handle network failure (offline) ─────────────────────────────────────
  proxyReq.on('error', () => {
    if (res.headersSent) return;

    if (isGet) {
      // Serve from local cache if available
      const cached = getCachedResponse(urlPath);
      if (cached) {
        const offlineHeaders: http.OutgoingHttpHeaders = {
          ...cached.headers,
          'content-type':           'application/json',
          'x-pilothouse-cached':    '1',
          'x-pilothouse-cached-at': String(cached.cachedAt),
        };
        res.writeHead(cached.statusCode, offlineHeaders);
        res.end(cached.body);
      } else {
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ message: 'Server unreachable — no cached data available' }));
      }
    } else if (shouldQueueMutation(urlPath)) {
      // Queue the mutation; it will be replayed when the connection returns
      queueMutation({
        method:   req.method!,
        path:     urlPath,
        body:     reqBody.toString('utf8'),
        headers:  sanitiseReqHeaders(req.headers),
        queuedAt: Date.now(),
      });
      const count = pendingMutationCount();
      mainWindow?.webContents.send('store:mutation-queued', count);
      res.writeHead(202, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        message:      'Queued — will sync when internet returns',
        queued:       true,
        pendingCount: count,
      }));
    } else {
      // Non-queueable mutation (Stripe, auth) — return honest error
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ message: 'Server unreachable' }));
    }
  });

  // Send the (possibly buffered) request body
  proxyReq.end(reqBody.length > 0 ? reqBody : undefined);
}

// ── Start local HTTP server ───────────────────────────────────────────────────

/** URL paths that must always be proxied to the remote server. */
function shouldProxy(urlPath: string): boolean {
  return (
    urlPath.startsWith('/api/')            ||
    urlPath === '/health'                  ||
    urlPath === '/__health'                ||
    urlPath.startsWith('/uploads/')        ||
    urlPath.startsWith('/stock-images/')   ||
    urlPath.startsWith('/objects/')        ||
    urlPath.startsWith('/public-objects/')
  );
}

async function startLocalServer(): Promise<number> {
  const port = await getFreePort();

  const server = http.createServer((req, res) => {
    const rawUrl  = req.url || '/';
    const urlPath = rawUrl.split('?')[0];

    if (shouldProxy(rawUrl)) {
      proxyToRemote(req, res, rawUrl);
      return;
    }

    // Security: prevent path traversal
    const filePath = path.normalize(path.join(STATIC_DIR, urlPath === '/' ? 'index.html' : urlPath));
    if (!filePath.startsWith(STATIC_DIR)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }

    serveStatic(filePath, res);
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(port, '127.0.0.1', resolve);
    server.on('error', reject);
  });

  return port;
}

// ── Background health check + mutation drain ──────────────────────────────────

let wasServerReachable: boolean | null = null;
let drainInProgress = false;

/** Replay a single queued mutation against the remote server directly. */
function replayMutation(mut: PendingMutation): Promise<boolean> {
  return new Promise((resolve) => {
    const target  = new URL(REMOTE_URL);
    const isHttps = target.protocol === 'https:';
    const mod     = isHttps ? https : http;
    const body    = Buffer.from(mut.body, 'utf8');

    const headers: Record<string, string | number> = {
      ...mut.headers,
      host: target.hostname,
    };
    if (body.length > 0) headers['content-length'] = body.length;

    const proxyReq = (mod as typeof https).request(
      {
        hostname: target.hostname,
        port:     isHttps ? 443 : 80,
        path:     mut.path,
        method:   mut.method,
        headers,
        timeout:  10000,
      },
      (res) => {
        res.resume(); // drain without reading
        const ok = (res.statusCode ?? 500) < 500;
        resolve(ok);
      },
    );

    proxyReq.on('timeout', () => { proxyReq.destroy(); resolve(false); });
    proxyReq.on('error',   () => resolve(false));
    proxyReq.end(body.length > 0 ? body : undefined);
  });
}

/** Drain the pending-mutations queue in FIFO order. Stops on first network failure. */
async function drainPendingMutations(): Promise<void> {
  drainInProgress = true;
  let syncedCount = 0;

  try {
    const pending = getOldestMutations(50);
    for (const mut of pending) {
      const ok = await replayMutation(mut);
      if (ok) {
        popMutation(mut.id);
        syncedCount++;
      } else {
        bumpMutationAttempts(mut.id);
        // Drop after 3 failed attempts so the queue doesn't grow forever
        if (mut.attempts >= 2) popMutation(mut.id);
        break; // Stop draining — network may be flaky
      }
    }
  } finally {
    drainInProgress = false;
  }

  if (syncedCount > 0) {
    mainWindow?.webContents.send('store:mutations-synced', syncedCount);
  }
}

/** Ping the remote server every 15 s; drain the mutation queue on reconnect. */
function startHealthCheckLoop(): void {
  setInterval(() => {
    const target  = new URL(REMOTE_URL);
    const isHttps = target.protocol === 'https:';
    const mod     = isHttps ? https : http;

    const req = (mod as typeof https).request(
      {
        hostname: target.hostname,
        port:     isHttps ? 443 : 80,
        path:     '/health',
        method:   'GET',
        timeout:  5000,
      },
      (res) => {
        res.resume();
        const reachable = (res.statusCode ?? 503) < 500;
        if (wasServerReachable === false && reachable && !drainInProgress) {
          drainPendingMutations().catch(() => {});
        }
        wasServerReachable = reachable;
      },
    );

    req.on('timeout', () => { req.destroy(); wasServerReachable = false; });
    req.on('error',   () => { wasServerReachable = false; });
    req.end();
  }, 15_000);
}

// ── Window factory ─────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width:          1280,
    height:         800,
    minWidth:       900,
    minHeight:      600,
    titleBarStyle:  process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    backgroundColor: '#111827',   // bg-gray-900 — prevents white flash on load
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      webSecurity:      !isDev,
    },
    icon: path.join(STATIC_DIR, 'icon.png'),
  });

  Menu.setApplicationMenu(null);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const localBase = `http://localhost:${localPort}`;
    if (!url.startsWith(REMOTE_URL) && !url.startsWith(localBase)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (isDev) {
    // Dev: load from the Vite + Express dev server (hot reload works)
    const devUrl = process.env.PILOTHOUSE_SERVER_URL ?? 'http://localhost:5000';
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Production: start local server → loads from disk, works offline immediately
    localPort = await startLocalServer();
    mainWindow.loadURL(`http://localhost:${localPort}`);
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}


// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  await createWindow();
  startHealthCheckLoop();

  // Check for updates on launch (production only)
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify().catch((err: unknown) => {
      // Auto-update errors are non-fatal — the app still works without it.
      // Log so support staff can diagnose missing GH_TOKEN / private-release issues.
      const message = err instanceof Error ? err.message : String(err);
      console.error('[auto-updater] Could not check for updates:', message);
      // Notify the renderer (About screen / toast) so the failure is visible to staff.
      mainWindow?.webContents.send('app:update-error', message);
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', async () => {
  for (const [portPath, port] of openPorts) {
    await closePort(portPath, port);
  }
});

// ── Auto-updater events ───────────────────────────────────────────────────────

autoUpdater.on('update-available', () => {
  mainWindow?.webContents.send('app:update-available');
});

autoUpdater.on('update-downloaded', () => {
  mainWindow?.webContents.send('app:update-downloaded');
});

ipcMain.handle('app:install-update', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('app:server-url', () => REMOTE_URL);

// ── Local store IPC ───────────────────────────────────────────────────────────

/** Renderer can poll this to show a "pending sync" badge. */
ipcMain.handle('store:pending-mutation-count', () => pendingMutationCount());

// ── Serial port IPC ───────────────────────────────────────────────────────────

const openPorts = new Map<string, SerialPort>();

async function closePort(portPath: string, port: SerialPort): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!port.isOpen) { openPorts.delete(portPath); resolve(); return; }
    port.close((_err) => { openPorts.delete(portPath); resolve(); });
  });
}

ipcMain.handle('serial:list', async () => SerialPort.list());

ipcMain.handle('serial:open', async (_event, portPath: string, baudRate: number) => {
  if (openPorts.has(portPath)) return;

  const port = openPorts.get(portPath);
  if (!port) throw new Error(`Port ${portPath} is not open`);

  await new Promise<void>((resolve, reject) => {
    port.write(Buffer.from(bytes), (err) => (err ? reject(err) : resolve()));
  });

  await new Promise<void>((resolve, reject) => {
    port.drain((err) => (err ? reject(err) : resolve()));
  });
});

ipcMain.handle('serial:close', async (_event, portPath: string) => {
  const port = openPorts.get(portPath);
  if (!port) throw new Error(`Port ${portPath} is not open`);

  await new Promise<void>((resolve, reject) => {
    port.write(Buffer.from(bytes), (err) => (err ? reject(err) : resolve()));
  });

  await new Promise<void>((resolve, reject) => {
    port.drain((err) => (err ? reject(err) : resolve()));
  });
});

ipcMain.handle('serial:close', async (_event, portPath: string) => {
  const port = openPorts.get(portPath);
  if (!port) return;
  await closePort(portPath, port);
});
