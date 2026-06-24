// Regression — mid-meeting intelligence starvation (Jun 11):
//
// The local STT engine can hold an ENTIRE utterance as a live partial and
// commit nothing until the end-meeting drain. getTranscriptText() must
// include live partials so "What to answer?" never returns empty while the
// overlay visibly shows words.
//
// Finals-only architecture: dialogueTurns stores only committed finals.
// Live partials live in a separate livePartials object. getTranscriptText()
// appends livePartials entries after the finals.
//
// Zero mocks: runs the real getTranscriptText() body extracted from
// MeetingService.ts against real state.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendDialogueFinal } from '../../../renderer/lib/dialogueTranscript.ts';

const SRC = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'services',
    'meeting',
    'MeetingService.ts'
  ),
  'utf8'
);

function loadGetTranscriptText() {
  const sig = 'public getTranscriptText(): string {';
  const start = SRC.indexOf(sig);
  assert.ok(start > -1, 'getTranscriptText not found in MeetingService.ts');
  const bodyStart = start + sig.length;
  const end = SRC.indexOf('\n  }', bodyStart);
  assert.ok(end > bodyStart, 'getTranscriptText body end not found');
  const fn = new Function(SRC.slice(bodyStart, end));
  return (state) => fn.call(state);
}

const getTranscriptText = loadGetTranscriptText();

test('finals format as Me/Them lines', () => {
  let turns = [];
  turns = appendDialogueFinal(turns, 'Me', 'hello there');
  turns = appendDialogueFinal(turns, 'Them', 'hi back');
  const text = getTranscriptText({
    dialogueTurns: turns,
    livePartials: { Me: null, Them: null },
  });
  assert.equal(text, 'Me: hello there\nThem: hi back');
});

test('live partials append after finals', () => {
  let turns = [];
  turns = appendDialogueFinal(turns, 'Me', 'first final');
  const text = getTranscriptText({
    dialogueTurns: turns,
    livePartials: { Me: null, Them: 'still being said' },
  });
  assert.equal(text, 'Me: first final\nThem: still being said');
});

test('REGRESSION: zero finals + live partial → fallback is NOT empty', () => {
  const text = getTranscriptText({
    dialogueTurns: [],
    livePartials: {
      Me: null,
      Them: 'The quarterly revenue target is two million dollars',
    },
  });
  assert.equal(
    text,
    'Them: The quarterly revenue target is two million dollars'
  );
});

test('no speech at all → empty string (backstop still reachable)', () => {
  assert.equal(
    getTranscriptText({
      dialogueTurns: [],
      livePartials: { Me: null, Them: null },
    }),
    ''
  );
});

test('consecutive same-speaker finals fold into one dialogue line', () => {
  let turns = [];
  turns = appendDialogueFinal(turns, 'Them', 'The quarterly revenue target');
  turns = appendDialogueFinal(turns, 'Them', 'is two million dollars.');
  turns = appendDialogueFinal(turns, 'Me', 'Got it.');
  const text = getTranscriptText({
    dialogueTurns: turns,
    livePartials: { Me: null, Them: null },
  });
  assert.equal(
    text,
    'Them: The quarterly revenue target is two million dollars.\nMe: Got it.'
  );
});
