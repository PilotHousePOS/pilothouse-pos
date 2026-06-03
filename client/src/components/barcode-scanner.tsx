import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Keyboard, Camera } from "lucide-react";
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

type CameraState = "home" | "starting" | "live" | "denied";

export default function BarcodeScanner({ onClose, onDetected }: BarcodeScannerProps) {
  const quaggaContainerRef = useRef<HTMLDivElement>(null);
  const quaggaModuleRef = useRef<any>(null); // holds the imported Quagga2 module for cleanup
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [cameraState, setCameraState] = useState<CameraState>("home");
  const [manualMode, setManualMode] = useState(false);
  const [manualUpc, setManualUpc] = useState("");
  const [result, setResult] = useState<Product | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [lastScanned, setLastScanned] = useState("");
  const cooldownRef = useRef(false);

  // Cleanup Quagga on unmount
  useEffect(() => {
    return () => {
      if (quaggaModuleRef.current) {
        try { quaggaModuleRef.current.stop(); } catch {}
        quaggaModuleRef.current = null;
      }
    };
  }, []);

  // ── Live camera: initialize Quagga2 once the live-view div is in the DOM ──
  // Quagga2 (getUserMedia + canvas) works on both iOS Safari and Android Chrome.
  useEffect(() => {
    if (cameraState !== "live") return;
    let cancelled = false;

    const initQuagga = async () => {
      // Give React one tick to mount the container div
      await new Promise(r => setTimeout(r, 80));
      if (cancelled) return;
      const container = quaggaContainerRef.current;
      if (!container) {
        setCameraError("Camera container not ready — please try again.");
        setCameraState("denied");
        return;
      }
      try {
        const { default: Quagga } = await import("@ericblade/quagga2");
        if (cancelled) return;
        await new Promise<void>((resolve, reject) => {
          Quagga.init(
            {
              inputStream: {
                name: "Live",
                type: "LiveStream",
                target: container,
                constraints: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
              },
              decoder: {
                readers: ["upc_reader", "upc_e_reader", "ean_reader", "ean_8_reader", "code_128_reader", "code_39_reader"],
              },
              locate: true,
            },
            (err: any) => {
              if (err) { reject(err); return; }
              Quagga.start();
              quaggaModuleRef.current = Quagga;
              resolve();
            }
          );
        });
        if (cancelled) { try { Quagga.stop(); } catch {} return; }
        Quagga.onDetected((result: any) => {
          const code = result?.codeResult?.code;
          if (code && !cancelled) {
            scanLog("quagga_detected", { upc: code });
            handleDetected(code);
          }
        });
        scanLog("quagga_started");
      } catch (err: any) {
        if (cancelled) return;
        const error = String(err?.message || err).slice(0, 200);
        scanLog("quagga_error", { error });
        setCameraError("Could not start camera. Please grant camera access and try again.");
        setCameraState("denied");
      }
    };

    initQuagga();

    return () => {
      cancelled = true;
      if (quaggaModuleRef.current) {
        try { quaggaModuleRef.current.stop(); } catch {}
        quaggaModuleRef.current = null;
      }
    };
  }, [cameraState, handleDetected]);

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
      setResult(null);
      setNotFound(true);
      setTimeout(() => {
        setNotFound(false);
        cooldownRef.current = false;
      }, 2000);
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

  const requestCamera = useCallback(() => {
    setCameraState("starting");
    setCameraError("");
    scanLog("camera_requested");
    // Quagga2 useEffect initializes once "live" state mounts the container div.
    // Use rAF so the "starting" spinner renders one frame before transitioning.
    requestAnimationFrame(() => setCameraState("live"));
  }, []);

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
    setCameraError("");
    setCameraState("home");
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

  const imageUrl = getProductImageUrl(result?.imageUrls?.[0] || result?.imageUrl);

  const Header = ({ title }: { title: string }) => (
    <div className="flex items-center justify-between px-4 pt-4 pb-3 bg-[#0071CE]">
      <button onClick={onClose} className="text-white p-1"><X className="w-6 h-6" /></button>
      <span className="text-white font-semibold text-base">{title}</span>
      <span className="text-white/40 text-xs">{SCANNER_VERSION}</span>
    </div>
  );

  let content: React.ReactNode = null;

  // ── Camera starting spinner ──
  if (cameraState === "starting") {
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
              <p className="text-gray-400 text-sm">Point the camera at any product barcode</p>
            </div>

            {cameraState === "denied" && cameraError && (
              <div className="bg-red-500/20 border border-red-500/40 rounded-xl px-4 py-3 w-full">
                <p className="text-red-300 text-sm">Camera access was denied. Please allow camera access in your browser settings and try again.</p>
              </div>
            )}

            <div className="flex flex-col gap-3 w-full">
              <button
                onClick={requestCamera}
                className="w-full bg-[#0071CE] text-white py-4 text-base font-semibold rounded-xl flex items-center justify-center gap-2 active:bg-[#0058a3]"
              >
                <Camera className="w-5 h-5" />
                Scan with Camera
              </button>

              <button
                onClick={() => setManualMode(true)}
                className="w-full bg-transparent border border-white/25 text-white py-4 text-base font-semibold rounded-xl flex items-center justify-center gap-2 active:bg-white/10"
              >
                <Keyboard className="w-5 h-5" />
                Enter UPC Manually
              </button>
            </div>

            <p className="text-gray-600 text-xs text-center">
              Hold steady with the barcode centered in the frame
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
          <button onClick={() => setManualMode(m => !m)} className="text-white p-1">
            <Keyboard className="w-5 h-5" />
          </button>
        </div>

        <div className="relative flex-1 overflow-hidden">
          {/* Quagga2 renders its own <video> into this div via getUserMedia (iOS + Android) */}
          <div ref={quaggaContainerRef} className="absolute inset-0 w-full h-full overflow-hidden [&_video]:absolute [&_video]:inset-0 [&_video]:w-full [&_video]:h-full [&_video]:object-cover [&_canvas]:hidden" />
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
