---
name: iOS PWA camera access bug
description: navigator.mediaDevices is undefined when the app is launched from iOS home screen (PWA mode), even over HTTPS.
---

## Rule
Always guard `navigator.mediaDevices` with a null check and fall back to `navigator.webkitGetUserMedia` on iOS.

**Why:** WebKit bug #185448 — `navigator.mediaDevices` is undefined in iOS PWA standalone mode. Direct property access throws "undefined is not an object" before getUserMedia is even called. This affects any feature using getUserMedia on iOS PWAs, not just the barcode scanner.

**How to apply:**
```ts
const md = navigator.mediaDevices;
if (md?.getUserMedia) {
  return await md.getUserMedia(constraints);
}
// Fallback
const legacyGUM = (navigator as any).getUserMedia ||
                  (navigator as any).webkitGetUserMedia;
if (!legacyGUM) throw new Error("Camera not available");
return new Promise((resolve, reject) =>
  legacyGUM.call(navigator, constraints, resolve, reject)
);
```
