// ─── PilotHouse Hardware Device Manager ──────────────────────────────────────
// Manages connections to three POS peripherals:
//   - Card terminal (Dejavoo/EP semi-integrated)
//   - Receipt printer + cash drawer (ESC/POS)
//   - Label printer (ZPL II)
//
// BROWSER SUPPORT
// Primary:  Chrome 89+, Edge 89+, Android Chrome (Web Serial API).
// Fallback: Any browser + QZ Tray desktop app (Firefox, Safari, iOS indirect).
// The hook auto-detects which transport is available on mount.
//
// PERSISTENCE
// Web Serial: uses navigator.serial.getPorts() + localStorage VID/PID hints.
// QZ Tray:    stores port name in localStorage for display; user re-selects on
//             reconnect (QZ Tray serial ports don't persist across app restarts).

import { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { TERMINAL_BAUD_RATE } from '@/lib/hardware/terminal';
import { LABEL_PRINTER_BAUD_RATE } from '@/lib/hardware/zpl';
import {
  probeQzTray, connectQzTray, closeQzPort, openQzPort,
} from '@/lib/hardware/qzTray';
import {
  isElectronAvailable, openElectronPort, closeElectronPort,
} from '@/lib/hardware/electronSerial';

const AUTO_RECONNECT_DELAY_MS = 2_000; // wait 2 s before first reopen attempt
const AUTO_RECONNECT_MAX_RETRIES = 3;  // give up after 3 consecutive failures

export type DeviceType = 'terminal' | 'printer' | 'labelPrinter';
export type DeviceStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface DeviceState {
  status:     DeviceStatus;
  deviceName: string;     // friendly name e.g. "Epson TM-T88VI Receipt Printer"
  port:       any | null; // SerialPort (Web Serial) or port name string (QZ Tray)
  baudRate?:  number;     // baud rate in use (Web Serial only)
}

export interface HardwareDevices {
  hardwareSupported: boolean;
  /** Active transport: 'webserial' | 'qztray' | 'electron' | 'none' */
  transport:         'webserial' | 'qztray' | 'electron' | 'none';
  terminal:          DeviceState;
  printer:           DeviceState;
  labelPrinter:      DeviceState;
  // Legacy individual connect helpers (used by old HardwareDeviceCard UI)
  connectTerminal:     () => Promise<void>;
  connectPrinter:      () => Promise<void>;
  connectLabelPrinter: () => Promise<void>;
  disconnectDevice:    (type: DeviceType) => Promise<void>;
  // Connect a Web Serial port that the wizard has already identified
  connectWithPort: (
    type: DeviceType,
    port: any,
    baudRate: number,
    friendlyName: string,
  ) => Promise<void>;
  // Connect a QZ Tray serial port (port = COM name string)
  connectWithQzPort: (
    type: DeviceType,
    portName: string,
    friendlyName: string,
  ) => Promise<void>;
  // Connect an Electron IPC serial port (port = COM name / device path string)
  connectWithElectronPort: (
    type: DeviceType,
    portName: string,
    friendlyName: string,
  ) => Promise<void>;
  // Re-probe for QZ Tray / Electron after user installs/starts it
  recheckTransport: () => Promise<void>;
}

const EMPTY_DEVICE: DeviceState = { status: 'disconnected', deviceName: '', port: null };

const DEFAULT_BAUD_RATES: Record<DeviceType, number> = {
  terminal:     TERMINAL_BAUD_RATE,
  printer:      9600,
  labelPrinter: LABEL_PRINTER_BAUD_RATE,
};

const LS_KEY = 'pilothouse-hw-devices'; // localStorage key

interface StoredHint {
  usbVendorId?:       number;
  usbProductId?:      number;
  baudRate?:          number;
  friendlyName?:      string;
  qzPortName?:        string; // QZ Tray: port name (COM3, /dev/ttyUSB0, etc.)
  electronPortName?:  string; // Electron IPC: port path (COM3, /dev/ttyUSB0, etc.)
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

  // Transport detection: Electron > Web Serial > QZ Tray > none.
  // Electron is detected synchronously (window.electronAPI exists immediately).
  const [transport, setTransport] = useState<'webserial' | 'qztray' | 'electron' | 'none'>(
    isElectronAvailable() ? 'electron' : hardwareSupported ? 'webserial' : 'none',
  );

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

  // Tracks which transport owns each currently-connected device.
  const deviceTransportRef = useRef<Map<DeviceType, 'webserial' | 'qztray' | 'electron'>>(
    new Map([
      ['terminal',     'webserial'],
      ['printer',      'webserial'],
      ['labelPrinter', 'webserial'],
    ]),
  );

  // Track per-device retry timers so we can cancel them on unmount / manual disconnect.
  // Using a Map keyed by DeviceType so each device has its own isolated slot and no
  // sibling key can be accidentally overwritten (e.g. simultaneous disconnects).
  const reconnectTimerRef = useRef<Map<DeviceType, ReturnType<typeof setTimeout> | null>>(
    new Map<DeviceType, ReturnType<typeof setTimeout> | null>([
      ['terminal',     null],
      ['printer',      null],
      ['labelPrinter', null],
    ])
  );
  // Track consecutive reopen failures per device (same Map-based isolation).
  const reconnectAttemptsRef = useRef<Map<DeviceType, number>>(
    new Map<DeviceType, number>([
      ['terminal',     0],
      ['printer',      0],
      ['labelPrinter', 0],
    ])
  );

  // ── Auto-reconnect on mount ──────────────────────────────────────────────────
  useEffect(() => {
    if (!hardwareSupported) {
      // Electron provides its own IPC transport — no need to probe QZ Tray.
      if (isElectronAvailable()) return;
      // Web Serial unavailable — probe for QZ Tray as a fallback transport.
      probeQzTray().then(available => {
        if (!available) return;
        connectQzTray()
          .then(() => setTransport('qztray'))
          .catch(() => {/* QZ Tray answered probe but failed persistent connect — ignore */});
      });
      return;
    }

    const serial = (navigator as any).serial as { getPorts(): Promise<any[]> };

    (async () => {
      let ports: any[] = [];
      try { ports = await serial.getPorts(); } catch { return; }
      if (!ports.length) return;

      const hints = loadStoredHints();
      const types: DeviceType[] = ['terminal', 'printer', 'labelPrinter'];

      // Reconnect all matched devices in parallel so three devices open
      // simultaneously rather than sequentially one after another.
      const reconnected = (await Promise.all(
        types.map(async (type) => {
          const hint = hints[type];
          if (!hint) return null;

          const match = ports.find((p: any) => {
            const info = p.getInfo?.();
            return (
              info?.usbVendorId  === hint.usbVendorId &&
              info?.usbProductId === hint.usbProductId
            );
          });

          if (!match) return null;

          try {
            setters[type](s => ({ ...s, status: 'connecting' }));
            const baud = hint.baudRate ?? DEFAULT_BAUD_RATES[type];
            await match.open({ baudRate: baud, dataBits: 8, stopBits: 1, parity: 'none' });
            refs[type].current = match;
            deviceTransportRef.current.set(type, 'webserial');
            const name = hint.friendlyName ?? rawDeviceLabel(match);
            setters[type]({ status: 'connected', deviceName: name, port: match, baudRate: baud });
            // Only toast if it was a previous session (friendlyName stored = came from wizard)
            return hint.friendlyName ? name : null;
          } catch {
            setters[type](EMPTY_DEVICE);
            return null;
          }
        }),
      )).filter((name): name is string => name !== null);

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

  // ── Auto-reopen on USB disconnect ────────────────────────────────────────────
  // The Web Serial API fires a 'disconnect' event on navigator.serial when a
  // USB cable is unplugged.  We listen for it and retry opening the port so
  // cashiers don't have to manually reconnect from the hardware panel.
  useEffect(() => {
    if (!hardwareSupported) return;

    const serial = (navigator as any).serial;

    const handleDisconnect = (event: any) => {
      const disconnectedPort = event.port;
      if (!disconnectedPort) return;

      // Find which device type lost this port
      const types: DeviceType[] = ['terminal', 'printer', 'labelPrinter'];
      const type = types.find(t => refs[t].current === disconnectedPort);
      if (!type) return;

      // Null out the ref — the port handle is no longer usable
      refs[type].current = null;
      reconnectAttemptsRef.current.set(type, 0);

      setters[type](s => ({ ...s, status: 'connecting', port: null }));
      toast({
        title: 'Hardware disconnected',
        description: `Reconnecting ${type === 'labelPrinter' ? 'label printer' : type}…`,
        duration: 3000,
      });

      const hints = loadStoredHints();
      const hint = hints[type];

      const attempt = () => {
        const attemptNumber = (reconnectAttemptsRef.current.get(type) ?? 0) + 1;
        reconnectAttemptsRef.current.set(type, attemptNumber);

        reconnectTimerRef.current.set(type, setTimeout(async () => {
          // The browser keeps the SerialPort object even after disconnect;
          // try to reopen it directly.
          try {
            const baud = hint?.baudRate ?? DEFAULT_BAUD_RATES[type];
            await disconnectedPort.open({ baudRate: baud, dataBits: 8, stopBits: 1, parity: 'none' });
            refs[type].current = disconnectedPort;
            deviceTransportRef.current.set(type, 'webserial');
            const name = hint?.friendlyName ?? rawDeviceLabel(disconnectedPort);
            setters[type]({ status: 'connected', deviceName: name, port: disconnectedPort, baudRate: baud });
            reconnectAttemptsRef.current.set(type, 0);
            toast({
              title: 'Hardware reconnected',
              description: name,
              duration: 2500,
            });
          } catch {
            if (attemptNumber < AUTO_RECONNECT_MAX_RETRIES) {
              // Schedule another attempt
              attempt();
            } else {
              // Give up — let the cashier reconnect manually
              setters[type](EMPTY_DEVICE);
              toast({
                title: 'Hardware unavailable',
                description: `Could not reconnect ${type === 'labelPrinter' ? 'label printer' : type} after ${AUTO_RECONNECT_MAX_RETRIES} attempts. Please reconnect the cable.`,
                duration: 6000,
              });
            }
          }
        }, AUTO_RECONNECT_DELAY_MS));
      };

      attempt();
    };

    // ── connect event: handle new SerialPort objects on replug ──────────────
    // On some OS/driver combinations (Windows + CH340 adapters), unplugging a
    // device and replugging it generates a brand-new SerialPort object via the
    // 'connect' event rather than reusing the old one.  Without this listener
    // the retry loop above keeps calling open() on the stale object and keeps
    // failing, leaving the device permanently in error state until the cashier
    // runs the wizard again.
    //
    // When a new port appears we match it against stored hints by VID/PID.  If
    // it matches a device that is currently in 'connecting' state (i.e. the
    // disconnect retry loop gave up or the old port is stale) we take over with
    // the fresh port object.
    const handleConnect = async (event: any) => {
      const newPort = event.port;
      if (!newPort) return;

      const info = newPort.getInfo?.();
      if (!info?.usbVendorId) return;

      const hints = loadStoredHints();
      const types: DeviceType[] = ['terminal', 'printer', 'labelPrinter'];

      for (const type of types) {
        const hint = hints[type];
        if (!hint) continue;
        if (
          hint.usbVendorId  === info.usbVendorId &&
          hint.usbProductId === info.usbProductId
        ) {
          // Cancel any pending retry timer for this device — we have a fresh port
          const timer = reconnectTimerRef.current.get(type);
          if (timer != null) {
            clearTimeout(timer);
            reconnectTimerRef.current.set(type, null);
          }
          reconnectAttemptsRef.current.set(type, 0);

          try {
            setters[type](s => ({ ...s, status: 'connecting' }));
            const baud = hint.baudRate ?? DEFAULT_BAUD_RATES[type];
            await newPort.open({ baudRate: baud, dataBits: 8, stopBits: 1, parity: 'none' });
            refs[type].current = newPort;
            deviceTransportRef.current.set(type, 'webserial');
            const name = hint.friendlyName ?? rawDeviceLabel(newPort);
            setters[type]({ status: 'connected', deviceName: name, port: newPort, baudRate: baud });
            toast({ title: 'Hardware reconnected', description: name, duration: 2500 });
          } catch {
            setters[type](EMPTY_DEVICE);
          }
          break;
        }
      }
    };

    serial.addEventListener('disconnect', handleDisconnect);
    serial.addEventListener('connect',    handleConnect);

    return () => {
      serial.removeEventListener('disconnect', handleDisconnect);
      serial.removeEventListener('connect',    handleConnect);
      // Cancel any pending retry timers
      for (const type of (['terminal', 'printer', 'labelPrinter'] as DeviceType[])) {
        const timer = reconnectTimerRef.current.get(type);
        if (timer != null) {
          clearTimeout(timer);
          reconnectTimerRef.current.set(type, null);
        }
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hardwareSupported, toast]);

  // ── Connect a Web Serial port identified by the wizard ────────────────────────
  const connectWithPort = useCallback(async (
    type: DeviceType,
    port: any,
    baudRate: number,
    friendlyName: string,
  ): Promise<void> => {
    if (!hardwareSupported) return;

    // Close existing connection for this device type
    if (refs[type].current) {
      if (deviceTransportRef.current.get(type) === 'qztray') {
        await closeQzPort(refs[type].current as string);
      } else {
        try { await refs[type].current.close(); } catch {}
      }
      refs[type].current = null;
    }

    setters[type](s => ({ ...s, status: 'connecting' }));

    // Wrap port.open() in try/finally so that any failure (e.g. InvalidStateError
    // when the port is already open) always resets the device state back to
    // 'disconnected'. Without this the UI gets stuck showing 'connecting'
    // permanently until the page reloads.
    try {
      await port.open({ baudRate, dataBits: 8, stopBits: 1, parity: 'none' });
    } catch (err) {
      setters[type](EMPTY_DEVICE);
      throw err; // re-throw so the wizard's catch block shows the error step
    }

    refs[type].current = port;
    deviceTransportRef.current.set(type, 'webserial');

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

  // ── Connect a QZ Tray serial port ─────────────────────────────────────────────
  const connectWithQzPort = useCallback(async (
    type: DeviceType,
    portName: string,
    friendlyName: string,
  ): Promise<void> => {
    // Close any existing connection for this device type
    const currentPort = refs[type].current;
    if (currentPort !== null) {
      if (deviceTransportRef.current.get(type) === 'qztray') {
        await closeQzPort(currentPort as string);
      } else {
        try { await currentPort.close(); } catch {}
      }
      refs[type].current = null;
    }

    setters[type](s => ({ ...s, status: 'connecting' }));

    // Verify the port is accessible (brief open → close confirms device is ready)
    try {
      await openQzPort(portName, { baudRate: 9600 });
      await closeQzPort(portName);
    } catch (err) {
      setters[type](EMPTY_DEVICE);
      throw err; // re-throw so the wizard shows the error step
    }

    refs[type].current = portName;
    deviceTransportRef.current.set(type, 'qztray');
    saveHint(type, { qzPortName: portName, friendlyName });
    setters[type]({ status: 'connected', deviceName: friendlyName, port: portName });
  }, []);

  // ── Connect an Electron IPC serial port ──────────────────────────────────────
  const connectWithElectronPort = useCallback(async (
    type: DeviceType,
    portName: string,
    friendlyName: string,
  ): Promise<void> => {
    // Close any existing connection for this device type
    const currentPort = refs[type].current;
    if (currentPort !== null) {
      const priorTransport = deviceTransportRef.current.get(type);
      if (priorTransport === 'electron') {
        await closeElectronPort(currentPort as string);
      } else if (priorTransport === 'qztray') {
        await closeQzPort(currentPort as string);
      } else {
        try { await currentPort.close(); } catch {}
      }
      refs[type].current = null;
    }

    setters[type](s => ({ ...s, status: 'connecting' }));

    // Verify the port is accessible (brief open → close confirms device is ready)
    try {
      await openElectronPort(portName, { baudRate: 9600 });
      await closeElectronPort(portName);
    } catch (err) {
      setters[type](EMPTY_DEVICE);
      throw err; // re-throw so the wizard shows the error step
    }

    refs[type].current = portName;
    deviceTransportRef.current.set(type, 'electron');
    saveHint(type, { electronPortName: portName, friendlyName });
    setters[type]({ status: 'connected', deviceName: friendlyName, port: portName });
  }, []);

  // ── Re-probe transport after user installs QZ Tray / connects hardware ────────
  const recheckTransport = useCallback(async (): Promise<void> => {
    // Electron is always available synchronously if we're running inside it
    if (isElectronAvailable()) { setTransport('electron'); return; }
    if (hardwareSupported) return; // already on Web Serial
    const available = await probeQzTray();
    if (!available) return;
    try {
      await connectQzTray();
      setTransport('qztray');
    } catch {}
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
      deviceTransportRef.current.set(type, 'webserial');

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
    // Cancel any pending auto-reconnect timer so a manual disconnect stays disconnected
    const timer = reconnectTimerRef.current.get(type);
    if (timer != null) {
      clearTimeout(timer);
      reconnectTimerRef.current.set(type, null);
    }
    reconnectAttemptsRef.current.set(type, 0);

    const port = refs[type].current;
    if (port) {
      const portTransport = deviceTransportRef.current.get(type);
      if (portTransport === 'electron') {
        await closeElectronPort(port as string);
      } else if (portTransport === 'qztray') {
        await closeQzPort(port as string);
      } else {
        try { await port.close(); } catch {}
      }
      refs[type].current = null;
    }
    deviceTransportRef.current.set(type, 'webserial'); // reset to default
    saveHint(type, null);
    setters[type](EMPTY_DEVICE);
  }, []);

  return {
    hardwareSupported,
    transport,
    terminal,
    printer,
    labelPrinter,
    connectTerminal:     () => connectDevice('terminal'),
    connectPrinter:      () => connectDevice('printer'),
    connectLabelPrinter: () => connectDevice('labelPrinter'),
    disconnectDevice,
    connectWithPort,
    connectWithQzPort,
    connectWithElectronPort,
    recheckTransport,
  };
}
