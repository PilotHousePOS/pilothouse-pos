// ─── Hardware Setup Wizard ────────────────────────────────────────────────────
// Step-by-step wizard that guides staff through connecting POS hardware.
//
// FLOW — Web Serial (Chrome / Edge desktop)
// 1. "Scan for Device" → browser's native serial-port picker
// 2. Auto-identification: VID/PID lookup → probe (ESC/POS then ZPL) if not found
// 3. Recognized: friendly confirmation card → "Done"
//    Unrecognized: simple fallback form (device type + optional name) → "Connect"
//
// FLOW — QZ Tray (Firefox / Safari / any browser with QZ Tray installed)
// 1. StepPick shows "Scan with QZ Tray" button
// 2. Lists available serial ports → StepQzTrayPick
// 3. User selects a port → probe → Recognized / Fallback (same as above)
// 4. Connect via hw.connectWithQzPort instead of hw.connectWithPort
//
// FLOW — Unsupported (no Web Serial, no QZ Tray)
// 1. StepPick shows browser-specific message + QZ Tray install prompt
// 2. StepQzTrayInstall: download link + "I've started it" retry button

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Printer, Tag, CreditCard, CheckCircle2, AlertCircle,
  Loader2, Search, ChevronDown, AlertTriangle, SmartphoneNfc,
  Download, List,
} from 'lucide-react';
import {
  lookupDevice, probeDevice,
  categoryToDeviceType, deviceTypeLabel,
  probeResultToDeviceType, probeResultToName,
  createScanSequence,
  type KnownDevice,
  type ScanSequence,
} from '@/lib/hardware/deviceDatabase';
import {
  listQzPorts, probeQzPort, connectQzTray,
} from '@/lib/hardware/qzTray';
import {
  listElectronPorts, probeElectronPort,
} from '@/lib/hardware/electronSerial';
import type { DeviceType, HardwareDevices } from '@/hooks/useHardwareDevices';

// ── Internal types ────────────────────────────────────────────────────────────

/** Which transport owns the currently-probed port. */
type PortTransport = 'webserial' | 'qztray' | 'electron';

type WizardStep =
  | { step: 'pick' }
  | { step: 'probing' }
  | { step: 'recognized'; port: any; device: KnownDevice; suggestedType: DeviceType; portTransport?: PortTransport }
  | { step: 'fallback';   port: any; suggestedType: DeviceType | null; suggestedName: string; portTransport?: PortTransport }
  | { step: 'replace-confirm'; deviceType: DeviceType; existingDeviceName: string; doConnect: () => Promise<void> }
  | { step: 'connecting' }
  // busyPort: set when the error is specifically a "port already in use" error so that
  // a 'disconnect' event on that port can auto-advance back to the 'pick' step.
  | { step: 'error'; message: string; busyPort?: any }
  // QZ Tray-specific steps:
  | { step: 'qztray-install' }
  | { step: 'qztray-pick'; ports: string[] }
  // Electron-specific steps:
  | { step: 'electron-pick'; ports: ElectronPortInfo[] };

const INITIAL: WizardStep = { step: 'pick' };

// ── Browser support detection ─────────────────────────────────────────────────
// Web Serial is Chrome 89+, Edge 89+, Android Chrome 89+.
// It is NOT supported on: iOS Safari, iOS Chrome (WKWebView), Firefox (any OS),
// desktop Safari, or any other browser engine.

type UnsupportedReason = 'ios' | 'firefox' | 'safari' | 'other';

function detectUnsupportedReason(): UnsupportedReason | null {
  if (typeof navigator === 'undefined') return 'other';
  if ('serial' in navigator) return null; // supported — no message needed

  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) return 'ios';

  const isFirefox = /firefox\//i.test(ua);
  if (isFirefox) return 'firefox';

  // Desktop Safari: has "Safari" but no "Chrome"
  const isSafari = /safari\//i.test(ua) && !/chrome\//i.test(ua);
  if (isSafari) return 'safari';

  return 'other';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DeviceIcon({ type, className }: { type: DeviceType; className?: string }) {
  switch (type) {
    case 'printer':      return <Printer      className={className} />;
    case 'labelPrinter': return <Tag          className={className} />;
    case 'terminal':     return <CreditCard   className={className} />;
  }
}

function DeviceTypeBadge({ type }: { type: DeviceType }) {
  const colors: Record<DeviceType, string> = {
    printer:      'bg-blue-900/60 text-blue-300',
    labelPrinter: 'bg-purple-900/60 text-purple-300',
    terminal:     'bg-green-900/60 text-green-300',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${colors[type]}`}>
      {deviceTypeLabel(type)}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface HardwareWizardProps {
  open: boolean;
  onClose: () => void;
  hw: HardwareDevices;
  onSuccess?: (type: DeviceType, name: string) => void;
}

export function HardwareWizard({ open, onClose, hw, onSuccess }: HardwareWizardProps) {
  const [state, setState] = useState<WizardStep>(INITIAL);

  // Scan-sequence guard: prevents a stale probe from overwriting state when a
  // second scan starts before the first probe resolves.
  const scanSeq = useRef<ScanSequence>(createScanSequence());

  // Reset to initial step when wizard is closed.
  const handleOpenChange = useCallback((o: boolean) => {
    if (!o) { onClose(); setTimeout(() => setState(INITIAL), 200); }
  }, [onClose]);

  // ── Auto-advance from busy-port error when the port is unplugged ─────────────
  useEffect(() => {
    if (!open) return;
    if (state.step !== 'error' || !state.busyPort) return;
    if (typeof navigator === 'undefined' || !('serial' in navigator)) return;

    const serial = (navigator as any).serial;
    const busyPort = state.busyPort;

    const handleDisconnect = (event: any) => {
      if (event.port === busyPort) setState(INITIAL);
    };

    serial.addEventListener('disconnect', handleDisconnect);
    return () => serial.removeEventListener('disconnect', handleDisconnect);
  }, [open, state]);

  // ── Step 1: Web Serial browser picker + identification ───────────────────────
  const handleScan = useCallback(async () => {
    if (!hw.hardwareSupported) {
      setState({ step: 'error', message: 'Web Serial is not supported in this browser. Use Chrome or Edge on desktop.' });
      return;
    }

    const serial = (navigator as any).serial as {
      requestPort(options?: { filters?: any[] }): Promise<any>;
    };

    let port: any;
    try {
      port = await serial.requestPort({ filters: [] });
    } catch (err: any) {
      if (err?.name === 'NotFoundError' || err?.name === 'AbortError') return;
      setState({ step: 'error', message: err?.message ?? 'Could not open device picker.' });
      return;
    }

    const myScanId = scanSeq.current.next();
    setState({ step: 'probing' });

    const info = port.getInfo?.() ?? {};
    const known = lookupDevice(info.usbVendorId, info.usbProductId);

    if (known) {
      if (scanSeq.current.isStale(myScanId)) return;
      const suggestedType = categoryToDeviceType(known.deviceCategory);
      setState({ step: 'recognized', port, device: known, suggestedType, portTransport: 'webserial' });
      return;
    }

    if (port.readable != null) {
      if (scanSeq.current.isStale(myScanId)) return;
      setState({
        step: 'error',
        message: 'This device is already in use — unplug and reconnect it, then scan again.',
        busyPort: port,
      });
      return;
    }

    const probeResult = await probeDevice(port);
    if (scanSeq.current.isStale(myScanId)) return;

    const suggestedType = probeResultToDeviceType(probeResult);
    const suggestedName = probeResultToName(probeResult);

    if (probeResult !== 'unknown') {
      const synthetic: KnownDevice = {
        name:            suggestedName,
        deviceCategory:  probeResult === 'escpos' ? 'receipt-printer' : 'label-printer',
        protocol:        probeResult === 'escpos' ? 'escpos' : 'zpl',
        defaultBaudRate: 9600,
      };
      setState({ step: 'recognized', port, device: synthetic, suggestedType: suggestedType!, portTransport: 'webserial' });
    } else {
      setState({ step: 'fallback', port, suggestedType, suggestedName, portTransport: 'webserial' });
    }
  }, [hw.hardwareSupported]);

  // ── Step 1 (QZ Tray): list available serial ports ────────────────────────────
  const handleQzScan = useCallback(async () => {
    setState({ step: 'probing' });
    try {
      // Ensure we have a live connection to QZ Tray
      await connectQzTray();
      const ports = await listQzPorts();
      if (ports.length === 0) {
        // QZ Tray is running but found no ports (no devices plugged in)
        setState({
          step: 'error',
          message: 'QZ Tray found no serial ports. Make sure the device is plugged in, then try again.',
        });
      } else {
        setState({ step: 'qztray-pick', ports });
      }
    } catch {
      // QZ Tray connection dropped or was never up
      setState({ step: 'qztray-install' });
    }
  }, []);

  // ── Step 2 (QZ Tray): probe a selected port ──────────────────────────────────
  const handleQzPortSelected = useCallback(async (portName: string) => {
    setState({ step: 'probing' });

    const result = await probeQzPort(portName);
    const suggestedType = result !== 'unknown'
      ? (result === 'escpos' ? 'printer' : 'labelPrinter') as DeviceType
      : ('printer' as DeviceType);
    const suggestedName = result === 'escpos'
      ? 'ESC/POS Receipt Printer'
      : result === 'zpl'
        ? 'ZPL Label Printer'
        : '';

    if (result !== 'unknown') {
      const synthetic: KnownDevice = {
        name:            suggestedName,
        deviceCategory:  result === 'escpos' ? 'receipt-printer' : 'label-printer',
        protocol:        result === 'escpos' ? 'escpos' : 'zpl',
        defaultBaudRate: 9600,
      };
      setState({ step: 'recognized', port: portName, device: synthetic, suggestedType, portTransport: 'qztray' });
    } else {
      setState({ step: 'fallback', port: portName, suggestedType, suggestedName, portTransport: 'qztray' });
    }
  }, []);

  // ── Step 3a → connect recognized device ─────────────────────────────────────
  const handleConfirmRecognized = useCallback(async (
    port: any,
    device: KnownDevice,
    type: DeviceType,
    portTransport?: PortTransport,
  ) => {
    const doConnect = async () => {
      setState({ step: 'connecting' });
      try {
        if (portTransport === 'electron') {
          await hw.connectWithElectronPort(type, port as string, device.name);
        } else if (portTransport === 'qztray') {
          await hw.connectWithQzPort(type, port as string, device.name);
        } else {
          await hw.connectWithPort(type, port, device.defaultBaudRate, device.name);
        }
        onSuccess?.(type, device.name);
        handleOpenChange(false);
      } catch (err: any) {
        setState({ step: 'error', message: err?.message ?? 'Failed to connect device.' });
      }
    };

    if (hw[type].status === 'connected') {
      setState({
        step: 'replace-confirm',
        deviceType: type,
        existingDeviceName: hw[type].deviceName,
        doConnect,
      });
      return;
    }

    await doConnect();
  }, [hw, onSuccess, handleOpenChange]);

  // ── Step 3b → connect fallback (user-specified type) ────────────────────────
  const handleConfirmFallback = useCallback(async (
    port: any,
    type: DeviceType,
    name: string,
    baudRate: number,
    portTransport?: PortTransport,
  ) => {
    const resolvedName = name || deviceTypeLabel(type);

    const doConnect = async () => {
      setState({ step: 'connecting' });
      try {
        if (portTransport === 'electron') {
          await hw.connectWithElectronPort(type, port as string, resolvedName);
        } else if (portTransport === 'qztray') {
          await hw.connectWithQzPort(type, port as string, resolvedName);
        } else {
          await hw.connectWithPort(type, port, baudRate, resolvedName);
        }
        onSuccess?.(type, resolvedName);
        handleOpenChange(false);
      } catch (err: any) {
        setState({ step: 'error', message: err?.message ?? 'Failed to connect device.' });
      }
    };

    if (hw[type].status === 'connected') {
      setState({
        step: 'replace-confirm',
        deviceType: type,
        existingDeviceName: hw[type].deviceName,
        doConnect,
      });
      return;
    }

    await doConnect();
  }, [hw, onSuccess, handleOpenChange]);

  // ── Step 1 (Electron IPC): list available serial ports ───────────────────────
  const handleElectronScan = useCallback(async () => {
    setState({ step: 'probing' });
    try {
      const ports = await listElectronPorts();
      if (ports.length === 0) {
        setState({
          step: 'error',
          message: 'No serial ports found. Make sure the device is plugged in, then try again.',
        });
      } else {
        setState({ step: 'electron-pick', ports });
      }
    } catch (err: any) {
      setState({ step: 'error', message: err?.message ?? 'Failed to list serial ports.' });
    }
  }, []);

  // ── Step 2 (Electron IPC): probe a selected port ─────────────────────────────
  const handleElectronPortSelected = useCallback(async (portName: string) => {
    setState({ step: 'probing' });

    const result = await probeElectronPort(portName);
    const suggestedType = result !== 'unknown'
      ? (result === 'escpos' ? 'printer' : 'labelPrinter') as DeviceType
      : ('printer' as DeviceType);
    const suggestedName = result === 'escpos'
      ? 'ESC/POS Receipt Printer'
      : result === 'zpl'
        ? 'ZPL Label Printer'
        : '';

    if (result !== 'unknown') {
      const synthetic: KnownDevice = {
        name:            suggestedName,
        deviceCategory:  result === 'escpos' ? 'receipt-printer' : 'label-printer',
        protocol:        result === 'escpos' ? 'escpos' : 'zpl',
        defaultBaudRate: 9600,
      };
      setState({ step: 'recognized', port: portName, device: synthetic, suggestedType, portTransport: 'electron' });
    } else {
      setState({ step: 'fallback', port: portName, suggestedType, suggestedName, portTransport: 'electron' });
    }
  }, []);

  // ── QZ Tray install step → re-probe after user starts QZ Tray ────────────────
  const handleQzRetry = useCallback(async () => {
    setState({ step: 'probing' });
    await hw.recheckTransport();
    // After recheckTransport, transport state in hook updates.
    // If now 'qztray', proceed to scan; otherwise show install again.
    try {
      await connectQzTray();
      const ports = await listQzPorts();
      if (ports.length === 0) {
        setState({
          step: 'error',
          message: 'QZ Tray is running but no serial ports were found. Plug in the device and try again.',
        });
      } else {
        setState({ step: 'qztray-pick', ports });
      }
    } catch {
      setState({ step: 'qztray-install' });
    }
  }, [hw]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="bg-gray-900 border-gray-700 text-white sm:max-w-md"
        onInteractOutside={e => {
          // Block accidental outside-click dismissal during non-interactive steps
          if (
            state.step === 'probing' ||
            state.step === 'connecting' ||
            state.step === 'replace-confirm' ||
            state.step === 'error'
          ) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-white">Add Hardware Device</DialogTitle>
        </DialogHeader>

        <div className="pt-2">
          {state.step === 'pick' && (
            <StepPick
              transport={hw.transport}
              onScan={handleScan}
              onQzScan={handleQzScan}
              onQzInstall={() => setState({ step: 'qztray-install' })}
              onElectronScan={handleElectronScan}
            />
          )}
          {state.step === 'probing'   && <StepProbing />}
          {state.step === 'recognized' && (
            <StepRecognized
              port={state.port}
              device={state.device}
              initialType={state.suggestedType}
              portTransport={state.portTransport}
              onConfirm={handleConfirmRecognized}
              onBack={() => setState(INITIAL)}
            />
          )}
          {state.step === 'fallback' && (
            <StepFallback
              port={state.port}
              initialType={state.suggestedType}
              initialName={state.suggestedName}
              portTransport={state.portTransport}
              onConfirm={handleConfirmFallback}
              onBack={() => setState(INITIAL)}
            />
          )}
          {state.step === 'replace-confirm' && (
            <StepReplaceConfirm
              deviceType={state.deviceType}
              existingDeviceName={state.existingDeviceName}
              onConfirm={state.doConnect}
              onCancel={() => setState(INITIAL)}
            />
          )}
          {state.step === 'connecting'    && <StepConnecting />}
          {state.step === 'error'         && (
            <StepError message={state.message} onRetry={() => setState(INITIAL)} />
          )}
          {state.step === 'qztray-install' && (
            <StepQzTrayInstall onRetry={handleQzRetry} />
          )}
          {state.step === 'qztray-pick' && (
            <StepQzTrayPick
              ports={state.ports}
              onSelect={handleQzPortSelected}
              onBack={() => setState(INITIAL)}
            />
          )}
          {state.step === 'electron-pick' && (
            <StepQzTrayPick
              ports={state.ports.map(p => p.path)}
              onSelect={handleElectronPortSelected}
              onBack={() => setState(INITIAL)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Step components ───────────────────────────────────────────────────────────

function StepPick({
  transport,
  onScan,
  onQzScan,
  onQzInstall,
  onElectronScan,
}: {
  transport: 'webserial' | 'qztray' | 'electron' | 'none';
  onScan: () => void;
  onQzScan: () => void;
  onQzInstall: () => void;
  onElectronScan: () => void;
}) {
  // ── Electron desktop app transport ────────────────────────────────────────
  if (transport === 'electron') {
    return (
      <div className="flex flex-col items-center gap-5 py-4">
        <div className="w-16 h-16 rounded-full bg-indigo-900/40 flex items-center justify-center">
          <List className="h-8 w-8 text-indigo-400" />
        </div>
        <div className="text-center space-y-1.5 px-4">
          <p className="text-sm font-semibold text-gray-100">Scan for Device</p>
          <p className="text-xs text-gray-400 leading-relaxed">
            The desktop app has direct USB access. Click below to list available
            serial ports and connect your receipt printer or label printer.
          </p>
        </div>
        <Button
          onClick={onElectronScan}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 h-10 gap-2"
        >
          <List className="h-4 w-4" />
          List Serial Ports
        </Button>
        <p className="text-xs text-gray-600 text-center px-4">
          Card terminals connect via IP address — configure that in Terminal Settings.
        </p>
      </div>
    );
  }

  // ── QZ Tray transport ─────────────────────────────────────────────────────
  if (transport === 'qztray') {
    return (
      <div className="flex flex-col items-center gap-5 py-4">
        <div className="w-16 h-16 rounded-full bg-blue-900/40 flex items-center justify-center">
          <List className="h-8 w-8 text-blue-400" />
        </div>
        <div className="text-center space-y-1.5 px-4">
          <p className="text-sm font-semibold text-gray-100">Scan with QZ Tray</p>
          <p className="text-xs text-gray-400 leading-relaxed">
            QZ Tray is running on this machine. Click below to list available serial ports
            and connect your receipt printer or label printer.
          </p>
        </div>
        <Button
          onClick={onQzScan}
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 h-10 gap-2"
        >
          <List className="h-4 w-4" />
          List Serial Ports
        </Button>
        <p className="text-xs text-gray-600 text-center px-4">
          QZ Tray gives Firefox, Safari, and other browsers access to USB hardware.
        </p>
      </div>
    );
  }

  // ── No transport available — show unsupported message + QZ Tray option ───
  if (transport === 'none') {
    const reason = detectUnsupportedReason();

    const isIOS = reason === 'ios';

    const messages: Record<UnsupportedReason, { title: string; body: string }> = {
      ios: {
        title: 'USB hardware not available on iOS',
        body: 'iPhone and iPad do not support USB serial connections from a browser. Use Chrome or Edge on a Windows, Mac, or Android device to add hardware.',
      },
      firefox: {
        title: 'Firefox doesn\'t support USB hardware directly',
        body: 'Web Serial is not available in Firefox. Install QZ Tray (a free desktop app) to connect hardware from this browser — or switch to Chrome or Edge.',
      },
      safari: {
        title: 'Safari doesn\'t support USB hardware directly',
        body: 'Web Serial is not available in Safari. Install QZ Tray (a free desktop app) to connect hardware from this browser — or switch to Chrome or Edge.',
      },
      other: {
        title: 'USB hardware not supported in this browser',
        body: 'Install QZ Tray (a free desktop app) to add hardware support — or use Chrome 89+ or Edge 89+.',
      },
    };

    const { title, body } = messages[reason ?? 'other'];

    return (
      <div className="flex flex-col items-center gap-4 py-4">
        <div className="w-14 h-14 rounded-full bg-amber-900/40 flex items-center justify-center">
          <SmartphoneNfc className="h-7 w-7 text-amber-400" />
        </div>
        <div className="text-center space-y-1.5 px-4">
          <p className="text-sm font-semibold text-amber-300">{title}</p>
          <p className="text-xs text-gray-400 leading-relaxed">{body}</p>
        </div>
        {/* Only show QZ Tray option on non-iOS (iOS can't run desktop apps) */}
        {!isIOS && (
          <Button
            variant="outline"
            size="sm"
            className="border-gray-600 text-gray-300 hover:bg-gray-800 gap-2"
            onClick={onQzInstall}
          >
            <Download className="h-4 w-4" />
            Set up QZ Tray
          </Button>
        )}
      </div>
    );
  }

  // ── Web Serial transport (default) ────────────────────────────────────────
  return (
    <div className="flex flex-col items-center gap-5 py-4">
      <div className="w-16 h-16 rounded-full bg-blue-900/40 flex items-center justify-center">
        <Search className="h-8 w-8 text-blue-400" />
      </div>
      <div className="text-center space-y-1.5 px-4">
        <p className="text-sm font-semibold text-gray-100">Plug in your device</p>
        <p className="text-xs text-gray-400 leading-relaxed">
          Connect the device to a USB port, then click Scan. The browser will ask you to
          select the serial port — no technical knowledge required.
        </p>
      </div>
      <Button
        onClick={onScan}
        className="bg-blue-600 hover:bg-blue-500 text-white px-6 h-10 gap-2"
      >
        <Search className="h-4 w-4" />
        Scan for Device
      </Button>
      <p className="text-xs text-gray-600 text-center px-4">
        Works with Chrome and Edge only. The browser remembers the device —
        you only need to do this once per machine.
      </p>
    </div>
  );
}

function StepProbing() {
  return (
    <div className="flex flex-col items-center gap-5 py-8">
      <Loader2 className="h-10 w-10 text-blue-400 animate-spin" />
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-gray-100">Identifying device…</p>
        <p className="text-xs text-gray-500">Checking device capabilities</p>
      </div>
    </div>
  );
}

// ── QZ Tray install / launch step ─────────────────────────────────────────────

function StepQzTrayInstall({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex items-start gap-3 bg-blue-900/30 border border-blue-700/60 rounded-lg p-4">
        <Download className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-300">QZ Tray required</p>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">
            QZ Tray is a free desktop app that lets any browser connect to USB
            hardware. Install it once per machine, then it runs in the background.
          </p>
        </div>
      </div>

      <ol className="space-y-2 text-xs text-gray-400 pl-2">
        <li className="flex gap-2">
          <span className="text-blue-400 font-semibold flex-shrink-0">1.</span>
          Download QZ Tray from{' '}
          <a
            href="https://qz.io/download/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 underline"
          >
            qz.io/download
          </a>
        </li>
        <li className="flex gap-2">
          <span className="text-blue-400 font-semibold flex-shrink-0">2.</span>
          Install and launch it — a QZ icon will appear in your system tray.
        </li>
        <li className="flex gap-2">
          <span className="text-blue-400 font-semibold flex-shrink-0">3.</span>
          Click <strong className="text-gray-200">"I've started QZ Tray"</strong> below.
        </li>
      </ol>

      <div className="flex gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          className="border-gray-600 text-gray-400 hover:bg-gray-800"
          asChild
        >
          <a href="https://qz.io/download/" target="_blank" rel="noopener noreferrer">
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Download QZ Tray
          </a>
        </Button>
        <Button
          className="flex-1 bg-blue-600 hover:bg-blue-500 text-white h-9"
          onClick={onRetry}
        >
          I've started QZ Tray
        </Button>
      </div>
    </div>
  );
}

// ── QZ Tray port picker step ──────────────────────────────────────────────────

function StepQzTrayPick({
  ports,
  onSelect,
  onBack,
}: {
  ports: string[];
  onSelect: (portName: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="text-sm text-gray-300 px-1">
        Select the port your device is connected to.
        <span className="text-xs text-gray-500 block mt-0.5">
          Not sure which port? Unplug the device, note which port disappears, then replug and select it.
        </span>
      </div>

      <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto">
        {ports.map(port => (
          <button
            key={port}
            onClick={() => onSelect(port)}
            className="flex items-center gap-3 p-3 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-500 transition-colors text-left group"
          >
            <div className="w-8 h-8 rounded bg-gray-700 flex items-center justify-center flex-shrink-0">
              <List className="h-4 w-4 text-gray-400 group-hover:text-blue-400 transition-colors" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-100 truncate">{port}</p>
              <p className="text-xs text-gray-500">Serial port</p>
            </div>
            <ChevronDown className="h-4 w-4 text-gray-500 -rotate-90 flex-shrink-0" />
          </button>
        ))}
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="text-gray-400 hover:text-white hover:bg-gray-800 self-start"
        onClick={onBack}
      >
        Back
      </Button>
    </div>
  );
}

// ── Recognized device step ────────────────────────────────────────────────────

function StepRecognized({
  port, device, initialType, portTransport, onConfirm, onBack,
}: {
  port: any;
  device: KnownDevice;
  initialType: DeviceType;
  portTransport?: PortTransport;
  onConfirm: (port: any, device: KnownDevice, type: DeviceType, portTransport?: PortTransport) => void;
  onBack: () => void;
}) {
  const [type, setType] = useState<DeviceType>(initialType);
  const [showOverride, setShowOverride] = useState(false);

  return (
    <div className="flex flex-col gap-4 py-2">
      {/* Recognition success card */}
      <div className="bg-green-900/30 border border-green-700/60 rounded-lg p-4 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-green-900/60 flex items-center justify-center flex-shrink-0">
          <DeviceIcon type={type} className="h-6 w-6 text-green-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
            <span className="text-sm font-semibold text-green-300">Device recognized</span>
            {portTransport === 'qztray' && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-900/60 text-indigo-300">via QZ Tray</span>
            )}
          </div>
          <p className="text-sm text-white font-medium truncate">{device.name}</p>
          <div className="mt-1.5">
            <DeviceTypeBadge type={type} />
          </div>
        </div>
      </div>

      {/* Override type */}
      <div>
        <button
          onClick={() => setShowOverride(v => !v)}
          className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors"
        >
          Use as a different device type
          <ChevronDown className={`h-3 w-3 transition-transform ${showOverride ? 'rotate-180' : ''}`} />
        </button>
        {showOverride && (
          <div className="mt-2 space-y-2">
            <Select value={type} onValueChange={(v) => setType(v as DeviceType)}>
              <SelectTrigger className="bg-gray-800 border-gray-600 text-white h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700 text-white">
                <SelectItem value="printer">Receipt Printer + Cash Drawer</SelectItem>
                <SelectItem value="labelPrinter">Label Printer</SelectItem>
                {/* Card terminal uses TCP, not serial — exclude from QZ Tray / Electron paths */}
                {portTransport !== 'qztray' && portTransport !== 'electron' && (
                  <SelectItem value="terminal">Card Terminal</SelectItem>
                )}
              </SelectContent>
            </Select>
            {initialType === 'labelPrinter' && type !== 'labelPrinter' && (
              <div className="flex items-start gap-2 bg-amber-900/30 border border-amber-700/60 rounded p-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300 leading-relaxed">
                  This device was identified as a <strong>ZPL label printer</strong>. Saving it as a
                  different type may cause incorrect commands to be sent to the device.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Technical details — hide baud rate for QZ Tray (managed internally) */}
      <div className="text-xs text-gray-500 bg-gray-800/60 rounded p-3 space-y-0.5">
        <div>Protocol: <span className="text-gray-300">{device.protocol.toUpperCase()}</span></div>
        {portTransport !== 'qztray' && (
          <div>Baud rate: <span className="text-gray-300">{device.defaultBaudRate.toLocaleString()}</span></div>
        )}
        {portTransport === 'qztray' && (
          <div>Transport: <span className="text-gray-300">QZ Tray serial</span></div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-400 hover:text-white hover:bg-gray-800"
          onClick={onBack}
        >
          Back
        </Button>
        <Button
          className="flex-1 bg-blue-600 hover:bg-blue-500 text-white h-9"
          onClick={() => onConfirm(port, device, type, portTransport)}
        >
          Done — Connect Device
        </Button>
      </div>
    </div>
  );
}

// ── Fallback (unknown device) step ────────────────────────────────────────────

function StepFallback({
  port, initialType, initialName, portTransport, onConfirm, onBack,
}: {
  port: any;
  initialType: DeviceType | null;
  initialName: string;
  portTransport?: PortTransport;
  onConfirm: (port: any, type: DeviceType, name: string, baudRate: number, portTransport?: PortTransport) => void;
  onBack: () => void;
}) {
  const [type, setType] = useState<DeviceType>(initialType ?? 'printer');
  const [name, setName] = useState('');

  const defaultBaudRate: Record<DeviceType, number> = {
    printer:      9600,
    labelPrinter: 9600,
    terminal:     9600,
  };

  return (
    <div className="flex flex-col gap-4 py-2">
      {/* Unknown device notice */}
      <div className="bg-amber-900/30 border border-amber-700/60 rounded-lg p-3 flex items-start gap-3">
        <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-300">Device not recognized</p>
          <p className="text-xs text-amber-500 mt-0.5">
            Select what type of device this is and optionally give it a name.
          </p>
        </div>
      </div>

      {/* Device type selector */}
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-400">Device type</Label>
        <Select value={type} onValueChange={(v) => setType(v as DeviceType)}>
          <SelectTrigger className="bg-gray-800 border-gray-600 text-white h-10">
            <div className="flex items-center gap-2">
              <DeviceIcon type={type} className="h-4 w-4 text-gray-400" />
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent className="bg-gray-800 border-gray-700 text-white">
            <SelectItem value="printer">
              <span className="flex items-center gap-2">
                <Printer className="h-4 w-4" /> Receipt Printer + Cash Drawer
              </span>
            </SelectItem>
            <SelectItem value="labelPrinter">
              <span className="flex items-center gap-2">
                <Tag className="h-4 w-4" /> Label Printer
              </span>
            </SelectItem>
            {/* Card terminal uses TCP — exclude from QZ Tray and Electron serial paths */}
            {portTransport !== 'qztray' && portTransport !== 'electron' && (
              <SelectItem value="terminal">
                <span className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" /> Card Terminal
                </span>
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Optional custom name */}
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-400">
          Device name <span className="text-gray-600">(optional)</span>
        </Label>
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={`e.g. ${type === 'terminal' ? 'Dejavoo Z9 Terminal' : type === 'labelPrinter' ? 'Zebra ZD420' : 'Epson TM-T88'}`}
          className="bg-gray-800 border-gray-600 text-white h-10 text-sm placeholder:text-gray-600"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-400 hover:text-white hover:bg-gray-800"
          onClick={onBack}
        >
          Back
        </Button>
        <Button
          className="flex-1 bg-blue-600 hover:bg-blue-500 text-white h-9"
          onClick={() => onConfirm(port, type, name.trim(), defaultBaudRate[type], portTransport)}
        >
          Connect Device
        </Button>
      </div>
    </div>
  );
}

// ── Replace-confirm step ──────────────────────────────────────────────────────

function StepReplaceConfirm({
  deviceType, existingDeviceName, onConfirm, onCancel,
}: {
  deviceType: DeviceType;
  existingDeviceName: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}) {
  const label = deviceTypeLabel(deviceType);
  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="bg-amber-900/30 border border-amber-700/60 rounded-lg p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-300">
            {existingDeviceName.trim() ? existingDeviceName.trim() : label} already connected
          </p>
          <p className="text-xs text-amber-500 mt-1 leading-relaxed">
            {existingDeviceName.trim()
              ? `${existingDeviceName.trim()} is already connected. Connecting this device will replace it.`
              : `A ${label} is already connected. Connecting this device will replace it.`
            }
            {' '}The existing connection will be closed immediately.
          </p>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-400 hover:text-white hover:bg-gray-800"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          className="flex-1 bg-amber-600 hover:bg-amber-500 text-white h-9"
          onClick={onConfirm}
        >
          Replace {label}
        </Button>
      </div>
    </div>
  );
}

// ── Connecting step ───────────────────────────────────────────────────────────

function StepConnecting() {
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
      <p className="text-sm text-gray-300">Connecting…</p>
    </div>
  );
}

// ── Error step ────────────────────────────────────────────────────────────────

function StepError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <div className="w-14 h-14 rounded-full bg-red-900/40 flex items-center justify-center">
        <AlertCircle className="h-7 w-7 text-red-400" />
      </div>
      <div className="text-center space-y-1 px-4">
        <p className="text-sm font-semibold text-red-300">Connection failed</p>
        <p className="text-xs text-gray-500 break-words max-w-xs">{message}</p>
      </div>
      <Button
        onClick={onRetry}
        variant="outline"
        size="sm"
        className="border-gray-600 text-gray-300 hover:bg-gray-800"
      >
        Try Again
      </Button>
    </div>
  );
}
