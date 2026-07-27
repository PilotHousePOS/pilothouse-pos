// ─── Terminal Adapter Dispatcher ─────────────────────────────────────────────
//
// resolveAdapter() picks the correct terminal adapter from the tenant's
// hardware config and the optional per-request overrides.
//
// Brand routing:
//   "dejavoo"  → TCP binary frame (EP semi-integration)
//   "pax"      → HTTP binary frame (PAX local integration, port 9100)
//   "stripe"   → Stripe Terminal API (server-driven, any network)
//   "ingenico" → same frame format as dejavoo; route to createDejavooAdapter
//   "verifone" → not yet implemented; returns a clear error
//
// To add a new brand:
//   1. Create server/terminalAdapters/<brand>.ts implementing TerminalAdapter
//   2. Add a case here in resolveAdapter()
//   3. Add any new config fields to TerminalHardwareConfig in types.ts

export { createDejavooAdapter }    from "./dejavoo";
export { createPaxAdapter }        from "./pax";
export { createStripeTerminalAdapter } from "./stripeTerminal";
export type {
  TerminalAdapter,
  TerminalBrand,
  TerminalChargeRequest,
  TerminalChargeResult,
  TerminalHardwareConfig,
} from "./types";

import { createDejavooAdapter }        from "./dejavoo";
import { createPaxAdapter }            from "./pax";
import { createStripeTerminalAdapter } from "./stripeTerminal";
import type { TerminalAdapter, TerminalBrand, TerminalHardwareConfig } from "./types";

export interface AdapterResolveOptions {
  /** Override from request body — takes precedence over tenant config */
  terminalBrand?:   TerminalBrand;
  terminalIp?:      string;
  terminalPort?:    number;
  /** Stripe reader ID override (for testing) */
  stripeReaderId?:  string;
}

/**
 * Resolve a TerminalAdapter from tenant hardware config + optional overrides.
 *
 * Returns { adapter } on success or { error } with a user-facing message.
 */
export function resolveAdapter(
  tenantConfig: TerminalHardwareConfig,
  overrides: AdapterResolveOptions = {},
): { adapter: TerminalAdapter } | { error: string } {

  const brand: TerminalBrand =
    overrides.terminalBrand ??
    tenantConfig.terminalBrand ??
    "dejavoo"; // backwards-compatible default

  switch (brand) {

    // ── Dejavoo / EP ── (also handles Ingenico EP-provisioned terminals)
    case "dejavoo":
    case "ingenico": {
      const ip   = overrides.terminalIp   ?? tenantConfig.terminalIp;
      const port = overrides.terminalPort ?? tenantConfig.terminalPort ?? 9100;
      if (!ip) {
        return {
          error:
            `Terminal IP not configured for brand "${brand}". ` +
            "Set it in Hardware Settings or pass terminalIp in the request body.",
        };
      }
      return { adapter: createDejavooAdapter(ip, port) };
    }

    // ── PAX ──────────────────────────────────────────────────────────────────
    case "pax": {
      const ip   = overrides.terminalIp   ?? tenantConfig.terminalIp;
      const port = overrides.terminalPort ?? tenantConfig.terminalPort ?? 9100;
      if (!ip) {
        return {
          error:
            "Terminal IP not configured for PAX terminal. " +
            "Set it in Hardware Settings or pass terminalIp in the request body.",
        };
      }
      return {
        adapter: createPaxAdapter(ip, port, {
          paxMerchantId:     tenantConfig.paxMerchantId,
          paxOperatorId:     tenantConfig.paxOperatorId,
          paxTerminalNumber: tenantConfig.paxTerminalNumber,
        }),
      };
    }

    // ── Stripe Terminal ───────────────────────────────────────────────────────
    case "stripe": {
      const readerId =
        overrides.stripeReaderId ??
        tenantConfig.stripeTerminalReaderId;
      if (!readerId) {
        return {
          error:
            "Stripe Terminal reader ID not configured. " +
            "Pair your reader in the Stripe Dashboard, then set stripeTerminalReaderId in Hardware Settings.",
        };
      }
      return { adapter: createStripeTerminalAdapter(readerId) };
    }

    // ── Not yet implemented ───────────────────────────────────────────────────
    case "verifone":
      return {
        error:
          "Verifone direct integration is not yet implemented. " +
          "Use the Stripe Terminal adapter with a Verifone P400 reader registered in your Stripe account.",
      };

    default:
      return { error: `Unknown terminal brand: "${brand}"` };
  }
}
