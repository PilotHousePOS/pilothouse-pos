// ─── Terminal Adapter — Shared Types ─────────────────────────────────────────
//
// All terminal adapters implement the same TerminalAdapter interface so the
// /api/terminal/charge route can dispatch to any brand without knowing its
// transport details.

export type TerminalBrand =
  | "dejavoo"        // Dejavoo Z-series via Electronic Payments — TCP binary frame
  | "pax"            // PAX S/A/Q/E series — HTTP binary frame on LAN (port 10009)
  | "stripe"         // Stripe Terminal — server-driven via Stripe API, any network
  | "ingenico"       // Ingenico/Tetra — TCP binary, same frame as dejavoo; set brand to "dejavoo" with correct port
  | "verifone";      // Verifone — TCP; vendor-specific frame; see verifone.ts when implemented

export interface TerminalChargeRequest {
  amountCents: number;   // Integer cents, e.g. 1999 for $19.99
  orderRef:    string;   // POS order reference, ≤ 16 chars (truncated by most terminals)
  tipCents?:   number;   // Optional tip amount in cents (PAX supports on-device tip prompt)
}

export interface TerminalChargeResult {
  approved:  boolean;
  authCode?: string;   // Up to 6-char authorisation code from issuer
  last4?:    string;   // Last 4 digits of card
  cardType?: string;   // "VISA" | "MC" | "AMEX" | "DISC" | "DEBIT" | etc.
  reason?:   string;   // Decline reason or error description (always set when !approved)
  /** Raw terminal response code — useful for receipts and logs */
  responseCode?: string;
  /** Payment processor transaction ID (Stripe PaymentIntent ID, PAX TransID, etc.) */
  transactionId?: string;
}

/** Per-brand config stored in tenant.enabledFeatures.hardwareConfig */
export interface TerminalHardwareConfig {
  terminalBrand?:          TerminalBrand;  // default: "dejavoo"
  // ── Dejavoo / PAX / any LAN terminal ──
  terminalIp?:             string;         // LAN IP of the terminal
  terminalPort?:           number;         // TCP port (dejavoo: varies; PAX: 9100 default)
  // ── PAX-specific ──
  paxMerchantId?:          string;         // MerchID field in PAX frames
  paxOperatorId?:          string;         // OperID field (default "01")
  paxTerminalNumber?:      string;         // TPN assigned by your processor
  // ── Stripe Terminal ──
  stripeTerminalReaderId?: string;         // Stripe reader ID, e.g. "tmr_..."
}

export interface TerminalAdapter {
  /**
   * Execute a charge.  Resolves with a TerminalChargeResult — never rejects.
   * Any transport errors are returned as { approved: false, reason: "…" }.
   */
  charge(req: TerminalChargeRequest): Promise<TerminalChargeResult>;
}
