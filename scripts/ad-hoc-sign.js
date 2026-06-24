const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

// ─── Helper Disguise Configuration ───
// Display name used for helper processes in Activity Monitor
const DISGUISE_BASE = 'CoreServices';

const HELPER_SUFFIXES = ['', ' (GPU)', ' (Renderer)', ' (Plugin)'];

/**
 * Update the display names inside each helper's Info.plist so Activity Monitor
 * shows "CoreServices Helper" instead of "Cheatly Helper".
 *
 * IMPORTANT: We only modify CFBundleDisplayName and CFBundleName.
 * We do NOT rename the .app folders or the executable binaries — doing so
 * would break Electron's internal process spawning (Chromium hardcodes the
 * helper paths based on productName).
 */
function disguiseHelperPlists(appOutDir, appName) {
  const frameworksDir = path.join(
    appOutDir,
    `${appName}.app`,
    'Contents',
    'Frameworks'
  );

  if (!fs.existsSync(frameworksDir)) {
    console.log('[Helper Disguise] Frameworks directory not found, skipping.');
    return;
  }

  for (const suffix of HELPER_SUFFIXES) {
    const helperName = `${appName} Helper${suffix}`;
    const disguisedName = `${DISGUISE_BASE} Helper${suffix}`;
    const helperAppPath = path.join(frameworksDir, `${helperName}.app`);
    const plistPath = path.join(helperAppPath, 'Contents', 'Info.plist');

    if (!fs.existsSync(plistPath)) {
      console.log(`[Helper Disguise] Skipping (not found): ${helperName}.app`);
      continue;
    }

    console.log(
      `[Helper Disguise] ${helperName} → display as "${disguisedName}"`
    );

    try {
      // Update CFBundleDisplayName (Activity Monitor display)
      execSync(
        `/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName '${disguisedName}'" "${plistPath}"`,
        { stdio: 'pipe' }
      );
      // Update CFBundleName (Dock / menu bar fallback)
      execSync(
        `/usr/libexec/PlistBuddy -c "Set :CFBundleName '${disguisedName}'" "${plistPath}"`,
        { stdio: 'pipe' }
      );
    } catch (err) {
      console.warn(
        `[Helper Disguise] PlistBuddy warning for ${helperName}:`,
        err.message
      );
    }
  }

  console.log('[Helper Disguise] All helper plists updated successfully.');
}

exports.default = async function (context) {
  // Only process on macOS
  if (process.platform !== 'darwin') {
    return;
  }

  const appOutDir = context.appOutDir;
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  // ── Step 1: Disguise helper display names (before signing) ──
  // This MUST run regardless of the signing path: it edits helper Info.plist
  // display names, and afterPack runs BEFORE electron-builder's own signing,
  // so a later Developer ID signature will cover these edits correctly.
  try {
    disguiseHelperPlists(appOutDir, appName);
  } catch (error) {
    console.error('[Helper Disguise] Failed to update helper plists:', error);
    // Non-fatal: continue to signing
  }

  // ── Production guard: never ad-hoc sign when a real Developer ID identity is configured ──
  // When CSC_LINK / CSC_NAME / CHEATLY_SIGN_IDENTITY is present, electron-builder performs
  // proper inside-out Developer ID signing with the entitlements + hardened runtime declared
  // in package.json, and electron-builder's built-in mac.notarize notarizes + staples.
  // Running `codesign --sign -` here would clobber that real signature with an ad-hoc one,
  // which can never be notarized — so we skip the ad-hoc step entirely in that case.
  const hasRealIdentity = !!(
    process.env.CHEATLY_PRODUCTION_SIGN === '1' || // set by electron-builder.signed.cjs
    process.env.CSC_LINK ||
    process.env.CSC_NAME ||
    process.env.CHEATLY_SIGN_IDENTITY
  );
  if (hasRealIdentity) {
    console.log(
      '[Ad-Hoc Signing] Developer ID identity detected (CSC_LINK/CSC_NAME/CHEATLY_SIGN_IDENTITY) — ' +
        'skipping ad-hoc signing. electron-builder will sign with Developer ID; afterSign will notarize.'
    );
    return;
  }

  // Optional: shape the ad-hoc build like a hardened-runtime build for local TCC testing.
  // Off by default because a hardened-runtime ad-hoc build has stricter launch requirements
  // that cannot be fully verified without a real signing identity. Set CHEATLY_ADHOC_HARDENED=1
  // to opt in when testing entitlement/permission behavior locally.
  const hardenedOpt =
    process.env.CHEATLY_ADHOC_HARDENED === '1' ? '--options runtime ' : '';

  // Optional: sign with a STABLE local identity instead of ad-hoc ('-').
  // Ad-hoc signatures change on every rebuild, so macOS Keychain treats each
  // install as a different app — safeStorage then prompts for the login
  // keychain password on every launch and "Always Allow" never sticks.
  // Create a self-signed code-signing cert once (Keychain Access → Certificate
  // Assistant → Create a Certificate → name "Cheatly Dev", type Code Signing)
  // and set CHEATLY_LOCAL_SIGN_IDENTITY="Cheatly Dev" to keep the identity
  // stable across rebuilds. (Distinct from CHEATLY_SIGN_IDENTITY above,
  // which marks a real Developer ID and skips this script entirely.)
  const signIdentity = process.env.CHEATLY_LOCAL_SIGN_IDENTITY || '-';
  if (signIdentity !== '-') {
    console.log(
      `[Ad-Hoc Signing] Using stable local identity: ${signIdentity}`
    );
  }

  // ── Step 2: Ad-hoc sign the application (DEV / local distribution only) ──
  const entitlementsPath = path.join(
    context.packager.info.projectDir,
    'build',
    'entitlements.mac.plist'
  );
  const entitlementsOpt = fs.existsSync(entitlementsPath)
    ? `--entitlements "${entitlementsPath}" `
    : '';

  // ── Step 2a: Sign the main app bundle with --deep first ──
  // --deep recurses into nested Mach-O binaries (frameworks, helpers, .node files).
  // It signs them with --sign - only (no custom entitlements on nested items).
  // We MUST do this before signing the .node files with entitlements, because
  // --deep would otherwise overwrite the entitlement-signed .node files.
  console.log(
    `[Ad-Hoc Signing] Signing main app ${appPath}${entitlementsOpt ? ' with entitlements' : ''}...`
  );

  try {
    // --force: replace existing signature
    // --deep: sign nested code (frameworks, helpers, .dylib, .node)
    // --sign -: ad-hoc signature
    execSync(
      `codesign --force --deep ${hardenedOpt}${entitlementsOpt}--sign "${signIdentity}" "${appPath}"`,
      { stdio: 'inherit' }
    );
    console.log('[Ad-Hoc Signing] Successfully signed the application.');
  } catch (error) {
    console.error('[Ad-Hoc Signing] Failed to sign the application:', error);
    throw error;
  }

  // ── Step 2b: Re-sign .node binaries with entitlements AFTER --deep ──
  // codesign --deep re-signs nested .node binaries without entitlements (it only
  // applies entitlements to the top-level item). We re-sign them here AFTER --deep
  // so the entitlements (JIT / library-validation) are preserved on the native
  // module binary. (Screen/system-audio access is pure TCC — no entitlement.)
  const unpackedNativeDir = path.join(
    appPath,
    'Contents',
    'Resources',
    'app.asar.unpacked',
    'platform-bridge'
  );
  if (!fs.existsSync(unpackedNativeDir)) return;
  const files = fs.readdirSync(unpackedNativeDir);
  for (const file of files) {
    if (!file.endsWith('.node')) continue;
    const nodePath = path.join(unpackedNativeDir, file);
    console.log(
      `[Ad-Hoc Signing] Re-signing ${file}${entitlementsOpt ? ' with entitlements' : ''} (post --deep)...`
    );
    try {
      execSync(
        `codesign --force ${hardenedOpt}${entitlementsOpt}--sign "${signIdentity}" "${nodePath}"`,
        { stdio: 'inherit' }
      );
    } catch (error) {
      console.error(`[Ad-Hoc Signing] Failed to sign ${file}:`, error);
    }
  }
};
