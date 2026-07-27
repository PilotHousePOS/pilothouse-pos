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

  // ── Common USB-Serial adapters (used by card terminals and older printers) ───
  // Prolific PL2303
  '067b:2303': { name: 'USB Serial Adapter (Prolific PL2303)', deviceCategory: 'card-terminal', protocol: 'dejavoo', defaultBaudRate: 9600 },
  '067b:23a3': { name: 'USB Serial Adapter (Prolific PL2303TA)', deviceCategory: 'card-terminal', protocol: 'dejavoo', defaultBaudRate: 9600 },
  // FTDI FT232/FT2232
  '0403:6001': { name: 'USB Serial Adapter (FTDI FT232)',    deviceCategory: 'card-terminal', protocol: 'dejavoo', defaultBaudRate: 9600 },
  '0403:6010': { name: 'USB Serial Adapter (FTDI FT2232)',   deviceCategory: 'card-terminal', protocol: 'dejavoo', defaultBaudRate: 9600 },
  '0403:6011': { name: 'USB Serial Adapter (FTDI FT4232)',   deviceCategory: 'card-terminal', protocol: 'dejavoo', defaultBaudRate: 9600 },
  '0403:6014': { name: 'USB Serial Adapter (FTDI FT232H)',   deviceCategory: 'card-terminal', protocol: 'dejavoo', defaultBaudRate: 9600 },
  '0403:6015': { name: 'USB Serial Adapter (FTDI FT230X)',   deviceCategory: 'card-terminal', protocol: 'dejavoo', defaultBaudRate: 9600 },
  // Silicon Labs CP210x
  '10c4:ea60': { name: 'USB Serial Adapter (CP210x)',        deviceCategory: 'card-terminal', protocol: 'dejavoo', defaultBaudRate: 9600 },
  '10c4:ea70': { name: 'USB Serial Adapter (CP2105)',        deviceCategory: 'card-terminal', protocol: 'dejavoo', defaultBaudRate: 9600 },
  '10c4:ea71': { name: 'USB Serial Adapter (CP2108)',        deviceCategory: 'card-terminal', protocol: 'dejavoo', defaultBaudRate: 9600 },
  // WCH CH340/CH341
  '1a86:7523': { name: 'USB Serial Adapter (CH340)',         deviceCategory: 'card-terminal', protocol: 'dejavoo', defaultBaudRate: 9600 },
  '1a86:5523': { name: 'USB Serial Adapter (CH341)',         deviceCategory: 'card-terminal', protocol: 'dejavoo', defaultBaudRate: 9600 },
  '1a86:55d3': { name: 'USB Serial Adapter (CH340K)',        deviceCategory: 'card-terminal', protocol: 'dejavoo', defaultBaudRate: 9600 },
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

/** Try ESC/POS DLE EOT 1 probe. Returns true if the port responds. */
async function probeEscPos(port: any): Promise<boolean> {
  try {
    await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' });

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
    await port.close();
    return received;
  } catch {
    try { await port.close(); } catch {}
    return false;
  }
}

/** Try ZPL ~HI host-identification probe. Returns true if the port responds with 'Y'. */
async function probeZpl(port: any): Promise<boolean> {
  try {
    await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' });

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
    await port.close();
    return received;
  } catch {
    try { await port.close(); } catch {}
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
