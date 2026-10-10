import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('stop and discard await completion before returning to the launcher', () => {
  const overlay = source('../../pages/AssistantOverlay/index.tsx');
  const start = overlay.indexOf('const finishMeeting');
  const handler = overlay.slice(start, overlay.indexOf('\n  };', start));
  assert.match(handler, /await window\.desktopAPI\.endMeeting\(\)/);
  assert.match(handler, /await window\.desktopAPI\.abortMeeting\(\)/);
  assert.match(
    handler,
    /await window\.desktopAPI\.setWindowMode\('launcher'\)/
  );
  assert.match(handler, /setMeetingEndError\(String\(error\)\)/);
});

test('overlay drags only from the pill grip, with the built-in Tauri drag region', () => {
  const pill = source('../../pages/AssistantOverlay/live/RecordingPill.tsx');
  const bridge = source('../../lib/desktop/tauriBridge.ts');
  assert.match(pill, /className="grip"[\s\S]*?data-tauri-drag-region="deep"/);
  assert.equal(pill.match(/data-tauri-drag-region/g).length, 1, 'only the grip drags');
  assert.doesNotMatch(bridge, /addEventListener\('mousedown'/);
});

test('question hook subscribes to backend state without owning scheduling', () => {
  const hook = source('../../hooks/meeting/useDetectedQuestions.ts');
  assert.match(hook, /onQuestionStateChanged/);
  assert.match(hook, /getQuestionState/);
  assert.match(hook, /scanQuestions/);
  assert.doesNotMatch(hook, /setInterval|analyzeTranscript/);
});

test('overlay dropdowns render in the overlay window without creating native windows', () => {
  const overlay = source('../../pages/AssistantOverlay/index.tsx');
  const menu = source('../../pages/AssistantOverlay/live/SessionMenu.tsx');
  assert.match(overlay, /<SessionMenu/, 'Session options renders inline, owned by the pill');
  assert.match(overlay, /className="qa" data-overlay-popup/, 'Quick actions render inline in the composer');
  assert.match(menu, /data-overlay-popup/);
  assert.match(menu, /OPENROUTER_MODELS\.map/, 'model choice lives in Session options');
  assert.doesNotMatch(overlay, /toggleModelSelector|toggleSettingsWindow|ModelSelectorWindow|SettingsPopup/);
  assert.match(overlay, /event.key === 'Escape'/);
});
