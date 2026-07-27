// ─── Hardware Setup Wizard ────────────────────────────────────────────────────
// Step-by-step wizard that guides staff through connecting POS hardware.
//
// FLOW
// 1. "Scan for Device" → browser's native serial-port picker (security requirement)
// 2. Auto-identification: VID/PID lookup → probe (ESC/POS then ZPL) if not found
// 3. Recognized: friendly confirmation card → "Done"
//    Unrecognized: simple fallback form (device type + optional name) → "Connect"
//
// The wizard never asks for COM ports, baud rates, or other technical details.

import React, { useState, useCallback } from 'react';
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
  Loader2, Search, ChevronDown, AlertTriangle,
} from 'lucide-react';
import {
  lookupDevice, probeDevice,
  categoryToDeviceType, deviceTypeLabel,
  probeResultToDeviceType, probeResultToName,
  type KnownDevice,
} from '@/lib/hardware/deviceDatabase';
import type { DeviceType, HardwareDevices } from '@/hooks/useHardwareDevices';

// ── Internal types ────────────────────────────────────────────────────────────

type WizardStep =
  | { step: 'pick' }
  | { step: 'probing' }
  | { step: 'recognized'; port: any; device: KnownDevice; suggestedType: DeviceType }
  | { step: 'fallback';   port: any; suggestedType: DeviceType | null; suggestedName: string }
  | { step: 'replace-confirm'; deviceType: DeviceType; doConnect: () => Promise<void> }
  | { step: 'connecting' }
  | { step: 'error'; message: string };

const INITIAL: WizardStep = { step: 'pick' };

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

  // Reset to initial step when wizard is opened
  const handleOpenChange = (o: boolean) => {
    if (!o) { onClose(); setTimeout(() => setState(INITIAL), 200); }
  };

  // ── Step 1: browser picker + identification ──────────────────────────────────
  const handleScan = useCallback(async () => {
    const serial = (navigator as any).serial as {
      requestPort(options?: { filters?: any[] }): Promise<any>;
    };

    let port: any;
    try {
      port = await serial.requestPort({ filters: [] });
    } catch (err: any) {
      // User cancelled the picker — treat as abort, stay on step 1
      if (err?.name === 'NotFoundError' || err?.name === 'AbortError') return;
      setState({ step: 'error', message: err?.message ?? 'Could not open device picker.' });
      return;
    }

    setState({ step: 'probing' });

    // 1. VID/PID lookup (instant, no IO)
    //
    // EMPTY getInfo() FALLBACK PATH
    // Some browsers or OS drivers return an empty object from port.getInfo()
    // even for physically recognized devices (certain Linux kernels, devices
    // connected through non-standard USB hubs, etc.).  When that happens:
    //
    //   info = {}  →  usbVendorId/usbProductId are both undefined
    //   lookupDevice(undefined, undefined)  →  null
    //
    // A null result here is NOT an error — it is a deliberate branch to
    // probe-based identification (step 2 below).  Only if the probe also
    // fails ('unknown') does the user land on the manual fallback form.
    // The error step is reserved for serial.requestPort() rejections and
    // connectWithPort() failures; it is never triggered by a missing VID/PID.
    //
    // Expected fallback path when getInfo() returns {}:
    //   getInfo() → {}
    //   → lookupDevice(undefined, undefined) → null
    //   → setState('probing') + probeDevice(port)
    //   → probe 'escpos' / 'zpl' → setState('recognized') with synthetic device
    //   → probe 'unknown'        → setState('fallback') with manual selection form
    const info = port.getInfo?.() ?? {};
    const known = lookupDevice(info.usbVendorId, info.usbProductId);

    if (known) {
      const suggestedType = categoryToDeviceType(known.deviceCategory);
      setState({ step: 'recognized', port, device: known, suggestedType });
      return;
    }

    // 2. Probe-based identification (opens + closes port briefly)
    const probeResult = await probeDevice(port);
    const suggestedType = probeResultToDeviceType(probeResult);
    const suggestedName = probeResultToName(probeResult);

    if (probeResult !== 'unknown') {
      // Build a synthetic "known device" from probe result for the recognized UI
      const synthetic: KnownDevice = {
        name:            suggestedName,
        deviceCategory:  probeResult === 'escpos' ? 'receipt-printer' : 'label-printer',
        protocol:        probeResult === 'escpos' ? 'escpos' : 'zpl',
        defaultBaudRate: 9600,
      };
      setState({ step: 'recognized', port, device: synthetic, suggestedType: suggestedType! });
    } else {
      // Both VID/PID lookup and probe failed — show the manual fallback form.
      // This is a deliberate, clearly communicated path: staff can still connect
      // the device by selecting its type manually.
      setState({ step: 'fallback', port, suggestedType, suggestedName });
    }
  }, []);

  // ── Step 3a → connect recognized device ─────────────────────────────────────
  const handleConfirmRecognized = useCallback(async (
    port: any,
    device: KnownDevice,
    type: DeviceType,
  ) => {
    // If this slot already has a connected device, require explicit confirmation first
    if (hw[type].status === 'connected') {
      setState({
        step: 'replace-confirm',
        deviceType: type,
        doConnect: async () => {
          setState({ step: 'connecting' });
          try {
            await hw.connectWithPort(type, port, device.defaultBaudRate, device.name);
            onSuccess?.(type, device.name);
            handleOpenChange(false);
          } catch (err: any) {
            setState({ step: 'error', message: err?.message ?? 'Failed to connect device.' });
          }
        },
      });
      return;
    }

    setState({ step: 'connecting' });
    try {
      await hw.connectWithPort(type, port, device.defaultBaudRate, device.name);
      onSuccess?.(type, device.name);
      handleOpenChange(false);
    } catch (err: any) {
      setState({ step: 'error', message: err?.message ?? 'Failed to connect device.' });
    }
  }, [hw, onSuccess]);

  // ── Step 3b → connect fallback (user-specified type) ────────────────────────
  const handleConfirmFallback = useCallback(async (
    port: any,
    type: DeviceType,
    name: string,
    baudRate: number,
  ) => {
    const resolvedName = name || deviceTypeLabel(type);

    // If this slot already has a connected device, require explicit confirmation first
    if (hw[type].status === 'connected') {
      setState({
        step: 'replace-confirm',
        deviceType: type,
        doConnect: async () => {
          setState({ step: 'connecting' });
          try {
            await hw.connectWithPort(type, port, baudRate, resolvedName);
            onSuccess?.(type, resolvedName);
            handleOpenChange(false);
          } catch (err: any) {
            setState({ step: 'error', message: err?.message ?? 'Failed to connect device.' });
          }
        },
      });
      return;
    }

    setState({ step: 'connecting' });
    try {
      await hw.connectWithPort(type, port, baudRate, resolvedName);
      onSuccess?.(type, resolvedName);
      handleOpenChange(false);
    } catch (err: any) {
      setState({ step: 'error', message: err?.message ?? 'Failed to connect device.' });
    }
  }, [hw, onSuccess]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="bg-gray-900 border-gray-700 text-white sm:max-w-md"
        onInteractOutside={e => { if (state.step === 'probing' || state.step === 'connecting') e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="text-white">Add Hardware Device</DialogTitle>
        </DialogHeader>

        <div className="pt-2">
          {state.step === 'pick'      && <StepPick onScan={handleScan} />}
          {state.step === 'probing'   && <StepProbing />}
          {state.step === 'recognized' && (
            <StepRecognized
              port={state.port}
              device={state.device}
              initialType={state.suggestedType}
              onConfirm={handleConfirmRecognized}
              onBack={() => setState(INITIAL)}
            />
          )}
          {state.step === 'fallback' && (
            <StepFallback
              port={state.port}
              initialType={state.suggestedType}
              initialName={state.suggestedName}
              onConfirm={handleConfirmFallback}
              onBack={() => setState(INITIAL)}
            />
          )}
          {state.step === 'replace-confirm' && (
            <StepReplaceConfirm
              deviceType={state.deviceType}
              onConfirm={state.doConnect}
              onCancel={() => setState(INITIAL)}
            />
          )}
          {state.step === 'connecting' && <StepConnecting />}
          {state.step === 'error' && (
            <StepError message={state.message} onRetry={() => setState(INITIAL)} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Step components ───────────────────────────────────────────────────────────

function StepPick({ onScan }: { onScan: () => void }) {
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

function StepRecognized({
  port, device, initialType, onConfirm, onBack,
}: {
  port: any;
  device: KnownDevice;
  initialType: DeviceType;
  onConfirm: (port: any, device: KnownDevice, type: DeviceType) => void;
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
          </div>
          <p className="text-sm text-white font-medium truncate">{device.name}</p>
          <div className="mt-1.5">
            <DeviceTypeBadge type={type} />
          </div>
        </div>
      </div>

      {/* Override type (in case auto-identification was wrong) */}
      <div>
        <button
          onClick={() => setShowOverride(v => !v)}
          className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors"
        >
          Use as a different device type
          <ChevronDown className={`h-3 w-3 transition-transform ${showOverride ? 'rotate-180' : ''}`} />
        </button>
        {showOverride && (
          <div className="mt-2">
            <Select value={type} onValueChange={(v) => setType(v as DeviceType)}>
              <SelectTrigger className="bg-gray-800 border-gray-600 text-white h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700 text-white">
                <SelectItem value="printer">Receipt Printer + Cash Drawer</SelectItem>
                <SelectItem value="labelPrinter">Label Printer</SelectItem>
                <SelectItem value="terminal">Card Terminal</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="text-xs text-gray-500 bg-gray-800/60 rounded p-3 space-y-0.5">
        <div>Protocol: <span className="text-gray-300">{device.protocol.toUpperCase()}</span></div>
        <div>Baud rate: <span className="text-gray-300">{device.defaultBaudRate.toLocaleString()}</span></div>
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
          onClick={() => onConfirm(port, device, type)}
        >
          Done — Connect Device
        </Button>
      </div>
    </div>
  );
}

function StepFallback({
  port, initialType, initialName, onConfirm, onBack,
}: {
  port: any;
  initialType: DeviceType | null;
  initialName: string;
  onConfirm: (port: any, type: DeviceType, name: string, baudRate: number) => void;
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
            <SelectItem value="terminal">
              <span className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" /> Card Terminal
              </span>
            </SelectItem>
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
          onClick={() => onConfirm(port, type, name.trim(), defaultBaudRate[type])}
        >
          Connect Device
        </Button>
      </div>
    </div>
  );
}

function StepReplaceConfirm({
  deviceType, onConfirm, onCancel,
}: {
  deviceType: DeviceType;
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
            {label} already connected
          </p>
          <p className="text-xs text-amber-500 mt-1 leading-relaxed">
            A {label} is already connected. Connecting this device will replace it.
            The existing connection will be closed immediately.
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

function StepConnecting() {
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
      <p className="text-sm text-gray-300">Connecting…</p>
    </div>
  );
}

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
