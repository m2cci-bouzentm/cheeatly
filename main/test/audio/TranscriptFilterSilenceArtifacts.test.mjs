// Silence-hallucination filter (Jun 11): a quiet mic channel makes Parakeet
// decode noise into stock phrases ("Thank you.") and the dialogue grows
// phantom turns all meeting. Whole-segment artifacts are dropped; the same
// words inside real sentences always survive.
//
// Zero mocks: imports the real compiled module (no electron dependency).
//
// Run: node --test main/test/audio/TranscriptFilterSilenceArtifacts.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const modPath = path.resolve(
  process.cwd(),
  'dist-main/main/services/audio/native/transcriptFilter.js'
);
const { filterTranscript } = await import(pathToFileURL(modPath).href);

test('whole-segment silence artifacts are dropped', () => {
  for (const t of [
    'Thank you.',
    'thank you',
    'THANK YOU!',
    'Thanks for watching.',
    'Bye.',
    'you',
  ]) {
    assert.equal(filterTranscript(t), '', `"${t}" must be dropped`);
  }
});

test('the same words inside real speech survive', () => {
  assert.equal(
    filterTranscript('Thank you for the update on the quarterly numbers.'),
    'Thank you for the update on the quarterly numbers.'
  );
  assert.equal(
    filterTranscript('I will say bye to the team on Friday.'),
    'I will say bye to the team on Friday.'
  );
});

test('filler stripping still works and does not create false artifacts', () => {
  // "um, thank you" → filler removed → "thank you" → whole-segment artifact.
  assert.equal(filterTranscript('um, thank you'), '');
  assert.equal(
    filterTranscript('uh, the budget review is on Friday'),
    'the budget review is on Friday'
  );
});

test('bracketed hallucinations and tags are removed', () => {
  assert.equal(filterTranscript('[BLANK_AUDIO]'), '');
  assert.equal(
    filterTranscript('<tag>noise</tag>The real sentence.'),
    'The real sentence.'
  );
});
