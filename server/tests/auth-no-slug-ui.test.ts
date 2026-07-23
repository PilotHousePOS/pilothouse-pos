/**
 * Tests: /auth page — missing tenant slug shows "Store link required" message
 *
 * The auth page (`client/src/pages/auth.tsx`) reads `?tenant=` from the URL
 * and, when the param is absent, replaces the sign-up form with a
 * "Store link required" message telling the customer to use the store link.
 * When the param is present, the normal sign-up form is rendered instead.
 *
 * Because these tests run in a Node environment (no browser/DOM), they verify
 * the component source directly — asserting that the conditional guard, the
 * heading copy, the explanatory copy, and the sign-up form are all present and
 * correctly wired.  A future refactor that accidentally removes the guard or
 * changes the copy will be caught here.
 *
 * Covered scenarios:
 *
 *  1. The guard variable (`missingTenantForSignup`) is derived from the absence
 *     of the `tenant` query parameter.
 *
 *  2. The "Store link required" heading is rendered inside the guard branch.
 *
 *  3. The explanatory copy ("please open the sign-up link you received from
 *     your store") is rendered inside the guard branch.
 *
 *  4. The sign-up form (identified by the Create Account button) is rendered
 *     in the else branch — i.e. only when `?tenant=` is present.
 *
 *  5. The sign-in tab is unconditional — it is always present regardless of
 *     the tenant param.
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

// ─── 1. Guard variable is derived from the tenant query param ─────────────────

describe("auth.tsx — missingTenantForSignup guard", () => {
  it("reads the tenant param from the URL search string", () => {
    // The component must look up '?tenant=' to decide whether to show the guard.
    expect(src).toMatch(/URLSearchParams.*window\.location\.search/);
    expect(src).toMatch(/\.get\(['"]tenant['"]\)/);
  });

  it("sets missingTenantForSignup to true when the tenant param is absent", () => {
    // The guard must be the logical negation of the tenant param.
    expect(src).toMatch(/missingTenantForSignup\s*=\s*!/);
  });

  it("uses missingTenantForSignup to conditionally render UI in the Sign Up tab", () => {
    // The guard must be referenced inside JSX — it drives which branch renders.
    expect(src).toMatch(/\{missingTenantForSignup\s*\?/);
  });
});

// ─── 2. "Store link required" heading is visible when no tenant param ─────────

describe("auth.tsx — no-tenant branch: 'Store link required' message", () => {
  it("renders a 'Store link required' heading", () => {
    expect(src).toMatch(/Store link required/i);
  });

  it("the heading appears inside the missingTenantForSignup branch (before the else)", () => {
    // The heading must appear before the closing paren of the ternary's true branch
    // and before the sign-up <form> element.
    const guardIndex = src.indexOf("missingTenantForSignup ?");
    const headingIndex = src.indexOf("Store link required");
    const formIndex = src.indexOf('<form onSubmit={handleSignUpSubmit}');

    expect(guardIndex).toBeGreaterThan(-1);
    expect(headingIndex).toBeGreaterThan(guardIndex);
    expect(headingIndex).toBeLessThan(formIndex);
  });
});

// ─── 3. Explanatory copy tells the customer to use their store link ────────────

describe("auth.tsx — no-tenant branch: explanatory copy", () => {
  it("renders copy instructing the customer to open the store sign-up link", () => {
    // The message must reference the store link so customers know what to do.
    expect(src).toMatch(/sign-up link you received from your store/i);
  });

  it("the explanatory copy appears inside the missingTenantForSignup branch", () => {
    const guardIndex = src.indexOf("missingTenantForSignup ?");
    const copyIndex = src.indexOf("sign-up link you received from your store");
    const formIndex = src.indexOf('<form onSubmit={handleSignUpSubmit}');

    expect(guardIndex).toBeGreaterThan(-1);
    expect(copyIndex).toBeGreaterThan(guardIndex);
    expect(copyIndex).toBeLessThan(formIndex);
  });
});

// ─── 4. Sign-up form is in the else branch (requires tenant param) ────────────

describe("auth.tsx — with-tenant branch: sign-up form is rendered", () => {
  it("the Create Account button exists inside the sign-up form", () => {
    expect(src).toMatch(/Create Account/);
  });

  it("the sign-up form is in the else branch of missingTenantForSignup", () => {
    // The form must come AFTER the no-tenant branch ends (i.e. in the else).
    const headingIndex = src.indexOf("Store link required");
    const formIndex = src.indexOf('<form onSubmit={handleSignUpSubmit}');

    expect(headingIndex).toBeGreaterThan(-1);
    expect(formIndex).toBeGreaterThan(headingIndex);
  });

  it("the sign-up form contains email, password and name fields", () => {
    expect(src).toMatch(/name="email"/);
    expect(src).toMatch(/name="password"/);
    expect(src).toMatch(/name="firstName"/);
    expect(src).toMatch(/name="lastName"/);
  });
});

// ─── 5. Sign-in tab is always present (unconditional) ─────────────────────────

describe("auth.tsx — sign-in tab is unconditional", () => {
  it("the sign-in form is present regardless of the tenant param", () => {
    // The sign-in form must exist outside any missingTenantForSignup conditional.
    expect(src).toMatch(/handleSignInSubmit/);
    expect(src).toMatch(/data-testid="button-signin"/);
  });

  it("the sign-in form is not nested inside the missingTenantForSignup branch", () => {
    // The sign-in submit handler appears before the guard, confirming it is
    // outside the conditional block.
    const signinIndex = src.indexOf("handleSignInSubmit");
    const guardIndex = src.indexOf("missingTenantForSignup ?");

    expect(signinIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeGreaterThan(-1);
    // The sign-in form definition comes before the guard conditional in the JSX.
    expect(signinIndex).toBeLessThan(guardIndex);
  });
});
