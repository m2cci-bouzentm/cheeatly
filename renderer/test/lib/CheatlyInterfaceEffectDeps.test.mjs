// Regression test for: AssistantOverlay audio subscription effect deps
//
// Bug: The large useEffect at ~L1434 in src/components/CheatlyInterface.tsx
// registered IPC subscriptions and previously declared `[isExpanded]` as its
// dep array. The audio subscription logic now lives in
// renderer/hooks/meeting/useMeetingState.ts. Every expand or collapse toggle
// must not:
//   1. Run the cleanup forEach, removing audio IPC listeners.
//   2. Re-run the effect body, re-registering audio IPC listeners.
//
// Under React 18 strict mode this produced (a) listener leaks because the
// cleanup of the previous effect can run AFTER the next effect schedules,
// detaching the NEW listener; and (b) dropped IPC events that arrived in
// the teardown gap. Concrete symptoms: duplicate streaming tokens, double
// transcripts, stuck isProcessing, missed intelligence results.
//
// Fix: keep expansion state out of the audio subscription effect deps.
//
// Strategy: source-level static check on useMeetingState.ts. Rendering
// AssistantOverlay in RTL would require a massive IPC/electronAPI mock surface
// and would not actually validate the dep array semantics.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.resolve(
  __dirname,
  '../../../renderer/hooks/meeting/useMeetingState.ts'
);

const source = readFileSync(filePath, 'utf8');
const lines = source.split('\n');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Locate the audio subscription effect by its unique anchor:
//    onNativeAudioTranscript.
//    Walk backward from that line to find the enclosing `useEffect(() => {`.
// ─────────────────────────────────────────────────────────────────────────────
function findAudioSubscriptionEffect(srcLines) {
  let anchorLine = -1;
  for (let i = 0; i < srcLines.length; i++) {
    if (srcLines[i].includes('onNativeAudioTranscript')) {
      anchorLine = i;
      break;
    }
  }
  assert.ok(
    anchorLine >= 0,
    'could not find onNativeAudioTranscript anchor — has the IPC API renamed?'
  );

  // Walk backward to find the opening `useEffect(() => {`.
  let openLine = -1;
  for (let i = anchorLine; i >= 0; i--) {
    if (/useEffect\(\(\)\s*=>\s*\{/.test(srcLines[i])) {
      openLine = i;
      break;
    }
  }
  assert.ok(
    openLine >= 0,
    'could not find enclosing useEffect(() => { for the onNativeAudioTranscript anchor'
  );

  // Brace-balance from the opening `{` of the arrow body forward to find
  // the matching close. The closing token is `}, deps);` on its own line.
  const openIdxInSrc = (() => {
    let abs = 0;
    for (let i = 0; i < openLine; i++) abs += srcLines[i].length + 1;
    const openMatch = /useEffect\(\(\)\s*=>\s*\{/.exec(srcLines[openLine]);
    return abs + openMatch.index + openMatch[0].length - 1; // index of `{`
  })();

  let depth = 0;
  let closeAbs = -1;
  for (let i = openIdxInSrc; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) {
      closeAbs = i;
      break;
    }
  }
  assert.ok(closeAbs > 0, 'unbalanced braces while scanning mega-effect body');

  // Convert closeAbs back to a line number.
  let closeLine = 0;
  let running = 0;
  for (let i = 0; i < srcLines.length; i++) {
    running += srcLines[i].length + 1;
    if (running > closeAbs) {
      closeLine = i;
      break;
    }
  }

  const body = source.slice(openIdxInSrc + 1, closeAbs);
  const closeStmtMatch = /^\},\s*\[[\s\S]*?\]\s*\)\s*;/.exec(
    source.slice(closeAbs)
  );
  assert.ok(
    closeStmtMatch,
    `BUG REGRESSION: could not parse audio subscription effect dependency array. Found closing line:\n` +
      `  ${srcLines[closeLine]}\n` +
      `(line ${closeLine + 1}).`
  );
  const closeStmt = closeStmtMatch[0];

  return { openLine, closeLine, body, closeStmt };
}

const effect = findAudioSubscriptionEffect(lines);

test('audio subscription effect anchored on onNativeAudioTranscript is the expected block', () => {
  // Sanity: this should be the subscription block for native audio status,
  // activity, transcript, and cleanup.
  const span = effect.closeLine - effect.openLine;
  assert.ok(
    span > 30,
    `expected audio subscription effect to span >30 lines, got ${span} (open=${effect.openLine + 1}, close=${effect.closeLine + 1}). ` +
      `Has the file been restructured? Update the test anchor.`
  );
  assert.ok(
    effect.body.includes('getNativeAudioStatus'),
    'expected audio subscription effect to check native audio status'
  );
  assert.ok(
    effect.body.includes('onAudioCaptureActive'),
    'expected audio subscription effect to subscribe to audio capture activity'
  );
  assert.ok(
    effect.body.includes('onNativeAudioTranscript'),
    'expected audio subscription effect to subscribe to native audio transcripts'
  );
  assert.ok(
    effect.body.includes('cleanups.forEach((fn) => fn())'),
    'expected audio subscription effect cleanup to remove registered listeners'
  );
});

test('audio subscription effect dep array does not include expansion state', () => {
  const stripped = effect.closeStmt.trim();

  assert.ok(
    /^\},\s*\[[\s\S]*\]\s*\)\s*;/.test(stripped),
    `BUG REGRESSION: could not parse audio subscription effect dependency array. Found closing line:\n` +
      `  ${effect.closeStmt}\n` +
      `(line ${effect.closeLine + 1}).`
  );

  assert.ok(
    !/\bisExpanded\b/.test(stripped),
    `BUG REGRESSION: audio subscription effect dep array contains isExpanded. This is the exact bug ` +
      `the fix removed. Stable callback deps are allowed, but expansion state must not ` +
      `tear down and re-register IPC listeners on every expand/collapse.`
  );
});

test('audio subscription effect body does NOT read bare isExpanded', () => {
  // Strip comments so example/explanatory mentions don't trip us.
  const stripComments = (s) =>
    s
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');

  const code = stripComments(effect.body);

  // Find any `isExpanded` token that is NOT followed by `Ref` (i.e. not isExpandedRef).
  const bareRefs = [];
  const re = /\bisExpanded\b(?!Ref)/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    // Capture a small context window for the error message.
    const start = Math.max(0, m.index - 40);
    const end = Math.min(code.length, m.index + 60);
    bareRefs.push(code.slice(start, end).replace(/\s+/g, ' ').trim());
  }

  assert.equal(
    bareRefs.length,
    0,
    `BUG HAZARD: audio subscription effect body reads bare \`isExpanded\` ${bareRefs.length} time(s). ` +
      `Because the effect must not depend on expansion state, bare \`isExpanded\` captures the initial ` +
      `value and goes stale. Occurrences:\n  - ` +
      bareRefs.join('\n  - ')
  );
});
