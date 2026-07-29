// ─── PilotHouse POS — Electron Main Process ──────────────────────────────────
// Boots the BrowserWindow, manages serial port IPC, and wires up auto-updates.
//
// BUILD
//   npm run build:electron:main   → compiles this file to dist/electron/main.js
//   npm run build:electron        → full build: frontend + main + packaging
//
// DEV
//   npm run dev:electron          → starts the Vite dev server + Electron side by side
//
// SERVER URL
//   The app loads the PilotHouse server URL.  In development this is the local
//   dev server (http://localhost:5000).  In production, set PILOTHOUSE_SERVER_URL
//   in your electron-builder.yml env config or via system environment variable.
//   Default: https://pilothouse.replit.app (change before distributing).

import { app, BrowserWindow, ipcMain, Menu, session, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'path';
import { SerialPort } from 'serialport';

// ── Environment ──────────────────────────────────────────────────────────────

const isDev = !app.isPackaged || process.env.NODE_ENV === 'development';

/**
 * The remote server this Electron shell connects to.
 * Set PILOTHOUSE_SERVER_URL at build time via electron-builder.yml's `env`
 * block, or as a system environment variable for development overrides.
 */
const SERVER_URL: string =
  process.env.PILOTHOUSE_SERVER_URL ??
  (isDev ? 'http://localhost:5000' : 'https://pilothouse.replit.app');

// ── Window factory ────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width:          1280,
    height:         800,
    minWidth:       900,
    minHeight:      600,
    // Frameless inset title bar on macOS — looks native.
    // On Windows/Linux, use the default Electron frame.
    titleBarStyle:  process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    backgroundColor: '#111827', // bg-gray-900 — avoids white flash on load
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      // Allow loading mixed content when running against a local dev server
      webSecurity:      !isDev,
    },
    icon: path.join(__dirname, '../public/icon.png'),
  });

  // Suppress the default application menu (File / Edit / View …)
  Menu.setApplicationMenu(null);

  // Open external links (target="_blank") in the system browser, not a new
  // Electron window.  This prevents staff accidentally navigating away from
  // the POS into a frameless browser window with no address bar.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(SERVER_URL)) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    // In dev mode the Vite + Express dev server must be running on localhost.
    // Start it with `npm run dev` before launching `npm run dev:electron`.
    mainWindow.loadURL(SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadURL(SERVER_URL);
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();

  // Check for updates on launch (production only)
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {
      // Auto-update errors are non-fatal — the app still works without it
    });
  }

  // macOS: re-create the window when the dock icon is clicked and no windows are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed on Windows/Linux.
// On macOS, keep the process alive until the user explicitly quits (Cmd+Q).
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Close all open serial ports on quit so the OS releases them
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

// Renderer can call this to trigger the install-and-restart
ipcMain.handle('app:install-update', () => {
  autoUpdater.quitAndInstall();
});

// Renderer can query the server URL (useful for displaying in About screen)
ipcMain.handle('app:server-url', () => SERVER_URL);

// ── Serial port IPC ───────────────────────────────────────────────────────────
// All serial port access runs in the main process where Node.js is available.
// The renderer calls these handlers via window.electronAPI (exposed by preload.ts).

const openPorts = new Map<string, SerialPort>();

async function closePort(portPath: string, port: SerialPort): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!port.isOpen) { openPorts.delete(portPath); resolve(); return; }
    port.close((_err) => { openPorts.delete(portPath); resolve(); });
  });
}

/** serial:list — returns all ports visible to the OS */
ipcMain.handle('serial:list', async () => {
  return SerialPort.list();
});

/**
 * serial:open — opens a port at the requested baud rate.
 * Silently succeeds if the port is already open at the same baud rate.
 * Data arriving on the port is forwarded to the renderer via 'serial:data'.
 */
ipcMain.handle('serial:open', async (_event, portPath: string, baudRate: number) => {
  if (openPorts.has(portPath)) return; // already open

  const port = new SerialPort({ path: portPath, baudRate, autoOpen: false });

  await new Promise<void>((resolve, reject) => {
    port.open((err) => (err ? reject(err) : resolve()));
  });

  // Forward incoming bytes to the renderer
  port.on('data', (data: Buffer) => {
    mainWindow?.webContents.send('serial:data', portPath, Array.from(data));
  });

  port.on('error', (err) => {
    mainWindow?.webContents.send('serial:error', portPath, err.message);
    openPorts.delete(portPath);
  });

  openPorts.set(portPath, port);
});

/** serial:write — write raw bytes to an already-open port */
ipcMain.handle('serial:write', async (_event, portPath: string, bytes: number[]) => {
  const port = openPorts.get(portPath);
  if (!port) throw new Error(`Port ${portPath} is not open`);

  await new Promise<void>((resolve, reject) => {
    port.write(Buffer.from(bytes), (err) => (err ? reject(err) : resolve()));
  });

  // Drain the write buffer before resolving so the caller knows bytes were sent
  await new Promise<void>((resolve, reject) => {
    port.drain((err) => (err ? reject(err) : resolve()));
  });
});

/** serial:close — close an open port */
ipcMain.handle('serial:close', async (_event, portPath: string) => {
  const port = openPorts.get(portPath);
  if (!port) return;
  await closePort(portPath, port);
});
