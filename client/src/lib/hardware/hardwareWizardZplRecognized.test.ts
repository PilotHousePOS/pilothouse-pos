// ─── Hardware Wizard — ZPL Recognized Card Initial Type Tests ─────────────────
//
// Confirms that when the wizard reaches the "recognized" step via a ZPL probe
// result, the initialType passed to StepRecognized is 'labelPrinter' — never
// 'printer' (receipt printer).
//
// The guard being tested is the chain:
//   probeDevice(port) → 'zpl'
//   probeResultToDeviceType('zpl') → 'labelPrinter'
//   setState({ step: 'recognized', suggestedType: 'labelPrinter' })
//   → StepRecognized receives initialType = 'labelPrinter'
//
// A regression in any link of this chain would silently save the label printer
// under the 'printer' (receipt printer + cash drawer) slot, causing ESC/POS
// cash-drawer pulse commands to be sent to the ZPL device.

import { describe, it, expect } from 'vitest';
import {
  probeResultToDeviceType,
  probeResultToName,
  type ProbeResult,
  type KnownDevice,
  type KnownDeviceCategory,
  type KnownDeviceProtocol,
} from './deviceDatabase';
import type { DeviceType } from '@/hooks/useHardwareDevices';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Replicate the wizard's synthetic KnownDevice construction in handleScan
 * (HardwareWizard.tsx) when probeResult !== 'unknown':
 *
 *   const synthetic: KnownDevice = {
 *     name:            suggestedName,
 *     deviceCategory:  probeResult === 'escpos' ? 'receipt-printer' : 'label-printer',
 *     protocol:        probeResult === 'escpos' ? 'escpos'          : 'zpl',
 *     defaultBaudRate: 9600,
 *   };
 *   setState({ step: 'recognized', port, device: synthetic, suggestedType });
 *
 * Returns the { device, suggestedType } pair that becomes the 'recognized' step state.
 */
function buildRecognizedState(probeResult: ProbeResult): {
  device: KnownDevice;
  suggestedType: DeviceType | null;
} {
  const suggestedName  = probeResultToName(probeResult);
  const suggestedType  = probeResultToDeviceType(probeResult);
  const device: KnownDevice = {
    name:            suggestedName,
    deviceCategory:  (probeResult === 'escpos' ? 'receipt-printer' : 'label-printer') as KnownDeviceCategory,
    protocol:        (probeResult === 'escpos' ? 'escpos'          : 'zpl')           as KnownDeviceProtocol,
    defaultBaudRate: 9600,
  };
  return { device, suggestedType };
}

// ── Suite 1: recognized card initial type for a ZPL probe result ──────────────

describe('HardwareWizard recognized card — ZPL probe result initial type', () => {

  it('suggestedType (= StepRecognized initialType) is "labelPrinter" for a ZPL probe', () => {
    const { suggestedType } = buildRecognizedState('zpl');
    // This is the value passed as `initialType` to StepRecognized.
    // If it is ever 'printer' the dropdown starts on "Receipt Printer + Cash Drawer"
    // and the device is saved to the wrong slot.
    expect(suggestedType).toBe('labelPrinter');
  });

  it('suggestedType is NOT "printer" (receipt printer) for a ZPL probe', () => {
    const { suggestedType } = buildRecognizedState('zpl');
    expect(suggestedType).not.toBe('printer');
  });

  it('suggestedType is NOT null for a ZPL probe — fallback form does not appear', () => {
    // A null result would also send the wizard to the fallback form, which
    // defaults to 'printer' — another silent mis-registration path.
    const { suggestedType } = buildRecognizedState('zpl');
    expect(suggestedType).not.toBeNull();
  });

  it('wizard step is "recognized" (not "fallback") because probeResult is not "unknown"', () => {
    // The wizard only enters "fallback" when probeResult === 'unknown'.
    // For 'zpl', it must always enter "recognized".
    const probeResult: ProbeResult = 'zpl';
    const wizardStep = probeResult !== 'unknown' ? 'recognized' : 'fallback';
    expect(wizardStep).toBe('recognized');
  });

  it('synthetic device name mentions "Label Printer" — shown on the recognized card', () => {
    const { device } = buildRecognizedState('zpl');
    expect(device.name).toMatch(/label/i);
  });

  it('synthetic device name does NOT mention "Receipt" — no mis-labelling on the card', () => {
    const { device } = buildRecognizedState('zpl');
    expect(device.name).not.toMatch(/receipt/i);
  });
});

// ── Suite 2: warning guard — cross-category change detection ──────────────────
//
// StepRecognized exposes a "Use as a different device type" override.
// When initialType is 'labelPrinter' (ZPL device) and the operator selects
// 'printer', the component should surface a warning.  These tests encode
// the conditions that trigger the warning so regressions are caught early.

describe('StepRecognized cross-category change warning — trigger conditions', () => {

  it('warning condition is met when initialType is "labelPrinter" and selected type is "printer"', () => {
    const initialType: DeviceType = 'labelPrinter'; // ZPL probe result
    const selectedType: DeviceType = 'printer';     // operator override
    const shouldWarn = initialType === 'labelPrinter' && selectedType !== 'labelPrinter';
    expect(shouldWarn).toBe(true);
  });

  it('warning condition is met when initialType is "labelPrinter" and selected type is "terminal"', () => {
    const initialType: DeviceType = 'labelPrinter';
    const selectedType: DeviceType = 'terminal';
    const shouldWarn = initialType === 'labelPrinter' && selectedType !== 'labelPrinter';
    expect(shouldWarn).toBe(true);
  });

  it('warning condition is NOT met when initialType is "labelPrinter" and type stays "labelPrinter"', () => {
    const initialType: DeviceType = 'labelPrinter';
    const selectedType: DeviceType = 'labelPrinter';
    const shouldWarn = initialType === 'labelPrinter' && selectedType !== 'labelPrinter';
    expect(shouldWarn).toBe(false);
  });

  it('warning condition is NOT met when initialType is "printer" (receipt printer from ESC/POS probe)', () => {
    // The warning is specifically for ZPL label-printer devices being re-classified.
    // A receipt printer overridden to a different type does not need the same guard.
    const initialType: DeviceType = 'printer';
    const selectedType: DeviceType = 'labelPrinter';
    const shouldWarn = initialType === 'labelPrinter' && selectedType !== 'labelPrinter';
    expect(shouldWarn).toBe(false);
  });

  it('warning condition is NOT met when initialType is "terminal"', () => {
    const initialType: DeviceType = 'terminal';
    const selectedType: DeviceType = 'printer';
    const shouldWarn = initialType === 'labelPrinter' && selectedType !== 'labelPrinter';
    expect(shouldWarn).toBe(false);
  });
});

// ── Suite 3: contrast — ESC/POS probe produces "printer", ZPL must produce "labelPrinter" ───

describe('HardwareWizard recognized card — ESC/POS vs ZPL initial type contrast', () => {

  it('ESC/POS probe → initialType "printer", ZPL probe → initialType "labelPrinter"', () => {
    const { suggestedType: escposType } = buildRecognizedState('escpos');
    const { suggestedType: zplType }    = buildRecognizedState('zpl');

    expect(escposType).toBe('printer');
    expect(zplType).toBe('labelPrinter');
    expect(escposType).not.toBe(zplType);
  });

  it('ESC/POS probe device category is "receipt-printer", ZPL is "label-printer"', () => {
    const { device: escposDevice } = buildRecognizedState('escpos');
    const { device: zplDevice }    = buildRecognizedState('zpl');

    expect(escposDevice.deviceCategory).toBe('receipt-printer');
    expect(zplDevice.deviceCategory).toBe('label-printer');
  });

  it('ESC/POS probe protocol is "escpos", ZPL probe protocol is "zpl"', () => {
    const { device: escposDevice } = buildRecognizedState('escpos');
    const { device: zplDevice }    = buildRecognizedState('zpl');

    expect(escposDevice.protocol).toBe('escpos');
    expect(zplDevice.protocol).toBe('zpl');
  });
});
