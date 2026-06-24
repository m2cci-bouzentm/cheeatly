// Unit tests for TranscriptHandler — pure decision logic.
// No Electron, no binary, no mocking needed.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const compiledPath = path.join(
  __dirname,
  '../../../dist-main/main/services/audio/native/TranscriptHandler.js'
);

if (!existsSync(compiledPath)) {
  console.log(
    'SKIP: compiled TranscriptHandler not found — run npm run build:electron first'
  );
  process.exit(0);
}

const { TranscriptHandler } = await import(pathToFileURL(compiledPath).href);

const ACTIVE = {
  isMeetingActive: true,
  isDraining: false,
  micMuted: false,
  systemMuted: false,
};
const DRAINING = {
  isMeetingActive: false,
  isDraining: true,
  micMuted: false,
  systemMuted: false,
};
const INACTIVE = {
  isMeetingActive: false,
  isDraining: false,
  micMuted: false,
  systemMuted: false,
};
const MIC_MUTED = {
  isMeetingActive: true,
  isDraining: false,
  micMuted: true,
  systemMuted: false,
};
const SYS_MUTED = {
  isMeetingActive: true,
  isDraining: false,
  micMuted: false,
  systemMuted: true,
};

function seg(text, isFinal = true, startedAt = undefined) {
  return { text, isFinal, confidence: 0.95, startedAt };
}

// ---------------------------------------------------------------------------
// Meeting active / draining gate
// ---------------------------------------------------------------------------

describe('meeting gate', () => {
  test('drops when meeting inactive and not draining', () => {
    const h = new TranscriptHandler();
    const d = h.process('user', seg('hello'), INACTIVE);
    assert.equal(d.action, 'drop');
    assert.equal(d.reason, 'inactive');
  });

  test('accepts when draining (trailing finals)', () => {
    const h = new TranscriptHandler();
    const d = h.process('user', seg('hello'), DRAINING);
    assert.equal(d.action, 'dispatch');
  });

  test('accepts when meeting active', () => {
    const h = new TranscriptHandler();
    const d = h.process('user', seg('hello'), ACTIVE);
    assert.equal(d.action, 'dispatch');
  });
});

// ---------------------------------------------------------------------------
// Mute filter
// ---------------------------------------------------------------------------

describe('mute filter', () => {
  test('drops user transcript when mic muted', () => {
    const h = new TranscriptHandler();
    const d = h.process('user', seg('hello'), MIC_MUTED);
    assert.equal(d.action, 'drop');
    assert.equal(d.reason, 'muted');
  });

  test('drops interviewer transcript when system muted', () => {
    const h = new TranscriptHandler();
    const d = h.process('interviewer', seg('hello'), SYS_MUTED);
    assert.equal(d.action, 'drop');
    assert.equal(d.reason, 'muted');
  });

  test('passes user transcript when system muted (cross-channel)', () => {
    const h = new TranscriptHandler();
    const d = h.process('user', seg('hello'), SYS_MUTED);
    assert.equal(d.action, 'dispatch');
  });

  test('passes interviewer transcript when mic muted (cross-channel)', () => {
    const h = new TranscriptHandler();
    const d = h.process('interviewer', seg('hello'), MIC_MUTED);
    assert.equal(d.action, 'dispatch');
  });
});

// ---------------------------------------------------------------------------
// Dedup
// ---------------------------------------------------------------------------

describe('dedup', () => {
  test('first final per speaker dispatches', () => {
    const h = new TranscriptHandler();
    const d = h.process('user', seg('hello world'), ACTIVE);
    assert.equal(d.action, 'dispatch');
  });

  test('duplicate consecutive final per speaker is dropped', () => {
    const h = new TranscriptHandler();
    h.process('user', seg('hello world'), ACTIVE);
    const d = h.process('user', seg('hello world'), ACTIVE);
    assert.equal(d.action, 'drop');
    assert.equal(d.reason, 'duplicate');
  });

  test('same text from different speaker is NOT deduplicated', () => {
    const h = new TranscriptHandler();
    h.process('user', seg('hello world'), ACTIVE);
    const d = h.process('interviewer', seg('hello world'), ACTIVE);
    assert.equal(d.action, 'dispatch');
  });

  test('different text after a final is not deduplicated', () => {
    const h = new TranscriptHandler();
    h.process('user', seg('hello'), ACTIVE);
    const d = h.process('user', seg('goodbye'), ACTIVE);
    assert.equal(d.action, 'dispatch');
  });

  test('partials are never deduplicated', () => {
    const h = new TranscriptHandler();
    h.process('user', seg('hello', false), ACTIVE);
    const d = h.process('user', seg('hello', false), ACTIVE);
    assert.equal(d.action, 'dispatch');
  });

  test('reset() clears dedup state', () => {
    const h = new TranscriptHandler();
    h.process('user', seg('hello'), ACTIVE);
    h.reset();
    const d = h.process('user', seg('hello'), ACTIVE);
    assert.equal(d.action, 'dispatch');
  });
});

// ---------------------------------------------------------------------------
// Dispatch shape
// ---------------------------------------------------------------------------

describe('dispatch output', () => {
  test('feedRag is true only for finals', () => {
    const h = new TranscriptHandler();
    const final = h.process('user', seg('hello', true), ACTIVE);
    const partial = h.process('user', seg('hel', false), ACTIVE);
    assert.equal(final.feedRag, true);
    assert.equal(partial.feedRag, false);
  });

  test('timestamp uses startedAt when present', () => {
    const h = new TranscriptHandler();
    const d = h.process('user', seg('hello', true, 12345), ACTIVE);
    assert.equal(d.segment.timestamp, 12345);
  });

  test('timestamp falls back to Date.now() when startedAt absent', () => {
    const h = new TranscriptHandler();
    const before = Date.now();
    const d = h.process('user', seg('hello', true), ACTIVE);
    const after = Date.now();
    assert.ok(d.segment.timestamp >= before && d.segment.timestamp <= after);
  });
});
