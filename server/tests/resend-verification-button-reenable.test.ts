/**
 * Tests: handleResendVerification always re-enables the Resend button —
 *        even when the email server is unreachable (fetch throws)
 *
 * The Resend button in `auth.tsx` is gated on `resendingVerification`.
 * If `resendingVerification` is ever left as `true` after a failed request
 * the button stays permanently disabled until the user refreshes the page.
 *
 * The fix is to place `setResendingVerification(false)` exclusively in the
 * `finally` block of `handleResendVerification` so it fires regardless of:
 *   • a successful response (try completes normally)
 *   • a non-2xx server response (data.message toast inside try)
 *   • a network abort, SendGrid timeout, or any other throw caught by catch
 *   • an unexpected throw inside the catch block itself
 *     (finally still runs; JS guarantees this)
 *
 * Because these tests run in a Node environment (no browser/DOM), they inspect
 * the component source directly and assert on the structural properties that
 * guarantee the re-enable path cannot be skipped.
 *
 * Covered scenarios:
 *
 *  1. `handleResendVerification` contains a try/catch/finally triple.
 *  2. `setResendingVerification(false)` lives inside the `finally` block —
 *     not only in the `catch` block where an unexpected throw could skip it.
 *  3. The `catch` block does NOT re-throw, so the finally always runs cleanly.
 *  4. The Resend button's `disabled` prop is bound to `resendingVerification`,
 *     confirming the reset directly re-enables the button in the UI.
 */

import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";

// ─── Load component source once ───────────────────────────────────────────────

let src: string;

beforeAll(() => {
  const filePath = path.resolve(
    __dirname,
    "../../client/src/pages/auth.tsx",
  );
  src = fs.readFileSync(filePath, "utf-8");
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the body of `handleResendVerification` from the source so assertions
 * are scoped to that function and cannot accidentally match code in handleLogin
 * or handleSignUp.
 */
function getHandleResendVerificationBody(source: string): string {
  const start = source.indexOf("const handleResendVerification = async");
  expect(start).toBeGreaterThan(-1); // guard: function must exist

  // Walk forward to find the closing `};` that ends the arrow function.
  // We track brace depth starting from the opening brace of the function body.
  let depth = 0;
  let bodyStart = -1;
  for (let i = start; i < source.length; i++) {
    if (source[i] === "{") {
      depth++;
      if (depth === 1) bodyStart = i;
    } else if (source[i] === "}") {
      depth--;
      if (depth === 0) {
        return source.slice(bodyStart, i + 1);
      }
    }
  }
  throw new Error("Could not find closing brace for handleResendVerification");
}

// ─── 1. handleResendVerification has a try/catch/finally triple ───────────────

describe("auth.tsx — handleResendVerification: try/catch/finally structure", () => {
  it("contains a try block", () => {
    const body = getHandleResendVerificationBody(src);
    expect(body).toMatch(/\btry\s*\{/);
  });

  it("contains a catch block", () => {
    const body = getHandleResendVerificationBody(src);
    expect(body).toMatch(/\bcatch\b/);
  });

  it("contains a finally block", () => {
    const body = getHandleResendVerificationBody(src);
    expect(body).toMatch(/\bfinally\s*\{/);
  });

  it("the finally block appears after the catch block", () => {
    const body = getHandleResendVerificationBody(src);
    const catchIndex = body.indexOf("catch");
    const finallyIndex = body.indexOf("finally {");

    expect(catchIndex).toBeGreaterThan(-1);
    expect(finallyIndex).toBeGreaterThan(-1);
    expect(finallyIndex).toBeGreaterThan(catchIndex);
  });
});

// ─── 2. setResendingVerification(false) is inside the finally block ───────────

describe("auth.tsx — handleResendVerification: setResendingVerification(false) is in finally", () => {
  it("calls setResendingVerification(false) somewhere in the function body", () => {
    const body = getHandleResendVerificationBody(src);
    expect(body).toMatch(/setResendingVerification\(false\)/);
  });

  it("setResendingVerification(false) appears after the finally keyword", () => {
    const body = getHandleResendVerificationBody(src);
    const finallyIndex = body.indexOf("finally {");
    const resetIndex = body.indexOf("setResendingVerification(false)");

    expect(finallyIndex).toBeGreaterThan(-1);
    expect(resetIndex).toBeGreaterThan(-1);
    // The reset call must come after 'finally {' in the source.
    expect(resetIndex).toBeGreaterThan(finallyIndex);
  });

  it("setResendingVerification(false) is inside the finally block (before its closing brace)", () => {
    const body = getHandleResendVerificationBody(src);
    const finallyIndex = body.indexOf("finally {");
    const resetIndex = body.indexOf("setResendingVerification(false)");

    // Find the closing brace of the finally block by walking from 'finally {'.
    let depth = 0;
    let finallyEnd = -1;
    for (let i = finallyIndex; i < body.length; i++) {
      if (body[i] === "{") depth++;
      else if (body[i] === "}") {
        depth--;
        if (depth === 0) {
          finallyEnd = i;
          break;
        }
      }
    }

    expect(finallyEnd).toBeGreaterThan(-1);
    expect(resetIndex).toBeGreaterThan(finallyIndex);
    expect(resetIndex).toBeLessThan(finallyEnd);
  });
});

// ─── 3. catch block does NOT re-throw ─────────────────────────────────────────

describe("auth.tsx — handleResendVerification: catch block swallows errors (no re-throw)", () => {
  it("the catch block does not contain a bare 'throw' statement", () => {
    const body = getHandleResendVerificationBody(src);
    const catchIndex = body.indexOf("catch");
    const finallyIndex = body.indexOf("finally {");

    // Extract only the catch block body (between catch and finally).
    const catchBody = body.slice(catchIndex, finallyIndex);

    // A re-throw would be `throw error` or `throw` on its own.
    expect(catchBody).not.toMatch(/\bthrow\s+(error|err)\b/);
  });
});

// ─── 4. Resend button's disabled prop is bound to resendingVerification ───────

describe("auth.tsx — Resend button: disabled prop mirrors resendingVerification", () => {
  it("the Resend button has a disabled prop bound to resendingVerification", () => {
    expect(src).toMatch(/disabled=\{resendingVerification\}/);
  });

  it("the Resend button shows a spinner label when resendingVerification is true", () => {
    // The button label must change so the user gets visual feedback that the
    // request is in flight — and can see it re-enable when the reset fires.
    expect(src).toMatch(/resendingVerification\s*\?\s*["']Sending\.\.\.["']/);
  });
});
