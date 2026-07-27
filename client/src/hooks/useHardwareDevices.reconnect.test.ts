// @vitest-environment jsdom
// ─── useHardwareDevices — Auto-reconnect Exhaustion Tests ─────────────────────
//
// Confirms that after AUTO_RECONNECT_MAX_RETRIES (3) consecutive failed
// port.open() calls:
//   - The device status flips to 'disconnected' (not stuck at 'connecting')
//   - The "Hardware unavailable" toast is shown with the correct copy
//   - No further setTimeout calls are scheduled after the final failure

import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useHardwareDevices } from './useHardwareDevices';

// ── Toast mock ────────────────────────────────────────────────────────────────

const mockToast = vi.fn();

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// ── Serial API mock helpers ───────────────────────────────────────────────────

type DisconnectHandler = (event: { port: unknown }) => void;

function makeSerialMock(ports: unknown[] = []) {
  const listeners: Map<string, DisconnectHandler[]> = new Map();

  const serial = {
    getPorts: vi.fn().mockResolvedValue(ports),
    addEventListener: vi.fn((event: string, handler: DisconnectHandler) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(handler);
    }),
    removeEventListener: vi.fn((event: string, handler: DisconnectHandler) => {
      const arr = listeners.get(event) ?? [];
      const idx = arr.indexOf(handler);
      if (idx !== -1) arr.splice(idx, 1);
    }),
    fireDisconnect(port: unknown) {
      for (const h of listeners.get('disconnect') ?? []) {
        h({ port });
      }
    },
  };

  return serial;
}

// ── Port mock helpers ─────────────────────────────────────────────────────────

function makePort(openBehavior: 'succeed' | 'fail') {
  return {
    getInfo: () => ({ usbVendorId: 0x04b8, usbProductId: 0x0e27 }),
    open: openBehavior === 'succeed'
      ? vi.fn().mockResolvedValue(undefined)
      : vi.fn().mockRejectedValue(new DOMException('Port in use', 'InvalidStateError')),
  };
}

// ── localStorage stub (avoids JSDOM warnings) ─────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem:  vi.fn().mockReturnValue(null),
    setItem:  vi.fn(),
    removeItem: vi.fn(),
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useHardwareDevices — auto-reconnect exhaustion', () => {
  let serial: ReturnType<typeof makeSerialMock>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockToast.mockClear();

    serial = makeSerialMock(); // no pre-paired ports on mount
    vi.stubGlobal('navigator', { serial });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('status ends as "disconnected" after 3 failed port.open() attempts', async () => {
    const { result } = renderHook(() => useHardwareDevices());

    // ── Step 1: Connect the printer so the internal ref holds the port ─────────
    const printerPort = makePort('succeed');
    await act(async () => {
      await result.current.connectWithPort('printer', printerPort, 9600, 'Test Printer');
    });
    expect(result.current.printer.status).toBe('connected');

    // ── Step 2: Swap to a port that always fails on reopen ─────────────────────
    // Replace the open mock so every reconnect attempt fails
    printerPort.open.mockRejectedValue(
      new DOMException('Port in use', 'InvalidStateError'),
    );

    // ── Step 3: Fire the disconnect event ─────────────────────────────────────
    await act(async () => {
      serial.fireDisconnect(printerPort);
    });
    // Status should be 'connecting' (spinner visible)
    expect(result.current.printer.status).toBe('connecting');

    // ── Step 4: Advance through each retry (3 × 2 000 ms) ────────────────────
    for (let attempt = 1; attempt <= 3; attempt++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_001);
      });
    }

    // ── Assertions ─────────────────────────────────────────────────────────────
    // Status must be 'disconnected' — spinner cleared
    expect(result.current.printer.status).toBe('disconnected');
    expect(result.current.printer.port).toBeNull();

    // "Hardware unavailable" toast must have been fired exactly once
    const unavailableCalls = mockToast.mock.calls.filter(
      ([arg]) => arg?.title === 'Hardware unavailable',
    );
    expect(unavailableCalls).toHaveLength(1);

    const [toastArg] = unavailableCalls[0];
    expect(toastArg.description).toMatch(/could not reconnect/i);
    expect(toastArg.description).toMatch(/3 attempts/i);
    expect(toastArg.description).toMatch(/please reconnect the cable/i);
  });

  it('status is "connecting" after 2 failures but before the 3rd attempt resolves', async () => {
    const { result } = renderHook(() => useHardwareDevices());

    const printerPort = makePort('succeed');
    await act(async () => {
      await result.current.connectWithPort('printer', printerPort, 9600, 'Test Printer');
    });

    printerPort.open.mockRejectedValue(new DOMException('fail'));

    await act(async () => {
      serial.fireDisconnect(printerPort);
    });
    expect(result.current.printer.status).toBe('connecting');

    // Advance through only 2 retries — should still be 'connecting'
    for (let attempt = 1; attempt <= 2; attempt++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_001);
      });
    }

    expect(result.current.printer.status).toBe('connecting');

    // Complete the 3rd retry to clean up timers
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_001);
    });
    expect(result.current.printer.status).toBe('disconnected');
  });

  it('no further timer is scheduled after the final failure', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    const { result } = renderHook(() => useHardwareDevices());

    const printerPort = makePort('succeed');
    await act(async () => {
      await result.current.connectWithPort('printer', printerPort, 9600, 'Test Printer');
    });

    printerPort.open.mockRejectedValue(new DOMException('fail'));

    // Baseline BEFORE disconnect — the first retry setTimeout fires inside handleDisconnect
    const baselineBeforeDisconnect = setTimeoutSpy.mock.calls.length;

    await act(async () => {
      serial.fireDisconnect(printerPort);
    });

    // Advance through all 3 retries
    for (let attempt = 1; attempt <= 3; attempt++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_001);
      });
    }

    // Exactly 3 setTimeout calls should have been scheduled (one per attempt)
    const newCallsAfterExhaustion = setTimeoutSpy.mock.calls.length - baselineBeforeDisconnect;
    expect(newCallsAfterExhaustion).toBe(3);

    // No more timers fire after exhaustion — status stays 'disconnected'
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(result.current.printer.status).toBe('disconnected');

    setTimeoutSpy.mockRestore();
  });

  it('works identically for terminal and labelPrinter device types', async () => {
    for (const deviceType of ['terminal', 'labelPrinter'] as const) {
      mockToast.mockClear();
      serial = makeSerialMock();
      vi.stubGlobal('navigator', { serial });

      const { result, unmount } = renderHook(() => useHardwareDevices());

      const port = makePort('succeed');
      await act(async () => {
        await result.current.connectWithPort(deviceType, port, 9600, 'Test Device');
      });
      expect(result.current[deviceType].status).toBe('connected');

      port.open.mockRejectedValue(new DOMException('fail'));

      await act(async () => {
        serial.fireDisconnect(port);
      });

      for (let i = 0; i < 3; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(2_001);
        });
      }

      expect(result.current[deviceType].status).toBe('disconnected');

      const unavailable = mockToast.mock.calls.find(
        ([arg]) => arg?.title === 'Hardware unavailable',
      );
      expect(unavailable).toBeDefined();

      unmount();
    }
  });
});
