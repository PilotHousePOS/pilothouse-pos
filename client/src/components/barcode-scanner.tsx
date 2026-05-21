import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { X, Flashlight, FlashlightOff, Keyboard, Camera, Settings } from "lucide-react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

interface Product {
  id: number;
  name: string;
  price: string;
  brand: string | null;
  imageUrls: string[] | null;
  sku: string | null;
  category: string | null;
}

interface BarcodeScannerProps {
  onClose: () => void;
  onDetected?: (upc: string) => void;
}

type PermState = "checking" | "prompt" | "granted" | "denied" | "error";

export default function BarcodeScanner({ onClose, onDetected }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [permState, setPermState] = useState<PermState>("checking");
  const [cameraStarted, setCameraStarted] = useState(false);
  const [scanning, setScanning] = useState(true);
  const [manualMode, setManualMode] = useState(false);
  const [manualUpc, setManualUpc] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [result, setResult] = useState<Product | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [lastScanned, setLastScanned] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const cooldownRef = useRef(false);

  // Check permission state on mount
  useEffect(() => {
    const check = async () => {
      try {
        const status = await navigator.permissions.query({ name: "camera" as PermissionName });
        if (status.state === "granted") {
          setPermState("granted");
        } else if (status.state === "denied") {
          setPermState("denied");
        } else {
          setPermState("prompt");
        }
        status.onchange = () => {
          if (status.state === "granted") setPermState("granted");
          else if (status.state === "denied") setPermState("denied");
          else setPermState("prompt");
        };
      } catch {
        // Permissions API not supported — go straight to prompt screen
        setPermState("prompt");
      }
    };
    check();
  }, []);

  const startCamera = useCallback(async () => {
    let cancelled = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities?.() as any;
      if (caps?.torch) setTorchSupported(true);

      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;
      reader.decodeFromStream(stream, videoRef.current!, (res) => {
        if (cancelled) return;
        if (res) handleDetected(res.getText());
      });

      setCameraStarted(true);
      setPermState("granted");
    } catch (err: any) {
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
        setPermState("denied");
      } else {
        setPermState("error");
      }
    }
    return () => { cancelled = true; };
  }, []);

  // Auto-start camera once permission is confirmed granted
  useEffect(() => {
    if (permState === "granted" && !cameraStarted && !manualMode) {
      startCamera();
    }
    return () => {
      if (permState !== "granted" || cameraStarted) {
        streamRef.current?.getTracks().forEach(t => t.stop());
        readerRef.current = null;
      }
    };
  }, [permState, cameraStarted, manualMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      readerRef.current = null;
    };
  }, []);

  const lookupMutation = useMutation({
    mutationFn: async (upc: string) => {
      const res = await fetch(`/api/supplies/by-upc/${encodeURIComponent(upc)}`, { credentials: "include" });
      if (!res.ok) throw new Error("not found");
      return res.json() as Promise<Product>;
    },
    onSuccess: (product) => {
      setResult(product);
      setNotFound(false);
      setScanning(false);
    },
    onError: () => {
      setNotFound(true);
      setResult(null);
      setTimeout(() => {
        setNotFound(false);
        cooldownRef.current = false;
        setScanning(true);
      }, 2000);
    },
  });

  const handleDetected = useCallback((upc: string) => {
    if (cooldownRef.current || upc === lastScanned) return;
    cooldownRef.current = true;
    setLastScanned(upc);
    if (onDetected) {
      onDetected(upc);
      return;
    }
    lookupMutation.mutate(upc);
  }, [lastScanned, lookupMutation, onDetected]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await (track as any).applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn(t => !t);
    } catch {}
  };

  const handleManualSubmit = () => {
    const upc = manualUpc.trim();
    if (!upc) return;
    if (onDetected) {
      onDetected(upc);
      return;
    }
    lookupMutation.mutate(upc);
  };

  const handleViewProduct = () => {
    if (result) {
      onClose();
      setLocation(`/supplies/${result.id}`);
    }
  };

  const handleScanAgain = () => {
    setResult(null);
    setNotFound(false);
    setLastScanned("");
    cooldownRef.current = false;
    setScanning(true);
  };

  const addToCartMutation = useMutation({
    mutationFn: async () => {
      if (!result) return;
      return apiRequest("POST", "/api/cart", { supplyId: result.id, quantity: 1 });
    },
    onSuccess: () => {
      toast({ title: "Added to cart", description: result?.name });
      onClose();
    },
    onError: () => {
      toast({ title: "Could not add to cart", variant: "destructive" });
    },
  });

  const imageUrl = result?.imageUrls?.[0] || null;

  // ── Pre-permission screen (shown before requesting camera) ──
  if (permState === "checking") {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        <div className="relative flex items-center justify-between px-4 pt-safe-top pt-4 pb-3 bg-[#0071CE] z-10">
          <button onClick={onClose} className="text-white p-1"><X className="w-6 h-6" /></button>
          <span className="text-white font-semibold text-base tracking-wide">Scanner</span>
          <div className="w-6" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (permState === "prompt") {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        <div className="relative flex items-center justify-between px-4 pt-safe-top pt-4 pb-3 bg-[#0071CE] z-10">
          <button onClick={onClose} className="text-white p-1"><X className="w-6 h-6" /></button>
          <span className="text-white font-semibold text-base tracking-wide">Scanner</span>
          <div className="w-6" />
        </div>

        {/* Dim background like Walmart */}
        <div className="flex-1 bg-black/80 flex items-end justify-center pb-0">
          <div className="w-full bg-[#1c1c1e] rounded-t-3xl px-6 pt-8 pb-12 flex flex-col items-center gap-5 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#0071CE]/20 flex items-center justify-center">
              <Camera className="w-9 h-9 text-[#0071CE]" />
            </div>
            <div>
              <p className="text-white text-lg font-semibold mb-1">
                Allow <span className="font-bold">Animal House</span> to access your camera?
              </p>
              <p className="text-gray-400 text-sm">Camera is used to scan barcodes and find products instantly.</p>
            </div>
            <div className="w-full flex flex-col gap-3 mt-2">
              <button
                onClick={startCamera}
                className="w-full py-4 text-base font-semibold text-white border-b border-white/10 hover:bg-white/5 active:bg-white/10 transition-colors"
              >
                While using the app
              </button>
              <button
                onClick={startCamera}
                className="w-full py-4 text-base font-semibold text-white border-b border-white/10 hover:bg-white/5 active:bg-white/10 transition-colors"
              >
                Only this time
              </button>
              <button
                onClick={onClose}
                className="w-full py-4 text-base font-semibold text-red-400 hover:bg-white/5 active:bg-white/10 transition-colors"
              >
                Don't allow
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (permState === "denied" || permState === "error") {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        <div className="relative flex items-center justify-between px-4 pt-safe-top pt-4 pb-3 bg-[#0071CE] z-10">
          <button onClick={onClose} className="text-white p-1"><X className="w-6 h-6" /></button>
          <span className="text-white font-semibold text-base tracking-wide">Scanner</span>
          <div className="w-6" />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-5">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
            <Camera className="w-9 h-9 text-red-400" />
          </div>
          <div>
            <p className="text-white text-lg font-semibold mb-2">Camera access blocked</p>
            <p className="text-gray-400 text-sm leading-relaxed">
              Camera permission was denied. To use the scanner, enable camera access in your browser settings.
            </p>
          </div>
          <div className="bg-white/10 rounded-2xl p-4 text-left w-full">
            <p className="text-white text-sm font-semibold mb-2">How to enable:</p>
            <ol className="text-gray-300 text-sm space-y-1 list-decimal list-inside">
              <li>Tap the <strong className="text-white">lock icon</strong> or <strong className="text-white">info icon</strong> in your browser's address bar</li>
              <li>Tap <strong className="text-white">Permissions</strong> or <strong className="text-white">Site settings</strong></li>
              <li>Set <strong className="text-white">Camera</strong> to Allow</li>
              <li>Return here and try again</li>
            </ol>
          </div>
          <div className="flex flex-col gap-3 w-full">
            <Button
              onClick={() => { setPermState("prompt"); setCameraStarted(false); }}
              className="w-full bg-[#0071CE] hover:bg-[#0058a3] text-white py-3"
            >
              Try Again
            </Button>
            <Button
              variant="outline"
              onClick={() => setManualMode(true)}
              className="w-full border-white/30 text-white hover:bg-white/10 py-3"
            >
              <Keyboard className="w-4 h-4 mr-2" />
              Type barcode instead
            </Button>
          </div>
        </div>

        {/* Manual entry when blocked */}
        {manualMode && (
          <div className="bg-white px-4 py-4 flex gap-2">
            <input
              autoFocus
              type="number"
              inputMode="numeric"
              placeholder="Enter UPC number..."
              value={manualUpc}
              onChange={e => setManualUpc(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleManualSubmit()}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-[#0071CE]"
            />
            <Button onClick={handleManualSubmit} disabled={lookupMutation.isPending} className="bg-[#0071CE] hover:bg-[#0058a3] text-white">
              Search
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ── Main scanner UI (granted) ──
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" style={{ maxWidth: "100vw" }}>
      <div className="relative flex items-center justify-between px-4 pt-safe-top pt-4 pb-3 bg-[#0071CE] z-10">
        <button onClick={onClose} className="text-white p-1">
          <X className="w-6 h-6" />
        </button>
        <span className="text-white font-semibold text-base tracking-wide">Scanner</span>
        <div className="flex items-center gap-3">
          {torchSupported && (
            <button onClick={toggleTorch} className="text-white p-1">
              {torchOn ? <FlashlightOff className="w-5 h-5" /> : <Flashlight className="w-5 h-5" />}
            </button>
          )}
          <button onClick={() => setManualMode(m => !m)} className="text-white p-1">
            <Keyboard className="w-5 h-5" />
          </button>
        </div>
      </div>

      <button
        onClick={() => setManualMode(m => !m)}
        className="w-full bg-white/10 text-white text-sm py-2 px-4 text-center hover:bg-white/20 transition-colors"
      >
        Type your barcode
      </button>

      {manualMode && (
        <div className="bg-white px-4 py-4 flex gap-2">
          <input
            autoFocus
            type="number"
            inputMode="numeric"
            placeholder="Enter UPC number..."
            value={manualUpc}
            onChange={e => setManualUpc(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleManualSubmit()}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-[#0071CE]"
          />
          <Button onClick={handleManualSubmit} disabled={lookupMutation.isPending} className="bg-[#0071CE] hover:bg-[#0058a3] text-white">
            Search
          </Button>
        </div>
      )}

      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />

        <div className="absolute inset-0">
          <div className="absolute top-0 left-0 right-0 bg-black/55" style={{ height: "25%" }} />
          <div className="absolute bottom-0 left-0 right-0 bg-black/55" style={{ height: "35%" }} />
          <div className="absolute left-0 bg-black/55" style={{ top: "25%", height: "40%", width: "8%" }} />
          <div className="absolute right-0 bg-black/55" style={{ top: "25%", height: "40%", width: "8%" }} />

          <div className="absolute" style={{ top: "25%", left: "8%", right: "8%", height: "40%" }}>
            {scanning && !result && !notFound && (
              <div className="absolute left-0 right-0 h-0.5 bg-[#0071CE]/80" style={{ animation: "scanline 2s ease-in-out infinite" }} />
            )}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-white/60" />
            </div>
          </div>
        </div>

        <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-2 z-10">
          {lookupMutation.isPending && (
            <div className="bg-black/70 text-white px-4 py-2 rounded-full text-sm">Looking up product…</div>
          )}
          {notFound && (
            <div className="bg-red-600/90 text-white px-4 py-2 rounded-full text-sm font-medium">Product not found — try again</div>
          )}
          {!result && !notFound && !lookupMutation.isPending && (
            <div className="bg-black/60 text-white px-4 py-2 rounded-full text-sm">Scan barcodes, QR codes, and more</div>
          )}
        </div>
      </div>

      {result && (
        <div className="bg-white rounded-t-2xl shadow-2xl px-4 pt-4 pb-8 z-20">
          <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
          <div className="flex gap-3 mb-4">
            {imageUrl ? (
              <img src={imageUrl} alt={result.name} className="w-20 h-20 object-contain rounded-lg border border-gray-100 flex-shrink-0" />
            ) : (
              <div className="w-20 h-20 bg-gray-100 rounded-lg flex-shrink-0 flex items-center justify-center text-gray-400 text-xs text-center">No image</div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-0.5">{result.brand || ""}</p>
              <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-3">{result.name}</p>
              <p className="text-xl font-bold text-[#0071CE] mt-1">${parseFloat(result.price).toFixed(2)}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={handleScanAgain}>Scan Again</Button>
            <Button variant="outline" className="flex-1" onClick={handleViewProduct}>View Item</Button>
            <Button className="flex-1 bg-[#0071CE] hover:bg-[#0058a3] text-white" onClick={() => addToCartMutation.mutate()} disabled={addToCartMutation.isPending}>
              Add to Cart
            </Button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes scanline {
          0% { top: 0; }
          50% { top: calc(100% - 2px); }
          100% { top: 0; }
        }
      `}</style>
    </div>
  );
}
