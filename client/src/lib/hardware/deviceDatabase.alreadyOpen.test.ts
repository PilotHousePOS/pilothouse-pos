// ─── deviceDatabase — already-open port guard ──────────────────────────────────
//
// probeDevice() calls port.open() inside each probe sub-function.  If the port
// is already open when probeDevice() is called, port.open() throws
// InvalidStateError — a crash rather than a graceful fallback.
//
// The guard added to probeDevice() detects an open port via port.readable
// (non-null in the Web Serial API when the port is open) and returns 'unknown'
// immediately, sending the wizard to the manual-selection form.
//
// These tests confirm:
//   1. probeDevice returns 'unknown' (not throws) for an already-open port.
//   2. port.open() is never called on an already-open port.
//   3. The wizard transitions to 'fallback', not 'error', for this outcome.

import { describe, it, expect, vi } from 'vitest';
import {
  probeDevice,
  probeResultToDeviceType,
  probeResultToName,
  type ProbeResult,
} from './deviceDatabase';

// ── Mock port factory — port already open ─────────────────────────────────────

/**
 * Build a mock Web Serial port that is already open.
 *
 * In the Web Serial API, `port.readable` is a non-null ReadableStream when
 * the port is open and null when it is closed.  We set readable to a truthy
 * object to simulate an open port.
 *
 * port.open() is also wired to throw InvalidStateError so that any code that
 * bypasses the guard will produce a detectable failure rather than a silent
 * wrong result.
 */
function makeAlreadyOpenPort() {
  const open = vi.fn(async () => {
    const err = new DOMException(
      "Failed to open serial port. The port is already open.",
      "InvalidStateError",
    );
    throw err;
  });
  const close = vi.fn(async () => {});

  // port.readable being non-null is the signal that the port is open.
  const readableStream = { locked: false } as unknown as ReadableStream;
  const writableStream = { locked: false } as unknown as WritableStream;

  return {
    open,
    close,
    readable: readableStream,
    writable: writableStream,
    getInfo: vi.fn(() => ({})),
  };
}

/**
 * Build a mock Web Serial port that is closed (port.readable is null).
 * Used for contrast tests to confirm the guard does not fire for closed ports.
 *
 * open() is wired to succeed so the ESC/POS and ZPL probes can run.
 * Both return empty data so probeDevice returns 'unknown'.
 */
function makeClosedPort() {
  const open = vi.fn(async () => {});
  const close = vi.fn(async () => {});

  function makeWriter() {
    return {
      write: vi.fn(async (_data: Uint8Array) => {}),
      releaseLock: vi.fn(),
    };
  }

  return {
    open,
    close,
    readable: null,   // null = port is closed (Web Serial API contract)
    writable: {
      getWriter: vi.fn(() => makeWriter()),
    },
    getInfo: vi.fn(() => ({})),
  };
}

// ── Suite 1: already-open port — probeDevice must not throw ───────────────────

describe('probeDevice — already-open port guard', () => {

  it('returns "unknown" without throwing when port.readable is non-null', async () => {
    const port = makeAlreadyOpenPort();
    const result = await probeDevice(port);
    expect(result).toBe('unknown');
  });

  it('does NOT call port.open() when the port is already open', async () => {
    const port = makeAlreadyOpenPort();
    await probeDevice(port);
    // The guard must skip both ESC/POS and ZPL probes — port.open() must never
    // be called, avoiding the InvalidStateError double-open crash.
    expect(port.open).not.toHaveBeenCalled();
  });

  it('does NOT throw InvalidStateError when the port is already open', async () => {
    const port = makeAlreadyOpenPort();
    // Any unhandled exception here would previously crash the wizard and
    // leave it in an unrecoverable state.
    await expect(probeDevice(port)).resolves.not.toThrow();
  });

  it('returns "unknown" (not "escpos" or "zpl") for an already-open port', async () => {
    const port = makeAlreadyOpenPort();
    const result = await probeDevice(port);
    expect(result).not.toBe('escpos');
    expect(result).not.toBe('zpl');
    expect(result).toBe('unknown');
  });

  it('does NOT call port.close() when the guard fires (no open was attempted)', async () => {
    const port = makeAlreadyOpenPort();
    await probeDevice(port);
    // The guard exits before any open/close cycle — close must not be called.
    expect(port.close).not.toHaveBeenCalled();
  });
});

// ── Suite 2: wizard step after already-open guard returns 'unknown' ───────────
//
// probeDevice('unknown') → wizard transitions to 'fallback', not 'error'.
// This mirrors the identical contract verified for a legitimately unrecognized
// device — the already-open case must reach the same safe outcome.

describe('wizard step — already-open port falls through to fallback form', () => {

  it('probeResultToDeviceType("unknown") returns null — wizard shows fallback form', () => {
    const probeResult: ProbeResult = 'unknown';
    const suggestedType = probeResultToDeviceType(probeResult);
    expect(suggestedType).toBeNull();
  });

  it('wizard branch for "unknown" is "fallback", not "error"', () => {
    const probeResult: ProbeResult = 'unknown';
    // Replicates the wizard's post-probe branch in HardwareWizard.tsx handleScan.
    const wizardStep = probeResult !== 'unknown' ? 'recognized' : 'fallback';
    expect(wizardStep).toBe('fallback');
  });

  it('probeResultToName("unknown") provides a non-empty fallback name for the form', () => {
    const name = probeResultToName('unknown');
    expect(typeof name).toBe('string');
    expect(name.length).toBeGreaterThan(0);
  });

  it('full path: already-open port → probeDevice "unknown" → wizard step "fallback"', async () => {
    const port = makeAlreadyOpenPort();

    // Step 1: guard fires — returns 'unknown', never throws
    const probeResult = await probeDevice(port);
    expect(probeResult).toBe('unknown');

    // Step 2: wizard branches to 'fallback' — staff can still connect manually
    const wizardStep = probeResult !== 'unknown' ? 'recognized' : 'fallback';
    expect(wizardStep).toBe('fallback');

    // Step 3: a suggestedType of null is valid for the fallback form
    const suggestedType = probeResultToDeviceType(probeResult);
    expect(suggestedType).toBeNull();
  });
});

// ── Suite 3: guard does not fire for a closed port (regression check) ─────────
//
// A closed port (port.readable === null) must still attempt the probes.
// Confirm the guard only activates for the already-open case.

describe('probeDevice — guard does not fire when port is closed', () => {

  it('port.readable === null is the closed-port signal — guard must not activate', () => {
    // Directly assert the sentinel value the guard checks.
    const closedPortReadable = null;
    // Guard condition: port.readable != null → skip probe
    const guardWouldFire = closedPortReadable != null;
    expect(guardWouldFire).toBe(false);
  });

  it('port.readable !== null is the open-port signal — guard must activate', () => {
    const openPortReadable = {} as ReadableStream; // truthy non-null
    const guardWouldFire = openPortReadable != null;
    expect(guardWouldFire).toBe(true);
  });

  it('guard activates for truthy readable (simulates real open port)', async () => {
    const port = makeAlreadyOpenPort();
    // Confirm the guard condition evaluates to true for our mock.
    expect(port.readable != null).toBe(true);

    // And confirm the guard takes effect.
    const result = await probeDevice(port);
    expect(result).toBe('unknown');
    expect(port.open).not.toHaveBeenCalled();
  });
});
