import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
import { emit } from '@tauri-apps/api/event';

let serial = 0;
beforeEach(() => {
  globalThis.window = {
    crypto: globalThis.crypto,
    __TAURI_OS_PLUGIN_INTERNALS__: { platform: 'macos' },
  };
});
afterEach(() => {
  clearMocks();
  delete globalThis.window;
});
const bridge = async () =>
  (await import(`../../lib/desktop/tauriBridge.ts?case=${serial++}`))
    .desktopAPI;

test('desktop API preserves command names, argument shapes, and response payloads', async () => {
  const calls = [];
  const response = { success: true, sentinel: 'returned unchanged' };
  mockIPC((command, args) => {
    calls.push([command, args]);
    return response;
  });
  const api = await bridge();
  assert.equal(api.platform, 'darwin');
  const metadata = { audio: { inputDeviceId: 'mic', outputDeviceId: 'sck' } };
  const config = { enabled: true, interval: 20, window: 40 };
  const cases = [
    ['startMeeting', [metadata], 'start_meeting', { metadata }],
    ['endMeeting', [], 'end_meeting', {}],
    ['abortMeeting', [], 'abort_meeting', {}],
    ['getMeetingDetails', ['id'], 'get_meeting_details', { id: 'id' }],
    [
      'updateMeetingSummary',
      ['id', { summary: 'Notes' }],
      'update_meeting_summary',
      { id: 'id', updates: { summary: 'Notes' } },
    ],
    ['retryMeetingSummary', ['id'], 'retry_meeting_summary', { id: 'id' }],
    [
      'setChannelMuted',
      ['system', true],
      'set_channel_muted',
      { channel: 'system', muted: true },
    ],
    ['getQuestionState', [], 'get_question_state', {}],
    ['scanQuestions', [], 'scan_questions', {}],
    ['setQuestionsPaused', [true], 'set_questions_paused', { paused: true }],
    ['dismissQuestion', ['q1'], 'dismiss_question', { id: 'q1' }],
    ['resetQuestions', [], 'reset_questions', {}],
    ['setModel', ['model'], 'set_model', { modelId: 'model' }],
    ['setUndetectable', [true], 'set_undetectable', { value: true }],
    [
      'setQuestionAnalysisConfig',
      [config],
      'set_question_analysis_config',
      { config },
    ],
    [
      'analyzeTranscript',
      ['Them: Why?'],
      'analyze_transcript',
      { transcript: 'Them: Why?' },
    ],
    [
      'skillsUpdate',
      ['skill', { enabled: false }],
      'skills_update',
      { name: 'skill', patch: { enabled: false } },
    ],
    [
      'contextSaveDescription',
      ['Context'],
      'context_save_description',
      { content: 'Context' },
    ],
  ];
  for (const [method, args, command, payload] of cases) {
    assert.deepEqual(await api[method](...args), response, method);
    assert.deepEqual(calls.pop(), [command, payload], method);
  }
});

test('events deliver payloads and stop after unsubscribe, including early cleanup', async () => {
  mockIPC(() => undefined, { shouldMockEvents: true });
  const api = await bridge();
  const received = [];
  const stop = api.onNativeAudioTranscript((value) => received.push(value));
  await nextTurn();
  const transcript = { speaker: 'interviewer', text: 'Why?', final: true };
  await emit('native-audio-transcript', transcript);
  assert.deepEqual(received, [transcript]);
  stop();
  await nextTurn();
  await emit('native-audio-transcript', { ...transcript, text: 'Ignored' });
  assert.deepEqual(received, [transcript]);
  const stopEarly = api.onSessionReset((value) => received.push(value));
  stopEarly();
  await nextTurn();
  await emit('session-reset', 'Ignored');
  assert.deepEqual(received, [transcript]);
});

test('chat waits for listener registration and queued cancellation prevents invocation', async () => {
  const calls = [];
  let register;
  mockIPC((command, args) => {
    calls.push([command, args]);
    if (command === 'plugin:event|listen')
      return new Promise((resolve) => {
        register = resolve;
      });
    return { success: true };
  });
  const api = await bridge();
  const stop = api.onChatStreamEvent(() => {});
  const started = api.chatStreamStart('cancelled', [
    { role: 'user', content: 'Hi' },
  ]);
  const rejected = assert.rejects(started, { name: 'AbortError' });
  api.chatStreamAbort('cancelled');
  assert.equal(
    calls.some(([name]) => name === 'chat_stream_start'),
    false
  );
  register(7);
  await rejected;
  assert.equal(
    calls.some(([name]) => name === 'chat_stream_start'),
    false
  );
  await api.chatStreamStart('live', [], { system: 'Context' });
  assert.deepEqual(calls.at(-1), [
    'chat_stream_start',
    { streamId: 'live', messages: [], options: { system: 'Context' } },
  ]);
  api.chatStreamAbort('live');
  await nextTurn();
  assert.deepEqual(calls.at(-1), ['chat_stream_abort', { streamId: 'live' }]);
  stop();
  await nextTurn();
});

test('backend errors propagate to the caller instead of reporting success', async () => {
  mockIPC(() => {
    throw new Error('Disk full');
  });
  const api = await bridge();
  await assert.rejects(api.endMeeting(), /Disk full/);
  await assert.rejects(api.analyzeTranscript('Question?'), /Disk full/);
});
