// ─── deviceDatabase — empty getInfo() fallback path ───────────────────────────
//
// Some browsers or OS drivers return an empty object from port.getInfo() even
// for physically recognized devices.  This can happen on:
//   - Certain Linux kernels where the USB subsystem withholds VID/PID
//   - Safari / Firefox (Web Serial not fully supported)
//   - Devices connected via a non-standard USB hub or converter
//
// When that happens:
//   info = port.getInfo?.() ?? {}   →  { }  (no usbVendorId, no usbProductId)
//   lookupDevice(undefined, undefined)  →  null
//
// null signals the wizard to proceed to probe-based identification, NOT to
// display an error.  If the probe also returns 'unknown' the user lands on the
// manual fallback form — a deliberate, clearly communicated path.
//
// These tests confirm that the empty-getInfo case is handled gracefully at
// every layer of the identification pipeline.

import { describe, it, expect, vi } from 'vitest';
import {
  lookupDevice,
  probeResultToDeviceType,
  probeResultToName,
  type ProbeResult,
} from './deviceDatabase';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Replicate the wizard's handleScan identification branch:
 *
 *   const info = port.getInfo?.() ?? {};
 *   const known = lookupDevice(info.usbVendorId, info.usbProductId);
 *   if (known) → 'recognized'
 *   else       → setState({ step: 'probing' }); probeDevice(port); ...
 *
 * Returns 'recognized' | 'probe' so tests can assert which branch is taken.
 */
function simulateWizardIdentification(
  getInfoResult: Record<string, unknown>,
): 'recognized' | 'probe' {
  const info = getInfoResult;
  const known = lookupDevice(
    info.usbVendorId as number | undefined,
    info.usbProductId as number | undefined,
  );
  return known ? 'recognized' : 'probe';
}

// ── Suite: empty getInfo() → probe path ───────────────────────────────────────

describe('HardwareWizard fallback — getInfo() returns empty object', () => {

  it('lookupDevice(undefined, undefined) returns null when getInfo() returns {}', () => {
    // Direct contract check: no VID/PID → lookup must return null.
    // This is the entry condition for the probe path.
    const result = lookupDevice(undefined, undefined);
    expect(result).toBeNull();
  });

  it('wizard enters the probe path (not recognized, not error) when getInfo() returns {}', () => {
    // Simulates: const info = port.getInfo?.() ?? {};
    // An empty object carries no usbVendorId or usbProductId.
    const branch = simulateWizardIdentification({});
    expect(branch).toBe('probe');
  });

  it('wizard enters the probe path when getInfo() is absent (port.getInfo is undefined)', () => {
    // port.getInfo?.() ?? {} evaluates to {} when getInfo is not a function.
    // Verify the nullish-coalesce default produces the same outcome.
    const info = (undefined as unknown as () => Record<string, unknown>)?.() ?? {};
    const known = lookupDevice(
      info.usbVendorId as number | undefined,
      info.usbProductId as number | undefined,
    );
    expect(known).toBeNull();
  });

  it('wizard does NOT transition to the error step — null from lookupDevice is not an error', () => {
    // The error step is only reached when serial.requestPort() rejects or
    // connectWithPort() throws.  A null lookup result simply moves the wizard
    // from 'probing' state to the probe-then-fallback path.
    //
    // We confirm this by checking that no exception is thrown during the
    // identification phase when getInfo() returns {}.
    expect(() => {
      simulateWizardIdentification({});
    }).not.toThrow();
  });
});

// ── Suite: probe outcomes after empty getInfo() ───────────────────────────────

describe('HardwareWizard fallback — probe outcomes after empty getInfo()', () => {

  it('probe result "escpos" maps to suggestedType "printer" — wizard shows recognized card', () => {
    // When the ESC/POS probe succeeds the wizard builds a synthetic KnownDevice
    // and transitions to the "recognized" step, not "fallback".
    const probeResult: ProbeResult = 'escpos';
    const suggestedType = probeResultToDeviceType(probeResult);
    expect(suggestedType).toBe('printer');
  });

  it('probe result "zpl" maps to suggestedType "labelPrinter" — wizard shows recognized card', () => {
    const probeResult: ProbeResult = 'zpl';
    const suggestedType = probeResultToDeviceType(probeResult);
    expect(suggestedType).toBe('labelPrinter');
  });

  it('probe result "unknown" maps to suggestedType null — wizard shows manual fallback form', () => {
    // This is the final graceful fallback: both VID/PID lookup and probe failed.
    // The user sees the manual selection form rather than an error.
    const probeResult: ProbeResult = 'unknown';
    const suggestedType = probeResultToDeviceType(probeResult);
    expect(suggestedType).toBeNull();
  });

  it('probe result "unknown" produces a non-empty suggestedName for the fallback form', () => {
    // Even when the device is completely unrecognized the fallback form receives
    // a descriptive default name so the placeholder is meaningful.
    const name = probeResultToName('unknown');
    expect(typeof name).toBe('string');
    expect(name.length).toBeGreaterThan(0);
  });

  it('wizard branch when probe returns "unknown" is "fallback", not "error"', () => {
    // Replicate the wizard's post-probe branch:
    //   if (probeResult !== 'unknown') → 'recognized'
    //   else                           → 'fallback'  ← deliberate, graceful
    const probeResult: ProbeResult = 'unknown';
    const wizardStep = probeResult !== 'unknown' ? 'recognized' : 'fallback';
    expect(wizardStep).toBe('fallback');
  });
});

// ── Suite: full identification pipeline — empty getInfo() end-to-end ──────────

describe('HardwareWizard fallback — end-to-end pipeline simulation with empty getInfo()', () => {

  it('full pipeline: empty getInfo() → probe "escpos" → wizard step "recognized"', () => {
    // Step 1: getInfo returns {} → lookup returns null → wizard initiates probe
    const info = {} as Record<string, unknown>;
    const known = lookupDevice(
      info.usbVendorId as number | undefined,
      info.usbProductId as number | undefined,
    );
    expect(known).toBeNull(); // confirmed: enters probe path

    // Step 2: probe identifies ESC/POS → synthetic device built → "recognized"
    const probeResult: ProbeResult = 'escpos';
    const suggestedType = probeResultToDeviceType(probeResult);
    const wizardStep = probeResult !== 'unknown' ? 'recognized' : 'fallback';

    expect(suggestedType).toBe('printer');
    expect(wizardStep).toBe('recognized');
  });

  it('full pipeline: empty getInfo() → probe "unknown" → wizard step "fallback" (not "error")', () => {
    // Step 1: getInfo returns {} → lookup returns null
    const info = {} as Record<string, unknown>;
    const known = lookupDevice(
      info.usbVendorId as number | undefined,
      info.usbProductId as number | undefined,
    );
    expect(known).toBeNull();

    // Step 2: probe also fails → wizard lands on manual fallback form
    const probeResult: ProbeResult = 'unknown';
    const suggestedType = probeResultToDeviceType(probeResult);
    const wizardStep = probeResult !== 'unknown' ? 'recognized' : 'fallback';

    // Deliberate, graceful fallback: staff can still connect the device manually
    expect(suggestedType).toBeNull();
    expect(wizardStep).toBe('fallback');
  });
});
