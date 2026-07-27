// ─── Terminal Frame Parsing Tests ─────────────────────────────────────────────
//
// These tests focus on the critical ETX+LRC chunking boundary:
// The EP serial protocol sends:  STX | payload | ETX | LRC
// ETX and LRC can arrive in separate serial chunks.  The readWithTimeout helper
// must not return until the byte AFTER ETX (the LRC) is present, or the LRC
// stays in the reader buffer and corrupts the next transaction parse.
//
// Tests use a lightweight mock SerialPort that feeds the response as arbitrary
// sized chunks, exercising the reassembly logic in sendTerminalCharge.

import { describe, it, expect, vi } from 'vitest';
import { sendTerminalCharge } from './terminal';

// ── Frame builder (mirrors internal logic) ──────────────────────────────────

const STX = 0x02;
const ETX = 0x03;
const SEP = 0x1c;

function encodeStr(s: string): number[] {
  return Array.from(s, c => c.charCodeAt(0));
}

/** Build a complete, LRC-correct response frame from field values. */
function makeResponseFrame(
  responseCode: string,
  authCode = '',
  last4 = '',
  cardType = '',
): Uint8Array {
  const data = [
    ...encodeStr(responseCode), SEP,
    ...encodeStr(authCode),     SEP,
    ...encodeStr(last4),        SEP,
    ...encodeStr(cardType),
  ];
  const frame = [STX, ...data, ETX];
  let lrc = 0;
  for (const b of frame) lrc ^= b;
  return new Uint8Array([...frame, lrc]);
}

// ── Mock SerialPort ──────────────────────────────────────────────────────────

/**
 * Builds a minimal mock SerialPort whose readable returns `chunks` in order.
 * The writable captures whatever the caller writes (for optional inspection).
 */
function makeMockPort(responseChunks: Uint8Array[]): {
  port: { readable: unknown; writable: unknown };
  written: () => Uint8Array[];
} {
  const captured: Uint8Array[] = [];
  let idx = 0;

  return {
    written: () => captured,
    port: {
      writable: {
        getWriter: () => ({
          write: async (b: Uint8Array) => { captured.push(b); },
          releaseLock: vi.fn(),
        }),
      },
      readable: {
        getReader: () => ({
          read: async (): Promise<{ value?: Uint8Array; done: boolean }> => {
            if (idx < responseChunks.length) return { value: responseChunks[idx++], done: false };
            return { done: true };
          },
          releaseLock: vi.fn(),
        }),
      },
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('sendTerminalCharge — frame chunking and parsing', () => {

  it('approved response in a single chunk', async () => {
    const frame = makeResponseFrame('00', 'ABC123', '9876', 'VISA');
    const { port } = makeMockPort([frame]);

    const result = await sendTerminalCharge(port, { amountCents: 1999, orderRef: 'POS-001' });

    expect(result.approved).toBe(true);
    expect(result.authCode).toBe('ABC123');
    expect(result.last4).toBe('9876');
    expect(result.cardType).toBe('VISA');
  });

  it('ETX and LRC in separate chunks — the primary reliability fix', async () => {
    // This is the exact failure mode: ETX arrives at the end of chunk1,
    // LRC arrives alone in chunk2.  Without the fix the LRC was left in
    // the reader buffer and would corrupt a subsequent transaction.
    const frame = makeResponseFrame('00', 'AUTH77', '4321', 'MC');
    const etxPos = frame.indexOf(ETX);
    const chunk1 = frame.slice(0, etxPos + 1); // includes ETX but not LRC
    const chunk2 = frame.slice(etxPos + 1);    // just the LRC byte

    expect(chunk1[chunk1.length - 1]).toBe(ETX);
    expect(chunk2.length).toBe(1);

    const { port } = makeMockPort([chunk1, chunk2]);
    const result = await sendTerminalCharge(port, { amountCents: 500, orderRef: 'POS-002' });

    expect(result.approved).toBe(true);
    expect(result.authCode).toBe('AUTH77');
    expect(result.last4).toBe('4321');
    expect(result.cardType).toBe('MC');
  });

  it('ETX arrives alone in its own chunk, LRC in the next', async () => {
    const frame = makeResponseFrame('00', 'XAUTH1', '5555', 'DISC');
    const etxPos = frame.indexOf(ETX);
    const chunk1 = frame.slice(0, etxPos);          // everything before ETX
    const chunk2 = frame.slice(etxPos, etxPos + 1); // ETX alone
    const chunk3 = frame.slice(etxPos + 1);          // LRC alone

    const { port } = makeMockPort([chunk1, chunk2, chunk3]);
    const result = await sendTerminalCharge(port, { amountCents: 2500, orderRef: 'POS-003' });

    expect(result.approved).toBe(true);
    expect(result.authCode).toBe('XAUTH1');
    expect(result.last4).toBe('5555');
  });

  it('entire frame split into single-byte chunks', async () => {
    const frame = makeResponseFrame('00', 'ZZZ999', '0001', 'AMEX');
    const singleByteChunks = Array.from(frame, byte => new Uint8Array([byte]));

    const { port } = makeMockPort(singleByteChunks);
    const result = await sendTerminalCharge(port, { amountCents: 100, orderRef: 'POS-004' });

    expect(result.approved).toBe(true);
    expect(result.last4).toBe('0001');
    expect(result.cardType).toBe('AMEX');
  });

  it('decline — insufficient funds (code 51)', async () => {
    const frame = makeResponseFrame('51', '', '', '');
    const { port } = makeMockPort([frame]);

    const result = await sendTerminalCharge(port, { amountCents: 9999, orderRef: 'POS-005' });

    expect(result.approved).toBe(false);
    expect(result.reason).toMatch(/insufficient funds/i);
  });

  it('decline — unknown code is surfaced verbatim', async () => {
    const frame = makeResponseFrame('99', '', '', '');
    const { port } = makeMockPort([frame]);

    const result = await sendTerminalCharge(port, { amountCents: 100, orderRef: 'POS-006' });

    expect(result.approved).toBe(false);
    expect(result.reason).toContain('99');
  });

  // ── Port-closed guard ───────────────────────────────────────────────────────
  // Simulates a USB cable being pulled mid-session: the port object exists in
  // React state (hw.terminal.port is truthy) but Web Serial has set both
  // readable and writable to null because the physical connection dropped.
  // sendTerminalCharge must detect this immediately and return the exact reason
  // string that handleCreditPay uses to branch to the targeted toast.

  it('returns port-not-open reason when readable is null (port closed mid-session)', async () => {
    const closedPort = { readable: null, writable: {} };
    const result = await sendTerminalCharge(closedPort, { amountCents: 1000, orderRef: 'POS-CLOSED' });

    expect(result.approved).toBe(false);
    expect(result.reason).toBe('Terminal port is not open — call openTerminalPort() first');
  });

  it('returns port-not-open reason when writable is null (port closed mid-session)', async () => {
    const closedPort = { readable: {}, writable: null };
    const result = await sendTerminalCharge(closedPort, { amountCents: 500, orderRef: 'POS-CLOSED2' });

    expect(result.approved).toBe(false);
    expect(result.reason).toBe('Terminal port is not open — call openTerminalPort() first');
  });

  it('returns port-not-open reason when port itself is null', async () => {
    const result = await sendTerminalCharge(null, { amountCents: 100, orderRef: 'POS-NULL' });

    expect(result.approved).toBe(false);
    expect(result.reason).toBe('Terminal port is not open — call openTerminalPort() first');
  });

  it('write captures the correct request frame bytes', async () => {
    // Verify the request is formatted correctly: STX + CMD + SEP + amount(12) + SEP + ref + ETX + LRC
    const frame = makeResponseFrame('00', 'W1N123', '0007', 'VISA');
    const { port, written } = makeMockPort([frame]);

    await sendTerminalCharge(port, { amountCents: 1500, orderRef: 'TEST-REF' });

    const req = written()[0];
    expect(req[0]).toBe(STX);
    // ETX should be second-to-last; LRC is the last byte
    expect(req[req.length - 2]).toBe(ETX);
    // Amount starts at byte 3 (after STX, CMD, SEP): should be '000000001500'
    const amountBytes = req.slice(3, 15);
    expect(String.fromCharCode(...amountBytes)).toBe('000000001500');
  });
});
