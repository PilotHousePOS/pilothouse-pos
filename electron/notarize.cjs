/**
 * electron/notarize.js
 *
 * afterSign hook called by electron-builder after code-signing the macOS app.
 * Submits the signed .app to Apple's notarization service via `xcrun notarytool`
 * and staples the resulting ticket so Gatekeeper accepts the DMG on any Mac
 * without a security warning.
 *
 * Uses only Node.js built-ins (child_process, fs) — no extra npm packages.
 *
 * Required environment variables (set in CI via GitHub Actions secrets):
 *   APPLE_ID                     — Apple Developer account email address
 *   APPLE_APP_SPECIFIC_PASSWORD  — App-specific password from appleid.apple.com
 *                                  (NOT your Apple ID login password)
 *   APPLE_TEAM_ID                — 10-character Team ID from developer.apple.com
 *
 * The hook is a no-op on non-macOS platforms or when APPLE_ID is not set,
 * so local Windows/Linux builds and unsigned dev builds are unaffected.
 */

'use strict';

const { execSync } = require('child_process');
const path = require('path');

module.exports = async function afterSign(context) {
  const { electronPlatformName, appOutDir, packager } = context;

  // Only notarize on macOS builds
  if (electronPlatformName !== 'darwin') {
    return;
  }

  // Skip gracefully when credentials are absent (e.g. unsigned local dev build)
  const appleId = process.env.APPLE_ID;
  const applePassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !applePassword || !teamId) {
    console.log(
      '[notarize] Skipping — APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID not set.'
    );
    return;
  }

  const appName = packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`[notarize] Zipping ${appPath} for submission…`);
  const zipPath = `${appPath}.zip`;

  // Create a zip of the .app bundle for notarization submission
  execSync(`ditto -c -k --keepParent "${appPath}" "${zipPath}"`, {
    stdio: 'inherit',
  });

  console.log('[notarize] Submitting to Apple notarization service…');

  // Submit and wait for Apple's verdict in one step (--wait blocks until done)
  execSync(
    `xcrun notarytool submit "${zipPath}" ` +
      `--apple-id "${appleId}" ` +
      `--password "${applePassword}" ` +
      `--team-id "${teamId}" ` +
      `--wait`,
    { stdio: 'inherit' }
  );

  // Remove the temporary zip
  execSync(`rm -f "${zipPath}"`);

  console.log('[notarize] Stapling ticket to the app bundle…');

  // Staple the notarization ticket so Gatekeeper can verify offline
  execSync(`xcrun stapler staple "${appPath}"`, { stdio: 'inherit' });

  console.log('[notarize] Done — notarization ticket stapled.');
};
