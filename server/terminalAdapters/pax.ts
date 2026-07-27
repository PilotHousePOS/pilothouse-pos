// ─── PAX Terminal Adapter ─────────────────────────────────────────────────────
//
// PAX S/A/Q/E-series terminals (PAX Technology) support a local HTTP binary
// integration.  The terminal runs an embedded HTTP server on port 9100 (default;
// configurable).  The POS POSTs a binary frame to that endpoint and reads the
// binary response body.
//
// This covers PAX terminals provisioned by virtually any payment processor:
//   Heartland, TSYS, First Data/Fiserv, Worldpay, Clearent, Priority, etc.
// Confirm the TCP port on the terminal's configuration sheet from your processor.
//
// COMPATIBLE HARDWARE
// ───────────────────
// • PAX S300, S500, S800, S920 (traditional countertop)
// • PAX A920, A920Pro, A80, A35, A77 (Android smart terminals)
// • PAX Q25, Q30 (mobile)
// • PAX E500, E600 (self-service kiosk)
//
// TRANSPORT
// ─────────
// POST http://<terminalIp>:<terminalPort>/
// Content-Type: application/octet-stream
// Body: binary frame (same STX/ETX/LRC framing as EP/Dejavoo)
//
// FRAME FORMAT (PAX Developer Integration Guide, "HTTP Integration" section)
// ──────────────────────────────────────────────────────────────────────────
// Fields are separated by 0x1C (ASCII FS — same as EP spec).
//
// Request fields (in order):
//   CommandType  — "T00" (sale) | "T02" (refund) | "T03" (void)
//   Version      — "1.28" (current integration version)
//   TransType    — "01" credit | "02" debit | "03" EBT food | "04" EBT cash
//   Amount       — cents as decimal string, e.g. "1999" for $19.99
//   TipAmt       — tip in cents (empty string = no tip)
//   CashBack     — cash-back amount in cents (empty = none)
//   MerchID      — merchant ID from your processor (from paxMerchantId config)
//   OperID       — operator/cashier ID (from paxOperatorId config, default "01")
//   TPN          — terminal provisioning number from your processor
//   Timestamp    — "MMDDYYYYHHmmss" local time
//   ECRRefNum    — POS order reference (up to 16 chars)
//
// Response fields (in order):
//   CommandType  — echoed back
//   Version      — echoed back
//   ResultCode   — "000000" approved | other = declined/error
//   ResultTxt    — human-readable result text
//   Amount       — approved amount in cents
//   TransactionID — processor transaction ID
//   AuthCode     — authorisation code (up to 6 chars)
//   Last4        — last 4 digits of card
//   CardType     — "VISA" | "MC" | "AMEX" | "DISC" | "DEBIT" | "EBT" | etc.
//   ExpDate      — card expiry (MMYY) — do NOT store per PCI DSS
//   EMVAid       — EMV application identifier
//   EMVAppName   — EMV application label
//   TraceNum     — processor trace number
//
// ABOUT RESULTCODE
// ────────────────
// PAX ResultCode is a 6-digit string: "000000" = approved.
// The first 2 digits map to ISO 8583 response codes used by most processors.
// A non-zero value is a decline or error.
//
// ON-DEVICE TIP
// ─────────────
// To enable on-device tip selection, leave TipAmt empty ("") and set the
// TipType in ExtData — but this requires your processor to have tip-on-terminal
// enabled.  For simplicity this adapter sets TipAmt from tipCents if provided,
// or leaves it blank (the terminal uses its own prompting rules).

import type { TerminalAdapter, TerminalChargeRequest, TerminalChargeResult, TerminalHardwareConfig } from "./types";

const STX = 0x02;
const ETX = 0x03;
const SEP = 0x1c; // ASCII FS — same as EP/Dejavoo

const PAX_CMD_SALE   = "T00";
// const PAX_CMD_REFUND = "T02"; // future
// const PAX_CMD_VOID   = "T03"; // future
const PAX_VERSION    = "1.28";
const PAX_TRANS_CREDIT = "01";

const PAX_TIMEOUT_MS = 90_000; // PAX terminals have a 90-second customer timeout

// ISO 8583 decline codes (first 2 digits of PAX ResultCode)
const PAX_DECLINE_REASONS: Record<string, string> = {
  "01": "Refer to card issuer",
  "05": "Do not honour",
  "12": "Invalid transaction",
  "13": "Invalid amount",
  "14": "Invalid card number",
  "41": "Lost card",
  "43": "Stolen card",
  "51": "Insufficient funds",
  "54": "Expired card",
  "57": "Transaction not permitted to cardholder",
  "61": "Exceeds withdrawal amount limit",
  "65": "Activity limit exceeded",
  "91": "Issuer or switch inoperative",
};

// ── LRC checksum — identical to EP spec: XOR bytes [STX+1 … ETX] ─────────────
function computeLrc(bytes: number[]): number {
  let lrc = 0;
  for (let i = 1; i < bytes.length; i++) lrc ^= bytes[i];
  return lrc;
}

// ── Build PAX request frame ───────────────────────────────────────────────────
function buildPaxFrame(
  req: TerminalChargeRequest,
  config: Pick<TerminalHardwareConfig, "paxMerchantId" | "paxOperatorId" | "paxTerminalNumber">,
  timestamp: string,
): Uint8Array {
  const fields: string[] = [
    PAX_CMD_SALE,
    PAX_VERSION,
    PAX_TRANS_CREDIT,
    String(Math.round(req.amountCents)),
    req.tipCents != null ? String(Math.round(req.tipCents)) : "",  // TipAmt
    "",                                                              // CashBack
    config.paxMerchantId   ?? "",
    config.paxOperatorId   ?? "01",
    config.paxTerminalNumber ?? "",
    timestamp,
    req.orderRef.replace(/[\x00-\x1f,]/g, "").slice(0, 16),
  ];

  const data: number[] = [];
  for (let i = 0; i < fields.length; i++) {
    for (const ch of fields[i]) data.push(ch.charCodeAt(0));
    if (i < fields.length - 1) data.push(SEP);
  }

  const frameWithoutLrc = [STX, ...data, ETX];
  const lrc = computeLrc(frameWithoutLrc);
  return new Uint8Array([...frameWithoutLrc, lrc]);
}

// ── Parse PAX response frame ──────────────────────────────────────────────────
function parsePaxResponse(bytes: Uint8Array): TerminalChargeResult {
  if (!bytes.length) return { approved: false, reason: "No response from PAX terminal" };

  let stxIdx = -1, etxIdx = -1;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === STX && stxIdx === -1) stxIdx = i;
    if (bytes[i] === ETX && stxIdx !== -1) { etxIdx = i; break; }
  }
  if (stxIdx === -1 || etxIdx === -1) {
    return { approved: false, reason: "Invalid PAX response frame (missing STX/ETX)" };
  }

  // Extract and split fields on SEP
  const payload = Array.from(bytes.slice(stxIdx + 1, etxIdx));
  const fields: string[] = [];
  let cur: number[] = [];
  for (const b of payload) {
    if (b === SEP) { fields.push(cur.map(x => String.fromCharCode(x)).join("")); cur = []; }
    else cur.push(b);
  }
  if (cur.length) fields.push(cur.map(x => String.fromCharCode(x)).join(""));

  // PAX response field order (see spec above)
  // [0] CommandType  [1] Version  [2] ResultCode  [3] ResultTxt
  // [4] Amount       [5] TransactionID             [6] AuthCode
  // [7] Last4        [8] CardType  [9] ExpDate  [10] EMVAid  ...
  const resultCode    = fields[2] ?? "";
  const resultTxt     = fields[3] ?? "";
  const transactionId = fields[5] ?? "";
  const authCode      = fields[6] ?? "";
  const last4         = fields[7] ?? "";
  const cardType      = fields[8] ?? "";

  const approved = resultCode === "000000";

  if (approved) {
    return { approved: true, authCode, last4, cardType, transactionId, responseCode: resultCode };
  }

  // Map first 2 digits of ResultCode to ISO reason
  const isoCode = resultCode.slice(0, 2);
  const reason  = resultTxt ||
                  PAX_DECLINE_REASONS[isoCode] ||
                  `Declined (${resultCode || "no code"})`;

  return { approved: false, reason, responseCode: resultCode, transactionId: transactionId || undefined };
}

// ── Adapter factory ───────────────────────────────────────────────────────────
export function createPaxAdapter(
  terminalIp: string,
  terminalPort: number,
  config: Pick<TerminalHardwareConfig, "paxMerchantId" | "paxOperatorId" | "paxTerminalNumber">,
): TerminalAdapter {
  return {
    async charge(req: TerminalChargeRequest): Promise<TerminalChargeResult> {
      // Timestamp in PAX format: MMDDYYYYHHmmss
      const now = new Date();
      const pad = (n: number, l = 2) => String(n).padStart(l, "0");
      const timestamp =
        pad(now.getMonth() + 1) +
        pad(now.getDate()) +
        pad(now.getFullYear(), 4) +
        pad(now.getHours()) +
        pad(now.getMinutes()) +
        pad(now.getSeconds());

      const frame = buildPaxFrame(req, config, timestamp);

      // PAX transport: HTTP POST with raw binary frame body
      const url = `http://${terminalIp}:${terminalPort}/`;

      let responseBytes: Uint8Array;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), PAX_TIMEOUT_MS);

        const resp = await fetch(url, {
          method:  "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body:    frame,
          signal:  controller.signal,
        });
        clearTimeout(timer);

        const buf = await resp.arrayBuffer();
        responseBytes = new Uint8Array(buf);
      } catch (err: any) {
        const msg = err?.name === "AbortError"
          ? `PAX terminal response timeout (${terminalIp}:${terminalPort})`
          : (err?.message ?? "PAX HTTP connection failed");
        return { approved: false, reason: msg };
      }

      return parsePaxResponse(responseBytes);
    },
  };
}
