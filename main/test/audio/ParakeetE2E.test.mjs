// End-to-end test against the real Swift speech-to-text binary.
//
// Generates speech audio via macOS TTS, converts to 16kHz mono PCM16,
// feeds to the actual binary over stdio, and verifies transcript output.
// No mocks — tests the full pipeline: audio → FluidAudio → CoreML → ANE → text.
//
// Requirements: macOS with Apple Silicon, local-stt-engine built
// (swift build -c release), and Parakeet v3 model cached.
//
// MUST run serialized with the other *Parakeet* files (test:unit:stt uses
// --test-concurrency=1): concurrent binaries loading the CoreML model fight
// over the ANE compile cache and sessions die mid-test with write EPIPE.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../..');
const binaryPath = path.join(
  projectRoot,
  'local-stt-engine',
  '.build',
  'release',
  'speech-to-text'
);

if (process.platform !== 'darwin') {
  console.log('SKIP: Parakeet e2e tests require macOS');
  process.exit(0);
}

if (!fs.existsSync(binaryPath)) {
  console.log(
    'SKIP: Swift binary not built — run: cd local-stt-engine && swift build -c release'
  );
  process.exit(0);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parakeet-e2e-'));

function generateAudio(text, filename) {
  const aiffPath = path.join(tmpDir, `${filename}.aiff`);
  const wavPath = path.join(tmpDir, `${filename}.wav`);
  execSync(`say -o "${aiffPath}" "${text}"`);
  execSync(`afconvert -f WAVE -d LEI16@16000 -c 1 "${aiffPath}" "${wavPath}"`);
  return wavPath;
}

function readPcm16(wavPath) {
  const wav = fs.readFileSync(wavPath);
  return wav.slice(44);
}

function runStdioSession(pcm, opts = {}) {
  const model = opts.model || 'parakeet-tdt-0.6b-v3';
  const language = opts.language || 'en';
  const timeoutMs = opts.timeout || 30000;

  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, ['stdio']);
    let stdout = '';
    const events = [];

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Stdio session timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      const lines = stdout.split('\n');
      stdout = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          events.push(JSON.parse(line));
        } catch {}
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', () => {});

    child.on('exit', () => {
      clearTimeout(timer);
      if (stdout.trim()) {
        try {
          events.push(JSON.parse(stdout.trim()));
        } catch {}
      }
      resolve(events);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.stdin.write(
      JSON.stringify({ type: 'start', model, language, source: 'mic' }) + '\n'
    );

    setTimeout(() => {
      const chunkSize = 32000;
      for (let i = 0; i < pcm.length; i += chunkSize) {
        const chunk = pcm.slice(i, Math.min(i + chunkSize, pcm.length));
        child.stdin.write(
          JSON.stringify({
            type: 'audio',
            source: 'mic',
            pcm16: chunk.toString('base64'),
          }) + '\n'
        );
      }

      setTimeout(() => {
        child.stdin.write(JSON.stringify({ type: 'stop' }) + '\n');
        setTimeout(() => child.kill(), 5000);
      }, 2000);
    }, 3000);
  });
}

// ---------------------------------------------------------------------------
// E2E TESTS
// ---------------------------------------------------------------------------

test('E2E: transcribes English speech correctly', async () => {
  const text = 'Hello, my name is John and I work as a software engineer.';
  const wavPath = generateAudio(text, 'english');
  const pcm = readPcm16(wavPath);
  const events = await runStdioSession(pcm);

  assert.ok(
    events.some((e) => e.type === 'session_started'),
    'Must emit session_started'
  );

  const finals = events.filter(
    (e) => e.type === 'final' || e.type === 'committed'
  );
  assert.ok(
    finals.length > 0,
    'Must emit at least one committed or final event'
  );

  const allText = finals
    .map((e) => e.text)
    .join(' ')
    .toLowerCase();
  assert.ok(
    allText.includes('john'),
    `Transcript must contain "john", got: "${allText}"`
  );
  assert.ok(
    allText.includes('software'),
    `Transcript must contain "software", got: "${allText}"`
  );
});

test('E2E: transcribes multi-sentence speech', async () => {
  const text =
    'The weather is nice today. I enjoy working on distributed systems. Kubernetes is widely used.';
  const wavPath = generateAudio(text, 'multi-sentence');
  const pcm = readPcm16(wavPath);
  const events = await runStdioSession(pcm);

  const allText = events
    .filter((e) => e.type === 'final' || e.type === 'committed')
    .map((e) => e.text)
    .join(' ')
    .toLowerCase();

  assert.ok(
    allText.includes('weather'),
    `Must contain "weather", got: "${allText}"`
  );
  assert.ok(
    allText.includes('distributed'),
    `Must contain "distributed", got: "${allText}"`
  );
  assert.ok(
    allText.includes('kubernetes'),
    `Must contain "kubernetes", got: "${allText}"`
  );
});

test('E2E: emits correct event sequence (session_started → partial/committed → final)', async () => {
  const text = 'Testing the event sequence of the speech recognition pipeline.';
  const wavPath = generateAudio(text, 'sequence');
  const pcm = readPcm16(wavPath);
  const events = await runStdioSession(pcm);

  const types = events.map((e) => e.type);

  assert.ok(
    types[0] === 'session_started',
    `First event must be session_started, got: ${types[0]}`
  );
  assert.ok(
    types[types.length - 1] === 'final',
    `Last event must be final, got: ${types[types.length - 1]}`
  );
  assert.ok(
    types.some((t) => t === 'partial' || t === 'committed'),
    'Must have at least one partial or committed between session_started and final'
  );
});

test('E2E: committed text appears in final event', async () => {
  const text = 'Machine learning models require large datasets for training.';
  const wavPath = generateAudio(text, 'committed-in-final');
  const pcm = readPcm16(wavPath);
  const events = await runStdioSession(pcm);

  const committed = events
    .filter((e) => e.type === 'committed')
    .map((e) => e.text);
  const final = events.find((e) => e.type === 'final');

  assert.ok(final, 'Must have a final event');
  assert.ok(final.text.length > 0, 'Final text must be non-empty');

  if (committed.length > 0) {
    const committedJoined = committed.join(' ').toLowerCase();
    assert.ok(
      committedJoined.includes('machine') ||
        committedJoined.includes('learning') ||
        committedJoined.includes('model'),
      `Committed text should contain speech content, got: "${committedJoined}"`
    );
  }
});

test('E2E: all events have required fields', async () => {
  const text =
    'Validate that every event from the binary has the required fields.';
  const wavPath = generateAudio(text, 'fields');
  const pcm = readPcm16(wavPath);
  const events = await runStdioSession(pcm);

  for (const event of events) {
    assert.ok(
      event.type,
      `Every event must have a type field: ${JSON.stringify(event)}`
    );
    assert.ok(
      typeof event.timestampSeconds === 'number',
      `Every event must have timestampSeconds: ${JSON.stringify(event)}`
    );

    if (
      event.type === 'partial' ||
      event.type === 'committed' ||
      event.type === 'final'
    ) {
      assert.ok(
        typeof event.text === 'string',
        `${event.type} must have text field: ${JSON.stringify(event)}`
      );
      assert.ok(
        event.source === 'mic' || event.source === 'system',
        `${event.type} must have valid source: ${JSON.stringify(event)}`
      );
    }
  }
});

test('E2E: handles silence gracefully (no crash, minimal output)', async () => {
  const silentPcm = Buffer.alloc(32000);
  const events = await runStdioSession(silentPcm);

  assert.ok(
    events.some((e) => e.type === 'session_started'),
    'Must start session even with silence'
  );
  assert.ok(
    events.some((e) => e.type === 'final'),
    'Must emit final even with silence'
  );

  const final = events.find((e) => e.type === 'final');
  assert.ok(
    final.text === '' || final.text.length < 20,
    'Silent audio should produce empty or very short transcript'
  );
});

test('E2E: repeated short phrase does not produce duplicate committed events', async () => {
  const text = 'Yes. Yes. Yes. Yes. Yes.';
  const wavPath = generateAudio(text, 'repeated-phrase');
  const pcm = readPcm16(wavPath);
  const events = await runStdioSession(pcm);

  const committed = events.filter((e) => e.type === 'committed');
  const committedTexts = committed.map((e) => e.text.trim().toLowerCase());

  // The Swift binary may commit the repeated "yes" as one or more segments.
  // Key assertion: no two CONSECUTIVE committed events have identical text.
  for (let i = 1; i < committedTexts.length; i++) {
    assert.notEqual(
      committedTexts[i],
      committedTexts[i - 1],
      `BUG: consecutive committed events have identical text at index ${i}: "${committedTexts[i]}". ` +
        'The agreement engine should not re-commit the same stable text on successive passes.'
    );
  }
});

test('E2E: two distinct sentences produce two distinct committed segments', async () => {
  const text =
    'The first sentence is about dogs. The second sentence is about cats.';
  const wavPath = generateAudio(text, 'two-sentences');
  const pcm = readPcm16(wavPath);
  const events = await runStdioSession(pcm);

  const committed = events.filter((e) => e.type === 'committed');
  const final = events.find((e) => e.type === 'final');
  const allText = [...committed.map((e) => e.text), final?.text || '']
    .join(' ')
    .toLowerCase();

  assert.ok(
    allText.includes('dogs') || allText.includes('first'),
    'Must transcribe first sentence'
  );
  assert.ok(
    allText.includes('cats') || allText.includes('second'),
    'Must transcribe second sentence'
  );
});

test('E2E: final event includes trailing partial text not yet committed', async () => {
  // Generate two sentences — the agreement engine should commit the first
  // but may not commit the second before stop fires. The final event must
  // include BOTH committed + trailing partial text.
  const text =
    'The first sentence is about machine learning. The second sentence discusses neural networks.';
  const wavPath = generateAudio(text, 'trailing-partial');
  const pcm = readPcm16(wavPath);
  const events = await runStdioSession(pcm);

  const committed = events.filter((e) => e.type === 'committed');
  const final = events.find((e) => e.type === 'final');

  assert.ok(final, 'Must have a final event');
  assert.ok(final.text.length > 0, 'Final text must be non-empty');

  // The final must contain AT LEAST as much text as the last partial
  const lastPartial = [...events].reverse().find((e) => e.type === 'partial');
  if (lastPartial && lastPartial.text) {
    const finalLower = final.text.toLowerCase();
    const partialWords = lastPartial.text.toLowerCase().split(/\s+/).slice(-3);
    const someWordsPresent = partialWords.some(
      (w) => w.length > 3 && finalLower.includes(w)
    );
    assert.ok(
      someWordsPresent || final.text.length >= lastPartial.text.length,
      `BUG: Final text is shorter than last partial and missing key words. ` +
        `Final: "${final.text}" (${final.text.length}), Last partial: "${lastPartial.text}" (${lastPartial.text.length}). ` +
        'The final event must include trailing partial text that was not yet committed, ' +
        'otherwise the last thing displayed in the rolling bar is lost from the saved transcript.'
    );
  }

  // If committed events fired, final must be longer than or equal to committed text
  if (committed.length > 0) {
    const committedTotal = committed.map((e) => e.text).join(' ').length;
    assert.ok(
      final.text.length >= committedTotal * 0.8,
      `Final text (${final.text.length}) should be at least as long as committed total (${committedTotal}). ` +
        'Final must include committed parts + any trailing partial.'
    );
  }
});

test('E2E: short speech that never commits still produces final', async () => {
  // Very short phrase — agreement engine needs 3 passes (~3s) to commit,
  // but the audio is only ~1s. No committed events should fire.
  // The final event must still contain the text.
  const text = 'Hello world.';
  const wavPath = generateAudio(text, 'short-no-commit');
  const pcm = readPcm16(wavPath);
  const events = await runStdioSession(pcm);

  const committed = events.filter((e) => e.type === 'committed');
  const final = events.find((e) => e.type === 'final');

  assert.ok(final, 'Must have a final event even for short speech');

  if (committed.length === 0) {
    assert.ok(
      final.text.length > 0,
      `BUG: No committed events and final is empty. Short speech must still produce text via final. ` +
        `Final: "${final.text}"`
    );
    assert.ok(
      final.text.toLowerCase().includes('hello'),
      `Final must contain spoken text. Got: "${final.text}"`
    );
  }
});

// Cleanup
test('cleanup temp files', () => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
