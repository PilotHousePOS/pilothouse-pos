/**
 * Tests: handleLogin always resets isLoading — even when fetch throws
 *
 * The sign-in button in `auth.tsx` is gated on `isLoading`.  If `isLoading`
 * is ever left as `true` after a failed request the button stays permanently
 * disabled until the user refreshes the page.
 *
 * The fix is to place `setIsLoading(false)` exclusively in the `finally` block
 * of `handleLogin` so it fires regardless of:
 *   • a successful response (try completes normally)
 *   • a server-side error (else branch inside try)
 *   • a network abort or any other throw caught by the catch block
 *   • an unexpected throw inside the catch block itself
 *     (finally still runs; JS guarantees this)
 *
 * Because these tests run in a Node environment (no browser/DOM), they inspect
 * the component source directly and assert on the structural properties that
 * guarantee the reset path cannot be skipped.
 *
 * Covered scenarios:
 *
 *  1. `handleLogin` contains a try/catch/finally triple.
 *  2. `setIsLoading(false)` lives inside the `finally` block — not only in the
 *     `catch` block where an unexpected throw could skip it.
 *  3. The `catch` block does NOT re-throw, so the finally always runs cleanly.
 *  4. `setIsLoading(true)` is called before the try block (so it is set on
 *     every invocation and the finally always has something to reset).
 *  5. `setIsLoading(false)` is NOT duplicated inside the catch block — a single
 *     finally-only reset is the canonical pattern and avoids double-calls.
 *  6. The sign-in button's `disabled` prop is bound to `isLoading`, confirming
 *     the reset directly re-enables the button in the UI.
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
 * Extract the body of `handleLogin` from the source so assertions are scoped
 * to that function and cannot accidentally match code in handleSignUp or
 * handleResendVerification.
 */
function getHandleLoginBody(source: string): string {
  const start = source.indexOf("const handleLogin = async");
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
  throw new Error("Could not find closing brace for handleLogin");
}

// ─── 1. handleLogin has a try/catch/finally triple ────────────────────────────

describe("auth.tsx — handleLogin: try/catch/finally structure", () => {
  it("contains a try block", () => {
    const body = getHandleLoginBody(src);
    expect(body).toMatch(/\btry\s*\{/);
  });

  it("contains a catch block", () => {
    const body = getHandleLoginBody(src);
    expect(body).toMatch(/\bcatch\s*\(/);
  });

  it("contains a finally block", () => {
    const body = getHandleLoginBody(src);
    expect(body).toMatch(/\bfinally\s*\{/);
  });

  it("the finally block appears after the catch block", () => {
    const body = getHandleLoginBody(src);
    const catchIndex = body.indexOf("catch (");
    const finallyIndex = body.indexOf("finally {");

    expect(catchIndex).toBeGreaterThan(-1);
    expect(finallyIndex).toBeGreaterThan(-1);
    expect(finallyIndex).toBeGreaterThan(catchIndex);
  });
});

// ─── 2. setIsLoading(false) is inside the finally block ──────────────────────

describe("auth.tsx — handleLogin: setIsLoading(false) is in finally", () => {
  it("calls setIsLoading(false) somewhere in the function body", () => {
    const body = getHandleLoginBody(src);
    expect(body).toMatch(/setIsLoading\(false\)/);
  });

  it("setIsLoading(false) appears after the finally keyword", () => {
    const body = getHandleLoginBody(src);
    const finallyIndex = body.indexOf("finally {");
    const resetIndex = body.indexOf("setIsLoading(false)");

    expect(finallyIndex).toBeGreaterThan(-1);
    expect(resetIndex).toBeGreaterThan(-1);
    // The reset call must come after 'finally {' in the source.
    expect(resetIndex).toBeGreaterThan(finallyIndex);
  });

  it("setIsLoading(false) is inside the finally block (before its closing brace)", () => {
    const body = getHandleLoginBody(src);
    const finallyIndex = body.indexOf("finally {");
    const resetIndex = body.indexOf("setIsLoading(false)");

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

describe("auth.tsx — handleLogin: catch block swallows errors (no re-throw)", () => {
  it("the catch block does not contain a bare 'throw' statement", () => {
    const body = getHandleLoginBody(src);
    const catchIndex = body.indexOf("catch (");
    const finallyIndex = body.indexOf("finally {");

    // Extract only the catch block body (between catch and finally).
    const catchBody = body.slice(catchIndex, finallyIndex);

    // A re-throw would be `throw error` or `throw` on its own.
    // We allow `throw` if it appears inside a string literal or comment, but
    // a bare `throw` keyword followed by an identifier or `;` is the re-throw.
    expect(catchBody).not.toMatch(/\bthrow\s+(error|err)\b/);
  });
});

// ─── 4. setIsLoading(true) is called before the try block ────────────────────

describe("auth.tsx — handleLogin: setIsLoading(true) is called before try", () => {
  it("calls setIsLoading(true) in the function body", () => {
    const body = getHandleLoginBody(src);
    expect(body).toMatch(/setIsLoading\(true\)/);
  });

  it("setIsLoading(true) appears before the try block", () => {
    const body = getHandleLoginBody(src);
    const setLoadingTrueIndex = body.indexOf("setIsLoading(true)");
    const tryIndex = body.indexOf("try {");

    expect(setLoadingTrueIndex).toBeGreaterThan(-1);
    expect(tryIndex).toBeGreaterThan(-1);
    expect(setLoadingTrueIndex).toBeLessThan(tryIndex);
  });
});

// ─── 5. setIsLoading(false) is NOT duplicated inside the catch block ──────────

describe("auth.tsx — handleLogin: no duplicate setIsLoading(false) in catch", () => {
  it("setIsLoading(false) does not appear inside the catch block", () => {
    const body = getHandleLoginBody(src);
    const catchIndex = body.indexOf("catch (");
    const finallyIndex = body.indexOf("finally {");

    // The catch body is everything between 'catch (' and 'finally {'.
    const catchBody = body.slice(catchIndex, finallyIndex);

    expect(catchBody).not.toMatch(/setIsLoading\(false\)/);
  });
});

// ─── 6. Sign-in button's disabled prop is bound to isLoading ─────────────────

describe("auth.tsx — sign-in button: disabled prop mirrors isLoading", () => {
  it("the sign-in submit button has a disabled prop", () => {
    expect(src).toMatch(/disabled=\{isLoading\}/);
  });

  it("the sign-in button shows a spinner label when isLoading is true", () => {
    // The button label must change so the user gets visual feedback that the
    // request is in flight — and can see it re-enable when isLoading resets.
    expect(src).toMatch(/isLoading\s*\?\s*["']Signing In\.\.\.["']/);
  });

  it("the sign-in button has the expected test id", () => {
    expect(src).toMatch(/data-testid="button-signin"/);
  });
});
