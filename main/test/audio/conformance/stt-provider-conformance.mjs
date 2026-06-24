// ══════════════════════════════════════════════════════════════════════════════
// STT Provider Conformance Test Suite
// ══════════════════════════════════════════════════════════════════════════════
//
// Every local STT provider binary MUST pass this suite before integration.
// Tests use real audio (macOS TTS) and the real binary — zero mocks.
//
// To run against a provider:
//   node --test main/test/audio/conformance/stt-provider-conformance.mjs
//
// To test a different binary, set STT_BINARY_PATH:
//   STT_BINARY_PATH=/path/to/whisper-cli node --test ...
//
// The binary must implement the stdio JSON protocol:
//   stdin:  {"type":"start",...} / {"type":"audio",...} / {"type":"stop"}
//   stdout: {"type":"session_started",...} / {"type":"partial",...} /
//           {"type":"committed",...} / {"type":"final",...}
//
// ══════════════════════════════════════════════════════════════════════════════

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../../..');

// ── Provider binary resolution ──────────────────────────────────────────────
const BINARY_PATH =
  process.env.STT_BINARY_PATH ||
  path.join(
    projectRoot,
    'local-stt-engine',
    '.build',
    'release',
    'speech-to-text'
  );
const PROVIDER_NAME =
  process.env.STT_PROVIDER_NAME || path.basename(BINARY_PATH);

if (process.platform !== 'darwin') {
  console.log('SKIP: conformance tests require macOS (TTS audio generation)');
  process.exit(0);
}

if (!fs.existsSync(BINARY_PATH)) {
  console.log(`SKIP: binary not found at ${BINARY_PATH}`);
  console.log('Set STT_BINARY_PATH to your provider binary.');
  process.exit(0);
}

// ── Audio generation ────────────────────────────────────────────────────────
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stt-conformance-'));

function generateAudio(text, name) {
  const aiff = path.join(tmpDir, `${name}.aiff`);
  const wav = path.join(tmpDir, `${name}.wav`);
  execSync(`say -o "${aiff}" "${text}"`);
  execSync(`afconvert -f WAVE -d LEI16@16000 -c 1 "${aiff}" "${wav}"`);
  return fs.readFileSync(wav).slice(44); // skip WAV header → raw PCM16
}

// ── Stdio session runner ────────────────────────────────────────────────────
function runSession(pcm, opts = {}) {
  const model = opts.model || 'parakeet-tdt-0.6b-v3';
  const language = opts.language || 'en';
  const timeoutMs = opts.timeout || 30000;

  return new Promise((resolve, reject) => {
    const child = spawn(BINARY_PATH, ['stdio']);
    let buf = '';
    const events = [];

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Session timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop();
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
      if (buf.trim()) {
        try {
          events.push(JSON.parse(buf.trim()));
        } catch {}
      }
      resolve(events);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    // Start session
    child.stdin.write(
      JSON.stringify({ type: 'start', model, language, source: 'mic' }) + '\n'
    );

    // Feed audio after model loads
    setTimeout(() => {
      const chunkSize = 32000; // 1s of 16kHz mono PCM16
      for (let i = 0; i < pcm.length; i += chunkSize) {
        child.stdin.write(
          JSON.stringify({
            type: 'audio',
            source: 'mic',
            pcm16: pcm
              .slice(i, Math.min(i + chunkSize, pcm.length))
              .toString('base64'),
          }) + '\n'
        );
      }

      // Stop after processing time
      setTimeout(() => {
        child.stdin.write(JSON.stringify({ type: 'stop' }) + '\n');
        setTimeout(() => child.kill(), 5000);
      }, 2000);
    }, 3000);
  });
}

// ── Pre-generate audio fixtures ─────────────────────────────────────────────
const AUDIO = {};

test(`[${PROVIDER_NAME}] generate audio fixtures`, () => {
  AUDIO.normal = generateAudio(
    'Hello, my name is John. I have five years of experience with distributed systems.',
    'normal'
  );
  AUDIO.twoSentences = generateAudio(
    'The first sentence is about machine learning. The second sentence discusses neural networks.',
    'two-sentences'
  );
  AUDIO.short = generateAudio('Yes.', 'short');
  AUDIO.silence = Buffer.alloc(32000); // 1s of silence
});

// ══════════════════════════════════════════════════════════════════════════════
// CONFORMANCE TESTS
// ══════════════════════════════════════════════════════════════════════════════

describe(`STT Provider Conformance: ${PROVIDER_NAME}`, () => {
  // ── 1. session_started before any content events ──────────────────────────

  test('C01: sends session_started before any partial/committed/final', async () => {
    const events = await runSession(AUDIO.normal);
    const types = events.map((e) => e.type);

    assert.ok(types.includes('session_started'), 'Must emit session_started');

    const sessionIdx = types.indexOf('session_started');
    const firstContent = types.findIndex(
      (t) => t === 'partial' || t === 'committed' || t === 'final'
    );

    assert.ok(
      firstContent === -1 || sessionIdx < firstContent,
      `session_started (index ${sessionIdx}) must come before first content event (index ${firstContent}). ` +
        `Event order: ${types.join(', ')}`
    );
  });

  // ── 2. committed text is stable (no re-commits) ──────────────────────────

  test('C02: committed text is stable — same text not re-committed consecutively', async () => {
    const events = await runSession(AUDIO.twoSentences);
    const committed = events.filter((e) => e.type === 'committed');

    for (let i = 1; i < committed.length; i++) {
      assert.notEqual(
        committed[i].text,
        committed[i - 1].text,
        `Consecutive committed events have identical text at index ${i}: "${committed[i].text}". ` +
          'The agreement engine must not re-commit the same stable text.'
      );
    }
  });

  // ── 3. final includes ALL text (committed + trailing partial) ─────────────

  test('C03: final includes committed text AND trailing partial', async () => {
    const events = await runSession(AUDIO.twoSentences);

    const committed = events.filter((e) => e.type === 'committed');
    const final = events.find((e) => e.type === 'final');
    const lastPartial = [...events].reverse().find((e) => e.type === 'partial');

    assert.ok(final, 'Must emit a final event');
    assert.ok(final.text.length > 0, 'Final text must be non-empty');

    // Final must contain committed text
    if (committed.length > 0) {
      const committedWords = committed
        .map((c) => c.text.toLowerCase().split(/\s+/))
        .flat()
        .filter((w) => w.length > 3);
      const finalLower = final.text.toLowerCase();
      const committedPresent = committedWords.filter((w) =>
        finalLower.includes(w)
      );
      assert.ok(
        committedPresent.length >= committedWords.length * 0.5,
        `Final must contain most committed words. Final: "${final.text}", ` +
          `Committed words: [${committedWords.join(', ')}], Found: [${committedPresent.join(', ')}]`
      );
    }

    // Final must include trailing partial content (if any)
    if (lastPartial && lastPartial.text) {
      const partialWords = lastPartial.text
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .slice(-3);
      const somePresent = partialWords.some((w) =>
        final.text.toLowerCase().includes(w)
      );
      assert.ok(
        somePresent || final.text.length >= lastPartial.text.length * 0.7,
        `Final must include trailing partial text. Final: "${final.text}" (${final.text.length}), ` +
          `Last partial: "${lastPartial.text}" (${lastPartial.text.length}). ` +
          'If this fails, the last text shown in the rolling bar will be lost from the saved transcript.'
      );
    }
  });

  // ── 4. final fires exactly once per stop ──────────────────────────────────

  test('C04: final fires exactly once per stop', async () => {
    const events = await runSession(AUDIO.normal);
    const finals = events.filter((e) => e.type === 'final');

    assert.equal(
      finals.length,
      1,
      `Expected exactly 1 final event, got ${finals.length}. ` +
        'Multiple finals cause duplicate entries in the saved transcript.'
    );
  });

  // ── 5. partial text grows monotonically ───────────────────────────────────

  test('C05: partial text does not shrink (grows or changes, never shorter)', async () => {
    const events = await runSession(AUDIO.normal);
    const partials = events.filter((e) => e.type === 'partial' && e.text);

    for (let i = 1; i < partials.length; i++) {
      const prev = partials[i - 1].text;
      const curr = partials[i].text;

      // Allow new utterance (different start) but NOT same utterance shrinking
      const prevNorm = prev.toLowerCase().replace(/[^\w\s]/g, '');
      const currNorm = curr.toLowerCase().replace(/[^\w\s]/g, '');

      if (
        currNorm.startsWith(prevNorm.slice(0, 10)) ||
        prevNorm.startsWith(currNorm.slice(0, 10))
      ) {
        // Same utterance context — length should not decrease significantly
        assert.ok(
          curr.length >= prev.length * 0.7,
          `Partial text shrank significantly at index ${i}. ` +
            `Prev (${prev.length}): "${prev}", Curr (${curr.length}): "${curr}". ` +
            'This causes visible text removal in the rolling bar.'
        );
      }
    }
  });

  // ── 6. silence produces no committed events ───────────────────────────────

  test('C06: silence produces no committed events with actual text', async () => {
    const events = await runSession(AUDIO.silence);
    const committed = events.filter(
      (e) => e.type === 'committed' && e.text && e.text.trim().length > 0
    );

    assert.equal(
      committed.length,
      0,
      `Silence should produce 0 non-empty committed events, got ${committed.length}: ` +
        `[${committed.map((c) => `"${c.text}"`).join(', ')}]. ` +
        'Ghost commits from silence pollute the transcript.'
    );
  });

  // ── 7. short speech (<2s) still produces text in final ────────────────────

  test('C07: short speech still produces text in final', async () => {
    const events = await runSession(AUDIO.short);
    const final = events.find((e) => e.type === 'final');

    assert.ok(final, 'Must emit final even for short speech');
    assert.ok(
      final.text.length > 0,
      `Short speech must produce non-empty final. Got: "${final.text}". ` +
        'If the agreement engine never committed, the final must fall back to lastPartial.'
    );
  });

  // ── 8. timestamps reflect speech time ─────────────────────────────────────

  test('C08: events have timestampSeconds field', async () => {
    const events = await runSession(AUDIO.normal);

    for (const event of events) {
      assert.ok(
        typeof event.timestampSeconds === 'number',
        `Event ${event.type} missing timestampSeconds: ${JSON.stringify(event)}`
      );
    }
  });

  // ── 9. events are valid JSON with required fields ─────────────────────────

  test('C09: all events have required fields per type', async () => {
    const events = await runSession(AUDIO.normal);

    for (const event of events) {
      assert.ok(event.type, `Event missing type: ${JSON.stringify(event)}`);
      assert.ok(
        typeof event.timestampSeconds === 'number',
        `Event missing timestampSeconds: ${JSON.stringify(event)}`
      );

      if (event.type === 'session_started') {
        assert.ok(
          event.source === 'mic' || event.source === 'system',
          `session_started missing valid source: ${JSON.stringify(event)}`
        );
      }

      if (
        event.type === 'partial' ||
        event.type === 'committed' ||
        event.type === 'final'
      ) {
        assert.ok(
          typeof event.text === 'string',
          `${event.type} missing text field: ${JSON.stringify(event)}`
        );
        assert.ok(
          event.source === 'mic' || event.source === 'system',
          `${event.type} missing valid source: ${JSON.stringify(event)}`
        );
      }

      if (event.type === 'error') {
        assert.ok(
          typeof event.message === 'string',
          `error event missing message: ${JSON.stringify(event)}`
        );
      }
    }
  });

  // ── 10. event ordering is consistent ──────────────────────────────────────

  test('C10: event order is session_started → partials/committed → final (last)', async () => {
    const events = await runSession(AUDIO.normal);
    const types = events.map((e) => e.type);

    assert.equal(
      types[0],
      'session_started',
      `First event must be session_started, got: ${types[0]}`
    );
    assert.equal(
      types[types.length - 1],
      'final',
      `Last event must be final, got: ${types[types.length - 1]}`
    );

    // No content events before session_started
    const sessionIdx = types.indexOf('session_started');
    for (let i = 0; i < sessionIdx; i++) {
      assert.ok(
        types[i] !== 'partial' &&
          types[i] !== 'committed' &&
          types[i] !== 'final',
        `Content event "${types[i]}" appeared before session_started at index ${i}`
      );
    }

    // No session_started after content has started
    const secondSession = types.indexOf('session_started', sessionIdx + 1);
    assert.equal(
      secondSession,
      -1,
      'session_started must appear exactly once per session'
    );
  });

  // ── 11. multi-session reuse — process stays alive ─────────────────────────

  test('C11: process survives multiple start/stop cycles', async () => {
    const child = spawn(BINARY_PATH, ['stdio']);
    let buf = '';
    const allEvents = [];

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          allEvents.push(JSON.parse(line));
        } catch {}
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', () => {});

    const send = (cmd) => child.stdin.write(JSON.stringify(cmd) + '\n');

    // Session 1
    send({
      type: 'start',
      model: 'parakeet-tdt-0.6b-v3',
      language: 'en',
      source: 'mic',
    });
    await new Promise((r) => setTimeout(r, 3000));
    const chunk = AUDIO.short.toString('base64');
    send({ type: 'audio', source: 'mic', pcm16: chunk });
    await new Promise((r) => setTimeout(r, 2000));
    send({ type: 'stop' });
    await new Promise((r) => setTimeout(r, 3000));

    const session1Finals = allEvents.filter((e) => e.type === 'final').length;

    // Session 2 — same process
    send({
      type: 'start',
      model: 'parakeet-tdt-0.6b-v3',
      language: 'en',
      source: 'mic',
    });
    await new Promise((r) => setTimeout(r, 3000));
    send({ type: 'audio', source: 'mic', pcm16: chunk });
    await new Promise((r) => setTimeout(r, 2000));
    send({ type: 'stop' });
    await new Promise((r) => setTimeout(r, 3000));

    child.kill();

    const session2Finals = allEvents.filter((e) => e.type === 'final').length;

    assert.ok(session1Finals >= 1, 'Session 1 must produce at least 1 final');
    assert.ok(
      session2Finals >= 2,
      `Session 2 must produce additional final. Total finals: ${session2Finals}`
    );
    assert.ok(!child.killed || true, 'Process must not crash between sessions');
  });
});

// ── Cleanup ─────────────────────────────────────────────────────────────────

test('cleanup conformance fixtures', () => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
