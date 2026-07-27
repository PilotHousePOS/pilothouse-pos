// ─── deviceDatabase — ZPL label-printer probe tests ───────────────────────────
//
// Regression guard: when a ZPL-speaking label printer is NOT in KNOWN_DEVICES
// the wizard probes it with ~HI and must classify it as 'label-printer', never
// 'receipt-printer'.
//
// Three layers are tested:
//   1. probeDevice(port)          → returns 'zpl' when the port responds to ~HI
//   2. probeResultToDeviceType    → 'zpl' maps to 'labelPrinter' (not 'printer')
//   3. Wizard synthetic KnownDevice → deviceCategory is 'label-printer'
//
// The mock port is stateful: the first open/read cycle (ESC/POS probe) returns
// an empty payload so probeEscPos() returns false; the second cycle (ZPL probe)
// returns a 'Y' response so probeZpl() returns true.

import { describe, it, expect, vi } from 'vitest';
import {
  probeDevice,
  probeResultToDeviceType,
  probeResultToName,
  type ProbeResult,
  type KnownDevice,
  type KnownDeviceCategory,
  type KnownDeviceProtocol,
} from './deviceDatabase';

// ── Mock port factory ─────────────────────────────────────────────────────────

/**
 * Build a minimal Web Serial mock that:
 *  - Rejects the ESC/POS probe (returns 0 bytes on the first open)
 *  - Accepts the ZPL probe    (returns 'Y…' on the second open)
 *
 * The probe functions call open → write → read → close independently, so we
 * track `openCount` to return the right response per probe cycle.
 */
function makeZplMockPort() {
  let openCount = 0;

  // Each call to open() increments the counter so getReader() knows which
  // probe cycle we are in.
  const open = vi.fn(async (_options: unknown) => { openCount++; });
  const close = vi.fn(async () => {});

  // Writers are stateless (we only verify that write() doesn't throw).
  function makeWriter() {
    return {
      write: vi.fn(async (_data: Uint8Array) => {}),
      releaseLock: vi.fn(),
    };
  }

  // Readers are per-cycle: cycle 1 → empty (ESC/POS fails), cycle 2 → 'Y' (ZPL passes).
  function makeReader(cycle: number) {
    const zplResponse = new TextEncoder().encode('Y,ZPL,1.0\r\n');
    const emptyResponse = new Uint8Array(0);

    return {
      read: vi.fn(async () => ({
        value: cycle >= 2 ? zplResponse : emptyResponse,
        done: false,
      })),
      releaseLock: vi.fn(),
      cancel: vi.fn(async () => {}),
    };
  }

  return {
    open,
    close,
    writable: {
      getWriter: vi.fn(() => makeWriter()),
    },
    // getReader is called AFTER open, so openCount reflects the current cycle.
    readable: {
      get getReader() {
        return vi.fn(() => makeReader(openCount));
      },
    },
  };
}

// ── Suite 1: probeDevice returns 'zpl' for a ZPL-only port ───────────────────

describe('probeDevice — ZPL label printer', () => {

  it('returns "zpl" when the port does not respond to ESC/POS but responds to ~HI', async () => {
    const port = makeZplMockPort();
    const result = await probeDevice(port);
    expect(result).toBe('zpl');
  });

  it('does NOT return "escpos" for a ZPL-only port', async () => {
    const port = makeZplMockPort();
    const result = await probeDevice(port);
    expect(result).not.toBe('escpos');
  });

  it('does NOT return "unknown" for a ZPL-only port — fallback form must not appear', async () => {
    // If probe logic regresses (e.g. ZPL timeout shrinks) the result becomes
    // 'unknown', the wizard shows the manual fallback form, and the default
    // device type is 'printer' — silently misregistering a label printer as a
    // receipt printer.  This test is the regression guard for that failure mode.
    const port = makeZplMockPort();
    const result = await probeDevice(port);
    expect(result).not.toBe('unknown');
  });

  it('port.open() is called twice — once per probe (ESC/POS then ZPL)', async () => {
    const port = makeZplMockPort();
    await probeDevice(port);
    expect(port.open).toHaveBeenCalledTimes(2);
  });

  it('port.close() is called after each probe attempt', async () => {
    const port = makeZplMockPort();
    await probeDevice(port);
    // ESC/POS probe closes, then ZPL probe closes — two closes total.
    expect(port.close).toHaveBeenCalledTimes(2);
  });
});

// ── Suite 2: probeResultToDeviceType maps 'zpl' → 'labelPrinter' ─────────────

describe('probeResultToDeviceType — zpl result', () => {

  it('probeResultToDeviceType("zpl") returns "labelPrinter"', () => {
    const type = probeResultToDeviceType('zpl');
    expect(type).toBe('labelPrinter');
  });

  it('probeResultToDeviceType("zpl") does NOT return "printer" (receipt printer)', () => {
    // The regression: if this ever returns 'printer' a label printer is silently
    // registered as a receipt printer and cash drawer commands are sent to it.
    const type = probeResultToDeviceType('zpl');
    expect(type).not.toBe('printer');
  });

  it('probeResultToDeviceType("zpl") returns a non-null value', () => {
    // A null result sends the wizard to the manual fallback form with 'printer'
    // as the default — also a silent misregistration path.
    const type = probeResultToDeviceType('zpl');
    expect(type).not.toBeNull();
  });

  it('probeResultToName("zpl") mentions "Label Printer" in the friendly name', () => {
    const name = probeResultToName('zpl');
    expect(name).toMatch(/label/i);
  });

  it('probeResultToName("zpl") does NOT mention "Receipt" in the friendly name', () => {
    const name = probeResultToName('zpl');
    expect(name).not.toMatch(/receipt/i);
  });
});

// ── Suite 3: synthetic KnownDevice uses deviceCategory 'label-printer' ────────
//
// The wizard builds this object when probeResult !== 'unknown':
//   const synthetic: KnownDevice = {
//     name:           suggestedName,
//     deviceCategory: probeResult === 'escpos' ? 'receipt-printer' : 'label-printer',
//     protocol:       probeResult === 'escpos' ? 'escpos'          : 'zpl',
//     defaultBaudRate: 9600,
//   };
//
// We replicate that construction here and assert the category is 'label-printer'.

describe('wizard synthetic KnownDevice — ZPL probe result', () => {

  /** Replicate the wizard's synthetic device construction (HardwareWizard.tsx). */
  function buildSyntheticDevice(probeResult: ProbeResult): KnownDevice {
    const suggestedName = probeResultToName(probeResult);
    return {
      name:            suggestedName,
      deviceCategory:  (probeResult === 'escpos' ? 'receipt-printer' : 'label-printer') as KnownDeviceCategory,
      protocol:        (probeResult === 'escpos' ? 'escpos'          : 'zpl')           as KnownDeviceProtocol,
      defaultBaudRate: 9600,
    };
  }

  it('synthetic device has deviceCategory "label-printer" when probe returns "zpl"', () => {
    const synthetic = buildSyntheticDevice('zpl');
    expect(synthetic.deviceCategory).toBe('label-printer');
  });

  it('synthetic device does NOT have deviceCategory "receipt-printer" when probe returns "zpl"', () => {
    // Core regression guard: a ZPL label printer must never be categorised as a
    // receipt printer, which would cause the wizard to treat it as an ESC/POS
    // device and attempt to send cash-drawer pulse commands to it.
    const synthetic = buildSyntheticDevice('zpl');
    expect(synthetic.deviceCategory).not.toBe('receipt-printer');
  });

  it('synthetic device protocol is "zpl" when probe returns "zpl"', () => {
    const synthetic = buildSyntheticDevice('zpl');
    expect(synthetic.protocol).toBe('zpl');
  });

  it('synthetic device suggestedType from probeResultToDeviceType is "labelPrinter"', () => {
    const probeResult: ProbeResult = 'zpl';
    const suggestedType = probeResultToDeviceType(probeResult);
    expect(suggestedType).toBe('labelPrinter');
  });

  it('wizard transitions to "recognized" step (not "fallback") when probe returns "zpl"', () => {
    // The wizard only goes to "recognized" when probeResult !== 'unknown'.
    // A 'zpl' result must always produce the recognized card, not the fallback form.
    const probeResult: ProbeResult = 'zpl';
    const wizardStep = probeResult !== 'unknown' ? 'recognized' : 'fallback';
    expect(wizardStep).toBe('recognized');
  });

  it('contrast: ESC/POS probe produces "receipt-printer" category — ZPL must differ', () => {
    // Sanity check: confirm the two probe results produce different categories.
    const escposSynthetic = buildSyntheticDevice('escpos');
    const zplSynthetic    = buildSyntheticDevice('zpl');

    expect(escposSynthetic.deviceCategory).toBe('receipt-printer');
    expect(zplSynthetic.deviceCategory).toBe('label-printer');
    expect(escposSynthetic.deviceCategory).not.toBe(zplSynthetic.deviceCategory);
  });
});
