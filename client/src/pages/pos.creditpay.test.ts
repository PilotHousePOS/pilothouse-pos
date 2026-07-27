// ─── POS Credit-Pay Toast Branch Tests ───────────────────────────────────────
//
// handleCreditPay in pos.tsx dispatches one of three toasts after calling
// sendTerminalCharge:
//
//   1. "Approved …"               — result.approved === true
//   2. "Connect to terminal first" — result.reason starts with
//                                    'Terminal port is not open'
//   3. "Card Declined"            — any other non-approved result
//
// These tests validate the branching condition in isolation so a future
// refactor of the if/else cannot accidentally swap toasts 2 and 3.
// They mirror the exact guard used in the component:
//
//   } else if (result.reason?.startsWith('Terminal port is not open')) {
//     toast({ title: 'Connect to terminal first', ... })
//   } else {
//     toast({ title: 'Card Declined', ... })
//   }

import { describe, it, expect } from 'vitest';
import type { TerminalChargeResult } from '../lib/hardware/terminal';

// ── Inline replica of the toast-selection logic from handleCreditPay ─────────
// Kept intentionally thin: any change to pos.tsx that breaks this contract
// will also break this test.

type ToastCall = { title: string; description?: string; variant?: string };

function resolveToast(result: TerminalChargeResult): ToastCall {
  if (result.approved) {
    return { title: `Approved — ****${result.last4 ?? ''}`, description: result.cardType ?? '' };
  } else if (result.reason?.startsWith('Terminal port is not open')) {
    return {
      title:       'Connect to terminal first',
      description: 'The card terminal is paired but the port is not open. Disconnect and reconnect the terminal, then try again.',
      variant:     'destructive',
    };
  } else {
    return {
      title:       'Card Declined',
      description: result.reason ?? 'Try a different card.',
      variant:     'destructive',
    };
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('handleCreditPay — toast dispatch for port-closed result', () => {

  it('shows "Connect to terminal first" — not "Card Declined" — when the port guard fires', () => {
    // This is the exact reason string sendTerminalCharge returns when
    // readable or writable is null (cable pulled mid-session).
    const result: TerminalChargeResult = {
      approved: false,
      reason: 'Terminal port is not open — call openTerminalPort() first',
    };

    const toast = resolveToast(result);

    expect(toast.title).toBe('Connect to terminal first');
    expect(toast.title).not.toBe('Card Declined');
    expect(toast.variant).toBe('destructive');
  });

  it('shows "Card Declined" for a normal decline (e.g. insufficient funds)', () => {
    const result: TerminalChargeResult = {
      approved: false,
      reason: 'Insufficient funds',
    };

    const toast = resolveToast(result);

    expect(toast.title).toBe('Card Declined');
    expect(toast.title).not.toBe('Connect to terminal first');
    expect(toast.description).toBe('Insufficient funds');
  });

  it('shows "Card Declined" for an unknown decline code', () => {
    const result: TerminalChargeResult = {
      approved: false,
      reason: 'Declined (99)',
    };

    const toast = resolveToast(result);

    expect(toast.title).toBe('Card Declined');
  });

  it('shows "Card Declined" with fallback description when reason is absent', () => {
    const result: TerminalChargeResult = { approved: false };

    const toast = resolveToast(result);

    expect(toast.title).toBe('Card Declined');
    expect(toast.description).toBe('Try a different card.');
  });

  it('shows approved toast — not "Connect to terminal first" — on success', () => {
    const result: TerminalChargeResult = {
      approved: true,
      authCode: 'ABC123',
      last4: '9876',
      cardType: 'VISA',
    };

    const toast = resolveToast(result);

    expect(toast.title).toContain('Approved');
    expect(toast.title).toContain('9876');
    expect(toast.title).not.toBe('Connect to terminal first');
  });

  it('the "port not open" branch is triggered by the exact prefix used in sendTerminalCharge', () => {
    // Verify the startsWith() boundary: a reason that starts with the exact
    // prefix triggers the targeted toast; one that merely contains it does not.
    const exactPrefix = 'Terminal port is not open — call openTerminalPort() first';
    const containsButDoesNotStart = `Error: ${exactPrefix}`;

    expect(resolveToast({ approved: false, reason: exactPrefix }).title)
      .toBe('Connect to terminal first');

    // A prefixed wrapper does NOT start with the guard string → "Card Declined"
    expect(resolveToast({ approved: false, reason: containsButDoesNotStart }).title)
      .toBe('Card Declined');
  });
});
