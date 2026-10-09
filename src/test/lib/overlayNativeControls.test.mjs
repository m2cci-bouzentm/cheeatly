import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('stop and discard await completion before returning to the launcher', () => {
  const overlay = source('../../pages/AssistantOverlay/index.tsx');
  const handler = overlay.slice(
    overlay.indexOf('const finishMeeting'),
    overlay.indexOf('const questionDetectionPaused')
  );
  assert.match(handler, /await window\.desktopAPI\.endMeeting\(\)/);
  assert.match(handler, /await window\.desktopAPI\.abortMeeting\(\)/);
  assert.match(
    handler,
    /await window\.desktopAPI\.setWindowMode\('launcher'\)/
  );
  assert.match(handler, /setMeetingEndError\(String\(error\)\)/);
});

test('overlay uses built-in Tauri drag regions', () => {
  const overlay = source('../../pages/AssistantOverlay/index.tsx');
  const pill = source('../../components/ui/TopPill.tsx');
  const bridge = source('../../lib/desktop/tauriBridge.ts');
  assert.match(overlay, /data-tauri-drag-region="deep"/);
  assert.match(pill, /data-tauri-drag-region="deep"/);
  assert.doesNotMatch(bridge, /addEventListener\('mousedown'/);
});

test('question hook subscribes to backend state without owning scheduling', () => {
  const hook = source('../../hooks/meeting/useDetectedQuestions.ts');
  assert.match(hook, /onQuestionStateChanged/);
  assert.match(hook, /getQuestionState/);
  assert.match(hook, /scanQuestions/);
  assert.doesNotMatch(hook, /setInterval|analyzeTranscript/);
});

test('overlay dropdowns render in the main window without creating native windows', () => {
  const overlay = source('../../pages/AssistantOverlay/index.tsx');
  assert.match(overlay, /<ModelSelectorWindow onClose=/);
  assert.match(overlay, /<SettingsPopup embedded/);
  assert.doesNotMatch(overlay, /toggleModelSelector|toggleSettingsWindow/);
  assert.match(overlay, /event.key === 'Escape'/);
});
