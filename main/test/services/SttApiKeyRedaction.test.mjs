// ISSUE 1 (P0): raw STT API keys must never reach the renderer.
// Contract: get-stored-credentials returns NO STT key material (the only
// STT engine is local), and the renderer has no STT key plumbing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readIpcDomainSource, sliceSafeHandleBlock } from './ipcTestUtils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('get-stored-credentials returns no STT key material at all', () => {
  const source = readIpcDomainSource('provider');
  const handler = sliceSafeHandleBlock(source, 'get-stored-credentials');

  // No raw access to any cloud STT credential field (the fields are deleted;
  // this guards against them sneaking back in).
  assert.doesNotMatch(
    handler,
    /creds\.(groqSttApiKey|openAiSttApiKey|deepgramApiKey|elevenLabsApiKey|azureApiKey|ibmWatsonApiKey|sonioxApiKey)/,
    'get-stored-credentials must not read cloud STT credential fields'
  );

  // No stt*Key payload fields — masked or otherwise. Provider id only.
  assert.doesNotMatch(
    handler,
    /stt\w*Key\s*:/i,
    'get-stored-credentials must not return any STT key field (masked or raw)'
  );

  // The only STT data the renderer needs: which provider is active.
  assert.match(handler, /sttProvider:/);
});

test('renderer audio settings have no STT key plumbing', () => {
  const audioTab = read('renderer/pages/Settings/tabs/AudioTab.tsx');
  const hook = read('renderer/pages/Settings/useAudioSettings.ts');

  for (const src of [audioTab, hook]) {
    assert.doesNotMatch(
      src,
      /stt\w*Key/i,
      'no STT key state/fields in renderer settings'
    );
    assert.doesNotMatch(
      src,
      /hasStored\w*Key/,
      'no stored-key presence flags for STT'
    );
  }

  // The provider picker is the only STT control left.
  assert.match(hook, /'none' \| 'local-parakeet'/);
});
