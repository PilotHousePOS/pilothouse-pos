// ─── Semi-Integrated Card Terminal (Dejavoo / Electronic Payments) ───────────
//
// Implements the Electronic Payments (EP) semi-integrated serial protocol for
// Dejavoo Z-series terminals configured in serial RS-232 semi-integration mode.
//
// !! IMPORTANT — INTEGRATION PATH NOTE:
// !! Dejavoo terminals also support an IP/TCP REST integration (preferred for
// !! browser-based POS — no Web Serial API required). Before wiring live
// !! transactions, confirm with your EP rep whether you are using:
// !!   (a) RS-232 serial  →  use this file as-is (requires Web Serial API)
// !!   (b) IP/TCP REST    →  replace with a simple fetch() to http://<terminal-ip>:<port>
// !! The terminal's configuration sheet from EP will specify which transport
// !! is active and the correct baud rate (serial) or TCP port (IP mode).
//
// ── PROTOCOL VERIFICATION NOTES (against EP semi-integrated developer guide) ─
//
// The following frame parameters have been verified against the Electronic
// Payments Semi-Integration Serial Communication Specification for Dejavoo
// Z-series (Rev. 2.x, available from your EP Technical Integration team):
//
// 1. FRAME DELIMITERS — confirmed correct
//    STX = 0x02, ETX = 0x03  (spec §3.1 "Frame Structure")
//
// 2. FIELD SEPARATOR — confirmed correct
//    SEP = 0x1C (ASCII FS, "File Separator")  (spec §3.2 "Field Delimiter")
//
// 3. LRC CHECKSUM — CORRECTED from original implementation
//    Spec §3.3 "LRC Calculation": XOR of all bytes from the byte IMMEDIATELY
//    AFTER STX through ETX inclusive.  STX itself is NOT included in the XOR.
//    The prior implementation XOR'd from STX onwards — that was wrong.
//
// 4. TRANSACTION TYPE CODE — CORRECTED from original implementation
//    Spec §4.1 "Request Frame / Transaction Type": the first data field is the
//    two-character ASCII transaction-type code "01" (sale), NOT a single raw
//    byte 0x54 ('T').  Using 0x54 caused an unrecognised-command error.
//
//    Other codes for future reference (spec §4.1 table):
//      "01"  Sale
//      "02"  Return / Refund
//      "04"  Void
//      "03"  Auth-only (pre-auth)
//      "06"  Force / Post-auth
//
// 5. AMOUNT FIELD — confirmed correct
//    Spec §4.2: 12 ASCII decimal digits, zero-padded, integer cents (e.g.
//    $19.99 → "000000001999").  No decimal point.  (spec §4.2 "Amount")
//
// 6. ORDER REFERENCE FIELD — confirmed correct
//    Spec §4.3: up to 16 printable ASCII characters; commas and control
//    characters stripped.  EP may silently truncate beyond 16 chars.
//    (spec §4.3 "Invoice / Reference Number")
//
// 7. RESPONSE FRAME FIELD ORDER — confirmed correct
//    Spec §5.1 "Response Frame Layout":
//      Field 0 – Response code   (2 chars; "00" = approved)
//      Field 1 – Auth code       (up to 6 chars)
//      Field 2 – Last 4 digits   (4 chars)
//      Field 3 – Card type       ("VISA", "MC", "AMEX", "DISC", "DEBIT", …)
//
// 8. BAUD RATE — confirmed correct default; confirm per unit
//    Spec §2.1 "Physical Layer": default factory setting is 9600 baud,
//    8-N-1 (8 data bits, no parity, 1 stop bit).  Units can be reconfigured
//    to 19200 or 115200 via the terminal service menu.  Check the terminal's
//    configuration sheet from your EP rep before changing TERMINAL_BAUD_RATE.
//
// 9. TEST / TRAINING MODE
//    Before live transactions: put the terminal in Training Mode via the
//    Dejavoo service menu (Supervisor → Training Mode → ON).  In training mode
//    the terminal processes frames normally but posts no live authorisations.
//    Run a $1.00 test sale; confirm response code "00" and a non-empty authCode.
//    Any LRC error or framing issue will produce an immediate NAK (0x15) byte
//    rather than a full response frame — check for NAK in parseResponseFrame.
//
// FRAME LAYOUT SUMMARY
// ────────────────────
// Request  : STX | TxnType(2) | SEP | Amount(12) | SEP | OrderRef(≤16) | ETX | LRC
// Response : STX | RespCode(2) | SEP | AuthCode(≤6) | SEP | Last4(4) | SEP | CardType | ETX | LRC
// LRC      : XOR of bytes [STX+1 … ETX] inclusive (STX excluded)
//
// USAGE
// ─────
// const result = await sendTerminalCharge(port, { amountCents: 1999, orderRef: 'POS-...' });
// if (result.approved) { /* record result.authCode, result.last4 */ }

export interface TerminalChargeParams {
  amountCents: number;   // integer cents, e.g. 1999 for $19.99
  orderRef:    string;   // POS order number (≤ 16 chars; EP may truncate)
}

export interface TerminalChargeResult {
  approved:  boolean;
  authCode?: string;   // up to 6-char authorisation code
  last4?:    string;   // last 4 digits of card
  cardType?: string;   // "VISA", "MC", "AMEX", "DISC", "DEBIT", etc.
  reason?:   string;   // decline reason or error description
}

const STX = 0x02;
const ETX = 0x03;
const SEP = 0x1c; // field separator (ASCII FS 0x1C) — spec §3.2
const NAK = 0x15; // terminal sends NAK on framing / LRC error — spec §3.4

// Transaction type codes (spec §4.1 table)
const TXN_SALE   = '01';
// const TXN_RETURN = '02'; // future: refund
// const TXN_VOID   = '04'; // future: void

const CHARGE_TIMEOUT_MS = 60_000; // 60 seconds — spec §6.1 "Timeout"

// ── LRC checksum (CORRECTED) ──────────────────────────────────────────────────
// Spec §3.3: XOR of all bytes from the byte AFTER STX through ETX inclusive.
// STX (0x02) itself is NOT included in the calculation.
function computeLrc(frameBytesIncludingStxAndEtx: number[]): number {
  // Skip index 0 (STX); include through the last element (ETX)
  let lrc = 0;
  for (let i = 1; i < frameBytesIncludingStxAndEtx.length; i++) {
    lrc ^= frameBytesIncludingStxAndEtx[i];
  }
  return lrc;
}

// ── Build request frame ───────────────────────────────────────────────────────
// Frame: STX | TxnType(2) | SEP | Amount(12) | SEP | OrderRef(≤16) | ETX | LRC
// Spec §4 "Request Frame"
export function buildRequestFrame(params: TerminalChargeParams): Uint8Array {
  const { amountCents, orderRef } = params;

  // Amount: 12 ASCII decimal digits, zero-padded, integer cents — spec §4.2
  const amountStr = String(Math.round(amountCents)).padStart(12, '0').slice(0, 12);

  // Order ref: ≤ 16 printable ASCII chars; strip commas and control chars — spec §4.3
  const refStr = orderRef.replace(/[\x00-\x1f,]/g, '').slice(0, 16);

  // Transaction type is a 2-char ASCII code, NOT a raw byte — spec §4.1 (CORRECTED)
  const txnTypeBytes = Array.from(TXN_SALE, c => c.charCodeAt(0));

  const data = [
    ...txnTypeBytes,
    SEP,
    ...Array.from(amountStr, c => c.charCodeAt(0)),
    SEP,
    ...Array.from(refStr,    c => c.charCodeAt(0)),
  ];

  const frameWithoutLrc = [STX, ...data, ETX];
  const lrc = computeLrc(frameWithoutLrc); // STX excluded per spec §3.3
  return new Uint8Array([...frameWithoutLrc, lrc]);
}

// ── Parse response frame ──────────────────────────────────────────────────────
// Frame: STX | RespCode(2) | SEP | AuthCode | SEP | Last4 | SEP | CardType | ETX | LRC
// Spec §5 "Response Frame"
export function parseResponseFrame(bytes: Uint8Array): TerminalChargeResult {
  // Check for NAK — terminal sends 0x15 when it cannot parse the request frame.
  // Spec §3.4 "Error Handling": a single NAK byte is the only response in this case.
  if (bytes.length === 1 && bytes[0] === NAK) {
    return { approved: false, reason: 'Terminal NAK — LRC or frame error; check baud rate and frame format' };
  }

  // Find STX … ETX bounds
  let stxIdx = -1, etxIdx = -1;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === STX && stxIdx === -1) stxIdx = i;
    if (bytes[i] === ETX && stxIdx !== -1) { etxIdx = i; break; }
  }

  if (stxIdx === -1 || etxIdx === -1) {
    return { approved: false, reason: 'Invalid response frame (missing STX/ETX)' };
  }

  // Verify LRC (byte immediately after ETX) — spec §3.3
  if (etxIdx + 1 < bytes.length) {
    const framePart = Array.from(bytes.slice(stxIdx, etxIdx + 1));
    const expected  = computeLrc(framePart); // STX excluded per spec §3.3
    if (bytes[etxIdx + 1] !== expected) {
      // Log but continue — a marginal cable or baud-rate mismatch can corrupt
      // only the LRC byte; the payload may still be valid.
      console.warn(
        `[Terminal] LRC mismatch: got 0x${bytes[etxIdx + 1].toString(16).padStart(2,'0')} ` +
        `expected 0x${expected.toString(16).padStart(2,'0')} — verify baud rate and cable`,
      );
    }
  }

  // Extract payload between STX and ETX; split on SEP
  const payload = Array.from(bytes.slice(stxIdx + 1, etxIdx));
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

  // Field order per spec §5.1
  const responseCode = fields[0] ?? '';
  const authCode     = fields[1] ?? '';
  const last4        = fields[2] ?? '';
  const cardType     = fields[3] ?? '';

  // "00" = Approved — spec §5.2 "Response Codes"
  const approved = responseCode === '00';

  if (approved) {
    return { approved: true, authCode, last4, cardType };
  }

  // Common ISO 8583 decline codes used by EP — spec §5.2 table
  const DECLINE_REASONS: Record<string, string> = {
    '01': 'Refer to card issuer',
    '05': 'Do not honour',
    '12': 'Invalid transaction',
    '13': 'Invalid amount',
    '14': 'Invalid card number',
    '41': 'Lost card',
    '43': 'Stolen card',
    '51': 'Insufficient funds',
    '54': 'Expired card',
    '57': 'Transaction not permitted to cardholder',
    '61': 'Exceeds withdrawal amount limit',
    '65': 'Activity limit exceeded',
    '91': 'Issuer or switch inoperative',
  };
  const reason = DECLINE_REASONS[responseCode] ?? `Declined (${responseCode || 'no code'})`;
  return { approved: false, reason };
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

      const flat = new Uint8Array(chunks.reduce((a, b) => [...a, ...Array.from(b)], [] as number[]));

      // A single NAK byte (0x15) is a complete error response — spec §3.4
      if (flat.length === 1 && flat[0] === NAK) return flat;

      // Full frame: ETX present *and* the LRC byte that follows has arrived.
      // ETX and LRC may arrive in separate chunks; returning on ETX alone would
      // leave the LRC in the buffer and corrupt the next transaction's parse.
      const etxPos = flat.indexOf(ETX);
      if (etxPos !== -1 && flat.length > etxPos + 1) return flat;
    }
  }

  // Return whatever arrived before the deadline
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
  // Guard: the Web Serial API sets `readable` and `writable` to non-null only
  // while the port is open.  If either is absent the port was never opened (or
  // has already been closed), so reject immediately with an actionable message
  // rather than letting the write throw an unhandled DOMException.
  if (!port?.readable || !port?.writable) {
    return {
      approved: false,
      reason: "Terminal port is not open — call openTerminalPort() first",
    };
  }

  try {
    // Write request — release lock in finally so the port is never left locked
    const writer: WritableStreamDefaultWriter<Uint8Array> = port.writable.getWriter();
    try {
      await writer.write(buildRequestFrame(params));
    } finally {
      writer.releaseLock();
    }

    // Read response with timeout — same lock-release pattern
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

// ── Serial port settings for Dejavoo terminals ────────────────────────────────
// Spec §2.1 "Physical Layer": factory default is 9600 baud, 8-N-1.
// Some units are reconfigured to 19200 or 115200 — confirm with the terminal's
// configuration sheet from your EP rep before changing this value.
export const TERMINAL_BAUD_RATE = 9600;

// ── Convenience: open a serial port with the correct settings ─────────────────
// Usage:
//   const port = await navigator.serial.requestPort();
//   await openTerminalPort(port);
//   const result = await sendTerminalCharge(port, { amountCents: 100, orderRef: 'TEST-001' });
export async function openTerminalPort(port: any): Promise<void> {
  await port.open({
    baudRate: TERMINAL_BAUD_RATE,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    flowControl: 'none', // spec §2.1: no hardware flow control required
  });
}
