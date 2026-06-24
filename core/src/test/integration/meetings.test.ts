import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import '../helpers/testEnv';
import * as meetings from '../../api/meetings';
import { ValidationError, NotFoundError } from '../../errors';
import { getPrisma } from '../../config/database';

const CREDS = { provider: 'gemini', apiKey: 'test-key' };

describe('meetings api', () => {
  beforeAll(async () => {
    const prisma = getPrisma();
    await prisma.chunk.deleteMany();
    await prisma.meeting.deleteMany();
  });

  afterAll(async () => {
    const prisma = getPrisma();
    await prisma.chunk.deleteMany();
    await prisma.meeting.deleteMany();
    await prisma.$disconnect();
  });

  it('list returns empty result with pagination fields', async () => {
    const result = await meetings.list();

    expect(result.meetings).toEqual([]);
    expect(result.nextCursor).toBeNull();
    expect(result.hasMore).toBe(false);
  });

  it('get throws NotFoundError for nonexistent', async () => {
    await expect(meetings.get('nonexistent')).rejects.toThrow(NotFoundError);
  });

  it('remove throws NotFoundError for nonexistent', async () => {
    await expect(meetings.remove('nonexistent')).rejects.toThrow(NotFoundError);
  });

  it('create stores a meeting with transcript', async () => {
    const result = await meetings.create({
      id: 'create-test',
      transcript: 'Them: hello\nMe: hi',
    });

    expect(result.id).toBe('create-test');

    const saved = await getPrisma().meeting.findUnique({
      where: { id: 'create-test' },
    });
    expect(saved).not.toBeNull();
    expect(saved!.transcript).toContain('hello');
  });

  it('create throws ValidationError without transcript', async () => {
    await expect(
      meetings.create({ id: 'no-transcript', transcript: '' })
    ).rejects.toThrow(ValidationError);
  });

  it('process throws NotFoundError for nonexistent', async () => {
    await expect(meetings.process('nonexistent', CREDS)).rejects.toThrow(
      NotFoundError
    );
  });

  it('update changes the title', async () => {
    const prisma = getPrisma();
    const meeting = await prisma.meeting.create({
      data: {
        id: 'meeting-to-update',
        transcript: 'Initial transcript',
        summary: 'Initial summary',
      },
    });

    const updated = await meetings.update(meeting.id, {
      title: 'Updated title',
    });

    expect(updated).toMatchObject({ id: meeting.id, title: 'Updated title' });
  });

  it('update throws ValidationError with no fields', async () => {
    await expect(meetings.update('meeting-to-update', {})).rejects.toThrow(
      ValidationError
    );
  });
});

describe('summary status tracking', () => {
  it('empty-summary meeting with no live job reports failed (retryable after restart)', async () => {
    await meetings.create({ id: 'status-cold', transcript: 'Them: hello' });
    const m = await meetings.get('status-cold');
    expect(meetings.summaryStatusFor(m)).toBe('failed');
  });

  it('process failure marks the meeting failed; a stored summary reports done', async () => {
    await meetings.create({
      id: 'status-flow',
      transcript: 'Them: quarterly revenue is two million',
    });
    // bogus credentials -> generateText throws -> in-band error + failed status
    const result = await meetings.process('status-flow', {
      provider: 'gemini',
      apiKey: 'invalid',
    } as any);
    expect(result.summary).toBeNull();
    expect(result.error).toBeTruthy();
    expect(meetings.summaryStatusFor(await meetings.get('status-flow'))).toBe(
      'failed'
    );

    // a successful summary write supersedes any job state
    await meetings.update('status-flow', {
      summary: '## Recap\nNumbers discussed.',
    });
    expect(meetings.summaryStatusFor(await meetings.get('status-flow'))).toBe(
      'done'
    );
  });
});
