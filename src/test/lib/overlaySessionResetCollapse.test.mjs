// Regression test: a session reset must start the next meeting from a clean overlay without hiding it.
//
// resetSessionUi clears the thread (messages, answer variants) and returns to the Chat view through
// clearConversation (shared with Reset session), then resets suggestions. It must not hide the panels:
// a new meeting has to show its overlay immediately.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  path.resolve(__dirname, '../../pages/AssistantOverlay/index.tsx'),
  'utf8'
);
const resetStart = source.indexOf('const resetSessionUi = useCallback');
const body = source.slice(resetStart, source.indexOf('}, [', resetStart));
const clearStart = source.indexOf('const clearConversation = useCallback');
const clearBody = source.slice(clearStart, source.indexOf('}, [', clearStart));

test('resetSessionUi clears the thread and returns to Chat', () => {
  assert.ok(resetStart >= 0, 'resetSessionUi callback must exist');
  assert.ok(clearStart >= 0, 'clearConversation callback must exist');
  assert.match(body, /clearConversation\(\)/, 'must clear the conversation');
  assert.match(clearBody, /setMessages\(\[\]\)/, 'must clear the chat thread');
  assert.match(clearBody, /setVariants\(\{\}\)/, 'must drop Shorter / Another angle variants');
  assert.match(clearBody, /setView\('chat'\)/, 'must return to the Chat view');
  assert.match(body, /resetQuestionsRef\.current\(\)/, 'must reset suggestions');
  assert.match(source, /onSessionReset:\s*resetSessionUi/, 'must be wired as the onSessionReset handler');
});

test('resetSessionUi does NOT hide the panels', () => {
  assert.ok(
    !/setIsExpanded\(\s*false\s*\)/.test(body + clearBody),
    'resetSessionUi must NOT call setIsExpanded(false), that hides the panels'
  );
});
