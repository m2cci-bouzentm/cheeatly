import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('stop and discard await completion before returning to the launcher', () => {
  const overlay = source('../../pages/AssistantOverlay/index.tsx');
  const handler = overlay.slice(
    overlay.indexOf('const finishMeeting'),
    overlay.indexOf('const scanTurns')
  );
  assert.match(handler, /await window\.desktopAPI\.endMeeting\(\)/);
  assert.match(handler, /await window\.desktopAPI\.abortMeeting\(\)/);
  assert.match(
    handler,
    /await window\.desktopAPI\.setWindowMode\('launcher'\)/
  );
  assert.match(handler, /setMeetingEndError\(String\(error\)\)/);
});

test('dragging uses native Tauri API and excludes interactive controls', () => {
  const bridge = source('../../lib/desktop/tauriBridge.ts');
  assert.match(bridge, /getCurrentWindow\(\)\.startDragging\(\)/);
  assert.match(bridge, /closest\('button, input, textarea, select/);
});

test('question scans only mark a transcript processed after a successful response', () => {
  const hook = source('../../hooks/meeting/useDetectedQuestions.ts');
  const request = hook.indexOf(
    'await window.desktopAPI.analyzeTranscript(transcript)'
  );
  const markProcessed = hook.indexOf('lastHashRef.current = hash');
  assert.ok(request >= 0 && markProcessed > request);
  assert.match(hook, /setScanError\(/);
  assert.match(hook, /await analyze\(true\)/);
  assert.match(hook, /generation !== generationRef.current/);
});

test('overlay dropdowns render in the main window without creating native windows', () => {
  const overlay = source('../../pages/AssistantOverlay/index.tsx');
  assert.match(overlay, /<ModelSelectorWindow onClose=/);
  assert.match(overlay, /<SettingsPopup embedded/);
  assert.doesNotMatch(overlay, /toggleModelSelector|toggleSettingsWindow/);
  assert.match(overlay, /event.key === 'Escape'/);
});
