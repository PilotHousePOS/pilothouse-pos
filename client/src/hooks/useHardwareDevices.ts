// ─── PilotHouse Hardware Device Manager ──────────────────────────────────────
// Manages Web Serial connections to three POS peripherals:
//   - Card terminal (Dejavoo/EP semi-integrated)
//   - Receipt printer + cash drawer (ESC/POS)
//   - Label printer (ZPL II)
//
// BROWSER SUPPORT
// Chrome 89+, Edge 89+, Opera 75+. NOT supported on iOS Safari / Firefox.
// The hook sets hardwareSupported = false gracefully on unsupported browsers.
//
// PERSISTENCE
// The Web Serial API remembers granted ports across reloads via
// navigator.serial.getPorts(). On mount, the hook tries to auto-reconnect to
// previously paired devices using stored { usbVendorId, usbProductId } hints
// from localStorage. This is best-effort — if the hint can't find a port the
// user just clicks Connect again.

import { useState, useEffect, useRef, useCallback } from 'react';
import { TERMINAL_BAUD_RATE } from '@/lib/hardware/terminal';
import { LABEL_PRINTER_BAUD_RATE } from '@/lib/hardware/zpl';

export type DeviceType = 'terminal' | 'printer' | 'labelPrinter';
export type DeviceStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface DeviceState {
  status:     DeviceStatus;
  deviceName: string;     // e.g. "USB Serial Device (0x0483:0x5740)"
  port:       any | null; // SerialPort handle — null when disconnected
}

export interface HardwareDevices {
  hardwareSupported: boolean;
  terminal:          DeviceState;
  printer:           DeviceState;
  labelPrinter:      DeviceState;
  connectTerminal:     () => Promise<void>;
  connectPrinter:      () => Promise<void>;
  connectLabelPrinter: () => Promise<void>;
  disconnectDevice:    (type: DeviceType) => Promise<void>;
}

const EMPTY_DEVICE: DeviceState = { status: 'disconnected', deviceName: '', port: null };

const BAUD_RATES: Record<DeviceType, number> = {
  terminal:    TERMINAL_BAUD_RATE,
  printer:     9600,
  labelPrinter: LABEL_PRINTER_BAUD_RATE,
};

const LS_KEY = 'pilothouse-hw-devices'; // localStorage key

function loadStoredHints(): Record<DeviceType, { usbVendorId?: number; usbProductId?: number } | null> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : { terminal: null, printer: null, labelPrinter: null };
  } catch {
    return { terminal: null, printer: null, labelPrinter: null };
  }
}

function saveHint(type: DeviceType, info: { usbVendorId?: number; usbProductId?: number } | null) {
  try {
    const hints = loadStoredHints();
    hints[type] = info;
    localStorage.setItem(LS_KEY, JSON.stringify(hints));
  } catch {}
}

function deviceLabel(port: any): string {
  try {
    const info = port.getInfo?.();
    if (info?.usbVendorId && info?.usbProductId) {
      return `USB Serial (${info.usbVendorId.toString(16)}:${info.usbProductId.toString(16)})`;
    }
  } catch {}
  return 'Serial Device';
}

export function useHardwareDevices(): HardwareDevices {
  const hardwareSupported = typeof navigator !== 'undefined' && 'serial' in navigator;

  const [terminal,     setTerminal]     = useState<DeviceState>(EMPTY_DEVICE);
  const [printer,      setPrinter]      = useState<DeviceState>(EMPTY_DEVICE);
  const [labelPrinter, setLabelPrinter] = useState<DeviceState>(EMPTY_DEVICE);

  // Keep port refs so callbacks always see the latest port without stale closures
  const terminalRef     = useRef<any>(null);
  const printerRef      = useRef<any>(null);
  const labelPrinterRef = useRef<any>(null);

  const refs: Record<DeviceType, React.MutableRefObject<any>> = {
    terminal:     terminalRef,
    printer:      printerRef,
    labelPrinter: labelPrinterRef,
  };

  const setters: Record<DeviceType, React.Dispatch<React.SetStateAction<DeviceState>>> = {
    terminal:     setTerminal,
    printer:      setPrinter,
    labelPrinter: setLabelPrinter,
  };

  // ── Auto-reconnect on mount ──────────────────────────────────────────────────
  useEffect(() => {
    if (!hardwareSupported) return;

    const serial = (navigator as any).serial as {
      getPorts(): Promise<any[]>;
    };

    (async () => {
      let ports: any[] = [];
      try { ports = await serial.getPorts(); } catch { return; }
      if (!ports.length) return;

      const hints = loadStoredHints();
      const types: DeviceType[] = ['terminal', 'printer', 'labelPrinter'];

      for (const type of types) {
        const hint = hints[type];
        if (!hint) continue;

        // Find a previously granted port matching the stored vid/pid
        const match = ports.find((p: any) => {
          const info = p.getInfo?.();
          return (
            info?.usbVendorId  === hint.usbVendorId &&
            info?.usbProductId === hint.usbProductId
          );
        });

        if (match) {
          try {
            setters[type](s => ({ ...s, status: 'connecting' }));
            await match.open({ baudRate: BAUD_RATES[type] });
            refs[type].current = match;
            setters[type]({ status: 'connected', deviceName: deviceLabel(match), port: match });
          } catch {
            setters[type](EMPTY_DEVICE);
          }
        }
      }
    })();

    return () => {
      // Close all ports on unmount to avoid locked handles
      for (const ref of [terminalRef, printerRef, labelPrinterRef]) {
        if (ref.current) {
          try { ref.current.close(); } catch {}
          ref.current = null;
        }
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Connect helper ────────────────────────────────────────────────────────────
  const connectDevice = useCallback(async (type: DeviceType): Promise<void> => {
    if (!hardwareSupported) return;

    const serial = (navigator as any).serial as {
      requestPort(options?: { filters?: any[] }): Promise<any>;
    };

    setters[type](s => ({ ...s, status: 'connecting' }));

    try {
      const port = await serial.requestPort({ filters: [] });

      // Close existing port of this type if one is open
      if (refs[type].current) {
        try { await refs[type].current.close(); } catch {}
      }

      await port.open({ baudRate: BAUD_RATES[type] });

      refs[type].current = port;

      // Save VID/PID hint for auto-reconnect
      try {
        const info = port.getInfo?.();
        if (info?.usbVendorId || info?.usbProductId) {
          saveHint(type, info);
        }
      } catch {}

      setters[type]({ status: 'connected', deviceName: deviceLabel(port), port });
    } catch (err: any) {
      // User cancelled the picker: err.name === 'NotFoundError' — treat as aborted
      if (err?.name === 'NotFoundError') {
        setters[type](s => ({ ...s, status: s.status === 'connecting' ? 'disconnected' : s.status }));
      } else {
        setters[type](s => ({ ...s, status: 'error', port: null }));
      }
    }
  }, [hardwareSupported]);

  // ── Disconnect helper ─────────────────────────────────────────────────────────
  const disconnectDevice = useCallback(async (type: DeviceType): Promise<void> => {
    const port = refs[type].current;
    if (port) {
      try { await port.close(); } catch {}
      refs[type].current = null;
    }
    saveHint(type, null);
    setters[type](EMPTY_DEVICE);
  }, []);

  return {
    hardwareSupported,
    terminal,
    printer,
    labelPrinter,
    connectTerminal:     () => connectDevice('terminal'),
    connectPrinter:      () => connectDevice('printer'),
    connectLabelPrinter: () => connectDevice('labelPrinter'),
    disconnectDevice,
  };
}
