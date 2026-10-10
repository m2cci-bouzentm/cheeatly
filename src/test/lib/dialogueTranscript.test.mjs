import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendDialogueFinal } from '../../lib/dialogueTranscript.ts';

test('finals from alternating speakers create alternating turns', () => {
  let t = [];
  t = appendDialogueFinal(t, 'Me', 'hello there');
  t = appendDialogueFinal(t, 'Them', 'hi, how are you?');
  t = appendDialogueFinal(t, 'Me', 'great thanks');
  assert.deepEqual(t, [
    { speaker: 'Me', text: 'hello there' },
    { speaker: 'Them', text: 'hi, how are you?' },
    { speaker: 'Me', text: 'great thanks' },
  ]);
});

test('alternating same-text finals stay distinct turns', () => {
  let t = [];
  t = appendDialogueFinal(t, 'Me', 'yes');
  t = appendDialogueFinal(t, 'Them', 'go on');
  t = appendDialogueFinal(t, 'Me', 'yes');
  assert.deepEqual(t, [
    { speaker: 'Me', text: 'yes' },
    { speaker: 'Them', text: 'go on' },
    { speaker: 'Me', text: 'yes' },
  ]);
});

test('consecutive same-speaker finals merge into one bubble', () => {
  let t = [];
  t = appendDialogueFinal(t, 'Them', 'The revenue target is two million.');
  t = appendDialogueFinal(t, 'Them', 'The review is on Friday.');
  assert.equal(t.length, 1);
  assert.equal(
    t[0].text,
    'The revenue target is two million. The review is on Friday.'
  );
});

test('exact duplicate final from same speaker is dropped', () => {
  let t = [];
  t = appendDialogueFinal(t, 'Me', 'hello');
  const t2 = appendDialogueFinal(t, 'Me', 'hello');
  assert.equal(t2, t);
});

test('same text from different speakers is NOT deduplicated', () => {
  let t = [];
  t = appendDialogueFinal(t, 'Me', 'hello');
  t = appendDialogueFinal(t, 'Them', 'hello');
  assert.equal(t.length, 2);
});

test('inputs are not mutated (new arrays returned)', () => {
  const t0 = [{ speaker: 'Me', text: 'a' }];
  const t1 = appendDialogueFinal(t0, 'Me', 'b');
  assert.deepEqual(t0, [{ speaker: 'Me', text: 'a' }]);
  assert.notEqual(t0, t1);
});

test('empty/whitespace text is a no-op', () => {
  const t0 = [{ speaker: 'Me', text: 'a' }];
  assert.equal(appendDialogueFinal(t0, 'Them', '   '), t0);
  assert.equal(appendDialogueFinal(t0, 'Them', ''), t0);
});
