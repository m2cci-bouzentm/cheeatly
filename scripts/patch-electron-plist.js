#!/usr/bin/env node
/**
 * patch-electron-plist.js
 *
 * Patches the development Electron.app Info.plist to add the required
 * NSScreenCaptureUsageDescription, NSMicrophoneUsageDescription, and
 * NSAudioCaptureUsageDescription keys.
 *
 * Without NSScreenCaptureUsageDescription in the Info.plist, macOS silently
 * refuses to show the TCC screen recording permission prompt — or grants it
 * under the generic "com.github.Electron" bundle ID, which means the entry
 * is lost the next time electron is reinstalled / node_modules is cleared.
 *
 * Run this script after every `npm install` via `postinstall` in package.json.
 * It is idempotent — safe to run multiple times.
 */

const fs = require('fs');
const path = require('path');

const plistPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'electron',
  'dist',
  'Electron.app',
  'Contents',
  'Info.plist'
);

if (!fs.existsSync(plistPath)) {
  console.log(
    '[patch-electron-plist] Info.plist not found — skipping (non-macOS or missing dist).'
  );
  process.exit(0);
}

let content = fs.readFileSync(plistPath, 'utf8');

let modified = false;

// Patch NSScreenCaptureUsageDescription
const hadScreenCaptureDescription = content.includes(
  'NSScreenCaptureUsageDescription'
);
if (!hadScreenCaptureDescription) {
  content = content.replace(
    '<key>NSMicrophoneUsageDescription</key>',
    '<key>NSScreenCaptureUsageDescription</key>\n\t<string>Cheatly needs Screen Recording permission to capture system audio for meeting transcription.</string>\n\t<key>NSMicrophoneUsageDescription</key>'
  );
  modified = true;
  console.log('[patch-electron-plist] Added NSScreenCaptureUsageDescription.');
}
if (hadScreenCaptureDescription) {
  console.log(
    '[patch-electron-plist] NSScreenCaptureUsageDescription already present — skipping.'
  );
}

// Patch NSAudioCaptureUsageDescription
const hadAudioCaptureDescription = content.includes(
  'NSAudioCaptureUsageDescription'
);
if (!hadAudioCaptureDescription) {
  content = content.replace(
    '<key>NSMicrophoneUsageDescription</key>',
    '<key>NSAudioCaptureUsageDescription</key>\n\t<string>Cheatly needs system audio access to transcribe meeting audio.</string>\n\t<key>NSMicrophoneUsageDescription</key>'
  );
  modified = true;
  console.log('[patch-electron-plist] Added NSAudioCaptureUsageDescription.');
}
if (hadAudioCaptureDescription) {
  console.log(
    '[patch-electron-plist] NSAudioCaptureUsageDescription already present — skipping.'
  );
}

// Patch NSMicrophoneUsageDescription if it has the generic stock text
if (content.includes('This app needs access to the microphone')) {
  content = content.replace(
    '<string>This app needs access to the microphone</string>',
    '<string>Cheatly needs microphone access to transcribe your voice during meetings.</string>'
  );
  modified = true;
  console.log(
    '[patch-electron-plist] Updated NSMicrophoneUsageDescription text.'
  );
}

if (modified) {
  fs.writeFileSync(plistPath, content, 'utf8');
  console.log('[patch-electron-plist] Info.plist patched successfully.');
  process.exit(0);
}
console.log('[patch-electron-plist] No changes needed.');
