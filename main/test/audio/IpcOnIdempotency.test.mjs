import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readIpcSource } from '../services/ipcTestUtils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const safeHandleSource = readFileSync(
  path.resolve(__dirname, '../../ipc/safeHandle.ts'),
  'utf8'
);
const ipcSource = readIpcSource();

test('send-style IPC registrations use safeOn to avoid listener accumulation', () => {
  assert.ok(
    /ipcMain\.removeAllListeners\s*\(\s*channel\s*\)/.test(safeHandleSource) &&
      /ipcMain\.on\s*\(\s*channel\s*,\s*listener\s*\)/.test(safeHandleSource),
    'BUG: safeOn must remove old listeners before registering ipcMain.on channels.'
  );

  for (const channel of ['forward-log-to-file', 'interface-theme:set']) {
    assert.ok(
      new RegExp(`safeOn\\s*\\(\\s*['"]${channel}['"]`).test(ipcSource),
      `BUG: ${channel} must be registered through safeOn, not raw ipcMain.on.`
    );
    assert.ok(
      !new RegExp(`ipcMain\\.on\\s*\\(\\s*['"]${channel}['"]`).test(ipcSource),
      `BUG: ${channel} raw ipcMain.on registration would accumulate listeners on re-init.`
    );
  }
});
