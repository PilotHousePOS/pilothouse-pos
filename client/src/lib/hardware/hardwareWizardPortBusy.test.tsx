// @vitest-environment jsdom
// ─── Hardware Wizard — Already-Open Port (Port Busy) Tests ────────────────────
//
// When a browser or driver returns a port that is already open (port.readable
// is non-null), the wizard must NOT silently fall through to the manual fallback
// form.  Instead it must show a targeted, user-friendly message so staff know
// what to do.
//
// SCENARIOS COVERED
//   1. Error message "already in use" appears when port.readable is non-null
//   2. The fallback form ("device not recognized") does NOT appear for a busy port
//   3. The "Scan for Device" button reappears after clicking Retry on the error
//   4. A closed port (port.readable === null) takes the normal probe path (not
//      the busy-port branch) — regression guard

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { HardwareWizard } from '../../components/pos/HardwareWizard';
import type { HardwareDevices, DeviceState } from '../../hooks/useHardwareDevices';

// ── Mock port factories ───────────────────────────────────────────────────────

/** A port that is already open — port.readable is non-null (Web Serial API). */
function makeAlreadyOpenPort() {
  return {
    getInfo: vi.fn(() => ({})),
    readable: { locked: false } as unknown as ReadableStream,
    writable: { locked: false } as unknown as WritableStream,
    open:     vi.fn(async () => {
      throw new DOMException('Port is already open.', 'InvalidStateError');
    }),
    close: vi.fn(async () => {}),
  };
}

/** A port that is closed — port.readable is null (normal probe path). */
function makeClosedUnknownPort() {
  return {
    getInfo: vi.fn(() => ({})),
    readable: null,
    writable: { getWriter: vi.fn(() => ({ write: vi.fn(async () => {}), releaseLock: vi.fn() })) },
    open:     vi.fn(async () => {}),
    close:    vi.fn(async () => {}),
  };
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function makeDeviceState(status: DeviceState['status']): DeviceState {
  return { status, deviceName: '', port: null, baudRate: 9600 };
}

function makeHw(): HardwareDevices {
  return {
    hardwareSupported:   true,
    terminal:            makeDeviceState('disconnected'),
    printer:             makeDeviceState('disconnected'),
    labelPrinter:        makeDeviceState('disconnected'),
    connectTerminal:     vi.fn(),
    connectPrinter:      vi.fn(),
    connectLabelPrinter: vi.fn(),
    disconnectDevice:    vi.fn(),
    connectWithPort:     vi.fn().mockResolvedValue(undefined),
  };
}

function mockSerialWith(port: ReturnType<typeof makeAlreadyOpenPort> | ReturnType<typeof makeClosedUnknownPort>) {
  Object.defineProperty(navigator, 'serial', {
    value:        { requestPort: vi.fn().mockResolvedValue(port) },
    writable:     true,
    configurable: true,
  });
}

function renderWizard() {
  const hw      = makeHw();
  const onClose   = vi.fn();
  const onSuccess = vi.fn();
  render(<HardwareWizard open hw={hw} onClose={onClose} onSuccess={onSuccess} />);
  return { hw, onClose, onSuccess };
}

async function clickScan(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /scan for device/i }));
}

// ── Mock probeDevice — returns 'unknown' to confirm the busy-port check fires
//    BEFORE probeDevice is even called (the mock is not reached for busy ports).
vi.mock('@/lib/hardware/deviceDatabase', async (importActual) => {
  const real = await importActual<typeof import('@/lib/hardware/deviceDatabase')>();
  return {
    ...real,
    probeDevice: vi.fn().mockResolvedValue('unknown'),
  };
});

// ── Suite: already-open port shows targeted error message ─────────────────────

describe('HardwareWizard — already-open port (port busy)', () => {
  beforeEach(() => mockSerialWith(makeAlreadyOpenPort()));
  afterEach(() => vi.clearAllMocks());

  it('1. shows "already in use" error when port.readable is non-null', async () => {
    renderWizard();
    const user = userEvent.setup();

    expect(screen.getByText(/plug in your device/i)).toBeInTheDocument();

    await clickScan(user);

    await waitFor(() =>
      expect(
        screen.getByText(/this device is already in use/i),
      ).toBeInTheDocument(),
    );
  });

  it('2. the fallback "device not recognized" form does NOT appear for a busy port', async () => {
    renderWizard();
    const user = userEvent.setup();

    await clickScan(user);

    await waitFor(() =>
      expect(screen.getByText(/this device is already in use/i)).toBeInTheDocument(),
    );

    // The fallback form must NOT be shown — that would silently skip the error
    expect(screen.queryByText(/device not recognized/i)).not.toBeInTheDocument();
  });

  it('3. clicking Retry on the error resets to the "Scan for Device" step', async () => {
    renderWizard();
    const user = userEvent.setup();

    await clickScan(user);
    await waitFor(() =>
      expect(screen.getByText(/this device is already in use/i)).toBeInTheDocument(),
    );

    // The StepError component renders a "Try Again" / "Retry" button
    const retryBtn = screen.getByRole('button', { name: /try again/i });
    await user.click(retryBtn);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /scan for device/i })).toBeInTheDocument(),
    );
  });
});

// ── Suite: closed port takes the normal probe path (regression guard) ──────────

describe('HardwareWizard — closed port skips the busy-port branch', () => {
  beforeEach(() => mockSerialWith(makeClosedUnknownPort()));
  afterEach(() => vi.clearAllMocks());

  it('4. closed port (port.readable === null) reaches the fallback form, not the busy error', async () => {
    renderWizard();
    const user = userEvent.setup();

    await clickScan(user);

    // probeDevice mock returns 'unknown' → wizard goes to 'fallback', NOT 'error'
    await waitFor(() =>
      expect(screen.getByText(/device not recognized/i)).toBeInTheDocument(),
    );

    // The busy-port error must NOT appear
    expect(screen.queryByText(/this device is already in use/i)).not.toBeInTheDocument();
  });
});
