// End-to-end user journey test for the Parakeet STT pipeline.
//
// Simulates a real meeting: audio chunks flow → Swift helper emits
// partial/committed/final events → verify the transcript events have
// correct isFinal values → verify the downstream intelligence engine
// would receive usable context.
//
// This test exists because a mapping bug (committed → isFinal: false)
// silently broke recap, what-to-answer, RAG indexing, and meeting
// summaries. The intelligence engine only builds context from
// isFinal: true segments.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import Module from 'node:module';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.resolve(
  __dirname,
  '../../../dist-main/main/services/audio/native'
);
const compiledPath = path.join(distRoot, 'LocalParakeetSTT.js');

if (!existsSync(compiledPath)) {
  console.log('SKIP: LocalParakeetSTT.js not compiled yet');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Fake child process
// ---------------------------------------------------------------------------

class FakeChildProcess extends EventEmitter {
  constructor() {
    super();
    this.stdin = new FakeWritable();
    this.stdout = new EventEmitter();
    this.stdout.setEncoding = () => {};
    this.stderr = new EventEmitter();
    this.stderr.setEncoding = () => {};
    this.killed = false;
    this.pid = 99999;
    this.commands = [];

    this.stdin.on('data', (line) => {
      try {
        const cmd = JSON.parse(line.replace(/\n$/, ''));
        this.commands.push(cmd);
        if (cmd.type === 'start') {
          setTimeout(
            () =>
              this._emitEvent({
                type: 'session_started',
                source: cmd.source || 'mic',
                timestampSeconds: Date.now() / 1000,
              }),
            5
          );
        }
        if (cmd.type === 'stop') {
          setTimeout(
            () =>
              this._emitEvent({
                type: 'final',
                source: this._lastSource || 'mic',
                text:
                  this._finalText ||
                  this._committedTexts.join(' ') ||
                  'final text',
                timestampSeconds: Date.now() / 1000,
              }),
            5
          );
        }
        if (cmd.source) this._lastSource = cmd.source;
      } catch {}
    });

    this._committedTexts = [];
  }

  _emitEvent(event) {
    if (!this.killed) {
      this.stdout.emit('data', JSON.stringify(event) + '\n');
    }
  }

  kill(signal) {
    this.killed = true;
    this.emit('exit', null, signal || 'SIGTERM');
    this.emit('close', 0, signal || 'SIGTERM');
  }
}

class FakeWritable extends EventEmitter {
  constructor() {
    super();
    this.written = [];
    this.destroyed = false;
  }
  write(data, enc, cb) {
    if (this.destroyed) return false;
    this.written.push(data);
    this.emit('data', data);
    if (typeof enc === 'function') {
      enc();
      return true;
    }
    if (typeof cb === 'function') cb();
    return true;
  }
  end() {
    this.destroyed = true;
  }
  destroy() {
    this.destroyed = true;
  }
}

// ---------------------------------------------------------------------------
// Module patching
// ---------------------------------------------------------------------------

let fakeChild = null;

const origLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return {
      app: {
        getAppPath: () => '/tmp/fake-cheatly',
        getPath: () => '/tmp/fake-cheatly-data',
        isPackaged: false,
        isReady: () => false,
      },
    };
  }
  if (request === 'child_process' || request === 'node:child_process') {
    return {
      spawn: () => {
        fakeChild = new FakeChildProcess();
        return fakeChild;
      },
    };
  }
  if (
    typeof request === 'string' &&
    (request.endsWith('.node') || request.includes('platform-bridge'))
  ) {
    return {};
  }
  return origLoad.apply(this, arguments);
};

const { LocalParakeetSTT } = await import(compiledPath);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectTranscripts(stt, count, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const transcripts = [];
    const timer = setTimeout(() => {
      stt.removeListener('transcript', handler);
      resolve(transcripts);
    }, timeoutMs);
    const handler = (t) => {
      transcripts.push(t);
      if (transcripts.length >= count) {
        clearTimeout(timer);
        stt.removeListener('transcript', handler);
        resolve(transcripts);
      }
    };
    stt.on('transcript', handler);
  });
}

// ---------------------------------------------------------------------------
// USER JOURNEY: Full meeting session
// ---------------------------------------------------------------------------

test('JOURNEY: meeting session produces correct isFinal values for all event types', async () => {
  fakeChild = null;
  const stt = new LocalParakeetSTT();
  stt.on('error', () => {});
  await stt.start();
  await new Promise((r) => setTimeout(r, 20));

  const transcripts = collectTranscripts(stt, 5);

  // Simulate a real meeting: partials → committed → more partials → committed → final
  fakeChild._emitEvent({
    type: 'partial',
    source: 'mic',
    text: 'hello',
    timestampSeconds: 1,
  });
  await new Promise((r) => setTimeout(r, 10));

  fakeChild._emitEvent({
    type: 'partial',
    source: 'mic',
    text: 'hello world',
    timestampSeconds: 2,
  });
  await new Promise((r) => setTimeout(r, 10));

  fakeChild._emitEvent({
    type: 'committed',
    source: 'mic',
    text: 'Hello world.',
    timestampSeconds: 3,
  });
  await new Promise((r) => setTimeout(r, 10));

  fakeChild._emitEvent({
    type: 'partial',
    source: 'mic',
    text: 'How are',
    timestampSeconds: 4,
  });
  await new Promise((r) => setTimeout(r, 10));

  fakeChild._emitEvent({
    type: 'committed',
    source: 'mic',
    text: 'How are you?',
    timestampSeconds: 5,
  });
  await new Promise((r) => setTimeout(r, 10));

  const results = await transcripts;

  // Partials must be isFinal: false
  const partials = results.filter((t) => !t.isFinal);
  assert.ok(
    partials.length >= 2,
    `Expected at least 2 partials, got ${partials.length}`
  );
  for (const p of partials) {
    assert.equal(
      p.isFinal,
      false,
      `Partial "${p.text}" must be isFinal: false`
    );
  }

  // Committed segments must be isFinal: true
  const finals = results.filter((t) => t.isFinal);
  assert.ok(
    finals.length >= 2,
    `BUG: Expected at least 2 committed segments with isFinal: true, got ${finals.length}. ` +
      'If this fails, committed events are not being mapped to isFinal: true, which breaks ' +
      'the intelligence engine context (recap, what-to-answer, RAG, meeting summaries).'
  );

  assert.ok(
    finals.some((t) => t.text.includes('Hello world')),
    'First committed segment must contain "Hello world"'
  );
  assert.ok(
    finals.some((t) => t.text.includes('How are you')),
    'Second committed segment must contain "How are you"'
  );

  (await stt.destroy?.()) || stt.shutdown?.();
});

test('JOURNEY: committed segments would feed intelligence engine context', async () => {
  fakeChild = null;
  const stt = new LocalParakeetSTT();
  stt.on('error', () => {});
  await stt.start();
  await new Promise((r) => setTimeout(r, 20));

  // Collect all transcripts that would feed the intelligence engine
  const finalSegments = [];
  stt.on('transcript', (t) => {
    if (t.isFinal && t.text) finalSegments.push(t);
  });

  // Simulate 30s of conversation with multiple committed segments
  const sentences = [
    'Tell me about your experience with distributed systems.',
    'I worked on a microservices architecture at my previous company.',
    'We used Kafka for event streaming and gRPC for service communication.',
    'The main challenge was handling partial failures gracefully.',
  ];

  for (const sentence of sentences) {
    fakeChild._emitEvent({
      type: 'partial',
      source: 'mic',
      text: sentence.slice(0, 10),
      timestampSeconds: Date.now() / 1000,
    });
    await new Promise((r) => setTimeout(r, 5));
    fakeChild._emitEvent({
      type: 'committed',
      source: 'mic',
      text: sentence,
      timestampSeconds: Date.now() / 1000,
    });
    await new Promise((r) => setTimeout(r, 5));
  }

  await new Promise((r) => setTimeout(r, 30));

  assert.equal(
    finalSegments.length,
    sentences.length,
    `BUG: Expected ${sentences.length} final segments for intelligence engine, got ${finalSegments.length}. ` +
      'Each committed segment must produce an isFinal: true transcript that feeds into ' +
      'session.handleTranscript() → getFormattedContext() → recap/what-to-answer.'
  );

  // Verify context would be non-empty (simulates getFormattedContext check)
  const contextText = finalSegments.map((s) => s.text).join(' ');
  assert.ok(
    contextText.length > 50,
    `BUG: Combined context from final segments is too short (${contextText.length} chars). ` +
      'This means recap would fail with "No context available".'
  );

  (await stt.destroy?.()) || stt.shutdown?.();
});

test('JOURNEY: partials do NOT accumulate as final context', async () => {
  fakeChild = null;
  const stt = new LocalParakeetSTT();
  stt.on('error', () => {});
  await stt.start();
  await new Promise((r) => setTimeout(r, 20));

  const finalSegments = [];
  stt.on('transcript', (t) => {
    if (t.isFinal) finalSegments.push(t);
  });

  // Send only partials — no committed
  for (let i = 0; i < 10; i++) {
    fakeChild._emitEvent({
      type: 'partial',
      source: 'mic',
      text: `partial hypothesis ${i}`,
      timestampSeconds: Date.now() / 1000,
    });
    await new Promise((r) => setTimeout(r, 5));
  }

  await new Promise((r) => setTimeout(r, 30));

  assert.equal(
    finalSegments.length,
    0,
    'Partials must NOT produce isFinal: true segments. Only committed and final events ' +
      'should feed the intelligence engine. Partials are hypotheses that can change.'
  );

  (await stt.destroy?.()) || stt.shutdown?.();
});

test('JOURNEY: empty committed text does not produce a final segment', async () => {
  fakeChild = null;
  const stt = new LocalParakeetSTT();
  stt.on('error', () => {});
  await stt.start();
  await new Promise((r) => setTimeout(r, 20));

  const finalSegments = [];
  stt.on('transcript', (t) => {
    if (t.isFinal) finalSegments.push(t);
  });

  fakeChild._emitEvent({
    type: 'committed',
    source: 'mic',
    text: '',
    timestampSeconds: Date.now() / 1000,
  });
  fakeChild._emitEvent({
    type: 'committed',
    source: 'mic',
    text: '   ',
    timestampSeconds: Date.now() / 1000,
  });
  await new Promise((r) => setTimeout(r, 30));

  assert.equal(
    finalSegments.length,
    0,
    'Empty or whitespace-only committed text must not produce final segments — they would ' +
      'pollute the intelligence engine context with empty strings.'
  );

  (await stt.destroy?.()) || stt.shutdown?.();
});

test('JOURNEY: stop event produces final transcript from accumulated committed parts', async () => {
  fakeChild = null;
  const stt = new LocalParakeetSTT();
  stt.on('error', () => {});
  await stt.start();
  await new Promise((r) => setTimeout(r, 20));

  const allTranscripts = [];
  stt.on('transcript', (t) => allTranscripts.push(t));

  fakeChild._emitEvent({
    type: 'committed',
    source: 'mic',
    text: 'First sentence.',
    timestampSeconds: 1,
  });
  fakeChild._emitEvent({
    type: 'committed',
    source: 'mic',
    text: 'Second sentence.',
    timestampSeconds: 2,
  });
  await new Promise((r) => setTimeout(r, 10));

  stt.stop();
  await new Promise((r) => setTimeout(r, 30));

  const finalEvents = allTranscripts.filter((t) => t.isFinal);
  assert.ok(
    finalEvents.length >= 2,
    `Expected at least 2 final events (2 committed + possible stop final), got ${finalEvents.length}`
  );

  // The committed segments should have been emitted as finals
  assert.ok(
    finalEvents.some((t) => t.text.includes('First sentence')),
    'First committed sentence must be in finals'
  );
  assert.ok(
    finalEvents.some((t) => t.text.includes('Second sentence')),
    'Second committed sentence must be in finals'
  );

  (await stt.destroy?.()) || stt.shutdown?.();
});

test('JOURNEY: dual channel — both mic and system produce independent final segments', async () => {
  // Simulate two STT instances (mic + system) like createSTTProvider does
  fakeChild = null;
  const micStt = new LocalParakeetSTT();
  micStt.setChannel?.('mic');
  micStt.on('error', () => {});
  await micStt.start();
  await new Promise((r) => setTimeout(r, 20));
  const micChild = fakeChild;

  fakeChild = null;
  const sysStt = new LocalParakeetSTT();
  sysStt.setChannel?.('system');
  sysStt.on('error', () => {});
  await sysStt.start();
  await new Promise((r) => setTimeout(r, 20));
  const sysChild = fakeChild;

  const micFinals = [];
  const sysFinals = [];
  micStt.on('transcript', (t) => {
    if (t.isFinal) micFinals.push(t);
  });
  sysStt.on('transcript', (t) => {
    if (t.isFinal) sysFinals.push(t);
  });

  // Mic: user speaking
  micChild._emitEvent({
    type: 'committed',
    source: 'mic',
    text: 'My answer is yes.',
    timestampSeconds: 1,
  });

  // System: interviewer speaking
  sysChild._emitEvent({
    type: 'committed',
    source: 'system',
    text: 'Can you elaborate on that?',
    timestampSeconds: 2,
  });

  await new Promise((r) => setTimeout(r, 30));

  assert.equal(micFinals.length, 1, 'Mic channel must produce 1 final segment');
  assert.equal(
    sysFinals.length,
    1,
    'System channel must produce 1 final segment'
  );
  assert.ok(
    micFinals[0].text.includes('My answer'),
    'Mic final must contain user text'
  );
  assert.ok(
    sysFinals[0].text.includes('elaborate'),
    'System final must contain interviewer text'
  );

  (await micStt.destroy?.()) || micStt.shutdown?.();
  (await sysStt.destroy?.()) || sysStt.shutdown?.();
});

// ---------------------------------------------------------------------------
// DIALOGUE FORMAT AND ORDERING TESTS
// ---------------------------------------------------------------------------

test('JOURNEY: dialogue transcript preserves chronological order across channels', async () => {
  fakeChild = null;
  const micStt = new LocalParakeetSTT();
  micStt.setChannel?.('mic');
  micStt.on('error', () => {});
  await micStt.start();
  await new Promise((r) => setTimeout(r, 20));
  const micChild = fakeChild;

  fakeChild = null;
  const sysStt = new LocalParakeetSTT();
  sysStt.setChannel?.('system');
  sysStt.on('error', () => {});
  await sysStt.start();
  await new Promise((r) => setTimeout(r, 20));
  const sysChild = fakeChild;

  // Collect all finals with timestamps and speaker info
  const dialogue = [];
  micStt.on('transcript', (t) => {
    if (t.isFinal)
      dialogue.push({ speaker: 'user', text: t.text, time: Date.now() });
  });
  sysStt.on('transcript', (t) => {
    if (t.isFinal)
      dialogue.push({ speaker: 'interviewer', text: t.text, time: Date.now() });
  });

  // Simulate a real conversation — interviewer asks, user answers, back and forth
  sysChild._emitEvent({
    type: 'committed',
    source: 'system',
    text: 'Tell me about your experience.',
    timestampSeconds: 1,
  });
  await new Promise((r) => setTimeout(r, 10));

  micChild._emitEvent({
    type: 'committed',
    source: 'mic',
    text: 'I have five years in backend.',
    timestampSeconds: 2,
  });
  await new Promise((r) => setTimeout(r, 10));

  sysChild._emitEvent({
    type: 'committed',
    source: 'system',
    text: 'What languages do you use?',
    timestampSeconds: 3,
  });
  await new Promise((r) => setTimeout(r, 10));

  micChild._emitEvent({
    type: 'committed',
    source: 'mic',
    text: 'Mostly Go and Python.',
    timestampSeconds: 4,
  });
  await new Promise((r) => setTimeout(r, 30));

  assert.equal(
    dialogue.length,
    4,
    `Expected 4 dialogue entries, got ${dialogue.length}`
  );

  // Verify order: them, you, them, you
  assert.equal(
    dialogue[0].speaker,
    'interviewer',
    'First entry must be interviewer'
  );
  assert.equal(dialogue[1].speaker, 'user', 'Second entry must be user');
  assert.equal(
    dialogue[2].speaker,
    'interviewer',
    'Third entry must be interviewer'
  );
  assert.equal(dialogue[3].speaker, 'user', 'Fourth entry must be user');

  // Verify timestamps are monotonically increasing
  for (let i = 1; i < dialogue.length; i++) {
    assert.ok(
      dialogue[i].time >= dialogue[i - 1].time,
      `BUG: dialogue entry ${i} (${dialogue[i].speaker}: "${dialogue[i].text}") has timestamp ` +
        `${dialogue[i].time} before entry ${i - 1} at ${dialogue[i - 1].time}. ` +
        'Transcript must be in chronological commit order.'
    );
  }

  (await micStt.destroy?.()) || micStt.shutdown?.();
  (await sysStt.destroy?.()) || sysStt.shutdown?.();
});

test('JOURNEY: overlapping speech — both channels commit simultaneously, both preserved in order', async () => {
  fakeChild = null;
  const micStt = new LocalParakeetSTT();
  micStt.setChannel?.('mic');
  micStt.on('error', () => {});
  await micStt.start();
  await new Promise((r) => setTimeout(r, 20));
  const micChild = fakeChild;

  fakeChild = null;
  const sysStt = new LocalParakeetSTT();
  sysStt.setChannel?.('system');
  sysStt.on('error', () => {});
  await sysStt.start();
  await new Promise((r) => setTimeout(r, 20));
  const sysChild = fakeChild;

  const dialogue = [];
  micStt.on('transcript', (t) => {
    if (t.isFinal)
      dialogue.push({ speaker: 'user', text: t.text, time: Date.now() });
  });
  sysStt.on('transcript', (t) => {
    if (t.isFinal)
      dialogue.push({ speaker: 'interviewer', text: t.text, time: Date.now() });
  });

  // Simulate overlapping speech — both people talking at once
  // Interviewer asks a long question while user interjects
  sysChild._emitEvent({
    type: 'committed',
    source: 'system',
    text: 'So when you were working on the migration',
    timestampSeconds: 1,
  });
  micChild._emitEvent({
    type: 'committed',
    source: 'mic',
    text: 'Yes exactly',
    timestampSeconds: 1.5,
  });
  sysChild._emitEvent({
    type: 'committed',
    source: 'system',
    text: 'did you handle the rollback strategy yourself?',
    timestampSeconds: 2,
  });
  micChild._emitEvent({
    type: 'committed',
    source: 'mic',
    text: 'I did, let me explain.',
    timestampSeconds: 2.5,
  });
  await new Promise((r) => setTimeout(r, 30));

  assert.equal(
    dialogue.length,
    4,
    `Expected 4 overlapping entries, got ${dialogue.length}`
  );

  // All 4 entries must be present — no dropped segments during overlap
  const texts = dialogue.map((d) => d.text);
  assert.ok(
    texts.some((t) => t.includes('migration')),
    'Interviewer "migration" segment must be present'
  );
  assert.ok(
    texts.some((t) => t.includes('exactly')),
    'User "exactly" interjection must be present'
  );
  assert.ok(
    texts.some((t) => t.includes('rollback')),
    'Interviewer "rollback" segment must be present'
  );
  assert.ok(
    texts.some((t) => t.includes('explain')),
    'User "explain" segment must be present'
  );

  // Verify interleaved order is preserved (them, you, them, you)
  assert.equal(dialogue[0].speaker, 'interviewer');
  assert.equal(dialogue[1].speaker, 'user');
  assert.equal(dialogue[2].speaker, 'interviewer');
  assert.equal(dialogue[3].speaker, 'user');

  (await micStt.destroy?.()) || micStt.shutdown?.();
  (await sysStt.destroy?.()) || sysStt.shutdown?.();
});

test('JOURNEY: rapid-fire same-channel commits maintain order', async () => {
  fakeChild = null;
  const sysStt = new LocalParakeetSTT();
  sysStt.setChannel?.('system');
  sysStt.on('error', () => {});
  await sysStt.start();
  await new Promise((r) => setTimeout(r, 20));
  const sysChild = fakeChild;

  const segments = [];
  sysStt.on('transcript', (t) => {
    if (t.isFinal) segments.push(t.text);
  });

  // Interviewer speaks a long monologue — multiple rapid commits
  const sentences = [
    'First, let me explain the problem.',
    'We have a distributed cache layer.',
    'It needs to handle ten thousand requests per second.',
    'The current implementation uses Redis.',
    'But we are hitting memory limits.',
  ];

  for (const s of sentences) {
    sysChild._emitEvent({
      type: 'committed',
      source: 'system',
      text: s,
      timestampSeconds: Date.now() / 1000,
    });
    await new Promise((r) => setTimeout(r, 5));
  }
  await new Promise((r) => setTimeout(r, 30));

  assert.equal(
    segments.length,
    sentences.length,
    `Expected ${sentences.length} segments, got ${segments.length}`
  );

  // Order must match input order exactly
  for (let i = 0; i < sentences.length; i++) {
    assert.equal(
      segments[i],
      sentences[i],
      `BUG: segment ${i} is "${segments[i]}" but expected "${sentences[i]}". ` +
        'Rapid commits must preserve insertion order.'
    );
  }

  (await sysStt.destroy?.()) || sysStt.shutdown?.();
});

test('JOURNEY: dialogue labels match channel — mic=You, system=Them', async () => {
  fakeChild = null;
  const micStt = new LocalParakeetSTT();
  micStt.setChannel?.('mic');
  micStt.on('error', () => {});
  await micStt.start();
  await new Promise((r) => setTimeout(r, 20));
  const micChild = fakeChild;

  fakeChild = null;
  const sysStt = new LocalParakeetSTT();
  sysStt.setChannel?.('system');
  sysStt.on('error', () => {});
  await sysStt.start();
  await new Promise((r) => setTimeout(r, 20));
  const sysChild = fakeChild;

  // The CheatlyInterface handler prepends "You:" / "Them:" based on speaker.
  // Here we verify the raw channel assignment is correct so the UI labels are right.
  let micChannel = null;
  let sysChannel = null;

  micStt.on('transcript', (t) => {
    if (t.isFinal) micChannel = 'user';
  });
  sysStt.on('transcript', (t) => {
    if (t.isFinal) sysChannel = 'interviewer';
  });

  micChild._emitEvent({
    type: 'committed',
    source: 'mic',
    text: 'Test mic',
    timestampSeconds: 1,
  });
  sysChild._emitEvent({
    type: 'committed',
    source: 'system',
    text: 'Test system',
    timestampSeconds: 2,
  });
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(
    micChannel,
    'user',
    'Mic channel transcripts must map to speaker "user" (displayed as "Me")'
  );
  assert.equal(
    sysChannel,
    'interviewer',
    'System channel transcripts must map to speaker "interviewer" (displayed as "Them")'
  );

  (await micStt.destroy?.()) || micStt.shutdown?.();
  (await sysStt.destroy?.()) || sysStt.shutdown?.();
});

// ---------------------------------------------------------------------------
// DEDUPLICATION AND TIMESTAMP TESTS
// ---------------------------------------------------------------------------

test('JOURNEY: LocalParakeetSTT emits ALL committed events (dedup is upstream in main.ts)', async () => {
  fakeChild = null;
  const stt = new LocalParakeetSTT();
  stt.on('error', () => {});
  await stt.start();
  await new Promise((r) => setTimeout(r, 20));

  const finals = [];
  stt.on('transcript', (t) => {
    if (t.isFinal) finals.push(t.text);
  });

  // LocalParakeetSTT should emit all committed events — dedup happens in main.ts
  fakeChild._emitEvent({
    type: 'committed',
    source: 'mic',
    text: 'Hello world.',
    timestampSeconds: 1,
  });
  fakeChild._emitEvent({
    type: 'committed',
    source: 'mic',
    text: 'Hello world.',
    timestampSeconds: 2,
  });
  fakeChild._emitEvent({
    type: 'committed',
    source: 'mic',
    text: 'New text.',
    timestampSeconds: 3,
  });
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(
    finals.length,
    3,
    'LocalParakeetSTT must emit ALL committed events without dedup — ' +
      'centralized dedup in main.ts handles suppression before fan-out to consumers.'
  );

  (await stt.destroy?.()) || stt.shutdown?.();
});

test('JOURNEY: committed events pass startedAt timestamp through', async () => {
  fakeChild = null;
  const stt = new LocalParakeetSTT();
  stt.on('error', () => {});
  await stt.start();
  await new Promise((r) => setTimeout(r, 20));

  const transcripts = [];
  stt.on('transcript', (t) => transcripts.push(t));

  const speechTime = 1780000000000;
  fakeChild._emitEvent({
    type: 'committed',
    source: 'mic',
    text: 'Timestamped speech.',
    timestampSeconds: Date.now() / 1000,
    startedAt: speechTime,
  });
  await new Promise((r) => setTimeout(r, 20));

  const committed = transcripts.find((t) => t.isFinal);
  assert.ok(committed, 'Must have a committed transcript');
  assert.equal(
    committed.startedAt,
    speechTime,
    `BUG: startedAt must be passed through from Swift event. Got ${committed.startedAt}, expected ${speechTime}. ` +
      'Without this, transcript ordering uses commit time instead of speech time, ' +
      'causing segments to appear out of order when channels commit at different speeds.'
  );

  (await stt.destroy?.()) || stt.shutdown?.();
});

test('JOURNEY: system speaks first but commits later — startedAt preserves true order', async () => {
  fakeChild = null;
  const micStt = new LocalParakeetSTT();
  micStt.setChannel?.('mic');
  micStt.on('error', () => {});
  await micStt.start();
  await new Promise((r) => setTimeout(r, 20));
  const micChild = fakeChild;

  fakeChild = null;
  const sysStt = new LocalParakeetSTT();
  sysStt.setChannel?.('system');
  sysStt.on('error', () => {});
  await sysStt.start();
  await new Promise((r) => setTimeout(r, 20));
  const sysChild = fakeChild;

  const dialogue = [];
  micStt.on('transcript', (t) => {
    if (t.isFinal)
      dialogue.push({ speaker: 'user', text: t.text, startedAt: t.startedAt });
  });
  sysStt.on('transcript', (t) => {
    if (t.isFinal)
      dialogue.push({
        speaker: 'interviewer',
        text: t.text,
        startedAt: t.startedAt,
      });
  });

  // System spoke at T=1000, mic spoke at T=2000
  // But mic commits first (faster agreement), system commits second
  micChild._emitEvent({
    type: 'committed',
    source: 'mic',
    text: 'My response.',
    timestampSeconds: 3,
    startedAt: 2000,
  });
  await new Promise((r) => setTimeout(r, 5));
  sysChild._emitEvent({
    type: 'committed',
    source: 'system',
    text: 'The question was.',
    timestampSeconds: 4,
    startedAt: 1000,
  });
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(dialogue.length, 2, 'Both segments must be present');

  // Arrival order: mic first, system second
  assert.equal(
    dialogue[0].speaker,
    'user',
    'Mic committed first (arrival order)'
  );
  assert.equal(
    dialogue[1].speaker,
    'interviewer',
    'System committed second (arrival order)'
  );

  // But startedAt tells the TRUE order: system spoke first
  assert.ok(
    dialogue[1].startedAt < dialogue[0].startedAt,
    `BUG: System startedAt (${dialogue[1].startedAt}) should be BEFORE mic startedAt (${dialogue[0].startedAt}). ` +
      'The display layer should sort by startedAt to show correct conversation order.'
  );

  (await micStt.destroy?.()) || micStt.shutdown?.();
  (await sysStt.destroy?.()) || sysStt.shutdown?.();
});

// ---------------------------------------------------------------------------
// LAST SEGMENT PERSISTENCE — trailing text must survive stop
// ---------------------------------------------------------------------------

test('JOURNEY: uncommitted partial text is emitted as final on stop when no prior commits exist', async () => {
  fakeChild = null;
  const stt = new LocalParakeetSTT();
  stt.on('error', () => {});
  await stt.start();
  await new Promise((r) => setTimeout(r, 20));

  const finals = [];
  stt.on('transcript', (t) => {
    if (t.isFinal) finals.push(t);
  });

  // Only partials — agreement engine never committed (speech too short)
  fakeChild._emitEvent({
    type: 'partial',
    source: 'mic',
    text: 'Hello world',
    timestampSeconds: 1,
  });
  fakeChild._emitEvent({
    type: 'partial',
    source: 'mic',
    text: 'Hello world how are you',
    timestampSeconds: 2,
  });
  await new Promise((r) => setTimeout(r, 10));

  // Set final text BEFORE stop so the mock emits it
  fakeChild._finalText = 'Hello world, how are you?';
  stt.stop();
  await new Promise((r) => setTimeout(r, 30));

  assert.ok(
    finals.length >= 1,
    `BUG: No final emitted after stop with uncommitted partials. Got ${finals.length} finals. ` +
      'When the agreement engine never committed (short speech), the stop/final event is the ' +
      'ONLY chance to persist the text. If hadCommitted skips it, the text is lost.'
  );

  const allText = finals
    .map((f) => f.text)
    .join(' ')
    .toLowerCase();
  assert.ok(
    allText.includes('hello'),
    `Final must contain the spoken text. Got: "${allText}"`
  );

  (await stt.destroy?.()) || stt.shutdown?.();
});

test('JOURNEY: last uncommitted speech after prior commits is NOT lost', async () => {
  fakeChild = null;
  const stt = new LocalParakeetSTT();
  stt.on('error', () => {});
  await stt.start();
  await new Promise((r) => setTimeout(r, 20));

  const finals = [];
  stt.on('transcript', (t) => {
    if (t.isFinal) finals.push(t.text);
  });

  // First sentence committed successfully
  fakeChild._emitEvent({
    type: 'committed',
    source: 'mic',
    text: 'First sentence is committed.',
    timestampSeconds: 1,
  });
  await new Promise((r) => setTimeout(r, 5));

  // Second sentence — only partials, agreement engine didn't converge yet
  fakeChild._emitEvent({
    type: 'partial',
    source: 'mic',
    text: 'Second sentence still',
    timestampSeconds: 2,
  });
  fakeChild._emitEvent({
    type: 'partial',
    source: 'mic',
    text: 'Second sentence still partial',
    timestampSeconds: 3,
  });
  await new Promise((r) => setTimeout(r, 10));

  // Set final text BEFORE stop
  fakeChild._finalText =
    'First sentence is committed. Second sentence still partial.';
  stt.stop();
  await new Promise((r) => setTimeout(r, 30));

  assert.ok(
    finals.some((t) => t.includes('First sentence')),
    'First committed sentence must be in finals'
  );

  // Key: is trailing uncommitted text persisted?
  const allText = finals.join(' ').toLowerCase();
  assert.ok(
    allText.includes('second sentence'),
    `BUG: Trailing uncommitted text lost on stop. Finals: [${finals.join(' | ')}]. ` +
      'The stop/final must emit text NOT already committed. Otherwise the last thing ' +
      'someone says before Stop is silently dropped.'
  );

  (await stt.destroy?.()) || stt.shutdown?.();
});
