import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { X, Flashlight, FlashlightOff, Keyboard, Camera } from "lucide-react";
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

export default function BarcodeScanner({ onClose, onDetected }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // "starting" | "live" | "denied" | "scanning-photo"
  const [cameraState, setCameraState] = useState<"starting" | "live" | "denied" | "scanning-photo">("starting");
  const [retryKey, setRetryKey] = useState(0);
  const [manualMode, setManualMode] = useState(false);
  const [manualUpc, setManualUpc] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [result, setResult] = useState<Product | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [lastScanned, setLastScanned] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const cooldownRef = useRef(false);

  const lookupMutation = useMutation({
    mutationFn: async (upc: string) => {
      const res = await fetch(`/api/supplies/by-upc/${encodeURIComponent(upc)}`, { credentials: "include" });
      if (!res.ok) throw new Error("not found");
      return res.json() as Promise<Product>;
    },
    onSuccess: (product) => {
      setResult(product);
      setNotFound(false);
    },
    onError: () => {
      setNotFound(true);
      setResult(null);
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

  // Try live camera via getUserMedia — runs once on mount, and again if manualMode turns off
  useEffect(() => {
    if (manualMode || cameraState === "denied") return;
    let cancelled = false;

    const startCamera = async () => {
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

        setCameraState("live");
      } catch {
        if (!cancelled) setCameraState("denied");
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
      readerRef.current = null;
    };
  }, [manualMode, retryKey]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      readerRef.current = null;
    };
  }, []);

  // Load a File into an HTMLImageElement via FileReader (no URL loading issues)
  const loadImageFromFile = (file: File): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("img-load"));
        el.src = fr.result as string;
      };
      fr.onerror = () => reject(new Error("file-read"));
      fr.readAsDataURL(file);
    });

  // Draw image onto a canvas at a scaled-down size, optionally rotated
  const drawToCanvas = (img: HTMLImageElement, rotation: 0 | 90 | 180 | 270): HTMLCanvasElement => {
    const MAX = 1280;
    const sw = img.naturalWidth;
    const sh = img.naturalHeight;
    const scale = Math.min(1, MAX / Math.max(sw, sh));
    const dw = Math.round(sw * scale);
    const dh = Math.round(sh * scale);

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;

    if (rotation === 0 || rotation === 180) {
      canvas.width = dw;
      canvas.height = dh;
    } else {
      canvas.width = dh;
      canvas.height = dw;
    }

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
    return canvas;
  };

  // Scan a photo taken from native camera (file input fallback)
  const handlePhotoCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError("");
    setCameraState("scanning-photo");
    if (fileInputRef.current) fileInputRef.current.value = "";

    try {
      const img = await loadImageFromFile(file);
      const reader = new BrowserMultiFormatReader();

      // Try all 4 rotations — barcodes photographed sideways are common
      const rotations: Array<0 | 90 | 180 | 270> = [0, 90, 270, 180];
      let upc: string | null = null;

      for (const rotation of rotations) {
        try {
          const canvas = drawToCanvas(img, rotation);
          const result = (reader as any).decodeFromCanvas(canvas);
          upc = result.getText();
          break;
        } catch {
          // Try next rotation
        }
      }

      if (upc) {
        handleDetected(upc);
      } else {
        throw new Error("not-found");
      }
    } catch {
      setPhotoError("No barcode found. Point camera directly at the barcode and take the photo.");
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

  // ── Denied / fallback screen ──
  if ((cameraState === "denied" || cameraState === "scanning-photo") && !manualMode && !result) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        {/* Hidden native camera file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handlePhotoCapture}
        />

        <div className="flex items-center justify-between px-4 pt-4 pb-3 bg-[#0071CE]">
          <button onClick={onClose} className="text-white p-1"><X className="w-6 h-6" /></button>
          <span className="text-white font-semibold text-base">Scanner</span>
          <div className="w-6" />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-5">
          {cameraState === "scanning-photo" ? (
            <>
              <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
              <p className="text-white text-lg font-semibold">Scanning photo…</p>
            </>
          ) : (
            <>
              <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center">
                <Camera className="w-10 h-10 text-white/70" />
              </div>

              <div>
                <p className="text-white text-xl font-bold mb-2">Scan a barcode</p>
                <p className="text-gray-400 text-sm leading-relaxed">
                  Use your camera to take a photo of any barcode, or type the number manually.
                </p>
              </div>

              {photoError && (
                <div className="bg-red-500/20 border border-red-500/40 rounded-xl px-4 py-3 w-full">
                  <p className="text-red-300 text-sm">{photoError}</p>
                </div>
              )}

              <div className="flex flex-col gap-3 w-full mt-2">
                {/* Primary: open native camera app — works in ALL browsers */}
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full bg-[#0071CE] hover:bg-[#0058a3] text-white py-4 text-base font-semibold"
                >
                  <Camera className="w-5 h-5 mr-2" />
                  Open Camera
                </Button>

                <Button
                  variant="outline"
                  onClick={() => setManualMode(true)}
                  className="w-full border-white/30 text-white hover:bg-white/10 py-4 text-base"
                >
                  <Keyboard className="w-4 h-4 mr-2" />
                  Type barcode instead
                </Button>
              </div>

              <p className="text-gray-600 text-xs">
                Point camera at barcode, hold steady, then take the photo
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Manual entry (when denied and user taps "Type barcode") ──
  if (manualMode) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        <div className="flex items-center justify-between px-4 pt-4 pb-3 bg-[#0071CE]">
          <button onClick={onClose} className="text-white p-1"><X className="w-6 h-6" /></button>
          <span className="text-white font-semibold text-base">Enter Barcode</span>
          <div className="w-6" />
        </div>
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
              ← Back to camera
            </button>
          </div>
          {result && (
            <div className="px-4 pb-8">
              <div className="flex gap-3 mb-4">
                {imageUrl ? (
                  <img src={imageUrl} alt={result.name} className="w-20 h-20 object-contain rounded-lg border border-gray-100 flex-shrink-0" />
                ) : (
                  <div className="w-20 h-20 bg-gray-100 rounded-lg flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-0.5">{result.brand || ""}</p>
                  <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-3">{result.name}</p>
                  <p className="text-xl font-bold text-[#0071CE] mt-1">${parseFloat(result.price).toFixed(2)}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleScanAgain}>Clear</Button>
                <Button variant="outline" className="flex-1" onClick={handleViewProduct}>View Item</Button>
                <Button className="flex-1 bg-[#0071CE] hover:bg-[#0058a3] text-white" onClick={() => addToCartMutation.mutate()} disabled={addToCartMutation.isPending}>
                  Add to Cart
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Main live scanner UI ──
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" style={{ maxWidth: "100vw" }}>
      <div className="flex items-center justify-between px-4 pt-safe-top pt-4 pb-3 bg-[#0071CE] z-10">
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
        {cameraState === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
            <div className="flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
              <p className="text-white/60 text-sm">Starting camera…</p>
            </div>
          </div>
        )}

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
            {cameraState === "live" && !result && !notFound && (
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
          {cameraState === "live" && !result && !notFound && !lookupMutation.isPending && (
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
