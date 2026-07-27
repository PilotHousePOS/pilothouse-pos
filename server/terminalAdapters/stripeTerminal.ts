// ─── Stripe Terminal Adapter ──────────────────────────────────────────────────
//
// Stripe Terminal uses a server-driven integration: the POS server creates a
// Stripe PaymentIntent and instructs the cloud-registered Stripe reader to
// process it.  The reader handles the card interaction and updates the
// PaymentIntent asynchronously.
//
// This approach works on ANY network (cloud-routed) — no LAN access to the
// terminal is required.  The browser never touches the terminal directly.
//
// COMPATIBLE HARDWARE
// ───────────────────
// All Stripe Terminal readers, including:
//   • BBPOS WisePOS E (countertop)
//   • Stripe Reader M2 (mobile, Bluetooth)
//   • BBPOS WisePad 3 (mobile)
//   • BBPOS Chipper 2X BT (mobile)
//   • Verifone P400 (countertop, legacy)
// Full list: https://stripe.com/docs/terminal/readers
//
// SETUP REQUIREMENTS
// ──────────────────
// 1. The Stripe account must have Terminal enabled (Dashboard → Terminal).
// 2. Each reader must be registered to a Stripe Location (a physical address).
// 3. The reader ID (tmr_…) is obtained from the Stripe Dashboard or API after
//    pairing the reader to your Stripe account.
// 4. Store the reader ID in tenant.enabledFeatures.hardwareConfig.stripeTerminalReaderId
//    (via Hardware Settings or PUT /api/terminal/config).
//
// INTEGRATION FLOW
// ────────────────
// 1. Create a PaymentIntent (amount, currency, capture_method: "automatic").
// 2. Call stripe.terminal.readers.processPaymentIntent(readerId, { payment_intent }).
//    The Stripe API routes this to the physical reader over the cloud.
// 3. The reader shows the tap/insert/swipe UI to the customer.
// 4. Poll the PaymentIntent status until it reaches "succeeded" or "canceled".
// 5. Return the result.
//
// POLLING vs WEBHOOKS
// ───────────────────
// This adapter polls (max 90 s, every 3 s) for simplicity — no webhook config
// is required.  For high-volume deployments, replace the polling loop with a
// webhook handler on /api/stripe/webhook that resolves a pending Promise.
//
// CANCELLATION
// ────────────
// If the cashier needs to cancel a pending payment, call
// POST /api/terminal/cancel with { paymentIntentId } — that endpoint calls
// stripe.terminal.readers.cancelAction(readerId) and cancels the PaymentIntent.

import type { TerminalAdapter, TerminalChargeRequest, TerminalChargeResult } from "./types";
import { getUncachableStripeClient } from "../stripeClient";

const POLL_INTERVAL_MS = 3_000;   // check every 3 seconds
const POLL_MAX_MS      = 90_000;  // Stripe Terminal customer interaction timeout

// ── Adapter factory ───────────────────────────────────────────────────────────
export function createStripeTerminalAdapter(readerId: string): TerminalAdapter {
  return {
    async charge(req: TerminalChargeRequest): Promise<TerminalChargeResult> {
      let stripe: Awaited<ReturnType<typeof getUncachableStripeClient>>;
      try {
        stripe = await getUncachableStripeClient();
        if (!stripe) throw new Error("Stripe client unavailable — check STRIPE_SECRET_KEY");
      } catch (err: any) {
        return { approved: false, reason: err?.message ?? "Could not initialise Stripe client" };
      }

      // ── 1. Create PaymentIntent ───────────────────────────────────────────
      let paymentIntent: any;
      try {
        paymentIntent = await (stripe as any).paymentIntents.create({
          amount:          req.amountCents,
          currency:        "usd",
          capture_method:  "automatic",
          // Terminal server-driven requires payment_method_types: card_present
          payment_method_types: ["card_present"],
          metadata: { orderRef: req.orderRef },
        });
      } catch (err: any) {
        return { approved: false, reason: `Failed to create PaymentIntent: ${err?.message}` };
      }

      // ── 2. Present the PaymentIntent to the reader ────────────────────────
      try {
        await (stripe as any).terminal.readers.processPaymentIntent(readerId, {
          payment_intent: paymentIntent.id,
        });
      } catch (err: any) {
        // Cancel the PaymentIntent so it doesn't linger
        try { await (stripe as any).paymentIntents.cancel(paymentIntent.id); } catch { /* ignore */ }
        return {
          approved: false,
          reason: `Failed to present payment to reader ${readerId}: ${err?.message}`,
        };
      }

      // ── 3. Poll for completion ────────────────────────────────────────────
      const deadline = Date.now() + POLL_MAX_MS;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

        let pi: any;
        try {
          pi = await (stripe as any).paymentIntents.retrieve(paymentIntent.id, {
            expand: ["latest_charge"],
          });
        } catch (err: any) {
          // Transient error — keep polling
          continue;
        }

        const status: string = pi.status;

        if (status === "succeeded") {
          const charge  = pi.latest_charge as any;
          const details = charge?.payment_method_details?.card_present;
          return {
            approved:      true,
            authCode:      details?.authorization_code ?? charge?.authorization_code ?? "",
            last4:         details?.last4 ?? "",
            cardType:      details?.brand?.toUpperCase() ?? "",
            transactionId: paymentIntent.id,
            responseCode:  "00",
          };
        }

        if (status === "canceled") {
          return {
            approved:      false,
            reason:        "Payment canceled on terminal",
            transactionId: paymentIntent.id,
          };
        }

        if (status === "requires_payment_method") {
          // Card was declined
          const charge   = pi.latest_charge as any;
          const outcome  = charge?.outcome;
          const reason   =
            outcome?.seller_message ??
            charge?.failure_message ??
            `Declined (${outcome?.reason ?? "unknown"})`;
          return {
            approved:      false,
            reason,
            transactionId: paymentIntent.id,
            responseCode:  outcome?.network_status ?? undefined,
          };
        }

        // status is "processing" | "requires_action" | etc. — keep polling
      }

      // Timeout — cancel the PaymentIntent
      try {
        await (stripe as any).terminal.readers.cancelAction(readerId);
        await (stripe as any).paymentIntents.cancel(paymentIntent.id);
      } catch { /* ignore */ }

      return {
        approved:      false,
        reason:        "Stripe Terminal payment timed out — customer did not complete card interaction",
        transactionId: paymentIntent.id,
      };
    },
  };
}
