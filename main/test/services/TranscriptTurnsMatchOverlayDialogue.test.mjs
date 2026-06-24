// Parity glue — main's segment routing vs the overlay reducer (Jun 11):
//
// Finals-only architecture: both surfaces feed only final segments into
// appendDialogueFinal. Partials go into livePartials (ephemeral state).
// This test extracts the REAL applyTranscriptSegment body, injects the
// REAL reducer, and checks raw STT segment streams land identically.
//
// Zero mocks. Run:
//   node --test main/test/services/TranscriptTurnsMatchOverlayDialogue.test.mjs

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

function loadApplyTranscriptSegment() {
  const sig =
    'public applyTranscriptSegment(segment: TranscriptSegment): void {';
  const start = SRC.indexOf(sig);
  assert.ok(
    start > -1,
    'applyTranscriptSegment not found in MeetingService.ts'
  );
  const bodyStart = start + sig.length;
  const end = SRC.indexOf('\n  }', bodyStart);
  assert.ok(end > bodyStart, 'applyTranscriptSegment body end not found');
  const fn = new Function(
    'appendDialogueFinal',
    'segment',
    SRC.slice(bodyStart, end)
  );
  return (state, segment) => fn.call(state, appendDialogueFinal, segment);
}

const applySegment = loadApplyTranscriptSegment();

// The overlay's useMeetingState folding for the same dispatched payloads.
function overlayFold(segments) {
  let turns = [];
  const livePartials = { Me: null, Them: null };
  for (const s of segments) {
    const label = s.speaker === 'interviewer' ? 'Them' : 'Me';
    if (s.final) {
      turns = appendDialogueFinal(turns, label, s.text);
      livePartials[label] = null;
    } else {
      livePartials[label] = s.text.trim();
    }
  }
  return { turns, livePartials };
}

function mainFold(segments) {
  const state = {
    dialogueTurns: [],
    livePartials: { Me: null, Them: null },
  };
  for (const s of segments) applySegment(state, s);
  return { turns: state.dialogueTurns, livePartials: state.livePartials };
}

const seg = (speaker, text, final) => ({
  speaker,
  text,
  timestamp: 0,
  final,
  confidence: 1,
});

test('finals-only: alternating speakers', () => {
  const segments = [
    seg('user', 'Hello', true),
    seg('interviewer', 'Hi there', true),
    seg('user', 'How are you', true),
  ];
  const main = mainFold(segments);
  const overlay = overlayFold(segments);
  assert.deepEqual(main.turns, overlay.turns);
  assert.deepEqual(
    main.turns.map((t) => `${t.speaker}: ${t.text}`),
    ['Me: Hello', 'Them: Hi there', 'Me: How are you']
  );
});

test('partials go to livePartials, not dialogueTurns', () => {
  const segments = [
    seg('user', 'Thank you.', false),
    seg('interviewer', 'The quarterly revenue target is', false),
  ];
  const main = mainFold(segments);
  assert.equal(main.turns.length, 0, 'No finals = no turns');
  assert.equal(main.livePartials.Me, 'Thank you.');
  assert.equal(main.livePartials.Them, 'The quarterly revenue target is');
});

test('final clears livePartial for that speaker', () => {
  const segments = [
    seg('interviewer', 'The target is', false),
    seg('interviewer', 'The target is two million.', true),
  ];
  const main = mainFold(segments);
  assert.equal(main.turns.length, 1);
  assert.equal(main.livePartials.Them, null);
});

test('starvation: partial then drain commit', () => {
  const segments = [
    seg('user', 'Thank you.', false),
    seg('interviewer', 'The quarterly revenue target is $2 million.', false),
    seg(
      'interviewer',
      'The quarterly revenue target is $2 million, and the review is Friday.',
      true
    ),
    seg('user', 'Thank you.', true),
  ];
  const main = mainFold(segments);
  const overlay = overlayFold(segments);
  assert.deepEqual(main.turns, overlay.turns);
  assert.deepEqual(
    main.turns.map((t) => `${t.speaker}: ${t.text}`),
    [
      'Them: The quarterly revenue target is $2 million, and the review is Friday.',
      'Me: Thank you.',
    ]
  );
});

test('fuzz: 300 random segment streams fold identically on both surfaces', () => {
  let state = 1337;
  const rand = (n) => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state % n;
  };
  const speakers = ['interviewer', 'user'];
  const words = ['alpha', 'bravo', 'charlie', 'delta', '', '  '];

  for (let run = 0; run < 300; run++) {
    const count = 1 + rand(14);
    const segments = Array.from({ length: count }, () =>
      seg(
        speakers[rand(2)],
        Array.from(
          { length: 1 + rand(5) },
          () => words[rand(words.length)]
        ).join(' '),
        rand(3) > 0 ? rand(2) === 1 : false
      )
    );
    const main = mainFold(segments);
    const overlay = overlayFold(segments);
    assert.deepEqual(
      main.turns,
      overlay.turns,
      `run ${run} turns diverged for: ${JSON.stringify(segments)}`
    );
  }
});
