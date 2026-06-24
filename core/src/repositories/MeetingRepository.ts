import { PrismaClient, Meeting } from '@prisma/client';

export class MeetingRepository {
  constructor(private prisma: PrismaClient) {}

  async findAll(
    cursor?: string,
    limit = 20
  ): Promise<{
    meetings: Meeting[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const meetings = await this.prisma.meeting.findMany({
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = meetings.length > limit;
    if (hasMore) meetings.pop();

    return {
      meetings,
      nextCursor: hasMore ? meetings[meetings.length - 1].id : null,
      hasMore,
    };
  }

  async findById(id: string): Promise<Meeting | null> {
    return this.prisma.meeting.findUnique({ where: { id } });
  }

  async save(
    id: string,
    transcript: string,
    summary: string | null
  ): Promise<Meeting> {
    return this.prisma.meeting.upsert({
      where: { id },
      update: { transcript, summary },
      create: { id, transcript, summary },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.meeting.delete({ where: { id } });
  }

  async update(
    id: string,
    data: { title?: string; summary?: string }
  ): Promise<Meeting> {
    return this.prisma.meeting.update({
      where: { id },
      data,
    });
  }
}
