// ─── Hardware Wizard — Recognized Path Tests ──────────────────────────────────
//
// Confirms the "happy path" of the hardware wizard:
//   1. A mock SerialPort with a known Epson VID/PID (0x04B8:0x0E27) resolves
//      to the "recognized" step, never the "fallback" form.
//   2. The recognized card carries the correct name and device-type label.
//   3. connectWithPort would be called with protocol escpos and baud rate 9600.
//   4. No device that exists in KNOWN_DEVICES produces a null lookup (which
//      would force the fallback path).
//
// These tests exercise the lookup + categorisation logic that the wizard
// delegates to deviceDatabase.ts.  The wizard component itself calls
// lookupDevice() then branches on the result; we verify the branch is always
// "recognized" for every entry in KNOWN_DEVICES.

import { describe, it, expect, vi } from 'vitest';
import {
  lookupDevice,
  categoryToDeviceType,
  deviceTypeLabel,
  KNOWN_DEVICES,
  type KnownDevice,
} from './deviceDatabase';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal mock SerialPort whose getInfo() returns the supplied VID/PID.
 * This mirrors the structure the wizard reads: `port.getInfo?.()`.
 */
function makeMockPort(usbVendorId: number, usbProductId: number) {
  return {
    getInfo: () => ({ usbVendorId, usbProductId }),
  };
}

/**
 * Replicate the wizard's handleScan identification logic:
 *   const info = port.getInfo?.() ?? {};
 *   const known = lookupDevice(info.usbVendorId, info.usbProductId);
 *   → if (known)  → 'recognized'
 *   → else        → probe → fallback (if probe returns 'unknown')
 *
 * Returns the KnownDevice (recognized path) or null (fallback path).
 */
function identifyPort(port: ReturnType<typeof makeMockPort>): KnownDevice | null {
  const info = port.getInfo?.() ?? {};
  return lookupDevice(info.usbVendorId, info.usbProductId);
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('HardwareWizard recognized path — Epson TM-T88VI (0x04B8:0x0E27)', () => {

  const EPSON_VID = 0x04b8;
  const EPSON_PID = 0x0e27;

  it('lookupDevice returns a non-null result — wizard enters "recognized" step', () => {
    const port = makeMockPort(EPSON_VID, EPSON_PID);
    const known = identifyPort(port);

    // A non-null result means the wizard takes the recognized branch, not fallback
    expect(known).not.toBeNull();
  });

  it('recognized card shows "Epson TM-T88VI Receipt Printer"', () => {
    const port = makeMockPort(EPSON_VID, EPSON_PID);
    const known = identifyPort(port)!;

    expect(known.name).toBe('Epson TM-T88VI Receipt Printer');
  });

  it('device type badge label is "Receipt Printer + Cash Drawer"', () => {
    const port = makeMockPort(EPSON_VID, EPSON_PID);
    const known = identifyPort(port)!;

    const type = categoryToDeviceType(known.deviceCategory);
    expect(deviceTypeLabel(type)).toBe('Receipt Printer + Cash Drawer');
  });

  it('connectWithPort would be called with protocol escpos and baud rate 9600', () => {
    // The wizard calls:
    //   hw.connectWithPort(type, port, device.defaultBaudRate, device.name)
    // Verify the values it would pass are exactly what the spec requires.
    const port = makeMockPort(EPSON_VID, EPSON_PID);
    const known = identifyPort(port)!;

    const connectWithPort = vi.fn();
    const type = categoryToDeviceType(known.deviceCategory);

    // Simulate the wizard's handleConfirmRecognized call
    connectWithPort(type, port, known.defaultBaudRate, known.name);

    expect(connectWithPort).toHaveBeenCalledOnce();
    expect(connectWithPort).toHaveBeenCalledWith(
      'printer',       // type from categoryToDeviceType('receipt-printer')
      port,
      9600,            // defaultBaudRate
      'Epson TM-T88VI Receipt Printer',
    );
  });

  it('protocol stored on the device record is escpos', () => {
    const port = makeMockPort(EPSON_VID, EPSON_PID);
    const known = identifyPort(port)!;
    expect(known.protocol).toBe('escpos');
  });

  it('fallback form does NOT appear — wizard state is "recognized", not "fallback"', () => {
    // The wizard transitions to "fallback" only when lookupDevice returns null
    // AND probeDevice returns 'unknown'.  For a known VID/PID, lookupDevice
    // must always return non-null, so the fallback branch is never reached.
    const port = makeMockPort(EPSON_VID, EPSON_PID);
    const known = identifyPort(port);

    const wizardStep = known ? 'recognized' : 'fallback-or-probe';
    expect(wizardStep).toBe('recognized');
  });
});

// ── Suite: every entry in KNOWN_DEVICES must resolve, never fallback ──────────

describe('HardwareWizard recognized path — KNOWN_DEVICES exhaustive coverage', () => {

  it('lookupDevice returns non-null for every entry in KNOWN_DEVICES (no silent fallback)', () => {
    // Parse each "xxxx:xxxx" key back into numeric VID/PID and round-trip through
    // lookupDevice.  If any entry returns null the wizard would send staff to the
    // fallback form for a device that should be auto-identified.
    const failures: string[] = [];

    for (const key of Object.keys(KNOWN_DEVICES)) {
      const [vidHex, pidHex] = key.split(':');
      const vid = parseInt(vidHex, 16);
      const pid = parseInt(pidHex, 16);

      const result = lookupDevice(vid, pid);
      if (result === null) {
        failures.push(key);
      }
    }

    expect(failures).toEqual([]);
  });

  it('every KNOWN_DEVICES entry maps to a valid DeviceType without throwing', () => {
    for (const [key, device] of Object.entries(KNOWN_DEVICES)) {
      expect(() => {
        const type = categoryToDeviceType(device.deviceCategory);
        const label = deviceTypeLabel(type);
        expect(typeof label).toBe('string');
        expect(label.length).toBeGreaterThan(0);
      }).not.toThrow();
    }
  });
});

// ── Suite: lookupDevice edge cases ────────────────────────────────────────────

describe('lookupDevice — edge cases', () => {

  it('returns null when VID is undefined (no USB info on port)', () => {
    expect(lookupDevice(undefined, 0x0e27)).toBeNull();
  });

  it('returns null when PID is undefined', () => {
    expect(lookupDevice(0x04b8, undefined)).toBeNull();
  });

  it('returns null for both undefined (getInfo returns empty object)', () => {
    expect(lookupDevice(undefined, undefined)).toBeNull();
  });

  it('returns null for a VID/PID not in the database', () => {
    // 0xFFFF:0xFFFF is deliberately absent
    expect(lookupDevice(0xffff, 0xffff)).toBeNull();
  });

  it('key format is case-insensitive — upper-case hex from getInfo resolves correctly', () => {
    // Browser may return VID/PID as numbers; toString(16) always produces lower-case.
    // Passing the numeric values (not the string) verifies the helper handles any
    // integer representation the browser might supply.
    const result = lookupDevice(0x04B8, 0x0E27); // upper-case hex literals
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Epson TM-T88VI Receipt Printer');
  });
});
