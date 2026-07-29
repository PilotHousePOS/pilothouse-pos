// @vitest-environment jsdom
// ─── Hardware Wizard — Replace-Confirm Guard Component Tests ──────────────────
//
// Renders the real HardwareWizard component and drives it through the complete
// interaction flow to confirm the replace-confirm guard fires and behaves
// correctly when a device slot is already connected.
//
// SCENARIOS COVERED
//   1. replace-confirm step appears when the printer slot is 'connected'
//      (recognized path — handleConfirmRecognized)
//   2. Clicking Cancel on replace-confirm returns to 'pick' step; the existing
//      device is untouched (connectWithPort is NOT called)
//   3. Clicking Replace on replace-confirm proceeds to connecting and calls
//      connectWithPort with the correct arguments
//   4. Guard does NOT fire when the slot is 'disconnected'; wizard goes straight
//      to connecting (no replace-confirm step shown)
//   5. Fallback path (handleConfirmFallback) also shows replace-confirm when
//      the slot is 'connected'
//   6. Cancel on the fallback replace-confirm also returns to pick without
//      calling connectWithPort
//   7. Replace on the fallback replace-confirm calls connectWithPort correctly
//   8. Clicking outside the dialog on the replace-confirm step calls
//      e.preventDefault() and leaves the dialog open

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { HardwareWizard } from '../../components/pos/HardwareWizard';
import type { HardwareDevices, DeviceState } from '../../hooks/useHardwareDevices';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Epson TM-T88VI — known VID/PID; wizard enters 'recognized' without probing. */
const EPSON_PORT = {
  getInfo: () => ({ usbVendorId: 0x04b8, usbProductId: 0x0e27 }),
  open:    vi.fn().mockResolvedValue(undefined),
};

/** Unknown port — VID/PID not in database; probeDevice mock returns 'unknown'. */
const UNKNOWN_PORT = {
  getInfo: () => ({}),
  open:    vi.fn().mockResolvedValue(undefined),
};

function makeDeviceState(status: DeviceState['status']): DeviceState {
  return {
    status,
    deviceName: status === 'connected' ? 'Epson TM-T88VI Receipt Printer' : '',
    port:       status === 'connected' ? ({} as any) : null,
    baudRate:   9600,
  };
}

type MockHw = HardwareDevices & { connectWithPort: ReturnType<typeof vi.fn> };

function makeHw(printerStatus: DeviceState['status'] = 'disconnected'): MockHw {
  const connectWithPort = vi.fn().mockResolvedValue(undefined);
  return {
    hardwareSupported: true,
    terminal:     makeDeviceState('disconnected'),
    printer:      makeDeviceState(printerStatus),
    labelPrinter: makeDeviceState('disconnected'),
    connectTerminal:     vi.fn(),
    connectPrinter:      vi.fn(),
    connectLabelPrinter: vi.fn(),
    disconnectDevice:    vi.fn(),
    connectWithPort,
    connectWithQzPort:        vi.fn().mockResolvedValue(undefined),
    connectWithElectronPort:  vi.fn().mockResolvedValue(undefined),
    recheckTransport:         vi.fn().mockResolvedValue(undefined),
    transport:         'webserial' as const,
  };
}

function renderWizard(hw: HardwareDevices) {
  const onClose   = vi.fn();
  const onSuccess = vi.fn();
  render(<HardwareWizard open hw={hw} onClose={onClose} onSuccess={onSuccess} />);
  return { onClose, onSuccess };
}

function mockSerialWith(port: typeof EPSON_PORT | typeof UNKNOWN_PORT) {
  Object.defineProperty(navigator, 'serial', {
    value: {
      requestPort:         vi.fn().mockResolvedValue(port),
      getPorts:            vi.fn().mockResolvedValue([]),
      addEventListener:    vi.fn(),
      removeEventListener: vi.fn(),
    },
    writable:     true,
    configurable: true,
  });
}

/** The replace-confirm step always renders a "Replace {label}" button — use that
 *  as the canonical sentinel instead of body text that appears in multiple nodes. */
const REPLACE_BTN_LABEL = /replace receipt printer/i;

/** Click "Scan for Device" to start the wizard flow. */
async function clickScan(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /scan for device/i }));
}

// ── Mock: probeDevice — returns 'unknown' so unknown ports land on fallback form
vi.mock('@/lib/hardware/deviceDatabase', async (importActual) => {
  const real = await importActual<typeof import('@/lib/hardware/deviceDatabase')>();
  return {
    ...real,
    probeDevice: vi.fn().mockResolvedValue('unknown'),
  };
});

// ── Suite A: recognized path (handleConfirmRecognized) ─────────────────────────

describe('HardwareWizard replace-confirm — recognized device path', () => {
  beforeEach(() => mockSerialWith(EPSON_PORT));
  afterEach(() => vi.clearAllMocks());

  it('1. shows replace-confirm step when the printer slot is already connected', async () => {
    const hw = makeHw('connected');
    renderWizard(hw);
    const user = userEvent.setup();

    // Wizard starts on 'pick' step
    expect(screen.getByText(/plug in your device/i)).toBeInTheDocument();

    // Scan → recognized step
    await clickScan(user);
    await waitFor(() =>
      expect(screen.getByText(/device recognized/i)).toBeInTheDocument(),
    );

    // Click "Done — Connect Device" — slot is 'connected', guard must fire
    await user.click(screen.getByRole('button', { name: /done.*connect device/i }));

    // replace-confirm step is identified by its unique "Replace Receipt Printer" button
    await waitFor(() =>
      expect(screen.getByRole('button', { name: REPLACE_BTN_LABEL })).toBeInTheDocument(),
    );
    // The warning heading should also be present
    expect(
      screen.getAllByText(/receipt printer.*already connected/i).length,
    ).toBeGreaterThan(0);
  });

  it('2. Cancel on replace-confirm returns to pick step; connectWithPort is NOT called', async () => {
    const hw = makeHw('connected');
    renderWizard(hw);
    const user = userEvent.setup();

    await clickScan(user);
    await waitFor(() => screen.getByText(/device recognized/i));
    await user.click(screen.getByRole('button', { name: /done.*connect device/i }));
    await waitFor(() => screen.getByRole('button', { name: REPLACE_BTN_LABEL }));

    // Click Cancel
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    // Must return to 'pick' step
    await waitFor(() =>
      expect(screen.getByText(/plug in your device/i)).toBeInTheDocument(),
    );
    // The existing device was not replaced
    expect(hw.connectWithPort).not.toHaveBeenCalled();
  });

  it('3. Replace proceeds to connecting and calls connectWithPort with correct args', async () => {
    const hw = makeHw('connected');
    renderWizard(hw);
    const user = userEvent.setup();

    await clickScan(user);
    await waitFor(() => screen.getByText(/device recognized/i));
    await user.click(screen.getByRole('button', { name: /done.*connect device/i }));
    await waitFor(() => screen.getByRole('button', { name: REPLACE_BTN_LABEL }));

    // Click Replace
    await user.click(screen.getByRole('button', { name: REPLACE_BTN_LABEL }));

    // connectWithPort is called with the correct Epson device details
    await waitFor(() => expect(hw.connectWithPort).toHaveBeenCalledOnce());
    expect(hw.connectWithPort).toHaveBeenCalledWith(
      'printer',
      EPSON_PORT,
      9600,
      'Epson TM-T88VI Receipt Printer',
    );
  });

  it('4. Guard does NOT fire when the slot is disconnected — no replace-confirm shown', async () => {
    const hw = makeHw('disconnected');
    renderWizard(hw);
    const user = userEvent.setup();

    await clickScan(user);
    await waitFor(() => screen.getByText(/device recognized/i));
    await user.click(screen.getByRole('button', { name: /done.*connect device/i }));

    // replace-confirm Replace button must NOT appear
    await waitFor(() => expect(hw.connectWithPort).toHaveBeenCalledOnce());
    expect(screen.queryByRole('button', { name: REPLACE_BTN_LABEL })).not.toBeInTheDocument();
  });
});

// ── Suite B: fallback path (handleConfirmFallback) ─────────────────────────────

describe('HardwareWizard replace-confirm — fallback (manual) device path', () => {
  beforeEach(() => mockSerialWith(UNKNOWN_PORT));
  afterEach(() => vi.clearAllMocks());

  it('5. shows replace-confirm when the slot is connected and user confirms unknown device', async () => {
    const hw = makeHw('connected');
    renderWizard(hw);
    const user = userEvent.setup();

    // Scan → unknown port → fallback form
    await clickScan(user);
    await waitFor(() =>
      expect(screen.getByText(/device not recognized/i)).toBeInTheDocument(),
    );

    // Click "Connect Device" — slot is connected, guard fires
    await user.click(screen.getByRole('button', { name: /^connect device$/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: REPLACE_BTN_LABEL })).toBeInTheDocument(),
    );
  });

  it('6. Cancel on fallback replace-confirm returns to pick without calling connectWithPort', async () => {
    const hw = makeHw('connected');
    renderWizard(hw);
    const user = userEvent.setup();

    await clickScan(user);
    await waitFor(() => screen.getByText(/device not recognized/i));
    await user.click(screen.getByRole('button', { name: /^connect device$/i }));
    await waitFor(() => screen.getByRole('button', { name: REPLACE_BTN_LABEL }));

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    await waitFor(() =>
      expect(screen.getByText(/plug in your device/i)).toBeInTheDocument(),
    );
    expect(hw.connectWithPort).not.toHaveBeenCalled();
  });

  it('7. Replace on fallback replace-confirm calls connectWithPort with resolved name', async () => {
    const hw = makeHw('connected');
    renderWizard(hw);
    const user = userEvent.setup();

    await clickScan(user);
    await waitFor(() => screen.getByText(/device not recognized/i));
    await user.click(screen.getByRole('button', { name: /^connect device$/i }));
    await waitFor(() => screen.getByRole('button', { name: REPLACE_BTN_LABEL }));

    await user.click(screen.getByRole('button', { name: REPLACE_BTN_LABEL }));

    await waitFor(() => expect(hw.connectWithPort).toHaveBeenCalledOnce());
    // No custom name was entered → resolvedName falls back to deviceTypeLabel('printer')
    expect(hw.connectWithPort).toHaveBeenCalledWith(
      'printer',
      UNKNOWN_PORT,
      9600,
      'Receipt Printer + Cash Drawer',
    );
  });
});

// ── Suite D: outside-click guard on probing and connecting ─────────────────────

describe('HardwareWizard outside-click is blocked during probing', () => {
  afterEach(() => vi.clearAllMocks());

  it('9. clicking outside during probing calls e.preventDefault() and step stays probing', async () => {
    // probeDevice hangs so the wizard stays on the probing step for the duration of the test
    const { probeDevice } = await import('@/lib/hardware/deviceDatabase');
    (probeDevice as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    mockSerialWith(UNKNOWN_PORT);
    const hw = makeHw('disconnected');
    renderWizard(hw);
    const user = userEvent.setup();

    // Click Scan — requestPort resolves immediately; VID/PID lookup misses;
    // wizard moves to 'probing' and then awaits the hanging probeDevice call.
    await user.click(screen.getByRole('button', { name: /scan for device/i }));
    await waitFor(() =>
      expect(screen.getByText(/identifying device/i)).toBeInTheDocument(),
    );

    const preventDefaultSpy = vi.spyOn(Event.prototype, 'preventDefault');

    document.body.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true }),
    );

    await waitFor(() => {
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    // Wizard must still be on the probing step
    expect(screen.getByText(/identifying device/i)).toBeInTheDocument();

    preventDefaultSpy.mockRestore();
  });
});

describe('HardwareWizard outside-click is blocked during connecting', () => {
  beforeEach(() => mockSerialWith(EPSON_PORT));
  afterEach(() => vi.clearAllMocks());

  it('10. clicking outside during connecting calls e.preventDefault() and step stays connecting', async () => {
    // connectWithPort hangs so the wizard stays on the connecting step
    const hw = makeHw('disconnected');
    (hw.connectWithPort as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    renderWizard(hw);
    const user = userEvent.setup();

    // Navigate to recognized step
    await user.click(screen.getByRole('button', { name: /scan for device/i }));
    await waitFor(() =>
      expect(screen.getByText(/device recognized/i)).toBeInTheDocument(),
    );

    // Click "Done — Connect Device" — slot is disconnected so no replace-confirm;
    // wizard moves straight to 'connecting' and awaits the hanging connectWithPort.
    await user.click(screen.getByRole('button', { name: /done.*connect device/i }));
    await waitFor(() =>
      expect(screen.getByText(/connecting/i)).toBeInTheDocument(),
    );

    const preventDefaultSpy = vi.spyOn(Event.prototype, 'preventDefault');

    document.body.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true }),
    );

    await waitFor(() => {
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    // Wizard must still be on the connecting step
    expect(screen.getByText(/connecting/i)).toBeInTheDocument();

    preventDefaultSpy.mockRestore();
  });
});

// ── Suite C: outside-click guard on replace-confirm ────────────────────────────

describe('HardwareWizard replace-confirm — outside-click is blocked', () => {
  beforeEach(() => mockSerialWith(EPSON_PORT));
  afterEach(() => vi.clearAllMocks());

  it('8. clicking outside calls e.preventDefault() and dialog stays on replace-confirm', async () => {
    const hw = makeHw('connected');
    renderWizard(hw);
    const user = userEvent.setup();

    // Navigate to the replace-confirm step (same path as test 1)
    await clickScan(user);
    await waitFor(() => screen.getByText(/device recognized/i));
    await user.click(screen.getByRole('button', { name: /done.*connect device/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: REPLACE_BTN_LABEL })).toBeInTheDocument(),
    );

    // Spy on preventDefault so we can assert it was called
    const preventDefaultSpy = vi.spyOn(Event.prototype, 'preventDefault');

    // Radix UI's DismissableLayer listens for pointerdown events on the document
    // and calls onInteractOutside when the target is outside the dialog content.
    // Firing a pointerdown on document.body simulates an outside click.
    document.body.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true }),
    );

    // Allow any microtasks / event-loop ticks to settle
    await waitFor(() => {
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    // The replace-confirm step must still be visible — dialog did not close
    expect(screen.getByRole('button', { name: REPLACE_BTN_LABEL })).toBeInTheDocument();

    preventDefaultSpy.mockRestore();
  });
});
