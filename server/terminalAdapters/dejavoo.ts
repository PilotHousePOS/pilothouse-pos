// ─── Dejavoo / Electronic Payments Adapter ───────────────────────────────────
//
// Dejavoo Z-series terminals sold by Electronic Payments (EP) use a binary
// serial protocol — the same STX/ETX/LRC frame format works whether the
// terminal is connected over:
//   • RS-232 serial  (Web Serial API — handled in client/src/lib/hardware/terminal.ts)
//   • TCP/IP         (this adapter — the server connects directly over LAN)
//
// The terminal's configuration sheet from your EP rep specifies the LAN IP and
// TCP port assigned during provisioning.  The default port varies by firmware;
// EP typically assigns 9100.
//
// COMPATIBLE HARDWARE
// ───────────────────
// • Dejavoo Z8, Z9, Z11, Z-Series — EP semi-integration firmware
// • Ingenico Telium / Tetra series configured for EP semi-integration
//   (same frame format; set terminalBrand = "dejavoo" with the correct port)
//
// FRAME FORMAT (spec §3–5 of EP Semi-Integration Serial Communication Spec)
// ─────────────────────────────────────────────────────────────────────────
// Request  : STX | TxnType(2) | SEP | Amount(12) | SEP | OrderRef(≤16) | ETX | LRC
// Response : STX | RespCode(2) | SEP | AuthCode | SEP | Last4 | SEP | CardType | ETX | LRC
// LRC      : XOR of bytes [STX+1 … ETX] inclusive (STX itself excluded)

import net from "net";
import {
  buildRequestFrame,
  parseResponseFrame,
} from "../../client/src/lib/hardware/terminal";
import type { TerminalAdapter, TerminalChargeRequest, TerminalChargeResult } from "./types";

const ETX = 0x03;
const NAK = 0x15;

const TCP_CONNECT_TIMEOUT_MS  =  5_000;  // 5 s — terminal must be reachable on LAN
const TCP_RESPONSE_TIMEOUT_MS = 65_000;  // 65 s — EP terminal timeout is 60 s

// ── Raw TCP send/receive ──────────────────────────────────────────────────────
export function sendFrameOverTcp(
  host: string,
  port: number,
  frame: Uint8Array,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let settled = false;

    const connectTimer = setTimeout(() => {
      if (!settled) {
        settled = true;
        socket.destroy();
        reject(new Error(`Terminal TCP connect timeout (${host}:${port})`));
      }
    }, TCP_CONNECT_TIMEOUT_MS);

    let responseTimer: ReturnType<typeof setTimeout> | null = null;

    const socket = net.createConnection({ host, port }, () => {
      clearTimeout(connectTimer);
      responseTimer = setTimeout(() => {
        if (!settled) {
          settled = true;
          socket.destroy();
          reject(new Error("Terminal TCP response timeout"));
        }
      }, TCP_RESPONSE_TIMEOUT_MS);
      socket.write(Buffer.from(frame));
    });

    socket.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      const flat = Buffer.concat(chunks);
      if (flat.length === 1 && flat[0] === NAK) {
        if (!settled) { settled = true; if (responseTimer) clearTimeout(responseTimer); socket.destroy(); resolve(new Uint8Array(flat)); }
        return;
      }
      const etxPos = flat.indexOf(ETX);
      if (etxPos !== -1 && flat.length > etxPos + 1) {
        if (!settled) { settled = true; if (responseTimer) clearTimeout(responseTimer); socket.destroy(); resolve(new Uint8Array(flat)); }
      }
    });

    socket.on("error", (err: Error) => {
      if (!settled) { settled = true; clearTimeout(connectTimer); if (responseTimer) clearTimeout(responseTimer); reject(err); }
    });

    socket.on("close", () => {
      if (!settled) {
        settled = true;
        clearTimeout(connectTimer);
        if (responseTimer) clearTimeout(responseTimer);
        const flat = Buffer.concat(chunks);
        if (flat.length > 0) resolve(new Uint8Array(flat));
        else reject(new Error("Terminal closed connection without sending a response"));
      }
    });
  });
}

// ── Adapter factory ───────────────────────────────────────────────────────────
export function createDejavooAdapter(
  terminalIp: string,
  terminalPort: number,
): TerminalAdapter {
  return {
    async charge(req: TerminalChargeRequest): Promise<TerminalChargeResult> {
      const frame = buildRequestFrame({
        amountCents: req.amountCents,
        orderRef:    req.orderRef,
      });

      let responseBytes: Uint8Array;
      try {
        responseBytes = await sendFrameOverTcp(terminalIp, terminalPort, frame);
      } catch (err: any) {
        return { approved: false, reason: err?.message ?? "Dejavoo TCP connection failed" };
      }

      if (!responseBytes.length) {
        return { approved: false, reason: "No response from Dejavoo terminal" };
      }

      const result = parseResponseFrame(responseBytes);
      return result;
    },
  };
}
