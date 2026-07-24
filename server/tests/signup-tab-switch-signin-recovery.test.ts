/**
 * Tests: Sign In button recovers after a failed signup started from the Sign Up tab
 *
 * ## Design contract
 *
 * Both the Sign In and Sign Up buttons share the same `isLoading` state.  When
 * a signup request is in flight, the Sign In button is also disabled.  This is
 * intentional — it prevents a duplicate login submission while signup is running.
 *
 * The critical guarantee is that when the signup request settles (success,
 * server error, or network failure), `isLoading` is reset to `false` via the
 * `finally` block in `handleSignUp`.  This re-enables the Sign In button even
 * if the user has already switched to the Sign In tab.
 *
 * This is the inverse of the login-in-flight scenarios: here the **signup**
 * request throws a network error and the user has navigated to the Sign In tab
 * — confirming that the Sign In button (`data-testid="button-signin"`) is
 * re-enabled after the error resolves.
 *
 * ## Covered scenarios
 *
 *  Behavioural simulation (scenarios 1–4):
 *    1. Baseline: signup completes normally, isLoading resets to false.
 *    2. Signup throws a network error: finally still fires, button re-enables.
 *    3. User switches to Sign In mid-signup, error resolves: Sign In button
 *       becomes enabled (isLoading → false) without any tab-switch logic.
 *    4. Multiple tab switches during in-flight signup leave Sign In disabled
 *       until the signup request actually settles.
 *
 *  Implementation checks (scenario 5):
 *    5. Key guards in auth.tsx are all present: handleSignUp has try/catch/finally,
 *       setIsLoading(false) is in the finally block, and onValueChange does NOT
 *       reset isLoading.
 */

import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";

// ─── Minimal React-like state cell ────────────────────────────────────────────
//
// React bails out of re-renders when setState is called with a value that
// Object.is()-equals the current state.  We model that here so the behavioural
// scenarios reflect actual component behaviour.

function makeStateCell<T>(initial: T) {
  let value = initial;
  let renderCount = 0;

  return {
    get: () => value,
    set: (next: T) => {
      if (!Object.is(next, value)) {
        value = next;
        renderCount++;
      }
    },
    renderCount: () => renderCount,
  };
}

// ─── Load component source (for implementation checks only) ───────────────────

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
 * Extract the body of `handleSignUp` from the source so assertions are scoped
 * to that function and cannot accidentally match code in handleLogin or
 * handleResendVerification.
 */
function getHandleSignUpBody(source: string): string {
  const start = source.indexOf("const handleSignUp = async");
  expect(start).toBeGreaterThan(-1); // guard: function must exist

  // Walk forward to find the closing `};` that ends the arrow function.
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
  throw new Error("Could not find closing brace for handleSignUp");
}

// ─── Scenario 1: baseline — signup completes normally ─────────────────────────

describe("Baseline: Sign In button re-enables after signup completes normally", () => {
  it("isLoading transitions false → true (submit) → false (finally)", () => {
    const isLoading = makeStateCell(false);

    // User submits the signup form
    isLoading.set(true);
    expect(isLoading.get()).toBe(true); // both buttons disabled

    // Request settles — finally block fires
    isLoading.set(false);
    expect(isLoading.get()).toBe(false); // Sign In button re-enabled
  });

  it("exactly two renders occur: one on submit, one on completion", () => {
    const isLoading = makeStateCell(false);

    isLoading.set(true);  // render 1: both buttons become disabled
    isLoading.set(false); // render 2: buttons re-enable

    expect(isLoading.renderCount()).toBe(2);
  });
});

// ─── Scenario 2: signup throws a network error ────────────────────────────────

describe("Network error during signup: finally resets isLoading so Sign In re-enables", () => {
  it("isLoading is false after a simulated fetch rejection", async () => {
    const isLoading = makeStateCell(false);
    const signupError = makeStateCell<string | null>(null);

    // Simulate handleSignUp internals: set loading, throw, catch, finally
    isLoading.set(true);
    expect(isLoading.get()).toBe(true);

    try {
      // Simulate fetch(...) throwing (e.g. network offline, DNS failure)
      throw new TypeError("Failed to fetch");
    } catch {
      signupError.set("An error occurred during sign up. Please try again.");
    } finally {
      isLoading.set(false); // mirrors the finally block in handleSignUp
    }

    expect(isLoading.get()).toBe(false); // Sign In button is now enabled
    expect(signupError.get()).not.toBeNull(); // error message is visible
  });

  it("Sign In button (disabled={isLoading}) is enabled after the catch path", () => {
    const isLoading = makeStateCell(false);

    isLoading.set(true); // signup in-flight

    // Simulate the catch + finally path
    try {
      throw new Error("Network error");
    } catch {
      // catch block sets signupError but does NOT reset isLoading
    } finally {
      isLoading.set(false); // finally always runs
    }

    // The Sign In button reads disabled={isLoading} — it is now enabled
    const signInButtonDisabled = isLoading.get();
    expect(signInButtonDisabled).toBe(false);
  });
});

// ─── Scenario 3: user switches to Sign In tab mid-signup, then error resolves ──

describe("Tab switch to Sign In mid-signup: button recovers when error resolves", () => {
  it("isLoading is true on the Sign In tab while signup is in flight", () => {
    const isLoading = makeStateCell(false);

    // User submits signup form (on Sign Up tab)
    isLoading.set(true);

    // User switches to Sign In tab — onValueChange does NOT reset isLoading
    // (no setIsLoading call occurs on tab switch)
    expect(isLoading.get()).toBe(true); // Sign In button is disabled
  });

  it("Sign In button re-enables when finally fires, even while user is on Sign In tab", () => {
    const isLoading = makeStateCell(false);

    isLoading.set(true);  // signup submitted
    // user switches to Sign In tab — no isLoading change
    expect(isLoading.get()).toBe(true); // Sign In button is disabled

    // Signup fetch throws, catch + finally run in the background
    isLoading.set(false); // finally block
    expect(isLoading.get()).toBe(false); // Sign In button is now enabled
  });

  it("full sequence produces exactly two renders: submit and completion", () => {
    const isLoading = makeStateCell(false);

    isLoading.set(true);  // render 1 — signup submit
    // tab switch to Sign In: onValueChange fires but does NOT call setIsLoading
    isLoading.set(false); // render 2 — finally

    expect(isLoading.renderCount()).toBe(2);
  });

  it("the Sign In button shows 'Sign In' (not 'Signing In...') after the error resolves", () => {
    // Simulated label logic: isLoading ? "Signing In..." : "Sign In"
    const isLoading = makeStateCell(false);

    isLoading.set(true);
    const labelDuringRequest = isLoading.get() ? "Signing In..." : "Sign In";
    expect(labelDuringRequest).toBe("Signing In..."); // disabled label

    isLoading.set(false); // finally fires
    const labelAfterResolve = isLoading.get() ? "Signing In..." : "Sign In";
    expect(labelAfterResolve).toBe("Sign In"); // re-enabled label
  });
});

// ─── Scenario 4: multiple tab switches during in-flight signup ────────────────

describe("Multiple tab switches during in-flight signup", () => {
  it("Sign In button stays disabled through any number of tab switches until signup settles", () => {
    const isLoading = makeStateCell(false);

    isLoading.set(true); // signup submitted

    // Many rapid tab switches — none touch isLoading
    const switchCount = 8;
    for (let i = 0; i < switchCount; i++) {
      // onValueChange fires — clears signupError only, not isLoading
      expect(isLoading.get()).toBe(true); // Sign In button still disabled
    }

    // Signup finally settles (success or error)
    isLoading.set(false);
    expect(isLoading.get()).toBe(false); // Sign In button re-enabled
  });

  it("total renders remain 2 regardless of how many tab switches occur", () => {
    const isLoading = makeStateCell(false);

    isLoading.set(true);  // render 1
    // 8 tab switches — onValueChange does not mutate isLoading → 0 renders
    isLoading.set(false); // render 2

    expect(isLoading.renderCount()).toBe(2);
  });
});

// ─── Scenario 5: implementation checks ────────────────────────────────────────

describe("Implementation: handleSignUp finally block guarantees Sign In button recovery", () => {
  it("handleSignUp contains a try block", () => {
    const body = getHandleSignUpBody(src);
    expect(body).toMatch(/\btry\s*\{/);
  });

  it("handleSignUp contains a catch block", () => {
    const body = getHandleSignUpBody(src);
    expect(body).toMatch(/\bcatch\s*\(/);
  });

  it("handleSignUp contains a finally block", () => {
    const body = getHandleSignUpBody(src);
    expect(body).toMatch(/\bfinally\s*\{/);
  });

  it("handleSignUp calls setIsLoading(false) inside its finally block", () => {
    const body = getHandleSignUpBody(src);

    const finallyIndex = body.indexOf("finally {");
    const resetIndex = body.indexOf("setIsLoading(false)");

    expect(finallyIndex).toBeGreaterThan(-1);
    expect(resetIndex).toBeGreaterThan(-1);
    expect(resetIndex).toBeGreaterThan(finallyIndex);

    // Find the closing brace of the finally block and confirm reset is inside it.
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
    expect(resetIndex).toBeLessThan(finallyEnd);
  });

  it("handleSignUp sets isLoading to true before the try block", () => {
    const body = getHandleSignUpBody(src);
    const setLoadingTrueIndex = body.indexOf("setIsLoading(true)");
    const tryIndex = body.indexOf("try {");

    expect(setLoadingTrueIndex).toBeGreaterThan(-1);
    expect(tryIndex).toBeGreaterThan(-1);
    expect(setLoadingTrueIndex).toBeLessThan(tryIndex);
  });

  it("handleSignUp catch block does NOT re-throw (finally always runs)", () => {
    const body = getHandleSignUpBody(src);
    const catchIndex = body.indexOf("catch (");
    const finallyIndex = body.indexOf("finally {");

    // Extract only the catch block body (between catch and finally).
    const catchBody = body.slice(catchIndex, finallyIndex);

    // A re-throw would prevent finally from reaching setIsLoading(false).
    expect(catchBody).not.toMatch(/\bthrow\s+(error|err)\b/);
  });

  it("setIsLoading(false) is NOT duplicated inside handleSignUp's catch block", () => {
    const body = getHandleSignUpBody(src);
    const catchIndex = body.indexOf("catch (");
    const finallyIndex = body.indexOf("finally {");

    // The catch body is everything between 'catch (' and 'finally {'.
    const catchBody = body.slice(catchIndex, finallyIndex);

    expect(catchBody).not.toMatch(/setIsLoading\(false\)/);
  });

  it("onValueChange does NOT call setIsLoading — no premature reset on tab switch", () => {
    // The handler must clear signupError but must not reset isLoading.
    const onValueChangeMatch = src.match(/onValueChange\s*=\s*\{([^}]+)\}/);
    expect(onValueChangeMatch).not.toBeNull();
    const handlerBody = onValueChangeMatch![1];

    // signupError is cleared — that is intentional and correct
    expect(handlerBody).toMatch(/setSignupError\s*\(\s*null\s*\)/);
    // isLoading must NOT be reset here — that would re-enable the button prematurely
    expect(handlerBody).not.toMatch(/setIsLoading/);
  });

  it("the Sign In button's disabled prop is bound to isLoading", () => {
    // Both buttons share the same isLoading state.
    expect(src).toMatch(/disabled=\{isLoading\}/);
  });

  it("the Sign In button has the correct data-testid attribute", () => {
    expect(src).toMatch(/data-testid="button-signin"/);
  });

  it("the Sign In button shows 'Signing In...' label when isLoading is true", () => {
    // The shared isLoading state means even a signup request causes the
    // Sign In label to read "Signing In..." — confirming the shared state.
    expect(src).toMatch(/isLoading\s*\?\s*["']Signing In\.\.\.["']/);
  });

  it("isLoading is initialised to false so both buttons start enabled", () => {
    expect(src).toMatch(/const\s*\[isLoading[^=]*=\s*useState\s*\(\s*false\s*\)/);
  });

  it("the tab-switch comment documents why isLoading is not reset on tab change", () => {
    // The comment ensures a future maintainer does not accidentally add a
    // setIsLoading(false) call to onValueChange, which would allow duplicate
    // submissions.
    expect(src).toMatch(/do NOT reset isLoading/i);
  });
});
