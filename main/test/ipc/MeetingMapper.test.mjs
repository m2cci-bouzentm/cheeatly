// Meeting page regression — two display bugs after the server migration:
//
//  1) Every transcript row rendered as "Them". Transcript lines are stored
//     as "Me: ..."/"Them: ..." (AppState.getTranscriptText), but the renderer
//     labels speaker === 'user' as "Me" and all other speakers as "Them" — the
//     mapper passed the raw "Me"/"Them" strings through, so 'user' never
//     matched and the user's own lines showed as Them.
//
//  2) Summary tab blank despite the DB row having a summary. The tab renders
//     only detailedSummary.overview (through ReactMarkdown); the mapper
//     stubbed detailedSummary without overview, so nothing displayed.
//
// Zero mocks: extracts the real mapMeeting from main/ipc/meetingHandlers.ts
// (TS annotations stripped) and exercises it directly.
//
// Run: node --test main/test/ipc/MeetingMapper.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'ipc',
    'meetingHandlers.ts'
  ),
  'utf8'
);

function loadMapper() {
  const start = SRC.indexOf('export function mapMeeting');
  const end = SRC.indexOf('function createMeetingPersistenceHandler');
  assert.ok(
    start > -1 && end > start,
    'mapMeeting not found in meetingHandlers.ts'
  );
  const js = SRC.slice(start, end)
    .replace(/\/\*\*[\s\S]*?\*\//g, '')
    .replace(/^export /m, '')
    .replace(/: any\b|: string\b|: number\b/g, '');
  return new Function(`${js}; return mapMeeting;`)();
}

const mapMeeting = loadMapper();
const statusFor = () => 'done';

// The exact label rule from renderer/pages/MeetingDetails/index.tsx
const rendererLabel = (entry) => (entry.speaker === 'user' ? 'Me' : 'Them');

test('"Me:" lines map to speaker user so the renderer labels them Me', () => {
  const meeting = mapMeeting(
    {
      id: 'm1',
      createdAt: new Date('2026-06-10T14:11:36.000Z'),
      transcript:
        'Me: bonjour tout le monde\nThem: hello there\nno speaker prefix line',
      summary: null,
    },
    statusFor
  );

  assert.equal(
    meeting.date,
    '2026-06-10T14:11:36.000Z',
    'createdAt must cross IPC as an ISO string'
  );
  assert.equal(meeting.summaryStatus, 'done');
  assert.deepEqual(
    meeting.transcript.map((e) => e.speaker),
    ['user', 'interviewer', 'Unknown']
  );
  assert.deepEqual(
    meeting.transcript.map(rendererLabel),
    ['Me', 'Them', 'Them'],
    'renderer must label the local speaker Me and all other speakers Them'
  );
  assert.deepEqual(
    meeting.transcript.map((e) => e.text),
    ['bonjour tout le monde', 'hello there', 'no speaker prefix line']
  );
});

test('server summary lands in detailedSummary.overview for the Summary tab', () => {
  const summary =
    '### **Key Topics Discussed**\n* "quoted" decision & next steps';
  const meeting = mapMeeting(
    {
      id: 'm2',
      createdAt: new Date('2026-06-10T14:11:36.000Z'),
      transcript: 'Me: hi',
      summary,
    },
    statusFor
  );

  assert.equal(meeting.summary, summary);
  assert.equal(
    meeting.detailedSummary.overview,
    summary,
    'Summary tab renders only detailedSummary.overview — must carry the markdown'
  );
});

test('missing summary stays falsy so the overview block hides', () => {
  const meeting = mapMeeting(
    { id: 'm3', createdAt: new Date(0), transcript: '', summary: null },
    statusFor
  );
  assert.equal(meeting.summary, '');
  assert.ok(!meeting.detailedSummary.overview);
  assert.deepEqual(meeting.transcript, []);
  assert.equal(meeting.title, 'Untitled Session');
});
