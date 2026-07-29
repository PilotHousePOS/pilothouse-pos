// ─── QZ Tray Integration ──────────────────────────────────────────────────────
// QZ Tray is a free Java desktop app (qz.io) that exposes a WebSocket on
// localhost:8181 (WSS) or localhost:8182 (WS), giving any browser — Chrome,
// Firefox, Safari, Edge — access to local serial ports and printers.
//
// Staff install QZ Tray once per machine.  After that, any browser on that
// machine can connect to POS hardware through this module.
//
// SECURITY
// We use unsigned connections which QZ Tray allows by default for localhost.
// For public-facing deployments, configure certificate signing per:
//   https://qz.io/wiki/2.1-signing-messages

// ── Module-level singleton ─────────────────────────────────────────────────────

let qzInstance: any = null;

/** Lazily load qz-tray and configure it for unsigned localhost connections. */
async function getQz(): Promise<any> {
  if (qzInstance) return qzInstance;

  // Dynamic import so the 2 MB bundle is only fetched when QZ Tray is needed.
  const mod = (await import('qz-tray')) as any;
  qzInstance = mod.default ?? mod;

  // Accept unsigned connections — correct for trusted LAN / localhost POS.
  qzInstance.security.setSignaturePromise(
    () => (resolve: (v: string) => void) => resolve(''),
  );
  qzInstance.security.setCertificatePromise(
    (resolve: (v: string) => void) => resolve(''),
  );

  return qzInstance;
}

// ── Connection helpers ────────────────────────────────────────────────────────

/**
 * Check whether QZ Tray is running without keeping a connection open.
 * Returns true if QZ Tray answered on either the secure or insecure port.
 */
export async function probeQzTray(): Promise<boolean> {
  try {
    const qz = await getQz();
    if (qz.websocket.isActive()) return true;
    await qz.websocket.connect({ retries: 0, delay: 0 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Connect to QZ Tray and keep the connection alive for subsequent calls.
 * Idempotent — safe to call when already connected.
 * Throws if QZ Tray is not running.
 */
export async function connectQzTray(): Promise<void> {
  const qz = await getQz();
  if (qz.websocket.isActive()) return;
  await qz.websocket.connect({ retries: 1, delay: 0.5 });
}

/** Returns true when an active QZ Tray WebSocket connection exists. */
export function isQzConnected(): boolean {
  try {
    return !!(qzInstance?.websocket.isActive());
  } catch {
    return false;
  }
}

// ── Port listing ──────────────────────────────────────────────────────────────

/** List all serial port names available on this machine via QZ Tray. */
export async function listQzPorts(): Promise<string[]> {
  const qz = await getQz();
  return qz.serial.findPorts();
}

// ── Port open / send / close ──────────────────────────────────────────────────

export interface QzPortOptions {
  baudRate?: number;
  dataBits?: number;
  stopBits?: number;
}

/** Open a serial port via QZ Tray. `onReceive` is called with incoming bytes. */
export async function openQzPort(
  portName: string,
  options: QzPortOptions = {},
  onReceive?: (portName: string, output: any) => void,
): Promise<void> {
  const qz = await getQz();
  await qz.serial.openPort(portName, {
    baudRate:    options.baudRate ?? 9600,
    dataBits:    options.dataBits ?? 8,
    stopBits:    options.stopBits ?? 1,
    parity:      'NONE',
    flowControl: 'NONE',
    rx: onReceive,
  });
}

/** Close a serial port via QZ Tray. Never throws. */
export async function closeQzPort(portName: string): Promise<void> {
  try {
    const qz = await getQz();
    await qz.serial.closePort(portName);
  } catch {}
}

/**
 * Send raw bytes to an already-open QZ Tray serial port.
 * Accepts either a Uint8Array (sent as base64) or a plain string.
 */
export async function sendQzPortBytes(
  portName: string,
  data: Uint8Array | string,
): Promise<void> {
  const qz = await getQz();
  const payload: any = data instanceof Uint8Array
    ? { data: btoa(String.fromCharCode(...Array.from(data))), type: 'BASE64' }
    : { data, type: 'PLAIN' };
  await qz.serial.sendData(portName, payload);
}

/**
 * Open a QZ Tray serial port, send bytes, then close it.
 * Use this for one-shot print jobs (ESC/POS receipts, ZPL labels, cash drawer).
 */
export async function sendQzOneShot(
  portName: string,
  bytes: Uint8Array,
  options: QzPortOptions = {},
): Promise<void> {
  await openQzPort(portName, options);
  try {
    await sendQzPortBytes(portName, bytes);
  } finally {
    await closeQzPort(portName);
  }
}

// ── Device identification probe ───────────────────────────────────────────────
// Mirrors the Web Serial probes in deviceDatabase.ts but uses QZ Tray's
// receive-callback API instead of the Web Serial ReadableStream.

/**
 * Probe a QZ Tray serial port to identify the device type.
 *
 * Phase 1 — ESC/POS: send DLE EOT 1 (0x10 0x04 0x01); any response = ESC/POS.
 * Phase 2 — ZPL:     send ~HI\r\n;  'Y…' prefix response = Zebra label printer.
 *
 * Returns 'escpos', 'zpl', or 'unknown'.
 */
export async function probeQzPort(
  portName: string,
): Promise<'escpos' | 'zpl' | 'unknown'> {
  return new Promise(async (resolve) => {
    let settled     = false;
    let probePhase: 'escpos' | 'zpl' = 'escpos';
    let phaseTimer: ReturnType<typeof setTimeout> | undefined;

    const done = async (result: 'escpos' | 'zpl' | 'unknown') => {
      if (settled) return;
      settled = true;
      clearTimeout(phaseTimer);
      clearTimeout(hardTimer);
      await closeQzPort(portName);
      resolve(result);
    };

    // Hard deadline — two probe phases × 700 ms each + slack
    const hardTimer = setTimeout(() => done('unknown'), 4_000);

    const receiveHandler = (_name: string, output: any) => {
      if (settled || !output) return;
      if (probePhase === 'escpos') {
        done('escpos');
      } else {
        // ZPL host-identification response starts with STX (0x02) then 'Y'
        const text = typeof output === 'string'
          ? output
          : new TextDecoder().decode(output as ArrayBuffer);
        const startsWithY =
          text.startsWith('Y') ||
          (text.charCodeAt(0) === 0x02 && text.charCodeAt(1) === 0x59);
        done(startsWithY ? 'zpl' : 'unknown');
      }
    };

    const runZplPhase = async () => {
      if (settled) return;
      probePhase = 'zpl';
      await closeQzPort(portName);
      try {
        await openQzPort(portName, { baudRate: 9600 }, receiveHandler);
        await sendQzPortBytes(portName, new TextEncoder().encode('~HI\r\n'));
        // ZPL timeout — if no response, give up
        phaseTimer = setTimeout(() => done('unknown'), 700);
      } catch {
        done('unknown');
      }
    };

    try {
      await openQzPort(portName, { baudRate: 9600 }, receiveHandler);
      await sendQzPortBytes(portName, new Uint8Array([0x10, 0x04, 0x01]));
      // ESC/POS timeout — switch to ZPL phase
      phaseTimer = setTimeout(runZplPhase, 700);
    } catch {
      clearTimeout(hardTimer);
      resolve('unknown');
    }
  });
}
