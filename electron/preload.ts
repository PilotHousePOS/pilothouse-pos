// ─── PilotHouse POS — Electron Preload ───────────────────────────────────────
// Runs in the renderer's Isolated World before the page script.
// Exposes a minimal, typed API surface to the renderer via contextBridge —
// no direct Node.js access from the renderer.
//
// The interface this exposes must match the ElectronAPI type in
// client/src/electron.d.ts.

import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  // ── Serial port operations ───────────────────────────────────────────────

  /** List all serial ports visible to the OS. */
  listPorts(): Promise<{
    path: string;
    manufacturer?: string;
    vendorId?: string;
    productId?: string;
    serialNumber?: string;
    friendlyName?: string;
  }[]> {
    return ipcRenderer.invoke('serial:list');
  },

  /** Open a serial port at the given baud rate. */
  openPort(portPath: string, baudRate: number): Promise<void> {
    return ipcRenderer.invoke('serial:open', portPath, baudRate);
  },

  /** Write raw bytes to an already-open serial port. */
  writePort(portPath: string, bytes: number[]): Promise<void> {
    return ipcRenderer.invoke('serial:write', portPath, bytes);
  },

  /** Close an open serial port. */
  closePort(portPath: string): Promise<void> {
    return ipcRenderer.invoke('serial:close', portPath);
  },

  /**
   * Register a callback for data arriving on any open serial port.
   * Returns an unsubscribe function — call it to stop listening.
   */
  onPortData(callback: (portPath: string, data: number[]) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, portPath: string, data: number[]) => {
      callback(portPath, data);
    };
    ipcRenderer.on('serial:data', listener);
    return () => ipcRenderer.removeListener('serial:data', listener);
  },

  // ── App metadata ─────────────────────────────────────────────────────────

  /** The server URL this Electron shell was configured to load. */
  getServerUrl(): string {
    // Synchronous invoke via cached result populated at preload time
    return _serverUrl;
  },

  // ── Auto-update ──────────────────────────────────────────────────────────

  /** Register a callback for update-available and update-downloaded events. */
  onUpdateAvailable(callback: () => void): () => void {
    const listener = () => callback();
    ipcRenderer.on('app:update-available', listener);
    return () => ipcRenderer.removeListener('app:update-available', listener);
  },

  onUpdateDownloaded(callback: () => void): () => void {
    const listener = () => callback();
    ipcRenderer.on('app:update-downloaded', listener);
    return () => ipcRenderer.removeListener('app:update-downloaded', listener);
  },

  /** Register a callback for update-check failures (missing token, private release, etc.). */
  onUpdateError(callback: (message: string) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, message: string) => callback(message);
    ipcRenderer.on('app:update-error', listener);
    return () => ipcRenderer.removeListener('app:update-error', listener);
  },

  /** Trigger install-and-restart after an update has been downloaded. */
  installUpdate(): Promise<void> {
    return ipcRenderer.invoke('app:install-update');
  },

  // ── Local store (offline mutation queue) ─────────────────────────────────

  /**
   * Returns the number of mutations waiting to be synced to the server.
   * Call this on mount and when `onMutationQueued` fires to keep the count fresh.
   */
  getPendingMutationCount(): Promise<number> {
    return ipcRenderer.invoke('store:pending-mutation-count');
  },

  /**
   * Fires whenever a mutation is added to the offline queue.
   * `pendingCount` is the total queue length after the addition.
   */
  onMutationQueued(callback: (pendingCount: number) => void): () => void {
    const listener = (_: Electron.IpcRendererEvent, count: number) => callback(count);
    ipcRenderer.on('store:mutation-queued', listener);
    return () => ipcRenderer.removeListener('store:mutation-queued', listener);
  },

  /**
   * Fires when the drain loop successfully replays mutations after reconnect.
   * `syncedCount` is how many mutations were successfully sent.
   */
  onMutationsSynced(callback: (syncedCount: number) => void): () => void {
    const listener = (_: Electron.IpcRendererEvent, count: number) => callback(count);
    ipcRenderer.on('store:mutations-synced', listener);
    return () => ipcRenderer.removeListener('store:mutations-synced', listener);
  },
} as const;

// Cache the server URL synchronously at preload time so getServerUrl() is sync
let _serverUrl = '';
ipcRenderer.invoke('app:server-url').then((url: string) => { _serverUrl = url; });

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
