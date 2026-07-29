// ─── Electron IPC bridge — global ambient declarations ────────────────────────
// This file is a pure ambient declaration (no import/export) so TypeScript
// includes it automatically and `Window.electronAPI` is visible everywhere.
// Populated at runtime by electron/preload.ts via contextBridge.

interface ElectronPortInfo {
  path:          string;
  manufacturer?: string;
  vendorId?:     string;   // hex string e.g. "0403"
  productId?:    string;   // hex string e.g. "6001"
  serialNumber?: string;
  friendlyName?: string;   // Windows only
}

interface ElectronAPI {
  listPorts:          () => Promise<ElectronPortInfo[]>;
  openPort:           (portPath: string, baudRate: number) => Promise<void>;
  writePort:          (portPath: string, bytes: number[]) => Promise<void>;
  closePort:          (portPath: string) => Promise<void>;
  onPortData:         (callback: (portPath: string, data: number[]) => void) => () => void;
  getServerUrl:       () => string;
  onUpdateAvailable:  (callback: () => void) => () => void;
  onUpdateDownloaded: (callback: () => void) => () => void;
  installUpdate:      () => Promise<void>;
}

interface Window {
  /** Defined only when running inside the Electron desktop app. */
  electronAPI?: ElectronAPI;
}
