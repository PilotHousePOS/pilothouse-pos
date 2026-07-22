---
name: iOS scanner context
description: How the iOS app runs and what that means for the barcode scanner
---

## What the iOS "app" actually is
The PilotHouse iOS app is published on the App Store as a **WKWebView wrapper** (likely PWABuilder or similar). It is NOT a Safari PWA added to home screen.

## Diagnostic data (confirmed from deployment logs, iOS 18.7)
- `navigator.standalone` = **false** (0) — WKWebView apps never set this; standalone detection is useless here
- `navigator.mediaDevices` = **undefined** — WKWebView does not expose the camera API to web pages by default
- `isSecureContext` = true
- `window.top === window` = true (not in an iframe)
- iOS version in UA: `18.7` (user said "26.5" — they likely misread; UA is the ground truth)

## What works / doesn't work for camera in WKWebView

| Approach | Result |
|---|---|
| `navigator.mediaDevices.getUserMedia()` | Fails — mediaDevices is undefined |
| `<input type="file" capture="environment">` | Crashes / reloads the WebView |
| `<input type="file" accept="image/*">` (no capture) | **Shows iOS native photo picker — does NOT crash** |
| Safari link `window.open()` / `<a target="_blank">` | Redirected back into the app by iOS PWA domain capture |

## Correct fallback for iOS scanner
Use `<input type="file" accept="image/*">` **without** the `capture` attribute.
- Shows iOS action sheet: "Take Photo or Video", "Photo Library", "Files"
- User taps "Take Photo or Video" → camera opens as a sheet, WKWebView stays alive
- `onChange` fires with the captured image file
- ZXing (`BrowserMultiFormatReader.decodeFromImageUrl`) decodes the barcode from the photo

**Why:** `capture="environment"` launches the system camera app as a separate process, which suspends/kills the WKWebView. No `capture` uses the in-process iOS file picker which keeps the WebView alive.

## CSP additions needed for camera streaming
Added `media-src 'self' blob:` and `worker-src 'self' blob:` to CSP in server/index.ts for future getUserMedia support if the WKWebView wrapper is ever updated to grant camera API access.
