// ─── Hardware Device Database ─────────────────────────────────────────────────
// Static VID/PID lookup table for common retail POS hardware.
// Also exports probe functions for auto-identification of unlisted devices.
//
// VID/PID key format: "xxxx:xxxx" (4-digit lowercase hex, no "0x" prefix)
//
// HOW AUTO-IDENTIFICATION WORKS
// 1. Call port.getInfo() to get usbVendorId + usbProductId from the browser
// 2. Look up the key in KNOWN_DEVICES — instant, no IO
// 3. If not found: probe the port (open briefly, send a probe command, check response)
//    - ESC/POS probe: DLE EOT 1 → any single-byte response confirms ESC/POS printer
//    - ZPL probe:     ~HI\r\n  → 'Y…' response confirms Zebra-compatible printer
// 4. Return the detected protocol (or 'unknown' for the manual-selection fallback)

import type { DeviceType } from '@/hooks/useHardwareDevices';

export type KnownDeviceCategory = 'receipt-printer' | 'label-printer' | 'card-terminal';
export type KnownDeviceProtocol = 'escpos' | 'zpl' | 'dejavoo';

export interface KnownDevice {
  name:            string;
  deviceCategory:  KnownDeviceCategory;
  protocol:        KnownDeviceProtocol;
  defaultBaudRate: number;
}

// ── VID/PID database ──────────────────────────────────────────────────────────

export const KNOWN_DEVICES: Record<string, KnownDevice> = {

  // ── Epson TM series (VID 0x04B8) ────────────────────────────────────────────
  '04b8:0202': { name: 'Epson TM-T88III Receipt Printer',  deviceCategory: 'receipt-printer', protocol: 'escpos', defaultBaudRate: 9600 },
  '04b8:0e03': { name: 'Epson TM-T88IV/V Receipt Printer', deviceCategory: 'receipt-printer', protocol: 'escpos', defaultBaudRate: 9600 },
  '04b8:0e15': { name: 'Epson TM-T20III Receipt Printer',  deviceCategory: 'receipt-printer', protocol: 'escpos', defaultBaudRate: 9600 },
  '04b8:0e1a': { name: 'Epson TM-T82III Receipt Printer',  deviceCategory: 'receipt-printer', protocol: 'escpos', defaultBaudRate: 9600 },
  '04b8:0e1f': { name: 'Epson TM-m30 Receipt Printer',     deviceCategory: 'receipt-printer', protocol: 'escpos', defaultBaudRate: 9600 },
  '04b8:0e27': { name: 'Epson TM-T88VI Receipt Printer',   deviceCategory: 'receipt-printer', protocol: 'escpos', defaultBaudRate: 9600 },
  '04b8:0e2e': { name: 'Epson TM-T88VII Receipt Printer',  deviceCategory: 'receipt-printer', protocol: 'escpos', defaultBaudRate: 9600 },
  '04b8:0e2b': { name: 'Epson TM-m30II Receipt Printer',   deviceCategory: 'receipt-printer', protocol: 'escpos', defaultBaudRate: 9600 },
  '04b8:0e32': { name: 'Epson TM-T20III-i Receipt Printer',deviceCategory: 'receipt-printer', protocol: 'escpos', defaultBaudRate: 9600 },

  // ── Star Micronics (VID 0x0519) ──────────────────────────────────────────────
  '0519:0001': { name: 'Star TSP650/743 Receipt Printer',  deviceCategory: 'receipt-printer', protocol: 'escpos', defaultBaudRate: 9600 },
  '0519:0003': { name: 'Star TSP100 Receipt Printer',      deviceCategory: 'receipt-printer', protocol: 'escpos', defaultBaudRate: 9600 },
  '0519:0005': { name: 'Star TSP800 Receipt Printer',      deviceCategory: 'receipt-printer', protocol: 'escpos', defaultBaudRate: 9600 },
  '0519:0007': { name: 'Star SP512/542 Receipt Printer',   deviceCategory: 'receipt-printer', protocol: 'escpos', defaultBaudRate: 9600 },
  '0519:0009': { name: 'Star mC-Print3 Receipt Printer',   deviceCategory: 'receipt-printer', protocol: 'escpos', defaultBaudRate: 9600 },
  '0519:000a': { name: 'Star mC-Print2 Receipt Printer',   deviceCategory: 'receipt-printer', protocol: 'escpos', defaultBaudRate: 9600 },
  '0519:000b': { name: 'Star mC-Label3 Label Printer',     deviceCategory: 'label-printer',   protocol: 'zpl',    defaultBaudRate: 9600 },

  // ── Citizen (VID 0x1CBE) ─────────────────────────────────────────────────────
  '1cbe:0002': { name: 'Citizen CT-S310II Receipt Printer', deviceCategory: 'receipt-printer', protocol: 'escpos', defaultBaudRate: 9600 },
  '1cbe:0003': { name: 'Citizen CT-S4500 Receipt Printer',  deviceCategory: 'receipt-printer', protocol: 'escpos', defaultBaudRate: 9600 },
  '1cbe:0100': { name: 'Citizen CT-S651 Receipt Printer',   deviceCategory: 'receipt-printer', protocol: 'escpos', defaultBaudRate: 9600 },
  '1cbe:0101': { name: 'Citizen CT-S801 Receipt Printer',   deviceCategory: 'receipt-printer', protocol: 'escpos', defaultBaudRate: 9600 },

  // ── Zebra label printers (VID 0x0A5F) ────────────────────────────────────────
  '0a5f:008b': { name: 'Zebra LP2844 Label Printer',  deviceCategory: 'label-printer', protocol: 'zpl', defaultBaudRate: 9600 },
  '0a5f:008d': { name: 'Zebra GK420d Label Printer',  deviceCategory: 'label-printer', protocol: 'zpl', defaultBaudRate: 9600 },
  '0a5f:008e': { name: 'Zebra GK420t Label Printer',  deviceCategory: 'label-printer', protocol: 'zpl', defaultBaudRate: 9600 },
  '0a5f:0164': { name: 'Zebra ZD410 Label Printer',   deviceCategory: 'label-printer', protocol: 'zpl', defaultBaudRate: 9600 },
  '0a5f:0165': { name: 'Zebra ZD420 Label Printer',   deviceCategory: 'label-printer', protocol: 'zpl', defaultBaudRate: 9600 },
  '0a5f:0166': { name: 'Zebra ZD620 Label Printer',   deviceCategory: 'label-printer', protocol: 'zpl', defaultBaudRate: 9600 },
  '0a5f:0168': { name: 'Zebra ZT400 Series Printer',  deviceCategory: 'label-printer', protocol: 'zpl', defaultBaudRate: 9600 },
  '0a5f:016a': { name: 'Zebra ZD230 Label Printer',   deviceCategory: 'label-printer', protocol: 'zpl', defaultBaudRate: 9600 },

  // NOTE: Generic USB-serial adapters (Prolific PL2303, FTDI FT232, CP210x,
  // CH340, etc.) are intentionally NOT listed here. These chips are used by
  // receipt printers, label printers, barcode scanners, card terminals, and
  // countless other devices — hardcoding them as any particular device type
  // would cause mis-identification. They fall through to probe-based
  // identification (ESC/POS then ZPL), which correctly identifies the actual
  // device behind the adapter. If both probes fail the user gets the manual
  // selection fallback, which is the correct and safe outcome.
};

// ── Lookup helpers ────────────────────────────────────────────────────────────

/** Look up a device by USB Vendor ID and Product ID. Returns null if not in database. */
export function lookupDevice(
  usbVendorId?: number,
  usbProductId?: number,
): KnownDevice | null {
  if (usbVendorId == null || usbProductId == null) return null;
  const key = `${usbVendorId.toString(16).padStart(4, '0')}:${usbProductId.toString(16).padStart(4, '0')}`;
  return KNOWN_DEVICES[key] ?? null;
}

/** Map a KnownDeviceCategory to the hook's DeviceType. */
export function categoryToDeviceType(category: KnownDeviceCategory): DeviceType {
  switch (category) {
    case 'receipt-printer': return 'printer';
    case 'label-printer':   return 'labelPrinter';
    case 'card-terminal':   return 'terminal';
  }
}

/** Map the hook's DeviceType to a human-readable label. */
export function deviceTypeLabel(type: DeviceType): string {
  switch (type) {
    case 'printer':      return 'Receipt Printer + Cash Drawer';
    case 'labelPrinter': return 'Label Printer';
    case 'terminal':     return 'Card Terminal';
  }
}

// ── Probe-based identification ────────────────────────────────────────────────
// Used when VID/PID is not in the database.
// Each probe opens the port independently (open → write → read → close).

/**
 * Maximum milliseconds to wait for port.open() to resolve.
 *
 * If a driver takes longer than this (e.g. loading a kernel module for an
 * unusual USB-serial chip) the probe is abandoned and returns false so that
 * probeDevice() falls through to 'unknown' instead of hanging the wizard.
 */
export const PROBE_OPEN_TIMEOUT_MS = 3_000;

/**
 * Race port.open() against a hard deadline.
 * Rejects with a TimeoutError if the open call does not resolve in time.
 * The caller's outer try/catch turns any rejection into `return false`.
 */
async function openWithTimeout(
  port: any,
  options: object,
  timeoutMs: number,
): Promise<void> {
  let timerId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(
      () => reject(new Error(`port.open() timed out after ${timeoutMs} ms`)),
      timeoutMs,
    );
  });
  try {
    await Promise.race([port.open(options), timeoutPromise]);
  } finally {
    clearTimeout(timerId);
  }
}

/**
 * Attempt port.close() with a hard deadline.
 *
 * After a timed-out open(), the underlying port.open() promise may still be
 * in-flight, which can cause port.close() to hang indefinitely waiting for the
 * open to settle before it can begin teardown.  This wrapper races close()
 * against a timer and silently resolves either way so the probe can return
 * 'unknown' without blocking the wizard.
 *
 * We resolve (not reject) on timeout because a stuck close() is not an
 * actionable error — we just want the async chain to continue.
 */
const PROBE_CLOSE_TIMEOUT_MS = 1_500;

async function closeWithTimeout(port: any): Promise<void> {
  await Promise.race([
    port.close().catch(() => {}),
    new Promise<void>(resolve => setTimeout(resolve, PROBE_CLOSE_TIMEOUT_MS)),
  ]);
}

/** Try ESC/POS DLE EOT 1 probe. Returns true if the port responds. */
export async function probeEscPos(port: any): Promise<boolean> {
  try {
    await openWithTimeout(
      port,
      { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
      PROBE_OPEN_TIMEOUT_MS,
    );

    const writer = port.writable.getWriter();
    try {
      await writer.write(new Uint8Array([0x10, 0x04, 0x01])); // DLE EOT 1
    } finally {
      writer.releaseLock();
    }

    const reader = port.readable.getReader();
    let received = false;
    const timeoutId = setTimeout(() => reader.cancel(), 700);
    try {
      const { value } = await reader.read();
      received = !!(value && value.byteLength > 0);
    } catch {
      // timeout cancel or IO error — not an ESC/POS printer
    }
    clearTimeout(timeoutId);
    reader.releaseLock();
    await closeWithTimeout(port);
    return received;
  } catch {
    await closeWithTimeout(port);
    return false;
  }
}

/** Try ZPL ~HI host-identification probe. Returns true if the port responds with 'Y'. */
export async function probeZpl(port: any): Promise<boolean> {
  try {
    await openWithTimeout(
      port,
      { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
      PROBE_OPEN_TIMEOUT_MS,
    );

    const writer = port.writable.getWriter();
    try {
      await writer.write(new TextEncoder().encode('~HI\r\n'));
    } finally {
      writer.releaseLock();
    }

    const reader = port.readable.getReader();
    let received = false;
    const timeoutId = setTimeout(() => reader.cancel(), 700);
    try {
      const { value } = await reader.read();
      if (value && value.byteLength > 0) {
        const text = new TextDecoder().decode(value);
        received = text.charCodeAt(0) === 0x02 // STX
          ? text.charCodeAt(1) === 0x59        // 'Y' in Zebra response
          : text.startsWith('Y');
      }
    } catch {
      // timeout or IO error
    }
    clearTimeout(timeoutId);
    reader.releaseLock();
    await closeWithTimeout(port);
    return received;
  } catch {
    await closeWithTimeout(port);
    return false;
  }
}

export type ProbeResult = 'escpos' | 'zpl' | 'unknown';

/**
 * Probe a port to identify its device type.
 * Tries ESC/POS first, then ZPL. Returns 'unknown' if neither probe responds.
 *
 * If the port is already open (port.readable is non-null) the probe is skipped
 * entirely and 'unknown' is returned immediately.  Calling port.open() on an
 * already-open port throws InvalidStateError, which would surface as an
 * unhandled crash rather than a graceful fallback.  Returning 'unknown' here
 * sends the wizard to the manual-selection form, which is the correct fallback.
 */
export async function probeDevice(port: any): Promise<ProbeResult> {
  // Guard: Web Serial sets port.readable to a non-null ReadableStream when the
  // port is open.  Skip the probe to avoid a double-open InvalidStateError.
  if (port.readable != null) return 'unknown';

  if (await probeEscPos(port)) return 'escpos';
  if (await probeZpl(port))    return 'zpl';
  return 'unknown';
}

/** Map a probe result to the best-guess DeviceType. */
export function probeResultToDeviceType(result: ProbeResult): DeviceType | null {
  switch (result) {
    case 'escpos': return 'printer';
    case 'zpl':    return 'labelPrinter';
    default:       return null;
  }
}

/** Map a probe result to the best-guess friendly name hint. */
export function probeResultToName(result: ProbeResult): string {
  switch (result) {
    case 'escpos': return 'ESC/POS Receipt Printer';
    case 'zpl':    return 'ZPL Label Printer';
    default:       return 'Serial Device';
  }
}

// ── Scan-sequence guard ────────────────────────────────────────────────────────
// Prevents a stale probe from overwriting state when a second scan starts
// before the first probe resolves.
//
// Usage in the wizard:
//   const scanSeq = useRef(createScanSequence());
//   ...
//   const id = scanSeq.current.next();           // start of handleScan
//   const result = await probeDevice(port);
//   if (scanSeq.current.isStale(id)) return;     // discard stale probe
//   setState(...)                                 // safe to commit

export interface ScanSequence {
  /** Increment the sequence counter and return the new ID for this scan. */
  next(): number;
  /**
   * Returns true when a newer scan has started since this ID was issued,
   * meaning this probe's result is stale and must be discarded.
   */
  isStale(id: number): boolean;
  /** Current counter value — for inspection in tests. */
  current(): number;
}

/**
 * Create a scan-sequence guard.
 * Call `next()` at the start of each scan and `isStale(id)` after each await.
 */
export function createScanSequence(): ScanSequence {
  let counter = 0;
  return {
    next()           { return ++counter; },
    isStale(id)      { return id !== counter; },
    current()        { return counter; },
  };
}
