import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('application services and capture worker do not depend on desktop host', () => {
  for (const file of [
    'events.rs',
    'meetings/service.rs',
    'meetings/models.rs',
    'meetings/summary.rs',
    'assistant/service.rs',
    'assistant/questions.rs',
    'assistant/intelligence.rs',
    'context/service.rs',
    'skills/service.rs',
    'transcription/service.rs',
    'transcription/session.rs',
    'transcription/local_coreml.rs',
  ]) {
    const code = readFileSync(
      new URL(`../../../src-tauri/src/${file}`, import.meta.url),
      'utf8'
    );
    assert.doesNotMatch(
      code,
      /tauri::|AppHandle|AppState|crate::.*commands/,
      file
    );
  }
});
