// ─── Semi-Integrated Card Terminal (Dejavoo / Electronic Payments) ───────────
//
// Implements the Electronic Payments semi-integrated serial protocol.
// The frame format is based on the EP developer documentation for the Dejavoo
// Z-series terminals in serial semi-integration mode.
//
// !! IMPORTANT: Verify the exact frame layout and field lengths against the
// !! current Electronic Payments SDK/documentation before live deployment.
// !! The implementation below follows the spec provided in the task brief
// !! and common EP semi-integrated patterns, but field encodings and
// !! device-specific settings (baud rate, parity, stop bits) must be
// !! confirmed with the terminal configuration sheet from your EP rep.
//
// PROTOCOL OVERVIEW
// ─────────────────
// Request frame  : STX + Command(1) + SEP + Amount(12 digits, cents) + SEP + OrderRef + ETX + LRC
// Response frame : STX + ResponseCode(2) + SEP + AuthCode(6) + SEP + Last4(4) + SEP + CardType + ETX + LRC
//
// STX = 0x02, ETX = 0x03, SEP (field separator) = 0x1c, LRC = XOR of all bytes from STX to ETX inclusive
//
// ResponseCode "00" = approved; anything else = declined.
//
// USAGE
// ─────
// const result = await sendTerminalCharge(port, { amountCents: 1999, orderRef: 'POS-...' });
// if (result.approved) { /* record result.authCode, result.last4 */ }

export interface TerminalChargeParams {
  amountCents: number;   // integer cents, e.g. 1999 for $19.99
  orderRef:    string;   // POS order number (≤ 16 chars, EP may truncate)
}

export interface TerminalChargeResult {
  approved:  boolean;
  authCode?: string;   // 6-char authorisation code
  last4?:    string;   // last 4 digits of card
  cardType?: string;   // "VISA", "MC", "AMEX", etc.
  reason?:   string;   // decline reason or error description
}

const STX = 0x02;
const ETX = 0x03;
const SEP = 0x1c; // field separator
const CMD_SALE = 0x54; // 'T' — transaction/sale command

const CHARGE_TIMEOUT_MS = 60_000; // 60 seconds per spec

// ── LRC checksum ──────────────────────────────────────────────────────────────
// XOR of all bytes between (and including) STX and ETX
function computeLrc(frame: number[]): number {
  let lrc = 0;
  for (const byte of frame) lrc ^= byte;
  return lrc;
}

// ── Build request frame ───────────────────────────────────────────────────────
function buildRequestFrame(params: TerminalChargeParams): Uint8Array {
  const { amountCents, orderRef } = params;

  // Amount: 12 ASCII digits, zero-padded, no decimal point
  const amountStr = String(Math.round(amountCents)).padStart(12, '0').slice(0, 12);
  // Order ref: trimmed to 16 chars, replace commas/control chars
  const refStr = orderRef.replace(/[\x00-\x1f,]/g, '').slice(0, 16);

  const data = [
    CMD_SALE, SEP,
    ...Array.from(amountStr, c => c.charCodeAt(0)),
    SEP,
    ...Array.from(refStr, c => c.charCodeAt(0)),
  ];

  const frame = [STX, ...data, ETX];
  const lrc = computeLrc(frame);
  return new Uint8Array([...frame, lrc]);
}

// ── Parse response frame ──────────────────────────────────────────────────────
function parseResponseFrame(bytes: Uint8Array): TerminalChargeResult {
  // Find STX ... ETX bounds
  let stxIdx = -1, etxIdx = -1;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === STX && stxIdx === -1) stxIdx = i;
    if (bytes[i] === ETX && stxIdx !== -1) { etxIdx = i; break; }
  }

  if (stxIdx === -1 || etxIdx === -1) {
    return { approved: false, reason: 'Invalid response frame (missing STX/ETX)' };
  }

  // Verify LRC (byte immediately after ETX)
  if (etxIdx + 1 < bytes.length) {
    const framePart = bytes.slice(stxIdx, etxIdx + 1);
    const expected = computeLrc(Array.from(framePart));
    if (bytes[etxIdx + 1] !== expected) {
      console.warn('[Terminal] LRC mismatch — proceeding anyway (check protocol spec)');
    }
  }

  // Extract payload between STX and ETX
  const payload = Array.from(bytes.slice(stxIdx + 1, etxIdx));
  // Split on SEP
  const fields: string[] = [];
  let current: number[] = [];
  for (const byte of payload) {
    if (byte === SEP) {
      fields.push(current.map(b => String.fromCharCode(b)).join(''));
      current = [];
    } else {
      current.push(byte);
    }
  }
  if (current.length) fields.push(current.map(b => String.fromCharCode(b)).join(''));

  const responseCode = fields[0] ?? '';
  const authCode     = fields[1] ?? '';
  const last4        = fields[2] ?? '';
  const cardType     = fields[3] ?? '';

  const approved = responseCode === '00';

  if (approved) {
    return { approved: true, authCode, last4, cardType };
  } else {
    // Translate common EP decline codes
    const DECLINE_REASONS: Record<string, string> = {
      '01': 'Refer to card issuer',
      '05': 'Do not honour',
      '14': 'Invalid card number',
      '51': 'Insufficient funds',
      '54': 'Expired card',
      '61': 'Exceeds withdrawal amount limit',
      '65': 'Activity limit exceeded',
    };
    const reason = DECLINE_REASONS[responseCode] ?? `Declined (${responseCode || 'no code'})`;
    return { approved: false, reason };
  }
}

// ── Read bytes from readable stream with timeout ──────────────────────────────
async function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const timeLeft = deadline - Date.now();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Terminal response timeout')), timeLeft),
    );

    const { value, done } = await Promise.race([
      reader.read(),
      timeoutPromise,
    ]);

    if (done) break;
    if (value) {
      chunks.push(value);
      // Return only when we have the full frame: ETX *and* the LRC byte that follows it.
      // ETX and LRC can arrive in separate chunks; returning on ETX alone would leave the
      // LRC byte in the reader buffer, corrupting the next transaction's parse.
      const flat = new Uint8Array(chunks.reduce((a, b) => [...a, ...Array.from(b)], [] as number[]));
      const etxPos = flat.indexOf(ETX);
      if (etxPos !== -1 && flat.length > etxPos + 1) return flat;
    }
  }

  // Return whatever we have
  const total = chunks.reduce((acc, c) => acc + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { result.set(c, offset); offset += c.length; }
  return result;
}

// ── Main charge function ──────────────────────────────────────────────────────
export async function sendTerminalCharge(
  port: any, // SerialPort (Web Serial API)
  params: TerminalChargeParams,
): Promise<TerminalChargeResult> {
  try {
    // Write request — use try/finally so the lock is always released
    const writer: WritableStreamDefaultWriter<Uint8Array> = port.writable.getWriter();
    try {
      await writer.write(buildRequestFrame(params));
    } finally {
      writer.releaseLock();
    }

    // Read response with timeout — same pattern
    const reader: ReadableStreamDefaultReader<Uint8Array> = port.readable.getReader();
    let responseBytes: Uint8Array;
    try {
      responseBytes = await readWithTimeout(reader, CHARGE_TIMEOUT_MS);
    } finally {
      reader.releaseLock();
    }

    if (!responseBytes.length) {
      return { approved: false, reason: 'No response from terminal' };
    }

    return parseResponseFrame(responseBytes);
  } catch (err: any) {
    return {
      approved: false,
      reason: err?.message ?? 'Terminal communication error',
    };
  }
}

// ── Baud rate for Dejavoo terminals ──────────────────────────────────────────
// Default: 9600; many Dejavoo units can be configured to 115200.
// The EP rep will confirm the setting on the terminal's configuration sheet.
export const TERMINAL_BAUD_RATE = 9600;
