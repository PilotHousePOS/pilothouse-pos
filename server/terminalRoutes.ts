// ─── Card Terminal Routes ─────────────────────────────────────────────────────
//
// POST /api/terminal/charge  — run a charge on any supported terminal brand
// GET  /api/terminal/config  — read the tenant's terminal configuration
// PUT  /api/terminal/config  — save terminal configuration (admin only)
// POST /api/terminal/cancel  — cancel an in-progress Stripe Terminal payment
//
// ── Supported brands ─────────────────────────────────────────────────────────
//
//   "dejavoo"  Dejavoo Z-series (Electronic Payments semi-integration)
//              TCP binary frame, LAN-connected, port configurable (default 9100)
//
//   "ingenico" Ingenico / Tetra terminals configured for EP semi-integration
//              Same binary frame as Dejavoo; set brand="ingenico" with correct port
//
//   "pax"      PAX S/A/Q/E series (Heartland, TSYS, First Data, Worldpay, etc.)
//              HTTP binary frame on LAN, port 9100 by default
//              Requires paxMerchantId, paxOperatorId, paxTerminalNumber from processor
//
//   "stripe"   Stripe Terminal (BBPOS WisePOS E, Stripe Reader M2, Verifone P400, …)
//              Cloud-routed server-driven API — no LAN access required
//              Requires stripeTerminalReaderId from Stripe Dashboard
//
// ── Transport overview ────────────────────────────────────────────────────────
//
// The browser calls POST /api/terminal/charge.  The server resolves the correct
// adapter from the tenant's hardwareConfig and any per-request overrides, then
// executes the charge.  The response is always a TerminalChargeResult JSON object.
//
// The Web Serial path (direct browser-to-terminal RS-232) is kept as a fallback
// in client/src/lib/hardware/terminal.ts for environments where the app server
// cannot reach the terminal over IP.
//
// ── SSRF guard ────────────────────────────────────────────────────────────────
//
// Terminal IPs must be RFC-1918 private or loopback to prevent SSRF.
// Stripe Terminal bypasses this check (it routes through Stripe's cloud, not a
// local IP).

import type { Express } from "express";
import type { TerminalHardwareConfig, TerminalBrand } from "./terminalAdapters/types";
import { resolveAdapter } from "./terminalAdapters/index";
import { authMiddleware } from "./auth";
import { storage } from "./storage";

// ── SSRF guard — only allow RFC-1918 private / loopback addresses ─────────────
function isPrivateOrLoopback(ip: string): boolean {
  if (ip === "127.0.0.1" || ip === "localhost") return true;
  if (/^10\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  return false;
}

// ── Register all terminal routes ──────────────────────────────────────────────
export function registerTerminalRoutes(app: Express): void {

  // ── POST /api/terminal/charge ─────────────────────────────────────────────
  /**
   * Execute a card charge on the configured terminal.
   *
   * Body (JSON):
   *   amountCents      {number}         — integer cents, e.g. 1999 for $19.99
   *   orderRef         {string}         — POS order reference (≤ 16 chars)
   *   tipCents         {number?}        — optional tip in cents (PAX on-device tip)
   *   terminalBrand    {TerminalBrand?} — override brand; falls back to tenant config
   *   terminalIp       {string?}        — override terminal IP
   *   terminalPort     {number?}        — override TCP/HTTP port
   *   stripeReaderId   {string?}        — override Stripe reader ID (Stripe brand only)
   *
   * Response: TerminalChargeResult
   *   { approved, authCode?, last4?, cardType?, reason?, responseCode?, transactionId? }
   */
  app.post("/api/terminal/charge", authMiddleware, async (req: any, res) => {
    try {
      const tenantId: number | undefined = req.tenantId;
      if (!tenantId) {
        return res.status(400).json({ approved: false, reason: "No tenant context" });
      }

      // ── Validate charge params ──────────────────────────────────────────
      const amountCents = Number(req.body.amountCents);
      const orderRef    = String(req.body.orderRef ?? "").trim();
      const tipCents    = req.body.tipCents != null ? Number(req.body.tipCents) : undefined;

      if (!Number.isInteger(amountCents) || amountCents <= 0) {
        return res.status(400).json({ approved: false, reason: "amountCents must be a positive integer" });
      }
      if (!orderRef) {
        return res.status(400).json({ approved: false, reason: "orderRef is required" });
      }

      // ── Load tenant hardware config ─────────────────────────────────────
      const tenant   = await storage.getTenant(tenantId);
      const features = (tenant?.enabledFeatures || {}) as any;
      const hw: TerminalHardwareConfig = features.hardwareConfig || {};

      // ── Build overrides from request body ───────────────────────────────
      const overrideIp     = req.body.terminalIp   as string | undefined;
      const overridePort   = req.body.terminalPort  ? Number(req.body.terminalPort) : undefined;
      const overrideBrand  = req.body.terminalBrand as TerminalBrand | undefined;
      const overrideReader = req.body.stripeReaderId as string | undefined;

      // ── SSRF guard for LAN-based brands ─────────────────────────────────
      const effectiveBrand = overrideBrand ?? hw.terminalBrand ?? "dejavoo";
      const effectiveIp    = overrideIp ?? hw.terminalIp;

      if (effectiveBrand !== "stripe" && effectiveIp && !isPrivateOrLoopback(effectiveIp)) {
        return res.status(400).json({
          approved: false,
          reason: `Terminal IP ${effectiveIp} is not a private/LAN address — only LAN terminals are supported for brand "${effectiveBrand}"`,
        });
      }

      // ── Resolve the correct adapter ─────────────────────────────────────
      const resolved = resolveAdapter(hw, {
        terminalBrand:  overrideBrand,
        terminalIp:     overrideIp,
        terminalPort:   overridePort,
        stripeReaderId: overrideReader,
      });

      if ("error" in resolved) {
        return res.status(400).json({ approved: false, reason: resolved.error });
      }

      // ── Execute charge ──────────────────────────────────────────────────
      const result = await resolved.adapter.charge({ amountCents, orderRef, tipCents });
      return res.json(result);

    } catch (err: any) {
      console.error("[terminal/charge]", err);
      return res.status(500).json({ approved: false, reason: err?.message ?? "Internal error" });
    }
  });

  // ── POST /api/terminal/cancel ─────────────────────────────────────────────
  /**
   * Cancel an in-progress Stripe Terminal payment.
   * For LAN terminals (Dejavoo, PAX), cancellation must be done on the device.
   *
   * Body: { paymentIntentId }
   */
  app.post("/api/terminal/cancel", authMiddleware, async (req: any, res) => {
    try {
      const tenantId: number | undefined = req.tenantId;
      if (!tenantId) return res.status(400).json({ message: "No tenant context" });

      const { paymentIntentId } = req.body;
      if (!paymentIntentId) return res.status(400).json({ message: "paymentIntentId is required" });

      const tenant   = await storage.getTenant(tenantId);
      const features = (tenant?.enabledFeatures || {}) as any;
      const hw: TerminalHardwareConfig = features.hardwareConfig || {};
      const brand = hw.terminalBrand ?? "dejavoo";

      if (brand !== "stripe") {
        return res.status(400).json({
          message: `Server-side cancel is only supported for Stripe Terminal. ` +
                   `For ${brand} terminals, press Cancel on the physical device.`,
        });
      }

      const readerId = hw.stripeTerminalReaderId;
      if (!readerId) return res.status(400).json({ message: "Stripe reader ID not configured" });

      // Dynamic Stripe import to avoid circular deps
      const { getUncachableStripeClient } = await import("./stripeClient");
      const stripe = await getUncachableStripeClient() as any;
      if (!stripe) return res.status(503).json({ message: "Stripe client unavailable" });

      try { await stripe.terminal.readers.cancelAction(readerId); } catch { /* reader may already be idle */ }
      await stripe.paymentIntents.cancel(paymentIntentId);

      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── GET /api/terminal/config ──────────────────────────────────────────────
  /**
   * Returns the tenant's terminal configuration (no secrets).
   * Used by the POS UI to show connection status and active transport.
   */
  app.get("/api/terminal/config", authMiddleware, async (req: any, res) => {
    try {
      const tenantId: number | undefined = req.tenantId;
      if (!tenantId) return res.status(400).json({ message: "No tenant context" });

      const tenant   = await storage.getTenant(tenantId);
      const features = (tenant?.enabledFeatures || {}) as any;
      const hw: TerminalHardwareConfig = features.hardwareConfig || {};

      res.json({
        terminalBrand:           hw.terminalBrand           ?? "dejavoo",
        terminalIp:              hw.terminalIp              ?? null,
        terminalPort:            hw.terminalPort            ?? 9100,
        // PAX fields
        paxMerchantId:           hw.paxMerchantId           ?? null,
        paxOperatorId:           hw.paxOperatorId           ?? "01",
        paxTerminalNumber:       hw.paxTerminalNumber        ?? null,
        // Stripe Terminal
        stripeTerminalReaderId:  hw.stripeTerminalReaderId   ?? null,
        // Convenience flag for UI
        transport: hw.terminalBrand === "stripe"
          ? "cloud"
          : hw.terminalIp
            ? "tcp"
            : "serial",
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── PUT /api/terminal/config ──────────────────────────────────────────────
  /**
   * Save terminal configuration to tenant.enabledFeatures.hardwareConfig.
   * Admin only.
   *
   * Accepted fields:
   *   terminalBrand           — "dejavoo" | "pax" | "stripe" | "ingenico"
   *   terminalIp              — LAN IP (dejavoo/pax/ingenico)
   *   terminalPort            — TCP/HTTP port
   *   paxMerchantId           — PAX MerchID from processor
   *   paxOperatorId           — PAX OperID (default "01")
   *   paxTerminalNumber       — PAX TPN from processor
   *   stripeTerminalReaderId  — Stripe reader ID (tmr_…)
   */
  app.put("/api/terminal/config", authMiddleware, async (req: any, res) => {
    try {
      const tenantId: number | undefined = req.tenantId;
      if (!tenantId) return res.status(400).json({ message: "No tenant context" });

      const user = req.user as any;
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin access required" });

      const {
        terminalBrand,
        terminalIp,
        terminalPort,
        paxMerchantId,
        paxOperatorId,
        paxTerminalNumber,
        stripeTerminalReaderId,
      } = req.body;

      // Validate brand if provided
      const validBrands: TerminalBrand[] = ["dejavoo", "pax", "stripe", "ingenico", "verifone"];
      if (terminalBrand !== undefined && !validBrands.includes(terminalBrand)) {
        return res.status(400).json({ message: `Invalid terminalBrand. Must be one of: ${validBrands.join(", ")}` });
      }

      // SSRF guard for LAN brands
      if (terminalIp && terminalBrand !== "stripe" && !isPrivateOrLoopback(terminalIp)) {
        return res.status(400).json({
          message: `Terminal IP must be a private/LAN address (got ${terminalIp})`,
        });
      }

      const tenant   = await storage.getTenant(tenantId);
      const features = { ...(tenant?.enabledFeatures || {}) } as any;
      const existing: TerminalHardwareConfig = features.hardwareConfig || {};

      const updated: TerminalHardwareConfig = { ...existing };

      if (terminalBrand          !== undefined) updated.terminalBrand          = terminalBrand;
      if (terminalPort           !== undefined) updated.terminalPort           = Number(terminalPort);
      if (paxMerchantId          !== undefined) updated.paxMerchantId          = paxMerchantId;
      if (paxOperatorId          !== undefined) updated.paxOperatorId          = paxOperatorId;
      if (paxTerminalNumber      !== undefined) updated.paxTerminalNumber       = paxTerminalNumber;
      if (stripeTerminalReaderId !== undefined) updated.stripeTerminalReaderId  = stripeTerminalReaderId;

      // Handle IP: null/empty = clear (fall back to serial)
      if (terminalIp !== undefined) {
        if (terminalIp === null || terminalIp === "") delete updated.terminalIp;
        else updated.terminalIp = terminalIp;
      }

      features.hardwareConfig = updated;
      await storage.updateTenant(tenantId, { enabledFeatures: features });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });
}
