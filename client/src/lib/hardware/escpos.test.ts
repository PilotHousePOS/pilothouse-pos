// ─── ESC/POS Receipt Footer Tests ─────────────────────────────────────────────
//
// Confirms that printReceipt() handles the footer section correctly:
//   1. A custom footerMessage is printed verbatim (word-wrapped to PAPER_WIDTH)
//   2. An absent/empty footerMessage falls back to the two default sign-off lines
//   3. Long footer text is word-wrapped to PAPER_WIDTH

import { describe, it, expect } from 'vitest';
import { printReceipt, PAPER_WIDTH, type ReceiptSaleData } from './escpos';

// ── Mock writer ────────────────────────────────────────────────────────────────

/**
 * Builds a minimal writable-stream mock that collects every Uint8Array chunk
 * passed to write().  All chunks are concatenated so the test can inspect the
 * full byte stream after the print job finishes.
 */
function makeMockWriter() {
  const chunks: Uint8Array[] = [];
  const writer = {
    write: async (chunk: Uint8Array) => { chunks.push(chunk); },
    releaseLock: () => {},
  } as unknown as WritableStreamDefaultWriter<Uint8Array>;

  const bytes = () => {
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
  };

  /** Decode the captured byte stream to a plain ASCII string (non-printable bytes → '·'). */
  const text = () =>
    Array.from(bytes(), b => (b >= 0x20 && b <= 0x7e) ? String.fromCharCode(b) : '·').join('');

  return { writer, bytes, text };
}

// ── Minimal sale fixture ───────────────────────────────────────────────────────

function makeSale(overrides: Partial<ReceiptSaleData> = {}): ReceiptSaleData {
  return {
    storeName:     'Test Store',
    orderNumber:   '1001',
    items:         [{ name: 'Coffee', price: 3.50, quantity: 1 }],
    subtotal:      3.50,
    tax:           0.29,
    total:         3.79,
    paymentMethod: 'cash',
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('printReceipt — footer section', () => {

  it('prints the custom footerMessage when one is provided', async () => {
    const { writer, text } = makeMockWriter();
    await printReceipt(writer, makeSale({ footerMessage: 'Come back soon!' }));

    const out = text();
    expect(out).toContain('Come back soon!');
    // Default lines must NOT appear
    expect(out).not.toContain('Thank you for your business!');
    expect(out).not.toContain('We appreciate your visit.');
  });

  it('falls back to the two default lines when footerMessage is undefined', async () => {
    const { writer, text } = makeMockWriter();
    await printReceipt(writer, makeSale());   // no footerMessage field

    const out = text();
    expect(out).toContain('Thank you for your business!');
    expect(out).toContain('We appreciate your visit.');
  });

  it('falls back to the two default lines when footerMessage is an empty string', async () => {
    const { writer, text } = makeMockWriter();
    await printReceipt(writer, makeSale({ footerMessage: '' }));

    const out = text();
    expect(out).toContain('Thank you for your business!');
    expect(out).toContain('We appreciate your visit.');
  });

  it('falls back to the two default lines when footerMessage is only whitespace', async () => {
    const { writer, text } = makeMockWriter();
    await printReceipt(writer, makeSale({ footerMessage: '   ' }));

    const out = text();
    expect(out).toContain('Thank you for your business!');
    expect(out).toContain('We appreciate your visit.');
  });

  it('word-wraps a long footer message to PAPER_WIDTH columns', async () => {
    // Construct a footer that is wider than PAPER_WIDTH when on one line
    const longFooter =
      'Thank you very much for shopping with us today we hope to see you again very soon!';
    expect(longFooter.length).toBeGreaterThan(PAPER_WIDTH);

    const { writer, text } = makeMockWriter();
    await printReceipt(writer, makeSale({ footerMessage: longFooter }));

    const out = text();

    // Every run of printable characters between control-byte markers should be
    // no longer than PAPER_WIDTH.  Split on the non-printable sentinel '·' and
    // check each segment that is part of the footer.
    const printableSegments = out.split('·').map(s => s.trimEnd());
    const footerWords = longFooter.split(' ');
    for (const seg of printableSegments) {
      if (seg.length > 0 && footerWords.some(w => seg.includes(w))) {
        expect(seg.length).toBeLessThanOrEqual(PAPER_WIDTH);
      }
    }

    // The full footer content must appear across all segments
    const fullOut = out.replace(/·/g, '');
    for (const word of footerWords) {
      expect(fullOut).toContain(word);
    }
  });

  it('prints a short custom footer on a single line (no unnecessary wrapping)', async () => {
    const shortFooter = 'See you next time!';
    expect(shortFooter.length).toBeLessThanOrEqual(PAPER_WIDTH);

    const { writer, text } = makeMockWriter();
    await printReceipt(writer, makeSale({ footerMessage: shortFooter }));

    const out = text();
    // The text must appear as a contiguous sequence in the output
    expect(out).toContain(shortFooter);
  });
});
