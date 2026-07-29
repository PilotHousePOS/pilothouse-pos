// ─── PilotHouse POS — Electron Main Process ──────────────────────────────────
// Architecture: local static server (bundled frontend) + API proxy to remote.
//
// WHY LOCAL SERVER:
//   The app shell (HTML/JS/CSS) is bundled inside the Electron package and
//   served from http://localhost:{port}.  This means the app loads instantly
//   with zero internet — no "connecting to server…" on startup.
//   API calls (/api/*) are proxied to the remote PilotHouse server when online.
//   The service worker caches all API responses, so data-browsing pages work
//   offline after the first connected session.  Only card payments require live
//   internet (Stripe requirement).
//
// BUILD
//   npm run build:electron:main   → compiles this file to dist/electron/main.js
//   npm run build:electron        → full build: frontend + main + packaging
//
// DEV
//   npm run dev:electron          → starts the Vite dev server + Electron side by side
//   In dev mode the app still loads from the Vite dev server (hot reload works).
//
// SERVER URL
//   Set PILOTHOUSE_SERVER_URL in electron-builder.yml env config or as a system
//   environment variable.  This is the remote PilotHouse server that handles
//   API calls, authentication, and card payments.
//   Default: https://pilothouse.replit.app

import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'path';
import http from 'http';
import https from 'https';
import fs from 'fs';
import net from 'net';
import { SerialPort } from 'serialport';

// ── Environment ──────────────────────────────────────────────────────────────

const isDev = !app.isPackaged || process.env.NODE_ENV === 'development';

/**
 * The remote PilotHouse server.  API calls are proxied here when online.
 * Set PILOTHOUSE_SERVER_URL at build time via electron-builder.yml `env` block.
 */
const REMOTE_URL: string =
  process.env.PILOTHOUSE_SERVER_URL ?? 'https://pilothouse.replit.app';

/**
 * The directory containing the built React frontend.
 * In packaged app: resources/app/dist/public/
 * In development:  dist/public/ (relative to compiled main.js in dist/electron/)
 */
const STATIC_DIR = path.join(__dirname, '../public');

// ── MIME types for static file serving ───────────────────────────────────────

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

// ── Local static server ───────────────────────────────────────────────────────

let localPort = 0;

/** Find a free TCP port by binding to :0 */
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

/** Serve a file from the static directory, falling back to index.html for SPA routes */
function serveStatic(filePath: string, res: http.ServerResponse): void {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback: any unknown path is a client-side route → serve index.html
      fs.readFile(path.join(STATIC_DIR, 'index.html'), (err2, html) => {
        if (err2) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
        });
        res.end(html);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';
    // Content-hashed assets (/assets/*.js) can be cached aggressively
    const cacheControl = filePath.includes('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'no-cache';
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': cacheControl });
    res.end(data);
  });
}

/** Proxy a request to the remote server, rewriting cookies for localhost compat */
function proxyToRemote(
  req:  http.IncomingMessage,
  res:  http.ServerResponse,
  urlPath: string,
): void {
  const target  = new URL(REMOTE_URL);
  const isHttps = target.protocol === 'https:';

  // Strip hop-by-hop headers; override Host to match the remote server
  const reqHeaders = { ...req.headers };
  delete reqHeaders['connection'];
  delete reqHeaders['transfer-encoding'];
  delete reqHeaders['host'];
  reqHeaders['host'] = target.hostname;

  const options: https.RequestOptions = {
    hostname: target.hostname,
    port:     isHttps ? 443 : (Number(target.port) || 80),
    path:     urlPath,
    method:   req.method,
    headers:  reqHeaders,
  };

  const mod = isHttps ? https : http;

  const proxyReq = (mod as typeof https).request(options, (proxyRes) => {
    // Rewrite Set-Cookie so cookies work on http://localhost (not just the remote domain)
    const resHeaders: http.OutgoingHttpHeaders = {};
    for (const [k, v] of Object.entries(proxyRes.headers)) {
      if (k.toLowerCase() === 'set-cookie') {
        resHeaders[k] = (Array.isArray(v) ? v : [String(v)]).map(c =>
          c
            .replace(/;\s*Domain=[^;]+/gi, '')  // remove Domain=... so cookie binds to localhost
            .replace(/;\s*Secure\b/gi,    '')   // remove Secure so http://localhost accepts it
            .replace(/;\s*SameSite=[^;]+/gi, '; SameSite=Lax'),
        );
      } else {
        resHeaders[k] = v as string | string[];
      }
    }
    res.writeHead(proxyRes.statusCode!, resHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
    }
    if (!res.writableEnded) {
      res.end(JSON.stringify({ message: 'Server unreachable — you are offline' }));
    }
  });

  // Forward request body for POST/PUT/PATCH
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'DELETE') {
    req.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
}

/** Start the local HTTP server; returns the port it bound to */
async function startLocalServer(): Promise<number> {
  const port = await getFreePort();

  // Paths that must be proxied to the remote server
  function shouldProxy(urlPath: string): boolean {
    return (
      urlPath.startsWith('/api/') ||
      urlPath === '/health'       ||
      urlPath === '/__health'     ||
      urlPath.startsWith('/uploads/')       ||
      urlPath.startsWith('/stock-images/')  ||
      urlPath.startsWith('/objects/')       ||
      urlPath.startsWith('/public-objects/')
    );
  }

  const server = http.createServer((req, res) => {
    const rawUrl  = req.url || '/';
    const urlPath = rawUrl.split('?')[0]; // strip query string for static lookup

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

// ── Window factory ─────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width:          1280,
    height:         800,
    minWidth:       900,
    minHeight:      600,
    // Frameless inset title bar on macOS — looks native.
    titleBarStyle:  process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    backgroundColor: '#111827', // bg-gray-900 — prevents white flash on load
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      webSecurity:      !isDev,
    },
    icon: path.join(STATIC_DIR, 'icon.png'),
  });

  Menu.setApplicationMenu(null);

  // Open target="_blank" links in the system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const localBase = `http://localhost:${localPort}`;
    if (!url.startsWith(REMOTE_URL) && !url.startsWith(localBase)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (isDev) {
    // Dev mode: load from the Vite + Express dev server (hot reload works)
    const devUrl = process.env.PILOTHOUSE_SERVER_URL ?? 'http://localhost:5000';
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Production: start local server, load from it — works without internet
    localPort = await startLocalServer();
    mainWindow.loadURL(`http://localhost:${localPort}`);
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  await createWindow();

  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {
      // Auto-update errors are non-fatal
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

/** Returns the remote server URL — useful for the About screen */
ipcMain.handle('app:server-url', () => REMOTE_URL);

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

  const port = new SerialPort({ path: portPath, baudRate, autoOpen: false });
  await new Promise<void>((resolve, reject) => {
    port.open((err) => (err ? reject(err) : resolve()));
  });

  port.on('data', (data: Buffer) => {
    mainWindow?.webContents.send('serial:data', portPath, Array.from(data));
  });

  port.on('error', (err) => {
    mainWindow?.webContents.send('serial:error', portPath, err.message);
    openPorts.delete(portPath);
  });

  openPorts.set(portPath, port);
});

ipcMain.handle('serial:write', async (_event, portPath: string, bytes: number[]) => {
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
