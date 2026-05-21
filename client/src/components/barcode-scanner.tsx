import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader, NotFoundException } from "@zxing/browser";
import { X, Flashlight, FlashlightOff, Keyboard } from "lucide-react";
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
}

export default function BarcodeScanner({ onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

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
    lookupMutation.mutate(upc);
  }, [lastScanned, lookupMutation]);

  // Start camera + ZXing reader
  useEffect(() => {
    if (manualMode) return;
    let cancelled = false;

    const startScanner = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;

        // Check torch support
        const track = stream.getVideoTracks()[0];
        const caps = track.getCapabilities?.() as any;
        if (caps?.torch) setTorchSupported(true);

        const reader = new BrowserMultiFormatReader();
        readerRef.current = reader;

        reader.decodeFromStream(stream, videoRef.current!, (res, err) => {
          if (cancelled) return;
          if (res) handleDetected(res.getText());
        });
      } catch {
        toast({ title: "Camera access denied", description: "Please allow camera access to use the scanner.", variant: "destructive" });
        onClose();
      }
    };

    startScanner();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
      readerRef.current = null;
    };
  }, [manualMode]);

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

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" style={{ maxWidth: "100vw" }}>
      {/* Header bar */}
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

      {/* Manual entry banner */}
      <button
        onClick={() => setManualMode(m => !m)}
        className="w-full bg-white/10 text-white text-sm py-2 px-4 text-center hover:bg-white/20 transition-colors"
      >
        Type your barcode
      </button>

      {/* Manual entry input */}
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

      {/* Camera viewfinder */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Dark overlay with clear scanning window */}
        <div className="absolute inset-0">
          {/* Top dark band */}
          <div className="absolute top-0 left-0 right-0 bg-black/55" style={{ height: "25%" }} />
          {/* Bottom dark band */}
          <div className="absolute bottom-0 left-0 right-0 bg-black/55" style={{ height: "35%" }} />
          {/* Left dark band */}
          <div className="absolute left-0 bg-black/55" style={{ top: "25%", height: "40%", width: "8%" }} />
          {/* Right dark band */}
          <div className="absolute right-0 bg-black/55" style={{ top: "25%", height: "40%", width: "8%" }} />

          {/* Scan window corners */}
          <div className="absolute" style={{ top: "25%", left: "8%", right: "8%", height: "40%" }}>
            {/* Animated scan line */}
            {scanning && !result && !notFound && (
              <div className="absolute left-0 right-0 h-0.5 bg-[#0071CE]/80" style={{ animation: "scanline 2s ease-in-out infinite" }} />
            )}

            {/* Corner brackets */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br" />

            {/* Center crosshair dot */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-white/60" />
            </div>
          </div>
        </div>

        {/* Status messages */}
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

      {/* Result card — slides up from bottom */}
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
