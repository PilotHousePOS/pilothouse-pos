// ─── ESC/POS Printer + Cash Drawer ──────────────────────────────────────────
// Utilities for writing raw ESC/POS commands to a Web Serial port.
// Compatible with most standard thermal receipt printers (Epson, Star, etc.)
//
// USAGE:
//   const writer = await openWriter(port);
//   await printReceipt(writer, saleData);
//   await openDrawer(writer);
//   writer.releaseLock();

export interface ReceiptSaleData {
  storeName:     string;
  orderNumber:   string;
  items:         Array<{ name: string; price: number; quantity: number }>;
  subtotal:      number;
  tax:           number;
  total:         number;
  paymentMethod: string;
  amountTendered?: number;
  changeDue?:    number;
  operatorName?: string;
}

// ── ESC/POS byte constants ────────────────────────────────────────────────────
const ESC = 0x1b;
const GS  = 0x1d;

// Frequently used command sequences
const RESET          = [ESC, 0x40];                   // Initialize printer
const ALIGN_LEFT     = [ESC, 0x61, 0x00];
const ALIGN_CENTER   = [ESC, 0x61, 0x01];
const BOLD_ON        = [ESC, 0x45, 0x01];
const BOLD_OFF       = [ESC, 0x45, 0x00];
const DOUBLE_HEIGHT  = [ESC, 0x21, 0x10];             // Double height text
const DOUBLE_ON      = [ESC, 0x21, 0x30];             // Double height + width
const NORMAL_TEXT    = [ESC, 0x21, 0x00];             // Normal text size
const PAPER_FEED     = [0x0a];                         // Line feed
const FULL_CUT       = [GS,  0x56, 0x42, 0x00];       // Full paper cut
const DRAWER_KICK    = [ESC, 0x70, 0x00, 0x19, 0xfa]; // Cash drawer pin 0

// ── Low-level write ───────────────────────────────────────────────────────────

export async function openWriter(port: any): Promise<WritableStreamDefaultWriter<Uint8Array>> {
  const writer = port.writable.getWriter();
  return writer;
}

async function writeBytes(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  ...chunks: (number[] | Uint8Array)[]
): Promise<void> {
  for (const chunk of chunks) {
    await writer.write(new Uint8Array(chunk));
  }
}

function encode(text: string): number[] {
  // Encoder for ASCII/Latin-1; falls back to '?' for non-encodable chars
  return Array.from(text, (ch) => {
    const code = ch.charCodeAt(0);
    return code > 255 ? 0x3f : code; // '?'
  });
}

function nl(): number[] { return [0x0a]; }

// ── Receipt formatting helpers ────────────────────────────────────────────────

const COL_WIDTH = 42; // characters per line (standard 80mm paper ≈ 42 chars)

function divider(): number[] {
  return encode('-'.repeat(COL_WIDTH));
}

/** Left-pad a string to fill COL_WIDTH alongside a left string. */
function twoColumns(left: string, right: string, width = COL_WIDTH): number[] {
  const gap = Math.max(1, width - left.length - right.length);
  return encode(left + ' '.repeat(gap) + right);
}

/** Wrap text to COL_WIDTH lines. */
function wrapText(text: string, width = COL_WIDTH): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(' ')) {
    if ((current + (current ? ' ' : '') + word).length > width) {
      if (current) lines.push(current);
      current = word;
    } else {
      current += (current ? ' ' : '') + word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [text.slice(0, width)];
}

// ── Receipt print ─────────────────────────────────────────────────────────────

export async function printReceipt(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  data: ReceiptSaleData,
): Promise<void> {
  const { storeName, orderNumber, items, subtotal, tax, total,
          paymentMethod, amountTendered, changeDue, operatorName } = data;

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  await writeBytes(writer,
    // Init
    RESET,
    ALIGN_CENTER,
    DOUBLE_ON,
    encode(storeName.slice(0, 20)), nl(),
    NORMAL_TEXT,
    BOLD_OFF,
    nl(),

    // Date / order
    encode(`${dateStr}  ${timeStr}`), nl(),
    encode(`Order: ${orderNumber}`), nl(),
    ...(operatorName ? [encode(`Cashier: ${operatorName}`), nl()] : []),
    nl(),

    // Items
    ALIGN_LEFT,
    divider(), nl(),
    BOLD_ON,
    twoColumns('ITEM', 'TOTAL'), nl(),
    BOLD_OFF,
    divider(), nl(),
  );

  for (const item of items) {
    const lineTotal = `$${(item.price * item.quantity).toFixed(2)}`;
    // Truncate name to leave room for price
    const maxNameLen = COL_WIDTH - lineTotal.length - 1;
    const name = `${item.quantity > 1 ? `${item.quantity}x ` : ''}${item.name}`;
    // If name overflows, wrap it
    const nameLines = wrapText(name, maxNameLen);
    for (let i = 0; i < nameLines.length; i++) {
      if (i === 0) {
        await writeBytes(writer, twoColumns(nameLines[0], lineTotal), nl());
      } else {
        await writeBytes(writer, encode('  ' + nameLines[i]), nl());
      }
    }
  }

  const fmt = (n: number) => `$${n.toFixed(2)}`;

  await writeBytes(writer,
    divider(), nl(),
    twoColumns('Subtotal', fmt(subtotal)), nl(),
    twoColumns('Tax', fmt(tax)), nl(),
    BOLD_ON,
    twoColumns('TOTAL', fmt(total)), nl(),
    BOLD_OFF,
    nl(),

    // Payment
    twoColumns('Payment', paymentMethod.toUpperCase()), nl(),
    ...(amountTendered !== undefined ? [twoColumns('Tendered', fmt(amountTendered)), nl()] : []),
    ...(changeDue !== undefined && changeDue > 0 ? [twoColumns('Change', fmt(changeDue)), nl()] : []),
    nl(),

    // Footer
    ALIGN_CENTER,
    encode('Thank you for your business!'), nl(),
    encode('We appreciate your visit.'), nl(),
    nl(), nl(), nl(),

    // Cut
    FULL_CUT,
  );
}

// ── Cash drawer kick ──────────────────────────────────────────────────────────

export async function openDrawer(
  writer: WritableStreamDefaultWriter<Uint8Array>,
): Promise<void> {
  await writeBytes(writer, DRAWER_KICK);
}

// ── Convenience: print + close writer ────────────────────────────────────────

export async function sendPrintJob(
  port: any,
  fn: (writer: WritableStreamDefaultWriter<Uint8Array>) => Promise<void>,
): Promise<void> {
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  try {
    writer = await openWriter(port);
    await fn(writer);
  } finally {
    if (writer) {
      try { writer.releaseLock(); } catch {}
    }
  }
}
