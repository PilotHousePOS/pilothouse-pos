# Gatekeeper Smoke-Test — macOS DMG Pre-Release Checklist

**Purpose:** Confirm the notarized DMG passes Gatekeeper silently on a fresh Mac
before distributing the app to staff.  Run this procedure before every first-time
staff release and after any code-signing or notarization change.

---

## What CI already verifies automatically

Every `v*` tag push triggers `.github/workflows/build-electron.yml`, which:

| Step | Tool | What it catches |
|---|---|---|
| Certificate not expired | `openssl x509` | Cert within 30 days of expiry → build aborts |
| Code signature valid | `codesign --verify --deep --strict` | Broken cert chain, missing entitlements |
| Notarization ticket stapled | `xcrun stapler validate` | Apple rejected submission or stapler failed |
| Gatekeeper accepts the app | `spctl --assess --type execute` | Would fail on any clean Mac |

A green CI run on the macOS job is **necessary but not sufficient** — CI runs on a
GitHub-hosted runner whose Gatekeeper state is known.  The manual test below
confirms the DMG behaves correctly on a machine that has never seen the app.

---

## Pre-requisites

- A Mac running macOS 13 Ventura or later that has **never** opened this app
  (a fresh VM snapshot works equally well)
- System Preferences → Privacy & Security set to **"App Store and identified
  developers"** (the default — do **not** change it to "Anywhere")
- Internet access (Gatekeeper phones home for OCSP checks on first launch)

---

## Step-by-step procedure

### 1. Trigger the CI build

```bash
# On your development machine, create and push a pre-release tag
git tag v1.0.0-rc1
git push origin v1.0.0-rc1
```

Wait for both the **macOS installer** and **Windows installer** jobs to turn green
in GitHub Actions.  A red macOS job means CI caught a signing or notarization
problem — fix it before continuing.

### 2. Download the DMG

1. Go to the GitHub repository → **Releases**
2. Find the draft release created by the tag push
3. Download **both** DMG assets:
   - `PilotHouse POS-x.y.z.dmg`  (Intel x64)
   - `PilotHouse POS-x.y.z-arm64.dmg`  (Apple Silicon)

> Test on the architecture that matches your Mac.  If you have an Apple Silicon
> Mac, test the `-arm64` DMG.  If you have an Intel Mac, test the x64 DMG.

### 3. Mount and open the DMG

Double-click the DMG in Finder.

**Pass:** The DMG mounts immediately and the drag-to-Applications window appears.
No security dialog, no "Apple cannot check it for malicious software" sheet.

**Fail:** Any of these messages indicates a signing or notarization problem:

> "PilotHouse POS.dmg" can't be opened because Apple cannot check it for
> malicious software.

> "PilotHouse POS.dmg" cannot be opened because the developer cannot be
> verified.

If you see either message, do **not** bypass it with Ctrl-click → Open.  Instead,
investigate — see [Troubleshooting](#troubleshooting) below.

### 4. Install and launch the app

1. Drag **PilotHouse POS** to the **Applications** folder
2. Open it from Applications (first launch — Gatekeeper scans it)

**Pass:** The app opens directly.  The macOS spinner may appear briefly while
Gatekeeper performs its online check, but no user-facing security dialog appears.

**Fail:** A dialog appears asking you to confirm you want to open software from
an identified developer.  This means the notarization ticket was not stapled
correctly.  A properly notarized and stapled app opens silently even on first
launch.

### 5. Confirm server connectivity

After the app opens:

1. The login screen appears (not a blank page, not a connection-error banner)
2. Log in with a valid staff account
3. Navigate to POS → confirm the tab loads

**Pass:** All three points above are true.

**Fail:** A "Server unreachable — reconnecting…" banner appears or the login
screen fails to load.  Check that `PILOTHOUSE_SERVER_URL` was set correctly in
GitHub Secrets before the build.

---

## Recording results

After each pre-release smoke test, add a row to the table below.  Keep the most
recent 10 entries; archive older ones to `docs/gatekeeper-smoke-test-archive.md`.

| Date | Version | macOS version | Architecture | DMG opens | App launches | Login works | Tester | Notes |
|------|---------|---------------|-------------|-----------|--------------|------------|--------|-------|
| _first test pending_ | | | | | | | | |

---

## Troubleshooting

### "Apple cannot check it for malicious software"

The DMG (or the `.app` inside it) was not notarized, or the notarization ticket
was not stapled.  Check the CI log for the **"Package, sign, notarize, and publish
macOS DMG"** step and look for errors from `xcrun notarytool submit`.

To diagnose locally after downloading the DMG:

```bash
# Mount the DMG
hdiutil attach "PilotHouse POS-x.y.z.dmg" -mountpoint /Volumes/PilotHouse

# Check the staple ticket
xcrun stapler validate /Volumes/PilotHouse/PilotHouse\ POS.app

# Check the code signature
codesign --verify --deep --strict --verbose=2 /Volumes/PilotHouse/PilotHouse\ POS.app

# Check Gatekeeper's view
spctl --assess --type execute --verbose /Volumes/PilotHouse/PilotHouse\ POS.app

hdiutil detach /Volumes/PilotHouse
```

### "developer cannot be verified"

The signing certificate is either expired, revoked, or is not a **Developer ID
Application** certificate (it may be a Mac App Store Distribution or a
Development certificate instead).  Verify the certificate in
`APPLE_CERTIFICATE`:

```bash
# Decode and inspect the certificate
echo "$APPLE_CERTIFICATE" | base64 -D | openssl pkcs12 \
  -nokeys -passin pass:"$APPLE_CERTIFICATE_PASSWORD" | \
  openssl x509 -noout -subject -issuer -enddate
```

The subject must contain `Developer ID Application:` and the issuer must be
`Apple Inc.`.

### notarytool returns "Invalid" or "Rejected"

Run locally to fetch the full log:

```bash
xcrun notarytool log <submission-id> \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD" \
  --team-id "$APPLE_TEAM_ID"
```

Common causes:
- Missing or incorrect entitlements for hardened runtime (check
  `electron/entitlements.mac.plist`)
- Binary contains unsigned embedded content — rebuild with
  `buildDependenciesFromSource: true` in `electron-builder.yml`

### App shows "Server unreachable" on launch

The `PILOTHOUSE_SERVER_URL` secret was not set in GitHub Secrets before the
build, so the app defaulted to `https://pilothouse.replit.app`.  Verify in CI
logs that the **"Verify SERVER_URL is baked into compiled env-constants.js"**
step printed the correct URL.
