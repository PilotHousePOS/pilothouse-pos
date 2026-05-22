import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { X, Flashlight, FlashlightOff, Keyboard, Camera, Image } from "lucide-react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

const SCANNER_VERSION = "v13";

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

type CameraState = "home" | "starting" | "live" | "denied" | "scanning-photo";

export default function BarcodeScanner({ onClose, onDetected }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [cameraState, setCameraState] = useState<CameraState>("home");
  const [manualMode, setManualMode] = useState(false);
  const [manualUpc, setManualUpc] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [result, setResult] = useState<Product | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [lastScanned, setLastScanned] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const cooldownRef = useRef(false);
  const fromPhotoRef = useRef(false);

  // Cleanup camera on unmount
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
      if (fromPhotoRef.current) {
        fromPhotoRef.current = false;
        setCameraState("home");
      }
    },
    onError: () => {
      setNotFound(true);
      setResult(null);
      if (fromPhotoRef.current) {
        fromPhotoRef.current = false;
        setCameraState("home");
      }
      setTimeout(() => {
        setNotFound(false);
        cooldownRef.current = false;
      }, 2000);
    },
  });

  const handleDetected = useCallback((upc: string) => {
    if (cooldownRef.current || upc === lastScanned) return;
    cooldownRef.current = true;
    setLastScanned(upc);
    if (onDetected) { onDetected(upc); return; }
    lookupMutation.mutate(upc);
  }, [lastScanned, lookupMutation, onDetected]);

  // Try camera with progressively simpler constraints
  const getStream = async (): Promise<MediaStream> => {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
    } catch {}
    try {
      return await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    } catch {}
    return await navigator.mediaDevices.getUserMedia({ video: true });
  };

  const requestCamera = useCallback(async () => {
    setCameraState("starting");
    setCameraError("");
    try {
      const stream = await getStream();
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities?.() as any;
      if (caps?.torch) setTorchSupported(true);
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;
      reader.decodeFromStream(stream, videoRef.current!, (res) => {
        if (res) handleDetected(res.getText());
      });
      setCameraState("live");
    } catch (err: any) {
      const name = err?.name || "Unknown";
      const msg = err?.message || "";
      console.error("[Scanner] Camera error:", name, msg);
      setCameraError(`${name}: ${msg}`);
      setCameraState("denied");
    }
  }, [handleDetected]);

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
    if (onDetected) { onDetected(upc); return; }
    lookupMutation.mutate(upc);
  };

  const handleViewProduct = () => {
    if (result) { onClose(); setLocation(`/supplies/${result.id}`); }
  };

  const handleScanAgain = () => {
    setResult(null);
    setNotFound(false);
    setLastScanned("");
    cooldownRef.current = false;
    setPhotoError("");
    setCameraError("");
    setCameraState("home");
  };

  const handlePhotoCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError("");
    setCameraState("scanning-photo");
    if (fileInputRef.current) fileInputRef.current.value = "";

    const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
      Promise.race([p, new Promise<null>(r => setTimeout(() => r(null), ms))]);

    let upc: string | null = null;

    // Method 1: Native BarcodeDetector (Chrome Android — fastest and most accurate)
    if ("BarcodeDetector" in window) {
      try {
        const bd = new (window as any).BarcodeDetector({
          formats: ["upc_a", "upc_e", "ean_13", "ean_8", "code_128", "code_39", "qr_code", "itf", "codabar"],
        });
        const result = await withTimeout(
          createImageBitmap(file).then(bitmap => {
            const det = bd.detect(bitmap).then((b: any[]) => {
              bitmap.close();
              return b.length > 0 ? b[0].rawValue : null;
            });
            return det;
          }),
          6000
        );
        if (result) upc = result;
      } catch (err) {
        console.warn("[Scanner] BarcodeDetector failed:", err);
      }
    }

    // Method 2: ZXing via canvas (draw image to canvas, then decode)
    if (!upc) {
      try {
        const imgEl = await withTimeout(
          new Promise<HTMLImageElement>((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("img-load")); };
            img.src = url;
          }),
          5000
        );
        if (imgEl) {
          const MAX = 1920;
          const sw = imgEl.naturalWidth, sh = imgEl.naturalHeight;
          const scale = Math.min(1, MAX / Math.max(sw, sh));
          const dw = Math.round(sw * scale), dh = Math.round(sh * scale);
          const reader = new BrowserMultiFormatReader();
          for (const deg of [0, 90, 270, 180] as const) {
            try {
              const canvas = document.createElement("canvas");
              const ctx = canvas.getContext("2d")!;
              if (deg === 0 || deg === 180) { canvas.width = dw; canvas.height = dh; }
              else { canvas.width = dh; canvas.height = dw; }
              ctx.save();
              ctx.translate(canvas.width / 2, canvas.height / 2);
              ctx.rotate((deg * Math.PI) / 180);
              ctx.drawImage(imgEl, -dw / 2, -dh / 2, dw, dh);
              ctx.restore();
              const res = (reader as any).decodeFromCanvas(canvas);
              upc = res.getText();
              break;
            } catch { /* try next rotation */ }
          }
        }
      } catch (err) {
        console.warn("[Scanner] Canvas decode failed:", err);
      }
    }

    if (upc) {
      // Keep "scanning-photo" spinner up — mutation callbacks will dismiss it
      fromPhotoRef.current = true;
      handleDetected(upc);
    } else {
      setPhotoError("No barcode found. Make sure the barcode fills the frame and is in focus, then try again.");
      setCameraState("home");
    }
  }, [handleDetected, onDetected]);

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

  const Header = ({ title }: { title: string }) => (
    <div className="flex items-center justify-between px-4 pt-4 pb-3 bg-[#0071CE]">
      <button onClick={onClose} className="text-white p-1"><X className="w-6 h-6" /></button>
      <span className="text-white font-semibold text-base">{title}</span>
      <span className="text-white/40 text-xs">{SCANNER_VERSION}</span>
    </div>
  );

  // ── Scanning photo spinner ──
  if (cameraState === "scanning-photo") {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        <Header title="Scanner" />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
          <p className="text-white text-lg font-semibold">Scanning barcode…</p>
          <p className="text-white/40 text-sm">This may take a few seconds</p>
        </div>
      </div>
    );
  }

  // ── Camera starting spinner ──
  if (cameraState === "starting") {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        <Header title="Scanner" />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
            <p className="text-white/60 text-sm">Starting camera…</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Home / Denied screen ──
  if ((cameraState === "home" || cameraState === "denied") && !manualMode && !result) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handlePhotoCapture}
        />
        <Header title="Scanner" />

        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5">
          <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center">
            <Camera className="w-10 h-10 text-white/70" />
          </div>

          <div className="text-center">
            <p className="text-white text-xl font-bold mb-1">Scan a Barcode</p>
            <p className="text-gray-400 text-sm">Take a photo of any product barcode</p>
          </div>

          {/* Photo error */}
          {photoError && (
            <div className="bg-orange-500/20 border border-orange-500/40 rounded-xl px-4 py-3 w-full">
              <p className="text-orange-300 text-sm">{photoError}</p>
            </div>
          )}

          {/* Camera error details */}
          {cameraState === "denied" && cameraError && (
            <div className="bg-red-500/15 border border-red-500/30 rounded-xl px-4 py-3 w-full">
              <p className="text-red-300 text-xs font-mono break-all">{cameraError}</p>
            </div>
          )}

          {/* Primary: Photo */}
          <div className="flex flex-col gap-3 w-full">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full bg-[#0071CE] text-white py-4 text-base font-semibold rounded-xl flex items-center justify-center gap-2 active:bg-[#0058a3]"
            >
              <Image className="w-5 h-5" />
              Take Photo to Scan
            </button>

            <button
              onClick={requestCamera}
              className="w-full bg-white/10 text-white py-4 text-base font-semibold rounded-xl flex items-center justify-center gap-2 active:bg-white/20"
            >
              <Camera className="w-5 h-5" />
              Try Live Camera
            </button>

            <button
              onClick={() => setManualMode(true)}
              className="w-full bg-transparent border border-white/25 text-white py-4 text-base font-semibold rounded-xl flex items-center justify-center gap-2 active:bg-white/10"
            >
              <Keyboard className="w-5 h-5" />
              Type Barcode Instead
            </button>
          </div>

          <p className="text-gray-600 text-xs text-center">
            Point camera at the barcode, hold steady, then tap the shutter
          </p>
        </div>
      </div>
    );
  }

  // ── Manual entry ──
  if (manualMode) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        <Header title="Enter Barcode" />
        <div className="bg-white flex-1 flex flex-col">
          <div className="px-4 py-6 flex flex-col gap-4">
            <p className="text-gray-500 text-sm">Type or paste the UPC barcode number</p>
            <div className="flex gap-2">
              <input
                autoFocus
                type="number"
                inputMode="numeric"
                placeholder="Enter UPC number..."
                value={manualUpc}
                onChange={e => setManualUpc(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleManualSubmit()}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#0071CE]"
              />
              <Button onClick={handleManualSubmit} disabled={lookupMutation.isPending} className="bg-[#0071CE] hover:bg-[#0058a3] text-white px-5">
                Search
              </Button>
            </div>
            <button onClick={() => setManualMode(false)} className="text-[#0071CE] text-sm underline text-left">
              ← Back
            </button>
          </div>
          {result && (
            <div className="px-4 pb-8">
              <div className="flex gap-3 mb-4">
                {imageUrl
                  ? <img src={imageUrl} alt={result.name} className="w-20 h-20 object-contain rounded-lg border border-gray-100 flex-shrink-0" />
                  : <div className="w-20 h-20 bg-gray-100 rounded-lg flex-shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-0.5">{result.brand || ""}</p>
                  <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-3">{result.name}</p>
                  <p className="text-xl font-bold text-[#0071CE] mt-1">${parseFloat(result.price).toFixed(2)}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleScanAgain}>Clear</Button>
                <Button variant="outline" className="flex-1" onClick={handleViewProduct}>View Item</Button>
                <Button className="flex-1 bg-[#0071CE] hover:bg-[#0058a3] text-white" onClick={() => addToCartMutation.mutate()} disabled={addToCartMutation.isPending}>Add to Cart</Button>
              </div>
            </div>
          )}
          {notFound && <p className="px-4 text-red-500 text-sm">No product found for that barcode.</p>}
        </div>
      </div>
    );
  }

  // ── Live scanner ──
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 bg-[#0071CE] z-10">
        <button onClick={onClose} className="text-white p-1"><X className="w-6 h-6" /></button>
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

      {manualMode && (
        <div className="bg-white px-4 py-4 flex gap-2">
          <input
            autoFocus type="number" inputMode="numeric" placeholder="Enter UPC number..."
            value={manualUpc} onChange={e => setManualUpc(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleManualSubmit()}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-[#0071CE]"
          />
          <Button onClick={handleManualSubmit} disabled={lookupMutation.isPending} className="bg-[#0071CE] hover:bg-[#0058a3] text-white">Search</Button>
        </div>
      )}

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0">
          <div className="absolute top-0 left-0 right-0 bg-black/55" style={{ height: "25%" }} />
          <div className="absolute bottom-0 left-0 right-0 bg-black/55" style={{ height: "35%" }} />
          <div className="absolute left-0 bg-black/55" style={{ top: "25%", height: "40%", width: "8%" }} />
          <div className="absolute right-0 bg-black/55" style={{ top: "25%", height: "40%", width: "8%" }} />
          <div className="absolute" style={{ top: "25%", left: "8%", right: "8%", height: "40%" }}>
            <div className="absolute left-0 right-0 h-0.5 bg-[#0071CE]/80" style={{ animation: "scanline 2s ease-in-out infinite" }} />
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br" />
          </div>
        </div>
        <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-2 z-10">
          {lookupMutation.isPending && <div className="bg-black/70 text-white px-4 py-2 rounded-full text-sm">Looking up product…</div>}
          {notFound && <div className="bg-red-600/90 text-white px-4 py-2 rounded-full text-sm font-medium">Product not found — try again</div>}
          {!result && !notFound && !lookupMutation.isPending && (
            <div className="bg-black/60 text-white px-4 py-2 rounded-full text-sm">Aim at a barcode to scan</div>
          )}
        </div>
      </div>

      {result && (
        <div className="bg-white rounded-t-2xl shadow-2xl px-4 pt-4 pb-8 z-20">
          <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
          <div className="flex gap-3 mb-4">
            {imageUrl
              ? <img src={imageUrl} alt={result.name} className="w-20 h-20 object-contain rounded-lg border border-gray-100 flex-shrink-0" />
              : <div className="w-20 h-20 bg-gray-100 rounded-lg flex-shrink-0" />
            }
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-0.5">{result.brand || ""}</p>
              <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-3">{result.name}</p>
              <p className="text-xl font-bold text-[#0071CE] mt-1">${parseFloat(result.price).toFixed(2)}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={handleScanAgain}>Scan Again</Button>
            <Button variant="outline" className="flex-1" onClick={handleViewProduct}>View Item</Button>
            <Button className="flex-1 bg-[#0071CE] hover:bg-[#0058a3] text-white" onClick={() => addToCartMutation.mutate()} disabled={addToCartMutation.isPending}>Add to Cart</Button>
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
