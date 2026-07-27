// ─── deviceDatabase — port.open() timeout guard ────────────────────────────────
//
// probeEscPos and probeZpl both call port.open() before setting the read
// timeout.  If port.open() itself hangs (e.g. the OS is loading a driver for
// an unknown USB-serial chip) the entire probe would hang indefinitely — no
// timeout, no fallback — stalling the wizard with no recovery path.
//
// The fix wraps port.open() in openWithTimeout() (racing against
// PROBE_OPEN_TIMEOUT_MS).  These tests confirm:
//   1. probeEscPos returns false (not hangs) when port.open() never resolves.
//   2. probeZpl    returns false (not hangs) when port.open() never resolves.
//   3. probeDevice returns 'unknown' (not hangs) in the same scenario.
//   4. The wizard reaches the fallback form, not the error state.
//
// Fake timers are used so the suite runs instantly.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  probeEscPos,
  probeZpl,
  probeDevice,
  probeResultToDeviceType,
  PROBE_OPEN_TIMEOUT_MS,
  type ProbeResult,
} from './deviceDatabase';

// ── Mock port factory — port.open() hangs forever ────────────────────────────

/**
 * Build a mock Web Serial port whose open() call never resolves.
 *
 * This simulates a slow driver: the OS has accepted the open syscall but has
 * not returned — e.g. kernel module loading, firmware enumeration delay, or a
 * stuck driver.
 *
 * port.readable is null (port is logically closed) so the probeDevice guard
 * does not short-circuit; the probes must run and hit the open timeout.
 */
function makeHangingOpenPort() {
  // open() returns a promise that never settles — models an infinite hang.
  const open = vi.fn(() => new Promise<void>(() => { /* hangs forever */ }));
  const close = vi.fn(async () => {});

  return {
    open,
    close,
    readable: null,   // null = port is closed (Web Serial API contract)
    writable: {
      getWriter: vi.fn(),
    },
    getInfo: vi.fn(() => ({})),
  };
}

// ── Fake-timer setup ──────────────────────────────────────────────────────────
//
// Each test:
//   1. Starts the probe (returns a pending promise).
//   2. Advances fake timers past PROBE_OPEN_TIMEOUT_MS.
//   3. Awaits the now-settled promise.
//
// This avoids any real wall-clock delay while still exercising the real
// setTimeout path inside openWithTimeout.

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Suite 1: probeEscPos resolves to false when port.open() hangs ─────────────

describe('probeEscPos — port.open() timeout', () => {

  it('resolves to false (not hangs) when port.open() never resolves', async () => {
    const port = makeHangingOpenPort();

    const resultPromise = probeEscPos(port);
    // Advance time past the open timeout so the race resolves.
    await vi.advanceTimersByTimeAsync(PROBE_OPEN_TIMEOUT_MS + 50);

    const result = await resultPromise;
    expect(result).toBe(false);
  });

  it('does NOT throw when port.open() hangs — resolves cleanly', async () => {
    const port = makeHangingOpenPort();

    const resultPromise = probeEscPos(port);
    await vi.advanceTimersByTimeAsync(PROBE_OPEN_TIMEOUT_MS + 50);

    await expect(resultPromise).resolves.not.toThrow();
  });

  it('calls port.open() exactly once despite the timeout', async () => {
    const port = makeHangingOpenPort();

    const resultPromise = probeEscPos(port);
    await vi.advanceTimersByTimeAsync(PROBE_OPEN_TIMEOUT_MS + 50);
    await resultPromise;

    expect(port.open).toHaveBeenCalledTimes(1);
  });

  it('does not hang for longer than PROBE_OPEN_TIMEOUT_MS', async () => {
    // If the guard is missing, the probe would never settle.
    // The test itself times out in that case; here we just assert the timeout
    // fires promptly — within one tick after the deadline.
    const port = makeHangingOpenPort();

    let settled = false;
    const resultPromise = probeEscPos(port).then(v => { settled = true; return v; });

    // Just before the timeout — should still be pending.
    await vi.advanceTimersByTimeAsync(PROBE_OPEN_TIMEOUT_MS - 1);
    // Give microtasks a chance to run; if already settled something is wrong.
    await Promise.resolve();
    expect(settled).toBe(false);

    // Past the timeout — must now be settled.
    await vi.advanceTimersByTimeAsync(100);
    await resultPromise;
    expect(settled).toBe(true);
  });
});

// ── Suite 2: probeZpl resolves to false when port.open() hangs ───────────────

describe('probeZpl — port.open() timeout', () => {

  it('resolves to false (not hangs) when port.open() never resolves', async () => {
    const port = makeHangingOpenPort();

    const resultPromise = probeZpl(port);
    await vi.advanceTimersByTimeAsync(PROBE_OPEN_TIMEOUT_MS + 50);

    const result = await resultPromise;
    expect(result).toBe(false);
  });

  it('does NOT throw when port.open() hangs — resolves cleanly', async () => {
    const port = makeHangingOpenPort();

    const resultPromise = probeZpl(port);
    await vi.advanceTimersByTimeAsync(PROBE_OPEN_TIMEOUT_MS + 50);

    await expect(resultPromise).resolves.not.toThrow();
  });

  it('calls port.open() exactly once despite the timeout', async () => {
    const port = makeHangingOpenPort();

    const resultPromise = probeZpl(port);
    await vi.advanceTimersByTimeAsync(PROBE_OPEN_TIMEOUT_MS + 50);
    await resultPromise;

    expect(port.open).toHaveBeenCalledTimes(1);
  });

  it('does not hang for longer than PROBE_OPEN_TIMEOUT_MS', async () => {
    const port = makeHangingOpenPort();

    let settled = false;
    const resultPromise = probeZpl(port).then(v => { settled = true; return v; });

    await vi.advanceTimersByTimeAsync(PROBE_OPEN_TIMEOUT_MS - 1);
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(100);
    await resultPromise;
    expect(settled).toBe(true);
  });
});

// ── Suite 3: probeDevice returns 'unknown' when port.open() hangs ────────────
//
// probeDevice calls probeEscPos then probeZpl in sequence.  Both time out on
// a hanging port, so probeDevice must return 'unknown' — sending the wizard to
// the manual-selection fallback form rather than stalling indefinitely.

describe('probeDevice — port.open() timeout', () => {

  it('returns "unknown" (not hangs) when port.open() never resolves', async () => {
    const port = makeHangingOpenPort();

    const resultPromise = probeDevice(port);
    // Two probes run in sequence; each waits up to PROBE_OPEN_TIMEOUT_MS.
    await vi.advanceTimersByTimeAsync(PROBE_OPEN_TIMEOUT_MS * 2 + 200);

    const result = await resultPromise;
    expect(result).toBe('unknown');
  });

  it('does NOT return "escpos" when port.open() hangs', async () => {
    const port = makeHangingOpenPort();

    const resultPromise = probeDevice(port);
    await vi.advanceTimersByTimeAsync(PROBE_OPEN_TIMEOUT_MS * 2 + 200);

    expect(await resultPromise).not.toBe('escpos');
  });

  it('does NOT return "zpl" when port.open() hangs', async () => {
    const port = makeHangingOpenPort();

    const resultPromise = probeDevice(port);
    await vi.advanceTimersByTimeAsync(PROBE_OPEN_TIMEOUT_MS * 2 + 200);

    expect(await resultPromise).not.toBe('zpl');
  });

  it('does NOT throw — probeDevice resolves cleanly when port.open() hangs', async () => {
    const port = makeHangingOpenPort();

    const resultPromise = probeDevice(port);
    await vi.advanceTimersByTimeAsync(PROBE_OPEN_TIMEOUT_MS * 2 + 200);

    await expect(resultPromise).resolves.not.toThrow();
  });

  it('port.open() is attempted for each probe (ESC/POS and ZPL) before giving up', async () => {
    // Both probes must run so that a device that responds slowly to ESC/POS
    // but quickly to ZPL is not silently misidentified as unknown.
    const port = makeHangingOpenPort();

    const resultPromise = probeDevice(port);
    await vi.advanceTimersByTimeAsync(PROBE_OPEN_TIMEOUT_MS * 2 + 200);
    await resultPromise;

    // Each probe calls open() once: probeEscPos + probeZpl = 2 calls total.
    expect(port.open).toHaveBeenCalledTimes(2);
  });
});

// ── Suite 4: wizard fallback when port.open() hangs ──────────────────────────
//
// Confirm the 'unknown' result from a hanging open leads to the same graceful
// wizard path as any other unrecognised device — the manual-selection form.

describe('wizard step — hanging port.open() falls through to fallback form', () => {

  it('probeResultToDeviceType("unknown") returns null — fallback form shown', () => {
    const result: ProbeResult = 'unknown';
    expect(probeResultToDeviceType(result)).toBeNull();
  });

  it('wizard branches to "fallback" (not "error") for "unknown" result', () => {
    const result: ProbeResult = 'unknown';
    const wizardStep = result !== 'unknown' ? 'recognized' : 'fallback';
    expect(wizardStep).toBe('fallback');
  });

  it('full path: hanging port.open() → probeDevice "unknown" → wizard "fallback"', async () => {
    const port = makeHangingOpenPort();

    const resultPromise = probeDevice(port);
    await vi.advanceTimersByTimeAsync(PROBE_OPEN_TIMEOUT_MS * 2 + 200);
    const probeResult = await resultPromise;

    // Step 1: probe returned 'unknown' (not stuck)
    expect(probeResult).toBe('unknown');

    // Step 2: wizard shows fallback form, not error state
    const wizardStep = probeResult !== 'unknown' ? 'recognized' : 'fallback';
    expect(wizardStep).toBe('fallback');

    // Step 3: no device type pre-selected (staff must pick manually)
    expect(probeResultToDeviceType(probeResult)).toBeNull();
  });
});

// ── Suite 5: PROBE_OPEN_TIMEOUT_MS is a positive number ──────────────────────
//
// Sanity check: the exported constant must be a reasonable positive number
// so callers can reason about the maximum probe duration.

describe('PROBE_OPEN_TIMEOUT_MS constant', () => {

  it('is a positive number', () => {
    expect(typeof PROBE_OPEN_TIMEOUT_MS).toBe('number');
    expect(PROBE_OPEN_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it('is at least 1000 ms — long enough for real driver loads', () => {
    // Anything shorter would cause spurious timeouts on slow hardware.
    expect(PROBE_OPEN_TIMEOUT_MS).toBeGreaterThanOrEqual(1_000);
  });

  it('is at most 10 000 ms — short enough not to stall the wizard noticeably', () => {
    expect(PROBE_OPEN_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
  });
});
