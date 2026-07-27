// ─── ESC/POS Printer + Cash Drawer ──────────────────────────────────────────
// Utilities for writing raw ESC/POS commands to a Web Serial port.
// Compatible with most standard thermal receipt printers (Epson, Star, etc.)
//
// HARDWARE CALIBRATION NOTES
// ──────────────────────────
// Paper width: Most 80 mm thermal printers support 42 chars/line at 9600 baud.
//   Some models (Star SP, older Epson) use 40 chars. Run printTestPage() to
//   verify — if the right column of the alignment test overflows by 2 chars,
//   change PAPER_WIDTH below from 42 → 40.
//
// Cut command: FULL_CUT (GS V B 0) works on Epson TM-Txx and most clones.
//   If the paper does not cut, try PARTIAL_CUT (GS V 1) instead.
//   Update the `CUT` constant below accordingly.
//
// Cash drawer: The kick byte uses ESC p m t1 t2.
//   m = 0x00 activates pin 2 (most common — Epson, APG drawers).
//   m = 0x01 activates pin 5 (some Star / older Casio drawers).
//   If the drawer doesn't open, swap DRAWER_KICK_PIN2 → DRAWER_KICK_PIN5
//   in the openDrawer() call below.
//
// USAGE:
//   const writer = await openWriter(port);
//   await printTestPage(writer);          // alignment check before going live
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
const RESET          = [ESC, 0x40];            // Initialize printer
const ALIGN_LEFT     = [ESC, 0x61, 0x00];
const ALIGN_CENTER   = [ESC, 0x61, 0x01];
const BOLD_ON        = [ESC, 0x45, 0x01];
const BOLD_OFF       = [ESC, 0x45, 0x00];
const DOUBLE_ON      = [ESC, 0x21, 0x30];      // Double height + width
const NORMAL_TEXT    = [ESC, 0x21, 0x00];      // Normal text size

// Cut commands — choose the one that matches your printer model:
//   FULL_CUT    GS V B 0  — full cut; works on Epson TM-T88 and most clones
//   PARTIAL_CUT GS V 1    — partial cut; some Star and older Citizen models
const FULL_CUT    = [GS,  0x56, 0x42, 0x00];
const PARTIAL_CUT = [GS,  0x56, 0x01];         // keep if FULL_CUT doesn't cut

// Active cut command — change to PARTIAL_CUT if FULL_CUT doesn't work
const CUT = FULL_CUT;

// Cash drawer kick commands:
//   PIN2  ESC p 0 25 250  — activates RJ11 pin 2 (most common: Epson, APG)
//   PIN5  ESC p 1 25 250  — activates RJ11 pin 5 (some Star, older Casio)
const DRAWER_KICK_PIN2 = [ESC, 0x70, 0x00, 0x19, 0xfa];
const DRAWER_KICK_PIN5 = [ESC, 0x70, 0x01, 0x19, 0xfa];

// ── Paper width ───────────────────────────────────────────────────────────────
// 80 mm paper at standard font = 42 chars/line on most Epson-compatible printers.
// If columns overflow or misalign, change to 40.
// Run printTestPage() to see the ruler and confirm the correct value.
export const PAPER_WIDTH = 42;

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

const COL_WIDTH = PAPER_WIDTH;

function divider(): number[] {
  return encode('-'.repeat(COL_WIDTH));
}

/** Right-align `right` against `left` to fill COL_WIDTH. */
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

// ── Diagnostic test page ──────────────────────────────────────────────────────

/**
 * Print a column-alignment test page.
 *
 * Use this before going live to confirm:
 *   1. The ruler line fills the paper edge-to-edge (if short/long → adjust PAPER_WIDTH)
 *   2. Two-column rows align cleanly with a right-flush price column
 *   3. The paper cuts cleanly at the end
 *   4. (If drawer connected) the cash drawer opens
 *
 * Call openDrawer() separately after this if you want to test the drawer kick.
 */
export async function printTestPage(
  writer: WritableStreamDefaultWriter<Uint8Array>,
): Promise<void> {
  const width = COL_WIDTH;

  // Ruler: "123456789012345..." repeated to fill the line exactly
  const ruler = '1234567890'.repeat(Math.ceil(width / 10)).slice(0, width);

  // Two-column alignment samples
  const samples: Array<[string, string]> = [
    ['Item Name',              '$0.00'],
    ['Longer Item Name Here',  '$99.99'],
    ['A'.repeat(width - 8),   '$999.99'],
    ['Subtotal',               '$100.00'],
    ['Tax',                    '$8.25'],
    ['TOTAL',                  '$108.25'],
  ];

  await writeBytes(writer,
    RESET,
    ALIGN_CENTER,
    DOUBLE_ON,
    encode('ESC/POS TEST'), nl(),
    NORMAL_TEXT,
    nl(),

    ALIGN_LEFT,
    encode(`Paper width: ${width} cols`), nl(),
    encode(ruler), nl(),
    nl(),

    BOLD_ON,
    encode('Column alignment:'), nl(),
    BOLD_OFF,
    divider(), nl(),
  );

  for (const [left, right] of samples) {
    await writeBytes(writer, twoColumns(left, right), nl());
  }

  await writeBytes(writer,
    divider(), nl(),
    nl(),
    ALIGN_CENTER,
    encode('If ruler fills paper edge-to-edge,'), nl(),
    encode(`PAPER_WIDTH = ${width} is correct.`), nl(),
    encode('Otherwise adjust in escpos.ts.'), nl(),
    nl(), nl(), nl(),
    CUT,
  );
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
    CUT,
  );
}

// ── Cash drawer kick ──────────────────────────────────────────────────────────

/**
 * Trigger the cash drawer via the printer's RJ11 kick port.
 *
 * Most drawers use pin 2 (default). If the drawer doesn't open, the RJ11
 * wiring may use pin 5 — swap to DRAWER_KICK_PIN5 in this function.
 */
export async function openDrawer(
  writer: WritableStreamDefaultWriter<Uint8Array>,
): Promise<void> {
  await writeBytes(writer, DRAWER_KICK_PIN2);
}

// ── Convenience: print + release writer ──────────────────────────────────────

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
