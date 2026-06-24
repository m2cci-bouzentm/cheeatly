// IPC channel parity contract — zero mocks, pure source analysis.
//
// Regression guard: preload-exposed channels must have matching main-process
// registrations, otherwise renderer calls fail at runtime with "No handler
// registered". This test fails the build whenever any channel the preload
// invokes/sends has no matching ipcMain registration in the main process.
//
// Run: node --test main/ipc/__tests__/ChannelParity.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAIN_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKIP_DIRS = new Set(['__tests__', 'test', 'node_modules']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const isDirectory = statSync(full).isDirectory();
    if (isDirectory && SKIP_DIRS.has(entry)) continue;
    if (isDirectory) walk(full, out);
    const isSourceTs = entry.endsWith('.ts') && !entry.endsWith('.d.ts');
    if (!isDirectory && isSourceTs) {
      out.push(full);
    }
  }
  return out;
}

function collect(files, regexes) {
  const channels = new Map(); // channel -> first file seen
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const regex of regexes) {
      for (const match of src.matchAll(regex)) {
        if (!channels.has(match[1])) channels.set(match[1], file);
      }
    }
  }
  return channels;
}

const allFiles = walk(MAIN_DIR);
const preloadFiles = allFiles.filter((f) => f.includes('/preload'));

// What the renderer can reach via the preload bridge.
const invoked = collect(preloadFiles, [
  /ipcRenderer\.invoke\(\s*['"]([^'"]+)['"]/g,
  /\binvoke\(\s*['"]([^'"]+)['"]/g,
]);
const sent = collect(preloadFiles, [
  /ipcRenderer\.send\(\s*['"]([^'"]+)['"]/g,
]);

// What the main process actually registers. registerStealthHandler is
// main.ts's removeHandler-then-handle wrapper for the CGEventTap channels.
const handled = collect(allFiles, [
  /safeHandle\(\s*['"]([^'"]+)['"]/g,
  /ipcMain\.handle\(\s*['"]([^'"]+)['"]/g,
  /registerStealthHandler\(\s*['"]([^'"]+)['"]/g,
]);
const listened = collect(allFiles, [
  /safeOn\(\s*['"]([^'"]+)['"]/g,
  /ipcMain\.on\(\s*['"]([^'"]+)['"]/g,
]);

test('every preload ipcRenderer.invoke channel has an ipcMain handler', () => {
  const missing = [...invoked.keys()].filter((ch) => !handled.has(ch));
  assert.deepEqual(
    missing.map(
      (ch) => `${ch} (invoked in ${invoked.get(ch).replace(MAIN_DIR, 'main')})`
    ),
    [],
    'Channels invoked by the preload with no main-process handler'
  );
});

test('every preload ipcRenderer.send channel has an ipcMain listener', () => {
  const missing = [...sent.keys()].filter(
    (ch) => !listened.has(ch) && !handled.has(ch)
  );
  assert.deepEqual(
    missing.map(
      (ch) => `${ch} (sent in ${sent.get(ch).replace(MAIN_DIR, 'main')})`
    ),
    [],
    'Channels sent by the preload with no main-process listener'
  );
});

test('sanity: source scan found channels on both sides', () => {
  assert.ok(
    invoked.size > 10,
    `expected >10 invoked channels, got ${invoked.size}`
  );
  assert.ok(
    handled.size > 10,
    `expected >10 handled channels, got ${handled.size}`
  );
});
