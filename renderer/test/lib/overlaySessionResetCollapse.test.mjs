// Regression test: overlay must collapse shell width on session reset.
//
// resetSessionUi calls resetShellWidth which does shellWidth.set(SHELL_WIDTH_COLLAPSED).
// Without this, the previous meeting's expanded width shows on the first frame of the new meeting.

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

test('resetSessionUi calls resetShellWidth to collapse width on session reset', () => {
  assert.match(
    source,
    /const resetShellWidth = useCallback\(\(\) => \{/,
    'resetShellWidth callback must exist'
  );
  assert.match(
    source,
    /shellWidth\.set\(\s*SHELL_WIDTH_COLLAPSED\s*\)/,
    'resetShellWidth must imperatively set shellWidth to SHELL_WIDTH_COLLAPSED'
  );
  assert.match(
    source,
    /const resetSessionUi = useCallback\(\(\) => \{/,
    'resetSessionUi callback must exist'
  );
  assert.match(
    source,
    /resetShellWidth\(\)/,
    'resetSessionUi must call resetShellWidth()'
  );
  assert.match(
    source,
    /onSessionReset:\s*resetSessionUi/,
    'resetSessionUi must be wired as the onSessionReset handler'
  );
});

test('resetSessionUi does NOT call setIsExpanded(false)', () => {
  const resetStart = source.indexOf('const resetSessionUi = useCallback');
  const resetEnd = source.indexOf('}, [resetShellWidth', resetStart);
  const body = source.slice(resetStart, resetEnd);
  assert.ok(
    !/setIsExpanded\(\s*false\s*\)/.test(body),
    'resetSessionUi must NOT call setIsExpanded(false) — that hides the overlay'
  );
});
