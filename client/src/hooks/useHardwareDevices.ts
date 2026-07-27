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
// previously paired devices using stored { usbVendorId, usbProductId, baudRate,
// friendlyName } hints from localStorage. On successful reconnect, a brief
// "Hardware reconnected" toast is shown (not on the very first connection).

import { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { TERMINAL_BAUD_RATE } from '@/lib/hardware/terminal';
import { LABEL_PRINTER_BAUD_RATE } from '@/lib/hardware/zpl';

export type DeviceType = 'terminal' | 'printer' | 'labelPrinter';
export type DeviceStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface DeviceState {
  status:     DeviceStatus;
  deviceName: string;     // friendly name e.g. "Epson TM-T88VI Receipt Printer"
  port:       any | null; // SerialPort handle — null when disconnected
  baudRate?:  number;     // baud rate in use
}

export interface HardwareDevices {
  hardwareSupported: boolean;
  terminal:          DeviceState;
  printer:           DeviceState;
  labelPrinter:      DeviceState;
  // Legacy individual connect helpers (used by old HardwareDeviceCard UI)
  connectTerminal:     () => Promise<void>;
  connectPrinter:      () => Promise<void>;
  connectLabelPrinter: () => Promise<void>;
  disconnectDevice:    (type: DeviceType) => Promise<void>;
  // New: connect a port that the wizard has already identified
  connectWithPort: (
    type: DeviceType,
    port: any,
    baudRate: number,
    friendlyName: string,
  ) => Promise<void>;
}

const EMPTY_DEVICE: DeviceState = { status: 'disconnected', deviceName: '', port: null };

const DEFAULT_BAUD_RATES: Record<DeviceType, number> = {
  terminal:     TERMINAL_BAUD_RATE,
  printer:      9600,
  labelPrinter: LABEL_PRINTER_BAUD_RATE,
};

const LS_KEY = 'pilothouse-hw-devices'; // localStorage key

interface StoredHint {
  usbVendorId?:  number;
  usbProductId?: number;
  baudRate?:     number;
  friendlyName?: string;
}

function loadStoredHints(): Record<DeviceType, StoredHint | null> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : { terminal: null, printer: null, labelPrinter: null };
  } catch {
    return { terminal: null, printer: null, labelPrinter: null };
  }
}

function saveHint(type: DeviceType, hint: StoredHint | null) {
  try {
    const hints = loadStoredHints();
    hints[type] = hint;
    localStorage.setItem(LS_KEY, JSON.stringify(hints));
  } catch {}
}

function rawDeviceLabel(port: any): string {
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
  const { toast } = useToast();

  const [terminal,     setTerminal]     = useState<DeviceState>(EMPTY_DEVICE);
  const [printer,      setPrinter]      = useState<DeviceState>(EMPTY_DEVICE);
  const [labelPrinter, setLabelPrinter] = useState<DeviceState>(EMPTY_DEVICE);

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

    const serial = (navigator as any).serial as { getPorts(): Promise<any[]> };

    (async () => {
      let ports: any[] = [];
      try { ports = await serial.getPorts(); } catch { return; }
      if (!ports.length) return;

      const hints = loadStoredHints();
      const types: DeviceType[] = ['terminal', 'printer', 'labelPrinter'];
      const reconnected: string[] = [];

      for (const type of types) {
        const hint = hints[type];
        if (!hint) continue;

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
            const baud = hint.baudRate ?? DEFAULT_BAUD_RATES[type];
            await match.open({ baudRate: baud, dataBits: 8, stopBits: 1, parity: 'none' });
            refs[type].current = match;
            const name = hint.friendlyName ?? rawDeviceLabel(match);
            setters[type]({ status: 'connected', deviceName: name, port: match, baudRate: baud });
            // Only toast if it was a previous session (friendlyName stored = came from wizard)
            if (hint.friendlyName) reconnected.push(name);
          } catch {
            setters[type](EMPTY_DEVICE);
          }
        }
      }

      if (reconnected.length) {
        toast({
          title: 'Hardware reconnected',
          description: reconnected.join(', '),
          duration: 2500,
        });
      }
    })();

    return () => {
      for (const ref of [terminalRef, printerRef, labelPrinterRef]) {
        if (ref.current) {
          try { ref.current.close(); } catch {}
          ref.current = null;
        }
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Connect a port that was already identified by the wizard ─────────────────
  const connectWithPort = useCallback(async (
    type: DeviceType,
    port: any,
    baudRate: number,
    friendlyName: string,
  ): Promise<void> => {
    if (!hardwareSupported) return;

    // Close existing connection for this device type
    if (refs[type].current) {
      try { await refs[type].current.close(); } catch {}
      refs[type].current = null;
    }

    setters[type](s => ({ ...s, status: 'connecting' }));

    await port.open({ baudRate, dataBits: 8, stopBits: 1, parity: 'none' });
    refs[type].current = port;

    // Save VID/PID + baud rate + friendly name for auto-reconnect
    try {
      const info = port.getInfo?.() ?? {};
      saveHint(type, {
        usbVendorId:  info.usbVendorId,
        usbProductId: info.usbProductId,
        baudRate,
        friendlyName,
      });
    } catch {}

    setters[type]({ status: 'connected', deviceName: friendlyName, port, baudRate });
  }, [hardwareSupported]);

  // ── Legacy connect helper (opens browser picker + connects) ──────────────────
  const connectDevice = useCallback(async (type: DeviceType): Promise<void> => {
    if (!hardwareSupported) return;

    const serial = (navigator as any).serial as {
      requestPort(options?: { filters?: any[] }): Promise<any>;
    };

    setters[type](s => ({ ...s, status: 'connecting' }));

    try {
      const port = await serial.requestPort({ filters: [] });

      if (refs[type].current) {
        try { await refs[type].current.close(); } catch {}
      }

      const baud = DEFAULT_BAUD_RATES[type];
      await port.open({ baudRate: baud, dataBits: 8, stopBits: 1, parity: 'none' });
      refs[type].current = port;

      try {
        const info = port.getInfo?.();
        if (info?.usbVendorId || info?.usbProductId) {
          saveHint(type, { ...info, baudRate: baud });
        }
      } catch {}

      setters[type]({ status: 'connected', deviceName: rawDeviceLabel(port), port, baudRate: baud });
    } catch (err: any) {
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
    connectWithPort,
  };
}
