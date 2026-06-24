// Full pipeline e2e test — real Swift binary + real LocalParakeetSTT class.
//
// No mocks. Generates real speech audio via macOS TTS, feeds it through
// the actual LocalParakeetSTT TypeScript class (compiled JS) which spawns
// the real speech-to-text Swift binary, and verifies transcript events
// come out correctly.
//
// This tests the ENTIRE chain: audio → base64 → stdio → Swift/FluidAudio
// → CoreML/ANE → agreement engine → committed/partial/final events
// → LocalParakeetSTT event mapping → isFinal values.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Module from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../..');
const binaryPath = path.join(
  projectRoot,
  'local-stt-engine',
  '.build',
  'release',
  'speech-to-text'
);
const compiledPath = path.join(
  projectRoot,
  'dist-main',
  'main',
  'audio',
  'LocalParakeetSTT.js'
);

if (process.platform !== 'darwin') {
  console.log('SKIP: requires macOS');
  process.exit(0);
}
if (!fs.existsSync(binaryPath)) {
  console.log('SKIP: Swift binary not built');
  process.exit(0);
}
if (!fs.existsSync(compiledPath)) {
  console.log('SKIP: LocalParakeetSTT.js not compiled');
  process.exit(0);
}

// Patch Module._load to handle electron imports (not available in test)
const origLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return {
      app: {
        getAppPath: () => projectRoot,
        getPath: () => '/tmp/fake-cheatly-data',
        isPackaged: false,
        isReady: () => true,
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

const { LocalParakeetSTT } = await import(pathToFileURL(compiledPath).href);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parakeet-pipeline-'));

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

function feedAudioToSTT(stt, pcm) {
  const chunkSize = 3200; // 100ms of 16kHz mono PCM16
  for (let i = 0; i < pcm.length; i += chunkSize) {
    const chunk = pcm.slice(i, Math.min(i + chunkSize, pcm.length));
    stt.write(chunk);
  }
}

function collectTranscripts(stt, timeoutMs = 20000) {
  return new Promise((resolve) => {
    const transcripts = [];
    const timer = setTimeout(() => {
      stt.removeAllListeners('transcript');
      resolve(transcripts);
    }, timeoutMs);
    stt.on('transcript', (t) => {
      transcripts.push({ ...t, receivedAt: Date.now() });
    });
    stt.once('error', () => {
      clearTimeout(timer);
      resolve(transcripts);
    });
  });
}

// ---------------------------------------------------------------------------
// FULL PIPELINE E2E TESTS
// ---------------------------------------------------------------------------

test('PIPELINE: real audio through real LocalParakeetSTT produces isFinal transcripts', async () => {
  const wavPath = generateAudio(
    'Hello my name is John and I work as a software engineer.',
    'pipeline-basic'
  );
  const pcm = readPcm16(wavPath);

  const stt = new LocalParakeetSTT('parakeet-tdt-0.6b-v3');
  stt.setChannel('mic');
  stt.on('error', (e) => console.error('[test] STT error:', e.message));

  const collecting = collectTranscripts(stt);
  await stt.start();

  feedAudioToSTT(stt, pcm);

  // Wait for agreement engine to process, then stop
  await new Promise((r) => setTimeout(r, 5000));
  stt.stop();
  await new Promise((r) => setTimeout(r, 3000));

  const transcripts = await collecting;
  await stt.destroy();

  const partials = transcripts.filter((t) => !t.isFinal);
  const finals = transcripts.filter((t) => t.isFinal);

  assert.ok(
    transcripts.length > 0,
    'Must receive at least one transcript event'
  );
  assert.ok(
    partials.length > 0,
    'Must receive partial events from agreement engine'
  );

  const allFinalText = finals
    .map((t) => t.text)
    .join(' ')
    .toLowerCase();
  const allText = transcripts
    .map((t) => t.text)
    .join(' ')
    .toLowerCase();

  assert.ok(
    allText.includes('john') || allText.includes('software'),
    `Transcripts must contain spoken words. Got: "${allText.slice(0, 200)}"`
  );

  // Finals must have isFinal: true
  for (const f of finals) {
    assert.equal(
      f.isFinal,
      true,
      `Final transcript must have isFinal: true. Got: ${JSON.stringify(f)}`
    );
  }
});

test('PIPELINE: trailing speech not committed is included in final', async () => {
  // Two sentences — first should commit, second may only be partial at stop time
  const wavPath = generateAudio(
    'The weather is sunny today. I enjoy working on distributed systems.',
    'pipeline-trailing'
  );
  const pcm = readPcm16(wavPath);

  const stt = new LocalParakeetSTT('parakeet-tdt-0.6b-v3');
  stt.setChannel('mic');
  stt.on('error', (e) => console.error('[test] STT error:', e.message));

  const collecting = collectTranscripts(stt);
  await stt.start();

  feedAudioToSTT(stt, pcm);

  await new Promise((r) => setTimeout(r, 5000));
  stt.stop();
  await new Promise((r) => setTimeout(r, 3000));

  const transcripts = await collecting;
  await stt.destroy();

  const finals = transcripts.filter((t) => t.isFinal);
  const allFinalText = finals
    .map((t) => t.text)
    .join(' ')
    .toLowerCase();

  // The last partial text must appear somewhere in finals
  const lastPartial = [...transcripts].reverse().find((t) => !t.isFinal);
  if (lastPartial) {
    const lastWords = lastPartial.text
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const somePresent = lastWords.some((w) => allFinalText.includes(w));
    assert.ok(
      somePresent || allFinalText.length >= lastPartial.text.length * 0.7,
      `BUG: Trailing partial text lost. Last partial: "${lastPartial.text}", ` +
        `All finals: "${allFinalText}". The rolling bar showed this text but it ` +
        'was not saved to the transcript.'
    );
  }
});

test('PIPELINE: short speech produces at least one final', async () => {
  const wavPath = generateAudio('Yes.', 'pipeline-short');
  const pcm = readPcm16(wavPath);

  const stt = new LocalParakeetSTT('parakeet-tdt-0.6b-v3');
  stt.setChannel('mic');
  stt.on('error', (e) => console.error('[test] STT error:', e.message));

  const collecting = collectTranscripts(stt);
  await stt.start();

  feedAudioToSTT(stt, pcm);

  await new Promise((r) => setTimeout(r, 4000));
  stt.stop();
  await new Promise((r) => setTimeout(r, 3000));

  const transcripts = await collecting;
  await stt.destroy();

  const finals = transcripts.filter((t) => t.isFinal);
  assert.ok(
    finals.length >= 1,
    `Short speech must produce at least one final. Got ${finals.length} finals, ` +
      `${transcripts.length} total events. If 0 finals, the text is lost from saved transcript.`
  );
});

test('PIPELINE: dual channel — mic and system produce independent transcripts', async () => {
  const wavPath = generateAudio(
    'Tell me about your experience with databases.',
    'pipeline-dual'
  );
  const pcm = readPcm16(wavPath);

  const micStt = new LocalParakeetSTT('parakeet-tdt-0.6b-v3');
  micStt.setChannel('mic');
  micStt.on('error', () => {});

  const sysStt = new LocalParakeetSTT('parakeet-tdt-0.6b-v3');
  sysStt.setChannel('system');
  sysStt.on('error', () => {});

  const micCollecting = collectTranscripts(micStt);
  const sysCollecting = collectTranscripts(sysStt);

  await micStt.start();
  await sysStt.start();

  // Feed same audio to both channels (simulates both people talking)
  feedAudioToSTT(micStt, pcm);
  feedAudioToSTT(sysStt, pcm);

  await new Promise((r) => setTimeout(r, 5000));
  micStt.stop();
  sysStt.stop();
  await new Promise((r) => setTimeout(r, 3000));

  const micTranscripts = await micCollecting;
  const sysTranscripts = await sysCollecting;

  await micStt.destroy();
  await sysStt.destroy();

  assert.ok(micTranscripts.length > 0, 'Mic channel must produce transcripts');
  assert.ok(
    sysTranscripts.length > 0,
    'System channel must produce transcripts'
  );

  const micFinals = micTranscripts.filter((t) => t.isFinal);
  const sysFinals = sysTranscripts.filter((t) => t.isFinal);

  assert.ok(micFinals.length >= 1, 'Mic must produce at least one final');
  assert.ok(sysFinals.length >= 1, 'System must produce at least one final');
});

// Cleanup
test('cleanup', () => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
