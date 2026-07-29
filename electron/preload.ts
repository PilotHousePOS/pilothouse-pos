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

  openPort(portPath: string, baudRate: number): Promise<void> {
    return ipcRenderer.invoke('serial:open', portPath, baudRate);
  },

  writePort(portPath: string, bytes: number[]): Promise<void> {
    return ipcRenderer.invoke('serial:write', portPath, bytes);
  },

  closePort(portPath: string): Promise<void> {
    return ipcRenderer.invoke('serial:close', portPath);
  },

  onPortData(callback: (portPath: string, data: number[]) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, portPath: string, data: number[]) => {
      callback(portPath, data);
    };
    ipcRenderer.on('serial:data', listener);
    return () => ipcRenderer.removeListener('serial:data', listener);
  },

  // ── App metadata ─────────────────────────────────────────────────────────

  getServerUrl(): string {
    return _serverUrl;
  },

  // ── Auto-update ──────────────────────────────────────────────────────────

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
