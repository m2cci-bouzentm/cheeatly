import { Meeting } from '@prisma/client';
import { ProviderCredentials } from '../types';
import { ValidationError, NotFoundError } from '../errors';
import { MeetingRepository } from '../repositories/MeetingRepository';
import { AIService } from '../services/AIService';
import { ResponseParser } from '../services/ResponseParser';
import { getPrisma } from '../config/database';

const ai = new AIService();

export type MeetingList = {
  meetings: Meeting[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type SummaryStatus = 'pending' | 'failed' | 'done';

// Empty summaries become retryable after restart.
const summaryJobs = new Map<string, 'pending' | 'failed'>();

function repo() {
  return new MeetingRepository(getPrisma());
}

export function summaryStatusFor(
  meeting: Pick<Meeting, 'id' | 'summary'>
): SummaryStatus {
  if (meeting.summary && meeting.summary.trim()) return 'done';
  return summaryJobs.get(meeting.id) ?? 'failed';
}

export async function list(params?: {
  cursor?: string;
  limit?: number;
}): Promise<MeetingList> {
  const result = await repo().findAll(params?.cursor, params?.limit ?? 20);
  return {
    meetings: result.meetings,
    nextCursor: result.nextCursor,
    hasMore: result.hasMore,
  };
}

export async function get(id: string): Promise<Meeting> {
  const meeting = await repo().findById(id);
  if (!meeting) throw new NotFoundError('Meeting not found.');
  return meeting;
}

export async function create(input: {
  id: string;
  transcript: string;
  title?: string;
}): Promise<{ id: string }> {
  if (!input.id || !input.transcript) {
    throw new ValidationError('Validation failed.', [
      'id and transcript are required',
    ]);
  }
  const r = repo();
  await r.save(input.id, input.transcript, null);
  if (input.title) await r.update(input.id, { title: input.title });
  return { id: input.id };
}

export async function update(
  id: string,
  data: { title?: string; summary?: string }
): Promise<Meeting> {
  if (data.title === undefined && data.summary === undefined) {
    throw new ValidationError('Validation failed.', [
      'title or summary is required',
    ]);
  }
  const r = repo();
  const meeting = await r.findById(id);
  if (!meeting) throw new NotFoundError('Meeting not found.');

  const patch: { title?: string; summary?: string } = {};
  if (data.title !== undefined) patch.title = data.title;
  if (data.summary !== undefined) patch.summary = data.summary;
  return r.update(id, patch);
}

export async function process(
  id: string,
  credentials: ProviderCredentials
): Promise<{ summary: string | null; error?: string }> {
  summaryJobs.set(id, 'pending');
  const meetingRepo = repo();
  const meeting = await meetingRepo.findById(id);

  if (!meeting || !meeting.transcript) {
    summaryJobs.delete(id);
    throw new NotFoundError('Meeting not found or has no transcript.');
  }

  try {
    const title = await ai.generateTitle(meeting.transcript, credentials);
    const summary = await ai.generateSummary(meeting.transcript, credentials);
    await meetingRepo.update(id, { title, summary });

    summaryJobs.delete(id);
    return { summary: ResponseParser.escapeSummary(summary) };
  } catch (err: any) {
    summaryJobs.set(id, 'failed');
    console.error('[Meeting] Summary generation failed:', err.message);
    return { summary: null, error: err.message };
  }
}

export async function remove(id: string): Promise<void> {
  const meeting = await repo().findById(id);
  if (!meeting) throw new NotFoundError('Meeting not found.');
  await repo().delete(id);
}
