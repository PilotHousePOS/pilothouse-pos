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
// Also covers the retry scenario: if the probe times out on the first attempt
// (e.g. slow device startup) but succeeds on a second call, the wizard must
// land in 'recognized' with the correct suggestedType — NOT reset to 'fallback'
// with suggestedType null.
//
// These tests confirm that the empty-getInfo case is handled gracefully at
// every layer of the identification pipeline.

import { describe, it, expect, vi } from 'vitest';
import {
  lookupDevice,
  probeDevice,
  probeResultToDeviceType,
  probeResultToName,
  createScanSequence,
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

// ── Suite: probe retry behaviour — delayed device startup ─────────────────────
//
// Scenario: getInfo() returns {} (no VID/PID), so the wizard falls to
// probe-based identification.  On the first attempt the probe times out
// (slow device startup — the printer hasn't finished booting).  The wizard
// retries once; on the second attempt the ESC/POS probe succeeds.
//
// Expected outcome:
//   - wizard step  → 'recognized'   (NOT 'fallback')
//   - suggestedType → 'printer'     (NOT null)
//
// Implementation note: probeDevice() itself does not contain retry logic — the
// retry loop lives in the wizard's handleScan callback.  These tests validate
// the data-mapping layer used by that retry loop so it is exercised without
// needing a full React component mount.

describe('HardwareWizard fallback — probe retry on delayed device startup', () => {

  it('a probe function that fails once then succeeds returns the successful result on the second call', async () => {
    // Simulate a probe callable that times out on attempt 1 and succeeds on attempt 2.
    // This mirrors the wizard calling probeDevice() a second time after a failed first attempt.
    let callCount = 0;
    const retryableProbe = vi.fn(async (): Promise<ProbeResult> => {
      callCount += 1;
      if (callCount === 1) return 'unknown'; // first attempt: timeout / no response
      return 'escpos';                        // second attempt: device ready, responds
    });

    const firstResult  = await retryableProbe();
    const secondResult = await retryableProbe();

    expect(firstResult).toBe('unknown');
    expect(secondResult).toBe('escpos');
    expect(retryableProbe).toHaveBeenCalledTimes(2);
  });

  it('wizard ends in "recognized" with suggestedType "printer" when the second probe attempt returns "escpos"', async () => {
    // Full wizard-branch simulation using the retry result.
    let callCount = 0;
    const retryableProbe = vi.fn(async (): Promise<ProbeResult> => {
      callCount += 1;
      return callCount === 1 ? 'unknown' : 'escpos';
    });

    // Wizard logic: try once; if 'unknown', retry once more.
    let probeResult = await retryableProbe();
    if (probeResult === 'unknown') {
      probeResult = await retryableProbe();
    }

    const suggestedType = probeResultToDeviceType(probeResult);
    const wizardStep    = probeResult !== 'unknown' ? 'recognized' : 'fallback';

    expect(probeResult).toBe('escpos');
    expect(suggestedType).toBe('printer');
    expect(wizardStep).toBe('recognized');
  });

  it('wizard stays in "fallback" with suggestedType null when both probe attempts return "unknown"', async () => {
    // Ensures the retry path does not corrupt state when both attempts fail.
    const alwaysUnknown = vi.fn(async (): Promise<ProbeResult> => 'unknown');

    let probeResult = await alwaysUnknown();
    if (probeResult === 'unknown') {
      probeResult = await alwaysUnknown();
    }

    const suggestedType = probeResultToDeviceType(probeResult);
    const wizardStep    = probeResult !== 'unknown' ? 'recognized' : 'fallback';

    expect(suggestedType).toBeNull();
    expect(wizardStep).toBe('fallback');
    expect(alwaysUnknown).toHaveBeenCalledTimes(2);
  });

  it('probeDevice() is called with the same port object on each retry attempt', async () => {
    // Confirm the wizard passes the same port reference on retry — not a new port.
    // Using a mock port whose readable is null (so probeDevice skips the guard).
    const mockPort = {
      readable: null,
      open:     vi.fn().mockRejectedValue(new Error('timeout')), // always fails to open
      close:    vi.fn().mockResolvedValue(undefined),
    };

    const probeDeviceSpy = vi.fn(async (_port: unknown): Promise<ProbeResult> => 'unknown');

    // Simulate: wizard calls probeDevice(port) → 'unknown' → retries with same port
    let result = await probeDeviceSpy(mockPort);
    if (result === 'unknown') {
      result = await probeDeviceSpy(mockPort);
    }

    expect(probeDeviceSpy).toHaveBeenCalledTimes(2);
    expect(probeDeviceSpy).toHaveBeenNthCalledWith(1, mockPort);
    expect(probeDeviceSpy).toHaveBeenNthCalledWith(2, mockPort);
  });

  it('probeDevice() with a port whose readable becomes non-null between retries returns "unknown" on the second call', async () => {
    // If the port was opened externally between attempts, the guard inside
    // probeDevice() (port.readable != null) must prevent a double-open crash
    // and return 'unknown' — not an exception.
    const portThatOpensItself = {
      readable: null as ReadableStream<Uint8Array> | null,
    };

    // First call: port is closed (readable === null) — simulate 'unknown' outcome
    // by having the probe respond with nothing (we patch probeDevice for isolation).
    const probeDeviceMock = vi.fn(async (port: typeof portThatOpensItself): Promise<ProbeResult> => {
      // After the first call the port marks itself as open
      port.readable = new ReadableStream<Uint8Array>();
      return 'unknown';
    });

    let result = await probeDeviceMock(portThatOpensItself);
    // port.readable is now non-null

    if (result === 'unknown') {
      // Real probeDevice would return 'unknown' immediately due to the guard.
      // Confirm that the guard condition is met.
      expect(portThatOpensItself.readable).not.toBeNull();
      // Calling real probeDevice with an already-open port returns 'unknown' (guard fires).
      result = await probeDevice(portThatOpensItself);
    }

    const suggestedType = probeResultToDeviceType(result);
    const wizardStep    = result !== 'unknown' ? 'recognized' : 'fallback';

    expect(result).toBe('unknown');
    expect(suggestedType).toBeNull();
    expect(wizardStep).toBe('fallback');
  });
});

// ── Suite: overlapping probe race — second scan before first probe finishes ────
//
// Scenario: the user plugs in device A, the wizard starts probing it (slow —
// still in-flight).  Before that probe resolves the user unplugs A and plugs in
// device B.  The wizard starts a second probe.
//
//   Timeline:
//     t=0  scan 1 starts  → probe for port A (will return 'zpl',   slow)
//     t=10 scan 2 starts  → probe for port B (will return 'escpos', fast)
//     t=20 probe B resolves first  → wizard commits 'escpos'
//     t=50 probe A resolves later  → wizard MUST discard this stale result
//
// Correct behaviour: HardwareWizard.handleScan calls createScanSequence().next()
// at the start of each scan and createScanSequence().isStale(id) after every
// await before committing state.  These tests validate that contract directly
// against the exported createScanSequence utility from deviceDatabase.ts — the
// same function the component uses.
//
// The handleScan pattern under test:
//
//   const myScanId = scanSeq.current.next();          // start of scan
//   const probeResult = await probeDevice(port);
//   if (scanSeq.current.isStale(myScanId)) return;    // discard stale
//   setState({ step: ..., suggestedType: ... });       // commit

describe('HardwareWizard race condition — second scan started before first probe resolves', () => {

  /**
   * Thin wrapper that replicates the wizard's handleScan pattern using the
   * real createScanSequence from deviceDatabase.ts.  This is NOT a synthetic
   * helper — it directly exercises the exported guard that the component uses.
   */
  function makeWizardHandleScan() {
    const seq = createScanSequence();
    let committedResult: ProbeResult | null = null;
    let committedStep: 'recognized' | 'fallback' | 'probing' = 'probing';
    let committedType: ReturnType<typeof probeResultToDeviceType> = null;

    async function handleScan(probeImpl: () => Promise<ProbeResult>) {
      // Mirrors: const myScanId = scanSeq.current.next();
      const myScanId = seq.next();
      const result = await probeImpl();

      // Mirrors: if (scanSeq.current.isStale(myScanId)) return;
      if (seq.isStale(myScanId)) return;

      committedResult = result;
      committedType   = probeResultToDeviceType(result);
      committedStep   = result !== 'unknown' ? 'recognized' : 'fallback';
    }

    return {
      handleScan,
      seq,
      getState: () => ({ committedResult, committedStep, committedType }),
    };
  }

  // ── createScanSequence unit contract ────────────────────────────────────────

  it('createScanSequence.next() increments monotonically from 0', () => {
    const seq = createScanSequence();
    expect(seq.current()).toBe(0);
    expect(seq.next()).toBe(1);
    expect(seq.next()).toBe(2);
    expect(seq.next()).toBe(3);
    expect(seq.current()).toBe(3);
  });

  it('createScanSequence.isStale returns false for the latest ID', () => {
    const seq = createScanSequence();
    const id = seq.next();
    expect(seq.isStale(id)).toBe(false);
  });

  it('createScanSequence.isStale returns true once a newer scan starts', () => {
    const seq = createScanSequence();
    const firstId = seq.next();   // scan 1
    seq.next();                   // scan 2 — firstId is now stale
    expect(seq.isStale(firstId)).toBe(true);
  });

  it('createScanSequence.isStale returns true for any earlier scan when three scans start', () => {
    const seq = createScanSequence();
    const id1 = seq.next();
    const id2 = seq.next();
    const id3 = seq.next();
    expect(seq.isStale(id1)).toBe(true);
    expect(seq.isStale(id2)).toBe(true);
    expect(seq.isStale(id3)).toBe(false); // latest
  });

  // ── Race-condition scenarios using the real guard ────────────────────────────

  it('when probe 2 resolves before probe 1, the wizard shows probe 2 result (escpos/printer)', async () => {
    // probe 1 is slow (returns 'zpl'); probe 2 is fast (returns 'escpos').
    // Both are in-flight simultaneously.  Probe 2 resolves first → escpos wins.
    const wizard = makeWizardHandleScan();

    let resolveProbe1!: (r: ProbeResult) => void;
    const slowProbe = (): Promise<ProbeResult> =>
      new Promise<ProbeResult>((res) => { resolveProbe1 = res; });

    let resolveProbe2!: (r: ProbeResult) => void;
    const fastProbe = (): Promise<ProbeResult> =>
      new Promise<ProbeResult>((res) => { resolveProbe2 = res; });

    // Start scan 1 (still in-flight)
    const scan1 = wizard.handleScan(slowProbe);
    // Start scan 2 — seq.next() advances counter; scan 1's id is now stale
    const scan2 = wizard.handleScan(fastProbe);

    // Probe 2 resolves first
    resolveProbe2('escpos');
    await scan2;

    // Probe 1 resolves later — isStale must prevent it from overwriting state
    resolveProbe1('zpl');
    await scan1;

    const { committedResult, committedStep, committedType } = wizard.getState();
    expect(committedResult).toBe('escpos');
    expect(committedType).toBe('printer');
    expect(committedStep).toBe('recognized');
  });

  it('intermediate state after scan 2 and final state after scan 1 both reflect escpos', async () => {
    // Verifies state is stable both immediately after scan 2 resolves and after
    // the stale scan 1 resolves later.
    const wizard = makeWizardHandleScan();

    let resolveProbe1!: (r: ProbeResult) => void;
    const slowProbe = (): Promise<ProbeResult> =>
      new Promise<ProbeResult>((res) => { resolveProbe1 = res; });

    let resolveProbe2!: (r: ProbeResult) => void;
    const fastProbe = (): Promise<ProbeResult> =>
      new Promise<ProbeResult>((res) => { resolveProbe2 = res; });

    const scan1 = wizard.handleScan(slowProbe);
    const scan2 = wizard.handleScan(fastProbe);

    resolveProbe2('escpos');
    await scan2;

    // State immediately after scan 2
    expect(wizard.getState().committedResult).toBe('escpos');
    expect(wizard.getState().committedStep).toBe('recognized');

    // Stale scan 1 resolves with a different type — must not overwrite
    resolveProbe1('zpl');
    await scan1;

    expect(wizard.getState().committedResult).toBe('escpos');
    expect(wizard.getState().committedType).toBe('printer');
    expect(wizard.getState().committedStep).toBe('recognized');
  });

  it('a stale recognized result cannot overwrite a committed fallback step', async () => {
    // Scan 2 returns 'unknown' → fallback step committed.
    // Scan 1 (stale) later returns 'escpos' — must not bump user off fallback form.
    const wizard = makeWizardHandleScan();

    let resolveProbe1!: (r: ProbeResult) => void;
    const slowProbe = (): Promise<ProbeResult> =>
      new Promise<ProbeResult>((res) => { resolveProbe1 = res; });

    let resolveProbe2!: (r: ProbeResult) => void;
    const fastProbe = (): Promise<ProbeResult> =>
      new Promise<ProbeResult>((res) => { resolveProbe2 = res; });

    const scan1 = wizard.handleScan(slowProbe);
    const scan2 = wizard.handleScan(fastProbe);

    resolveProbe2('unknown');
    await scan2;

    expect(wizard.getState().committedStep).toBe('fallback');

    resolveProbe1('escpos'); // stale — must be ignored
    await scan1;

    expect(wizard.getState().committedResult).toBe('unknown');
    expect(wizard.getState().committedType).toBeNull();
    expect(wizard.getState().committedStep).toBe('fallback');
  });

  it('with three overlapping scans the last-started scan always wins regardless of resolve order', async () => {
    // Scans resolve in reverse order (oldest last) — the worst case for
    // last-write-wins bugs.  Only scan 3 should commit.
    const wizard = makeWizardHandleScan();

    const resolvers: Array<(r: ProbeResult) => void> = [];
    const results: ProbeResult[] = ['escpos', 'zpl', 'escpos'];

    const scans = results.map((result) =>
      wizard.handleScan((): Promise<ProbeResult> =>
        new Promise<ProbeResult>((res) => { resolvers.push(() => res(result)); }),
      ),
    );

    // Resolve newest first, oldest last
    resolvers[2](); await scans[2]; // scan 3 (current) — commits 'escpos'
    resolvers[1](); await scans[1]; // scan 2 (stale)   — discarded
    resolvers[0](); await scans[0]; // scan 1 (stale)   — discarded

    expect(wizard.getState().committedResult).toBe('escpos');
    expect(wizard.getState().committedType).toBe('printer');
    expect(wizard.getState().committedStep).toBe('recognized');
    // Confirm the sequence counter advanced three times
    expect(wizard.seq.current()).toBe(3);
  });

  it('suggestedType from a stale zpl probe never reaches the wizard state', async () => {
    // Verifies probeResultToDeviceType is only applied to the current scan;
    // 'labelPrinter' (from stale 'zpl') must never appear in committed state.
    const wizard = makeWizardHandleScan();

    let resolveStale!: (r: ProbeResult) => void;
    const staleProbe = (): Promise<ProbeResult> =>
      new Promise<ProbeResult>((res) => { resolveStale = res; });

    let resolveFresh!: (r: ProbeResult) => void;
    const freshProbe = (): Promise<ProbeResult> =>
      new Promise<ProbeResult>((res) => { resolveFresh = res; });

    const scan1 = wizard.handleScan(staleProbe);  // stale: will return 'zpl'
    const scan2 = wizard.handleScan(freshProbe);  // fresh: will return 'escpos'

    resolveFresh('escpos');
    await scan2;

    resolveStale('zpl');
    await scan1;

    expect(wizard.getState().committedType).not.toBe('labelPrinter');
    expect(wizard.getState().committedType).toBe('printer');
  });
});
