/**
 * Tests: /auth page — invalid tenant slug shows "Store Not Found" screen
 *
 * The auth page (`client/src/pages/auth.tsx`) validates the `?tenant=` slug
 * against the server on load.  When the slug is present but does not match any
 * real store the component renders a "Store Not Found" card and never shows the
 * sign-in or sign-up forms.
 *
 * Because these tests run in a Node environment (no browser/DOM), they verify
 * the component source directly — asserting that the guard logic, loading state,
 * error screen, and tab rendering are all correctly structured.  A future
 * refactor that accidentally removes the guard or reorders the render branches
 * will be caught here.
 *
 * Covered scenarios:
 *
 *  1. When a tenant param is present the initial slugState is "checking", not
 *     "idle" or "valid" — so the form is never visible on first render.
 *
 *  2. The "checking" branch returns a spinner before reaching any tab or form
 *     element — no flash is possible.
 *
 *  3. The "invalid" branch returns the "Store Not Found" card before reaching
 *     the Tabs component — tab-switching cannot bypass the guard.
 *
 *  4. The "Store Not Found" card displays the slug so the user can recognise
 *     the broken link.
 *
 *  5. The Tabs/form block is only rendered after both early-return guards have
 *     been passed — valid and idle slugs still reach it normally.
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

// ─── 1. Initial slugState prevents a flash on first render ────────────────────

describe('auth.tsx — slugState initialises to "checking" when tenant param is present', () => {
  it('uses "checking" as the initial state when tenantSlugFromUrl is truthy', () => {
    // The useState initialiser must use a ternary so that slugState begins as
    // "checking" (not "idle" or "valid") the instant the component mounts.
    expect(src).toMatch(/useState.*tenantSlugFromUrl.*checking.*idle/s);
  });

  it('derives slugState from tenantSlugFromUrl, not from a plain string literal', () => {
    // The initial value must be conditional on the URL param — a bare "idle"
    // default would let the form flash before the fetch completes.
    const stateDecl = src.match(/useState<SlugState>\([^)]+\)/);
    expect(stateDecl).not.toBeNull();
    expect(stateDecl![0]).toContain("tenantSlugFromUrl");
  });
});

// ─── 2. "checking" branch returns before any form or tab is rendered ──────────

describe('auth.tsx — "checking" render branch shows only a spinner', () => {
  it('returns early when slugState is "checking"', () => {
    expect(src).toMatch(/slugState\s*===\s*["']checking["']/);
  });

  it('the spinner return appears before the Tabs component in source order', () => {
    const checkingIndex = src.indexOf('"checking"');
    const tabsIndex     = src.indexOf("<Tabs ");

    expect(checkingIndex).toBeGreaterThan(-1);
    expect(tabsIndex).toBeGreaterThan(-1);
    expect(checkingIndex).toBeLessThan(tabsIndex);
  });

  it('the "checking" branch does not contain a <form> element', () => {
    // Extract only the checking-guard block (from the guard to the next guard).
    const checkingStart = src.indexOf('slugState === "checking"');
    const invalidStart  = src.indexOf('slugState === "invalid"');

    expect(checkingStart).toBeGreaterThan(-1);
    expect(invalidStart).toBeGreaterThan(checkingStart);

    const checkingBlock = src.slice(checkingStart, invalidStart);
    expect(checkingBlock).not.toMatch(/<form/);
  });
});

// ─── 3. "invalid" branch returns before the Tabs component ───────────────────

describe('auth.tsx — "invalid" render branch returns "Store Not Found" before tabs', () => {
  it('returns early when slugState is "invalid"', () => {
    expect(src).toMatch(/slugState\s*===\s*["']invalid["']/);
  });

  it('the "Store Not Found" heading is inside the invalid guard branch', () => {
    const invalidIndex      = src.indexOf('"invalid"');
    const storeNotFoundIndex = src.indexOf("Store Not Found");
    const tabsIndex          = src.indexOf("<Tabs ");

    expect(invalidIndex).toBeGreaterThan(-1);
    expect(storeNotFoundIndex).toBeGreaterThan(invalidIndex);
    expect(storeNotFoundIndex).toBeLessThan(tabsIndex);
  });

  it('the invalid branch does not contain a <TabsTrigger> or sign-up form', () => {
    const invalidStart = src.indexOf('slugState === "invalid"');
    // The next guard after the invalid block is the verificationPending early-return.
    // Use "if (verificationPending)" to skip over earlier useState declarations.
    const nextGuardStart = src.indexOf("if (verificationPending)");

    expect(invalidStart).toBeGreaterThan(-1);
    expect(nextGuardStart).toBeGreaterThan(invalidStart);

    const invalidBlock = src.slice(invalidStart, nextGuardStart);
    expect(invalidBlock).not.toMatch(/<TabsTrigger/);
    expect(invalidBlock).not.toMatch(/<form/);
  });
});

// ─── 4. "Store Not Found" card displays the unrecognised slug ────────────────

describe('auth.tsx — "Store Not Found" card references the slug', () => {
  it('renders the tenantSlugFromUrl value so the user can identify the broken link', () => {
    // The card must interpolate the slug — a static message alone is insufficient.
    expect(src).toMatch(/tenantSlugFromUrl/);

    // Confirm the slug variable is used inside the Store-Not-Found section.
    const invalidStart       = src.indexOf('slugState === "invalid"');
    const storeNotFoundIndex = src.indexOf("Store Not Found");
    const afterHeadingBlock  = src.slice(storeNotFoundIndex, storeNotFoundIndex + 500);

    expect(afterHeadingBlock).toMatch(/tenantSlugFromUrl/);
  });

  it('includes a "Back to Home" affordance inside the invalid branch', () => {
    const invalidStart   = src.indexOf('slugState === "invalid"');
    const nextGuardStart = src.indexOf("if (verificationPending)");
    const invalidBlock   = src.slice(invalidStart, nextGuardStart);

    expect(invalidBlock).toMatch(/Back to Home/i);
  });
});

// ─── 5. Tabs are only reachable for valid / idle slugs ────────────────────────

describe("auth.tsx — Tabs component is only rendered after both guards pass", () => {
  it("the Tabs component appears after both the checking and invalid guard blocks", () => {
    const checkingIndex = src.indexOf('"checking"');
    const invalidIndex  = src.indexOf('"invalid"');
    const tabsIndex     = src.indexOf("<Tabs ");

    expect(tabsIndex).toBeGreaterThan(checkingIndex);
    expect(tabsIndex).toBeGreaterThan(invalidIndex);
  });

  it("both sign-in and sign-up TabsTrigger elements are inside the Tabs block", () => {
    const tabsIndex     = src.indexOf("<Tabs ");
    const afterTabs     = src.slice(tabsIndex);

    expect(afterTabs).toMatch(/value=["']signin["']/);
    expect(afterTabs).toMatch(/value=["']signup["']/);
  });

  it("the sign-up form is only reachable when slugState has passed both guards", () => {
    // The form must appear after the invalid-slug guard, confirming it cannot
    // be reached for an unrecognised tenant slug.
    const invalidIndex = src.indexOf('slugState === "invalid"');
    const formIndex    = src.indexOf('<form onSubmit={handleSignUpSubmit}');

    expect(invalidIndex).toBeGreaterThan(-1);
    expect(formIndex).toBeGreaterThan(invalidIndex);
  });
});
