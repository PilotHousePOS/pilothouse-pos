import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { X, Flashlight, FlashlightOff, Keyboard, Camera, Image } from "lucide-react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { getProductImageUrl } from "@/lib/imageUrl";

const SCANNER_VERSION = "v17";

// iOS Safari / PWA has strict memory limits and several API gaps.
// Detect once at module load time so all paths can branch.
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
const platform = isIOS ? "ios" : /Android/i.test(navigator.userAgent) ? "android" : "other";

// Fire-and-forget server log — shows up in deployment logs via fetch_deployment_logs.
function scanLog(event: string, extras: Record<string, string | number | undefined> = {}) {
  fetch("/api/log/scanner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, platform, ...extras }),
  }).catch(() => {});
}

interface Product {
  id: number;
  name: string;
  price: string;
  brand: string | null;
  imageUrl: string | null;
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
    onError: (_err, upc) => {
      setResult(null);
      if (fromPhotoRef.current) {
        fromPhotoRef.current = false;
        setPhotoError(`Barcode scanned (${upc}) — product not found in database.`);
        setCameraState("home");
      } else {
        setNotFound(true);
        setTimeout(() => {
          setNotFound(false);
          cooldownRef.current = false;
        }, 2000);
      }
      cooldownRef.current = false;
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
    scanLog("manual_submit", { upc });
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
    cooldownRef.current = false;
    setLastScanned("");
    setCameraState("scanning-photo");
    if (fileInputRef.current) fileInputRef.current.value = "";

    const fileSizeKB = Math.round(file.size / 1024);
    scanLog("photo_start", { fileSizeKB });

    const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
      Promise.race([p, new Promise<null>(r => setTimeout(() => r(null), ms))]);

    // iOS: keep resolution very small to avoid memory crashes.
    // Android Chrome can handle larger images via BarcodeDetector.
    const MAX = isIOS ? 800 : 1920;

    let upc: string | null = null;

    // Method 1: Native BarcodeDetector — fast, memory-efficient, Chrome Android only.
    // NOT available on iOS Safari.
    if (!isIOS && "BarcodeDetector" in window) {
      scanLog("try_barcode_detector");
      try {
        const bd = new (window as any).BarcodeDetector({
          formats: ["upc_a", "upc_e", "ean_13", "ean_8", "code_128", "code_39", "qr_code", "itf", "codabar"],
        });
        const imageUrl = URL.createObjectURL(file);
        try {
          const imgEl = await withTimeout(
            new Promise<HTMLImageElement>((resolve, reject) => {
              const img = new Image();
              img.onload = () => resolve(img);
              img.onerror = reject;
              img.src = imageUrl;
            }),
            5000
          );
          if (imgEl) {
            const detections = await withTimeout(bd.detect(imgEl), 6000);
            if (detections && detections.length > 0) upc = detections[0].rawValue;
          }
        } finally {
          URL.revokeObjectURL(imageUrl);
        }
        if (upc) scanLog("barcode_detector_success", { upc });
        else scanLog("barcode_detector_no_result");
      } catch (err: any) {
        const error = String(err?.message || err).slice(0, 120);
        scanLog("barcode_detector_error", { error });
        console.warn("[Scanner] BarcodeDetector failed:", err);
      }
    }

    // Method 2: ZXing via canvas.
    // On iOS: try only 0° (most likely orientation, avoids 4× memory allocation).
    // On Android: try all 4 rotations if 0° fails.
    if (!upc) {
      scanLog("try_zxing", { maxPx: MAX });
      let objectUrl: string | null = null;
      try {
        objectUrl = URL.createObjectURL(file);
        const imgEl = await withTimeout(
          new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("img-load"));
            img.src = objectUrl!;
          }),
          5000
        );

        if (imgEl) {
          const sw = imgEl.naturalWidth, sh = imgEl.naturalHeight;
          const scale = Math.min(1, MAX / Math.max(sw, sh));
          const dw = Math.round(sw * scale), dh = Math.round(sh * scale);
          scanLog("zxing_image_loaded", { origW: sw, origH: sh, scaledW: dw, scaledH: dh });
          const reader = new BrowserMultiFormatReader();

          // On iOS only try 0°; on Android try all 4 rotations.
          const rotations: (0 | 90 | 270 | 180)[] = isIOS ? [0] : [0, 90, 270, 180];

          for (const deg of rotations) {
            const canvas = document.createElement("canvas");
            try {
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
              scanLog("zxing_success", { upc, deg });
              break;
            } catch {
              // This rotation didn't decode — try next.
            } finally {
              // Explicitly release canvas memory — critical on iOS.
              canvas.width = 0;
              canvas.height = 0;
            }
          }
          if (!upc) scanLog("zxing_no_result");
        } else {
          scanLog("zxing_img_load_timeout");
        }
      } catch (err: any) {
        const error = String(err?.message || err).slice(0, 120);
        scanLog("zxing_error", { error });
        console.warn("[Scanner] Canvas decode failed:", err);
      } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      }
    }

    if (upc) {
      fromPhotoRef.current = true;
      handleDetected(upc);
    } else {
      scanLog("photo_failed_all_methods", { fileSizeKB });
      setPhotoError("No barcode found. Make sure the barcode fills the frame and is in focus, then try again.");
      setCameraState("home");
    }
  }, [handleDetected]);

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

  const imageUrl = getProductImageUrl(result?.imageUrls?.[0] || result?.imageUrl);

  const Header = ({ title }: { title: string }) => (
    <div className="flex items-center justify-between px-4 pt-4 pb-3 bg-[#0071CE]">
      <button onClick={onClose} className="text-white p-1"><X className="w-6 h-6" /></button>
      <span className="text-white font-semibold text-base">{title}</span>
      <span className="text-white/40 text-xs">{SCANNER_VERSION}</span>
    </div>
  );

  let content: React.ReactNode = null;

  // ── Scanning photo spinner ──
  if (cameraState === "scanning-photo") {
    content = (
      <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
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
  else if (cameraState === "starting") {
    content = (
      <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
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

  // ── Home / Denied / Result screen ──
  else if ((cameraState === "home" || cameraState === "denied") && !manualMode) {
    content = (
      <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
        {/*
          File input notes:
          - iOS PWA: omit `capture` entirely — iOS will show its native "Take Photo / Photo Library"
            sheet which is stable. Using capture="environment" in a saved-to-home-screen PWA on
            iOS can cause the app to crash or not return the file.
          - Android Chrome: include capture="environment" so the camera opens immediately
            without a picker.
        */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          {...(!isIOS && { capture: "environment" })}
          className="hidden"
          onChange={handlePhotoCapture}
        />
        <Header title="Scanner" />

        {result ? (
          /* ── Result card ── */
          <div className="flex-1 bg-white flex flex-col">
            <div className="px-4 pt-6 pb-4 flex gap-4">
              {imageUrl
                ? <img src={imageUrl} alt={result.name} className="w-24 h-24 object-contain rounded-xl border border-gray-100 flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                : <div className="w-24 h-24 bg-gray-100 rounded-xl flex-shrink-0" />
              }
              <div className="flex-1 min-w-0 pt-1">
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">{result.brand || ""}</p>
                <p className="text-base font-bold text-gray-900 leading-snug">{result.name}</p>
                <p className="text-2xl font-bold text-[#0071CE] mt-2">${parseFloat(result.price).toFixed(2)}</p>
              </div>
            </div>
            <div className="px-4 pb-6 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handleScanAgain}>Scan Again</Button>
              <Button variant="outline" className="flex-1" onClick={handleViewProduct}>View Item</Button>
              <Button className="flex-1 bg-[#0071CE] hover:bg-[#0058a3] text-white" onClick={() => addToCartMutation.mutate()} disabled={addToCartMutation.isPending}>Add to Cart</Button>
            </div>
          </div>
        ) : (
          /* ── Scan prompt ── */
          <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5">
            <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center">
              <Camera className="w-10 h-10 text-white/70" />
            </div>

            <div className="text-center">
              <p className="text-white text-xl font-bold mb-1">Scan a Barcode</p>
              <p className="text-gray-400 text-sm">
                {isIOS
                  ? "Tap below, then choose Take Photo to scan a barcode"
                  : "Take a photo of any product barcode"}
              </p>
            </div>

            {photoError && (
              <div className="bg-orange-500/20 border border-orange-500/40 rounded-xl px-4 py-3 w-full">
                <p className="text-orange-300 text-sm">{photoError}</p>
              </div>
            )}

            {cameraState === "denied" && cameraError && (
              <div className="bg-red-500/20 border border-red-500/40 rounded-xl px-4 py-3 w-full">
                <p className="text-red-300 text-sm">Camera access was denied. Use photo capture instead.</p>
              </div>
            )}

            <div className="flex flex-col gap-3 w-full">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-[#0071CE] text-white py-4 text-base font-semibold rounded-xl flex items-center justify-center gap-2 active:bg-[#0058a3]"
              >
                <Image className="w-5 h-5" />
                {isIOS ? "Open Camera to Scan" : "Take Photo to Scan"}
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
              {isIOS
                ? "Choose \"Take Photo\" from the sheet, aim at the barcode, and tap the shutter"
                : "Point camera at the barcode, hold steady, then tap the shutter"}
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── Manual entry ──
  else if (manualMode) {
    content = (
      <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
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
                  ? <img src={imageUrl} alt={result.name} className="w-20 h-20 object-contain rounded-lg border border-gray-100 flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
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

  // ── Live scanner (only when camera is actually running) ──
  else if (cameraState === "live") {
    content = (
      <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
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
                ? <img src={imageUrl} alt={result.name} className="w-20 h-20 object-contain rounded-lg border border-gray-100 flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
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

  if (!content) return null;
  return createPortal(content, document.body);
}
