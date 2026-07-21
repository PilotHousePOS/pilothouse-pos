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
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !value || value.length < 6) return;
    try {
      JsBarcode(svgRef.current, value, {
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
      });
    } catch {
      // Invalid barcode value — clear the SVG
      if (svgRef.current) svgRef.current.innerHTML = "";
    }
  }, [value, format, width, height, displayValue]);

  if (!value || value.length < 6) return null;

  return <svg ref={svgRef} className={className} />;
}
