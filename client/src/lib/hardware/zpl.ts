// ─── ZPL II Label Printer ─────────────────────────────────────────────────────
// Sends ZPL II label definitions to a paired serial label printer.
// Tested against standard Zebra thermal label printers (ZPL II spec).
//
// Default label size: 2" × 1" (203 dpi → 406 × 203 dots)
// Adjust LABEL_WIDTH_DOTS and LABEL_HEIGHT_DOTS to match your media.

export interface LabelData {
  name:     string;         // Product name (≤ 30 chars per line, wraps)
  price:    number;         // e.g. 12.99
  barcode?: string;         // UPC / SKU for Code128 barcode (optional)
}

// ── Label dimensions (dots at 203 dpi) ────────────────────────────────────────
const LABEL_WIDTH_DOTS  = 406;  // 2"   at 203 dpi
const LABEL_HEIGHT_DOTS = 203;  // 1"   at 203 dpi

// ── ZPL builder ──────────────────────────────────────────────────────────────

function buildZpl(data: LabelData): string {
  const { name, price, barcode } = data;

  // Sanitise: remove ZPL control characters (^ ~)
  const safeName    = name.replace(/[\^~]/g, '').trim().slice(0, 30);
  const priceStr    = `$${price.toFixed(2)}`;
  const safeBarcode = barcode ? barcode.replace(/[^A-Za-z0-9\-\.\ \$\/\+\%]/g, '').slice(0, 20) : '';

  const lines: string[] = [];
  lines.push('^XA');
  lines.push(`^PW${LABEL_WIDTH_DOTS}`);
  lines.push(`^LL${LABEL_HEIGHT_DOTS}`);
  lines.push('^CI28');       // UTF-8 character interpretation

  // Product name — Helvetica font, 28pt high × 24pt wide
  lines.push('^FO10,10^A0N,28,24');
  lines.push(`^FD${safeName}^FS`);

  // Price — slightly smaller below name
  lines.push('^FO10,50^A0N,24,20');
  lines.push(`^FD${priceStr}^FS`);

  // Barcode — Code128, height 50 dots, print human-readable below
  if (safeBarcode) {
    lines.push('^FO10,82^BCN,50,Y,N,N');
    lines.push(`^FD${safeBarcode}^FS`);
  }

  lines.push('^XZ');
  return lines.join('\n') + '\n';
}

// ── Send label to printer ─────────────────────────────────────────────────────

export async function printLabel(
  port: any, // SerialPort (Web Serial API)
  data: LabelData,
): Promise<void> {
  const zpl    = buildZpl(data);
  const bytes  = new TextEncoder().encode(zpl);

  const writer: WritableStreamDefaultWriter<Uint8Array> = port.writable.getWriter();
  try {
    await writer.write(bytes);
  } finally {
    try { writer.releaseLock(); } catch {}
  }
}

// ── Baud rate for Zebra label printers ───────────────────────────────────────
// Default: 9600. Many Zebra printers default to 9600; check ^SCa on the
// printer config label to confirm.
export const LABEL_PRINTER_BAUD_RATE = 9600;
