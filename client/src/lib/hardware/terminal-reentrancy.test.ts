// ─── Terminal Re-entrancy / Duplicate-charge Regression Tests ─────────────────
//
// Verifies that `sendTerminalCharge` is a pure async function: if the caller
// accidentally invokes it twice concurrently the second call must complete
// independently (no shared mutable state, no frame cross-contamination).
//
// The POS component's `terminalProcessing` flag is the actual UI-level guard
// that prevents concurrent invocations.  These tests confirm the underlying
// transport layer does not accumulate state across calls.

import { describe, it, expect, vi } from 'vitest';
import { sendTerminalCharge } from './terminal';

const STX = 0x02;
const ETX = 0x03;
const SEP = 0x1c;

function encodeStr(s: string): number[] {
  return Array.from(s, c => c.charCodeAt(0));
}

function makeResponseFrame(code: string, auth = '', last4 = '', cardType = ''): Uint8Array {
  const data = [
    ...encodeStr(code), SEP,
    ...encodeStr(auth),    SEP,
    ...encodeStr(last4),   SEP,
    ...encodeStr(cardType),
  ];
  const frame = [STX, ...data, ETX];
  let lrc = 0;
  for (const b of frame) lrc ^= b;
  return new Uint8Array([...frame, lrc]);
}

/** Make a mock port that drains a queue of frames, one per `sendTerminalCharge` call. */
function makeSequentialMockPort(frames: Uint8Array[]): {
  port: { readable: unknown; writable: unknown };
  writeCount: () => number;
} {
  let writeCount = 0;
  let frameIdx = 0;

  return {
    writeCount: () => writeCount,
    port: {
      writable: {
        getWriter: () => ({
          write: async () => { writeCount++; },
          releaseLock: vi.fn(),
        }),
      },
      readable: {
        getReader: () => {
          // Each getReader() call is for one sendTerminalCharge invocation.
          // It returns the *next* frame from the queue.
          const myFrame = frames[frameIdx++] ?? new Uint8Array();
          let sent = false;
          return {
            read: async (): Promise<{ value?: Uint8Array; done: boolean }> => {
              if (!sent) { sent = true; return { value: myFrame, done: false }; }
              return { done: true };
            },
            releaseLock: vi.fn(),
          };
        },
      },
    },
  };
}

describe('sendTerminalCharge — re-entrancy / duplicate-charge protection', () => {

  it('two sequential calls each return their own correct result', async () => {
    const frame1 = makeResponseFrame('00', 'AUTH01', '1111', 'VISA');
    const frame2 = makeResponseFrame('00', 'AUTH02', '2222', 'MC');
    const { port } = makeSequentialMockPort([frame1, frame2]);

    const result1 = await sendTerminalCharge(port, { amountCents: 100, orderRef: 'SEQ-001' });
    const result2 = await sendTerminalCharge(port, { amountCents: 200, orderRef: 'SEQ-002' });

    expect(result1.approved).toBe(true);
    expect(result1.last4).toBe('1111');
    expect(result2.approved).toBe(true);
    expect(result2.last4).toBe('2222');
  });

  it('each call writes exactly one request frame to the port', async () => {
    const frame1 = makeResponseFrame('00', 'AUTH03', '3333', 'AMEX');
    const frame2 = makeResponseFrame('51', '', '', '');
    const { port, writeCount } = makeSequentialMockPort([frame1, frame2]);

    await sendTerminalCharge(port, { amountCents: 300, orderRef: 'SEQ-003' });
    expect(writeCount()).toBe(1);

    await sendTerminalCharge(port, { amountCents: 400, orderRef: 'SEQ-004' });
    expect(writeCount()).toBe(2);
  });

  it('a declined second call does not corrupt a prior approved result', async () => {
    const approvedFrame = makeResponseFrame('00', 'AUTH04', '4444', 'DISC');
    const declinedFrame = makeResponseFrame('05', '', '', '');
    const { port } = makeSequentialMockPort([approvedFrame, declinedFrame]);

    const approved = await sendTerminalCharge(port, { amountCents: 500, orderRef: 'SEQ-005' });
    const declined = await sendTerminalCharge(port, { amountCents: 600, orderRef: 'SEQ-006' });

    expect(approved.approved).toBe(true);
    expect(approved.authCode).toBe('AUTH04');
    expect(declined.approved).toBe(false);
    expect(declined.reason).toMatch(/do not honour/i);
  });

  it('two concurrent calls both resolve without throwing (no shared-state crash)', async () => {
    // Both calls get their own reader via separate getReader() calls — no contention.
    const frame1 = makeResponseFrame('00', 'C1AUTH', '7777', 'VISA');
    const frame2 = makeResponseFrame('00', 'C2AUTH', '8888', 'MC');
    const { port } = makeSequentialMockPort([frame1, frame2]);

    // Fire both concurrently — we are testing that the function itself does not
    // throw or crash due to shared mutable state.
    const [r1, r2] = await Promise.all([
      sendTerminalCharge(port, { amountCents: 1000, orderRef: 'CONC-001' }),
      sendTerminalCharge(port, { amountCents: 2000, orderRef: 'CONC-002' }),
    ]);

    // Both should resolve (approved or declined); neither should throw.
    expect(typeof r1.approved).toBe('boolean');
    expect(typeof r2.approved).toBe('boolean');
  });
});
