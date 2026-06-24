// Behavioral tests for LocalParakeetSTT — mocks child_process.spawn to test
// the full stdio protocol lifecycle without requiring the Swift binary.
//
// Tests cover: happy-path session flow, event mapping, error handling,
// process lifecycle, write-before-start safety, and multi-session reuse.

import { test, beforeEach } from 'node:test';
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
  console.log('SKIP: LocalParakeetSTT.js not compiled yet — TDD scaffold');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Fake child process — simulates the Swift speech-to-text stdio binary
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
    this.pid = 12345;
    this.commands = [];

    this.stdin.on('data', (line) => {
      try {
        const cmd = JSON.parse(line.replace(/\n$/, ''));
        this.commands.push(cmd);
        this._handleCommand(cmd);
      } catch {}
    });
  }

  _handleCommand(cmd) {
    if (cmd.type === 'start') {
      setTimeout(() => {
        this._emitEvent({
          type: 'session_started',
          source: cmd.source || 'mic',
          timestampSeconds: Date.now() / 1000,
        });
      }, 5);
    }
    if (cmd.type === 'audio' && this._autoPartial) {
      this._partialCount = (this._partialCount || 0) + 1;
    }
    if (
      cmd.type === 'audio' &&
      this._autoPartial &&
      this._partialCount % 3 === 0
    ) {
      setTimeout(() => {
        this._emitEvent({
          type: 'partial',
          source: cmd.source || 'mic',
          text: `partial text ${this._partialCount}`,
          timestampSeconds: Date.now() / 1000,
        });
      }, 2);
    }
    if (cmd.type === 'stop') {
      setTimeout(() => {
        this._emitEvent({
          type: 'final',
          source: this._lastSource || 'mic',
          text: this._finalText || 'final transcript text',
          timestampSeconds: Date.now() / 1000,
        });
      }, 5);
    }
    if (cmd.source) this._lastSource = cmd.source;
  }

  _emitEvent(event) {
    if (!this.killed) {
      this.stdout.emit('data', JSON.stringify(event) + '\n');
    }
  }

  kill(signal) {
    this.killed = true;
    this.emit('exit', signal === 'SIGTERM' ? null : 1, signal || 'SIGTERM');
    this.emit('close', 0, signal || 'SIGTERM');
  }
}

class FakeWritable extends EventEmitter {
  constructor() {
    super();
    this.written = [];
    this.destroyed = false;
  }

  write(data, encoding, cb) {
    if (this.destroyed) return false;
    this.written.push(data);
    this.emit('data', data);
    if (typeof encoding === 'function') encoding();
    if (typeof encoding !== 'function' && typeof cb === 'function') cb();
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
// Module patching — intercept child_process.spawn and electron
// ---------------------------------------------------------------------------

let lastSpawnArgs = null;
let fakeChild = null;
let spawnCallCount = 0;
let spawnShouldFail = false;

const origLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return {
      app: {
        getAppPath: () => '/tmp/fake-cheatly',
        getPath: (name) => '/tmp/fake-cheatly-data',
        isPackaged: false,
        isReady: () => false,
      },
    };
  }
  if (request === 'child_process' || request === 'node:child_process') {
    return {
      spawn: (cmd, args, opts) => {
        spawnCallCount++;
        lastSpawnArgs = { cmd, args, opts };
        if (spawnShouldFail) {
          const fc = new FakeChildProcess();
          fakeChild = fc;
          setTimeout(
            () => fc.emit('error', new Error('ENOENT: spawn failed')),
            1
          );
          return fc;
        }
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
// Test helpers
// ---------------------------------------------------------------------------

function resetState() {
  lastSpawnArgs = null;
  fakeChild = null;
  spawnCallCount = 0;
  spawnShouldFail = false;
}

function collectEvents(stt, eventName, count) {
  return new Promise((resolve) => {
    const events = [];
    const handler = (data) => {
      events.push(data);
      if (events.length >= count) {
        stt.removeListener(eventName, handler);
        resolve(events);
      }
    };
    stt.on(eventName, handler);
  });
}

function waitForEvent(stt, eventName, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      stt.removeListener(eventName, handler);
      reject(
        new Error(`Timed out waiting for "${eventName}" after ${timeoutMs}ms`)
      );
    }, timeoutMs);
    const handler = (data) => {
      clearTimeout(timer);
      resolve(data);
    };
    stt.once(eventName, handler);
  });
}

// ---------------------------------------------------------------------------
// HAPPY PATH TESTS
// ---------------------------------------------------------------------------

test('constructor creates instance with default model', () => {
  resetState();
  const stt = new LocalParakeetSTT();
  assert.ok(stt, 'Should create instance without arguments');
  assert.ok(stt instanceof EventEmitter, 'Must be an EventEmitter');
});

test('constructor accepts custom model ID', () => {
  resetState();
  const stt = new LocalParakeetSTT('parakeet-tdt-0.6b-v2');
  assert.ok(stt, 'Should create instance with custom model');
});

test('start() spawns Swift helper with "stdio" argument', async () => {
  resetState();
  const stt = new LocalParakeetSTT();
  stt.on('error', () => {});
  await stt.start();

  assert.ok(lastSpawnArgs, 'spawn() must be called');
  assert.deepEqual(
    lastSpawnArgs.args,
    ['stdio'],
    'Must pass ["stdio"] to the binary'
  );
  assert.ok(
    lastSpawnArgs.cmd.includes('speech-to-text'),
    `Binary path must contain "speech-to-text", got: ${lastSpawnArgs.cmd}`
  );

  (await stt.destroy?.()) || stt.shutdown?.();
});

test('start() sends start command with model and source', async () => {
  resetState();
  const stt = new LocalParakeetSTT('parakeet-tdt-0.6b-v3');
  stt.setChannel?.('mic') || stt.setSource?.('mic');
  stt.on('error', () => {});
  await stt.start();

  await new Promise((r) => setTimeout(r, 20));

  const startCmd = fakeChild.commands.find((c) => c.type === 'start');
  assert.ok(startCmd, 'Must send a start command');
  assert.equal(
    startCmd.model,
    'parakeet-tdt-0.6b-v3',
    'Must include model in start command'
  );
  assert.ok(
    startCmd.source === 'mic' || startCmd.source === 'system',
    `Source must be "mic" or "system", got: ${startCmd.source}`
  );

  (await stt.destroy?.()) || stt.shutdown?.();
});

test('write() base64-encodes PCM16 buffer and sends audio command', async () => {
  resetState();
  const stt = new LocalParakeetSTT();
  stt.on('error', () => {});
  await stt.start();
  await new Promise((r) => setTimeout(r, 20));

  const pcmBuffer = Buffer.alloc(3200);
  for (let i = 0; i < 1600; i++) {
    pcmBuffer.writeInt16LE(Math.floor(Math.random() * 32767), i * 2);
  }

  stt.write(pcmBuffer);
  await new Promise((r) => setTimeout(r, 10));

  const audioCmd = fakeChild.commands.find((c) => c.type === 'audio');
  assert.ok(audioCmd, 'Must send an audio command');
  assert.ok(audioCmd.pcm16, 'Audio command must have pcm16 field');

  const decoded = Buffer.from(audioCmd.pcm16, 'base64');
  assert.equal(
    decoded.length,
    pcmBuffer.length,
    'Decoded base64 must match original buffer length'
  );
  assert.ok(
    decoded.equals(pcmBuffer),
    'Decoded base64 must match original PCM16 bytes'
  );

  (await stt.destroy?.()) || stt.shutdown?.();
});

test('partial events from Swift emit transcript with isFinal: false', async () => {
  resetState();
  const stt = new LocalParakeetSTT();
  stt.on('error', () => {});
  await stt.start();
  await new Promise((r) => setTimeout(r, 20));

  const transcriptPromise = waitForEvent(stt, 'transcript');

  fakeChild._emitEvent({
    type: 'partial',
    source: 'mic',
    text: 'hello world',
    timestampSeconds: Date.now() / 1000,
  });

  const transcript = await transcriptPromise;
  assert.equal(
    transcript.text,
    'hello world',
    'Partial text must be forwarded'
  );
  assert.equal(transcript.isFinal, false, 'Partial must have isFinal: false');

  (await stt.destroy?.()) || stt.shutdown?.();
});

test('final event from Swift emits transcript with isFinal: true', async () => {
  resetState();
  const stt = new LocalParakeetSTT();
  stt.on('error', () => {});
  await stt.start();
  await new Promise((r) => setTimeout(r, 20));

  const transcriptPromise = waitForEvent(stt, 'transcript');

  fakeChild._emitEvent({
    type: 'final',
    source: 'mic',
    text: 'complete sentence here',
    timestampSeconds: Date.now() / 1000,
  });

  const transcript = await transcriptPromise;
  assert.equal(transcript.text, 'complete sentence here');
  assert.equal(transcript.isFinal, true, 'Final must have isFinal: true');

  (await stt.destroy?.()) || stt.shutdown?.();
});

test('committed events from Swift emit transcript with isFinal: true', async () => {
  resetState();
  const stt = new LocalParakeetSTT();
  stt.on('error', () => {});
  await stt.start();
  await new Promise((r) => setTimeout(r, 20));

  const transcriptPromise = waitForEvent(stt, 'transcript', 1000);

  fakeChild._emitEvent({
    type: 'committed',
    source: 'mic',
    text: 'committed segment',
    timestampSeconds: Date.now() / 1000,
  });

  const transcript = await transcriptPromise;
  assert.equal(
    transcript.text,
    'committed segment',
    'Committed text must be forwarded'
  );
  assert.equal(
    transcript.isFinal,
    true,
    'BUG: committed events are stable confirmed text from the agreement engine — they MUST be isFinal: true. ' +
      'The intelligence engine only builds context from isFinal segments. If committed is isFinal: false, ' +
      'recap, what-to-answer, RAG indexing, and meeting summaries all break (empty context).'
  );

  (await stt.destroy?.()) || stt.shutdown?.();
});

test('stop() sends stop command and triggers final', async () => {
  resetState();
  const stt = new LocalParakeetSTT();
  stt.on('error', () => {});
  await stt.start();
  await new Promise((r) => setTimeout(r, 20));

  fakeChild._finalText = 'the final result';
  const transcriptPromise = waitForEvent(stt, 'transcript');

  stt.stop();
  await new Promise((r) => setTimeout(r, 30));

  const stopCmd = fakeChild.commands.find((c) => c.type === 'stop');
  assert.ok(stopCmd, 'Must send a stop command to Swift helper');

  const transcript = await transcriptPromise;
  assert.equal(
    transcript.isFinal,
    true,
    'Stop must trigger a final transcript'
  );
  assert.ok(transcript.text, 'Final transcript must have text');

  (await stt.destroy?.()) || stt.shutdown?.();
});

test('finalize() behaves like stop()', async () => {
  resetState();
  const stt = new LocalParakeetSTT();
  stt.on('error', () => {});
  await stt.start();
  await new Promise((r) => setTimeout(r, 20));

  if (typeof stt.finalize === 'function') {
    fakeChild._finalText = 'finalized text';
    stt.finalize();
    await new Promise((r) => setTimeout(r, 20));
    const stopCmd = fakeChild.commands.find((c) => c.type === 'stop');
    assert.ok(stopCmd, 'finalize() must send stop command');
  }

  (await stt.destroy?.()) || stt.shutdown?.();
});

test('destroy() kills the child process', async () => {
  resetState();
  const stt = new LocalParakeetSTT();
  stt.on('error', () => {});
  await stt.start();
  await new Promise((r) => setTimeout(r, 20));

  assert.ok(fakeChild, 'Child process must exist after start');
  assert.equal(fakeChild.killed, false, 'Not killed yet');

  (await stt.destroy?.()) || stt.shutdown?.();

  assert.equal(fakeChild.killed, true, 'destroy() must kill the child process');
});

// ---------------------------------------------------------------------------
// MULTI-SESSION TESTS
// ---------------------------------------------------------------------------

test('process is reused across start/stop cycles', async () => {
  resetState();
  const stt = new LocalParakeetSTT();
  stt.on('error', () => {});

  await stt.start();
  await new Promise((r) => setTimeout(r, 20));
  const firstChild = fakeChild;
  const firstSpawnCount = spawnCallCount;

  fakeChild._finalText = 'session 1';
  await stt.stop();
  await new Promise((r) => setTimeout(r, 20));

  await stt.start();
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(
    spawnCallCount,
    firstSpawnCount,
    'Second start() must reuse existing process, not spawn a new one.'
  );
  assert.equal(
    fakeChild,
    firstChild,
    'Same child process instance across sessions'
  );

  (await stt.destroy?.()) || stt.shutdown?.();
});

// ---------------------------------------------------------------------------
// LANGUAGE CONFIGURATION
// ---------------------------------------------------------------------------

test('language setting is forwarded in start command', async () => {
  resetState();
  const stt = new LocalParakeetSTT('parakeet-tdt-0.6b-v3');
  stt.on('error', () => {});

  if (typeof stt.setRecognitionLanguage === 'function') {
    stt.setRecognitionLanguage('fr');
  }

  await stt.start();
  await new Promise((r) => setTimeout(r, 20));

  const startCmd = fakeChild.commands.find((c) => c.type === 'start');
  assert.ok(startCmd, 'Must send start command');
  assert.equal(
    startCmd.language,
    'fr',
    'Language must be forwarded in start command'
  );

  (await stt.destroy?.()) || stt.shutdown?.();
});

// ---------------------------------------------------------------------------
// ERROR PATH TESTS
// ---------------------------------------------------------------------------

test('emits error when binary not found (ENOENT)', async () => {
  resetState();
  spawnShouldFail = true;

  const stt = new LocalParakeetSTT();
  const errorPromise = waitForEvent(stt, 'error');

  try {
    await stt.start();
  } catch {}

  const err = await errorPromise;
  assert.ok(err, 'Must emit error event on spawn failure');
  assert.ok(
    err.message?.includes('ENOENT') ||
      err.message?.includes('spawn') ||
      err.message?.includes('binary'),
    `Error message should indicate spawn failure, got: ${err.message}`
  );

  (await stt.destroy?.()?.catch?.(() => {})) ||
    stt.shutdown?.()?.catch?.(() => {});
});

test('emits error when child process exits unexpectedly', async () => {
  resetState();
  const stt = new LocalParakeetSTT();
  stt.on('error', () => {});
  await stt.start();
  await new Promise((r) => setTimeout(r, 20));

  const errorPromise = waitForEvent(stt, 'error', 1000);

  fakeChild.emit('exit', 1, null);
  fakeChild.emit('close', 1, null);

  const err = await errorPromise;
  assert.ok(err, 'Must emit error when process exits with non-zero code');

  (await stt.destroy?.()?.catch?.(() => {})) ||
    stt.shutdown?.()?.catch?.(() => {});
});

test('handles malformed JSON on stdout gracefully (no crash)', async () => {
  resetState();
  const stt = new LocalParakeetSTT();
  const errors = [];
  stt.on('error', (e) => errors.push(e));
  await stt.start();
  await new Promise((r) => setTimeout(r, 20));

  fakeChild.stdout.emit('data', 'this is not valid json\n');
  fakeChild.stdout.emit(
    'data',
    '{"type":"partial","text":"still works","source":"mic"}\n'
  );

  await new Promise((r) => setTimeout(r, 20));

  const transcripts = [];
  stt.on('transcript', (t) => transcripts.push(t));

  fakeChild._emitEvent({
    type: 'partial',
    source: 'mic',
    text: 'after bad json',
    timestampSeconds: Date.now() / 1000,
  });

  await new Promise((r) => setTimeout(r, 20));

  assert.ok(
    transcripts.some((t) => t.text === 'after bad json'),
    'Must continue processing events after malformed JSON line — no crash.'
  );

  (await stt.destroy?.()) || stt.shutdown?.();
});

test('write before start does not crash', async () => {
  resetState();
  const stt = new LocalParakeetSTT();
  stt.on('error', () => {});

  const pcmBuffer = Buffer.alloc(3200);
  assert.doesNotThrow(
    () => stt.write(pcmBuffer),
    'write() before start() must not throw — silently drop or queue.'
  );

  (await stt.destroy?.()?.catch?.(() => {})) ||
    stt.shutdown?.()?.catch?.(() => {});
});

test('handles empty text in events gracefully', async () => {
  resetState();
  const stt = new LocalParakeetSTT();
  stt.on('error', () => {});
  await stt.start();
  await new Promise((r) => setTimeout(r, 20));

  assert.doesNotThrow(() => {
    fakeChild._emitEvent({
      type: 'partial',
      source: 'mic',
      text: '',
      timestampSeconds: Date.now() / 1000,
    });
  }, 'Empty text in partial must not crash');

  await new Promise((r) => setTimeout(r, 10));
  (await stt.destroy?.()) || stt.shutdown?.();
});

test('error event from Swift helper is surfaced', async () => {
  resetState();
  const stt = new LocalParakeetSTT();
  const errors = [];
  stt.on('error', (e) => errors.push(e));
  await stt.start();
  await new Promise((r) => setTimeout(r, 20));

  fakeChild._emitEvent({
    type: 'error',
    message: 'Model download failed',
    timestampSeconds: Date.now() / 1000,
  });

  await new Promise((r) => setTimeout(r, 20));

  assert.ok(
    errors.length > 0,
    'Swift error events must be surfaced as error emissions.'
  );
  assert.ok(
    errors.some(
      (e) =>
        e.message?.includes('Model download') ||
        String(e).includes('Model download')
    ),
    'Error message from Swift helper must be preserved.'
  );

  (await stt.destroy?.()?.catch?.(() => {})) ||
    stt.shutdown?.()?.catch?.(() => {});
});

test('stderr output does not crash the process', async () => {
  resetState();
  const stt = new LocalParakeetSTT();
  stt.on('error', () => {});
  await stt.start();
  await new Promise((r) => setTimeout(r, 20));

  assert.doesNotThrow(() => {
    fakeChild.stderr.emit('data', 'some debug output from Swift\n');
    fakeChild.stderr.emit('data', 'warning: something happened\n');
  }, 'stderr output must not crash the provider');

  (await stt.destroy?.()) || stt.shutdown?.();
});

test('multiple rapid writes do not interleave JSON lines', async () => {
  resetState();
  const stt = new LocalParakeetSTT();
  stt.on('error', () => {});
  await stt.start();
  await new Promise((r) => setTimeout(r, 20));

  const buffers = Array.from({ length: 20 }, (_, i) => {
    const buf = Buffer.alloc(320);
    buf.writeInt16LE(i, 0);
    return buf;
  });

  for (const buf of buffers) {
    stt.write(buf);
  }

  await new Promise((r) => setTimeout(r, 50));

  const allWritten = fakeChild.stdin.written.join('');
  const lines = allWritten.split('\n').filter(Boolean);

  for (const line of lines) {
    assert.doesNotThrow(
      () => JSON.parse(line),
      `Every line written to stdin must be valid JSON. Got: ${line.slice(0, 100)}`
    );
  }

  (await stt.destroy?.()) || stt.shutdown?.();
});

test('destroy after destroy is safe (idempotent)', async () => {
  resetState();
  const stt = new LocalParakeetSTT();
  stt.on('error', () => {});
  await stt.start();
  await new Promise((r) => setTimeout(r, 20));

  await assert.doesNotReject(async () => {
    await (stt.destroy?.() || stt.shutdown?.());
    await (stt.destroy?.() || stt.shutdown?.());
  }, 'Double destroy must not throw or reject');
});

test('stop without prior start does not crash', async () => {
  resetState();
  const stt = new LocalParakeetSTT();
  stt.on('error', () => {});

  await assert.doesNotReject(async () => {
    await stt.stop?.();
  }, 'stop() without start() must not crash');
});

// ---------------------------------------------------------------------------
// BUFFERED STDOUT (partial lines across chunks)
// ---------------------------------------------------------------------------

test('handles stdout data split across multiple chunks', async () => {
  resetState();
  const stt = new LocalParakeetSTT();
  stt.on('error', () => {});
  await stt.start();
  await new Promise((r) => setTimeout(r, 20));

  const transcriptPromise = waitForEvent(stt, 'transcript');

  const fullEvent =
    JSON.stringify({
      type: 'partial',
      source: 'mic',
      text: 'split across chunks',
      timestampSeconds: Date.now() / 1000,
    }) + '\n';

  const mid = Math.floor(fullEvent.length / 2);
  fakeChild.stdout.emit('data', fullEvent.slice(0, mid));
  fakeChild.stdout.emit('data', fullEvent.slice(mid));

  const transcript = await transcriptPromise;
  assert.equal(
    transcript.text,
    'split across chunks',
    'Must reassemble split stdout chunks'
  );

  (await stt.destroy?.()) || stt.shutdown?.();
});

test('handles multiple events in a single stdout chunk', async () => {
  resetState();
  const stt = new LocalParakeetSTT();
  stt.on('error', () => {});
  await stt.start();
  await new Promise((r) => setTimeout(r, 20));

  const transcripts = [];
  stt.on('transcript', (t) => transcripts.push(t));

  const events = [
    { type: 'partial', source: 'mic', text: 'first', timestampSeconds: 1 },
    { type: 'partial', source: 'mic', text: 'second', timestampSeconds: 2 },
  ];
  const combined = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
  fakeChild.stdout.emit('data', combined);

  await new Promise((r) => setTimeout(r, 30));

  assert.ok(
    transcripts.length >= 2,
    `Must parse multiple events from one chunk, got ${transcripts.length}`
  );
  assert.equal(transcripts[0].text, 'first');
  assert.equal(transcripts[1].text, 'second');

  (await stt.destroy?.()) || stt.shutdown?.();
});
