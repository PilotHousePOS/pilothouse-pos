import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

interface BarcodeDisplayProps {
  value: string;
  format?: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
  className?: string;
}

export default function BarcodeDisplay({
  value,
  format = "CODE128",
  width = 2,
  height = 80,
  displayValue = true,
  className = "",
}: BarcodeDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !value || value.length < 6) return;
    try {
      JsBarcode(canvasRef.current, value, {
        format,
        width,
        height,
        displayValue,
        margin: 14,
        background: "#ffffff",
        lineColor: "#000000",
        fontSize: 12,
        fontOptions: "",
        font: "monospace",
        valid: () => true,
      });
    } catch {
      // Invalid barcode — clear canvas
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }, [value, format, width, height, displayValue]);

  if (!value || value.length < 6) return null;

  // canvas renders raw pixels — completely unaffected by dark mode CSS
  return (
    <div style={{ background: "#ffffff", display: "inline-block", lineHeight: 0 }}>
      <canvas ref={canvasRef} className={className} style={{ display: "block" }} />
    </div>
  );
}
