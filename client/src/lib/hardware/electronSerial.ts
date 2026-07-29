// ─── Electron IPC Serial Transport ───────────────────────────────────────────
// Provides the same interface as qzTray.ts but routes all I/O through the
// Electron preload IPC bridge (window.electronAPI) instead of a WebSocket.
//
// These functions only work inside the Electron desktop app.
// Check isElectronAvailable() before calling any of them.

// ElectronPortInfo is declared globally in client/src/electron.d.ts

// ── Availability ──────────────────────────────────────────────────────────────

/** Returns true when the Electron IPC bridge is available (running in desktop app). */
export function isElectronAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined';
}

function api() {
  const bridge = window.electronAPI;
  if (!bridge) throw new Error('Electron IPC bridge not available — not running in Electron.');
  return bridge;
}

// ── Port listing ──────────────────────────────────────────────────────────────

/** List all serial ports visible to the OS via Electron IPC. */
export async function listElectronPorts(): Promise<ElectronPortInfo[]> {
  return api().listPorts();
}

// ── Port open / write / close ─────────────────────────────────────────────────

export interface ElectronPortOptions {
  baudRate?: number;
}

/** Open a serial port via Electron IPC. */
export async function openElectronPort(
  portPath: string,
  options: ElectronPortOptions = {},
): Promise<void> {
  await api().openPort(portPath, options.baudRate ?? 9600);
}

/** Close an open serial port via Electron IPC. Never throws. */
export async function closeElectronPort(portPath: string): Promise<void> {
  try {
    await api().closePort(portPath);
  } catch {}
}

/**
 * Register a one-time receive callback for a specific port.
 * Returns an unsubscribe function.
 */
export function onElectronPortData(
  portPath: string,
  callback: (data: Uint8Array) => void,
): () => void {
  return api().onPortData((receivedPath, data) => {
    if (receivedPath === portPath) {
      callback(new Uint8Array(data));
    }
  });
}

/**
 * Write raw bytes to an already-open Electron serial port.
 * Accepts either a Uint8Array or a plain number array.
 */
export async function writeElectronPort(
  portPath: string,
  data: Uint8Array | number[],
): Promise<void> {
  const bytes = data instanceof Uint8Array ? Array.from(data) : data;
  await api().writePort(portPath, bytes);
}

/**
 * Open a serial port, send bytes, then close it.
 * Use for one-shot print jobs (ESC/POS receipts, ZPL labels, cash drawer kicks).
 */
export async function sendElectronOneShot(
  portPath: string,
  bytes: Uint8Array,
  options: ElectronPortOptions = {},
): Promise<void> {
  await openElectronPort(portPath, options);
  try {
    await writeElectronPort(portPath, bytes);
  } finally {
    await closeElectronPort(portPath);
  }
}

// ── Device identification probe ───────────────────────────────────────────────
// Mirrors probeQzPort from qzTray.ts: two-phase ESC/POS then ZPL probe
// via the IPC receive-callback pattern.

/**
 * Probe an Electron serial port to identify the device type.
 *
 * Phase 1 — ESC/POS: send DLE EOT 1 (0x10 0x04 0x01); any response = ESC/POS.
 * Phase 2 — ZPL:     send ~HI\r\n;  'Y…' prefix response = Zebra label printer.
 *
 * Returns 'escpos', 'zpl', or 'unknown'.
 */
export async function probeElectronPort(
  portPath: string,
): Promise<'escpos' | 'zpl' | 'unknown'> {
  return new Promise(async (resolve) => {
    let settled     = false;
    let probePhase: 'escpos' | 'zpl' = 'escpos';
    let phaseTimer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;

    const done = async (result: 'escpos' | 'zpl' | 'unknown') => {
      if (settled) return;
      settled = true;
      clearTimeout(phaseTimer);
      clearTimeout(hardTimer);
      unsubscribe?.();
      await closeElectronPort(portPath);
      resolve(result);
    };

    // Hard deadline
    const hardTimer = setTimeout(() => done('unknown'), 4_000);

    const receiveCallback = (data: Uint8Array) => {
      if (settled || !data.length) return;
      if (probePhase === 'escpos') {
        done('escpos');
      } else {
        // ZPL response starts with STX (0x02) then 'Y', or just 'Y'
        const startsWithY = data[0] === 0x59 || (data[0] === 0x02 && data[1] === 0x59);
        done(startsWithY ? 'zpl' : 'unknown');
      }
    };

    const runZplPhase = async () => {
      if (settled) return;
      probePhase = 'zpl';
      unsubscribe?.();
      await closeElectronPort(portPath);
      try {
        unsubscribe = onElectronPortData(portPath, receiveCallback);
        await openElectronPort(portPath, { baudRate: 9600 });
        await writeElectronPort(portPath, new TextEncoder().encode('~HI\r\n'));
        phaseTimer = setTimeout(() => done('unknown'), 700);
      } catch {
        done('unknown');
      }
    };

    try {
      unsubscribe = onElectronPortData(portPath, receiveCallback);
      await openElectronPort(portPath, { baudRate: 9600 });
      await writeElectronPort(portPath, [0x10, 0x04, 0x01]);
      phaseTimer = setTimeout(runZplPhase, 700);
    } catch {
      clearTimeout(hardTimer);
      resolve('unknown');
    }
  });
}
