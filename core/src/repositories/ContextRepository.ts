import { PrismaClient, Context } from '@prisma/client';

export class ContextRepository {
  constructor(private prisma: PrismaClient) {}

  async get(): Promise<Context | null> {
    return this.prisma.context.findFirst();
  }

  async saveDescription(content: string): Promise<Context> {
    const existing = await this.get();
    if (existing) {
      return this.prisma.context.update({
        where: { id: existing.id },
        data: { description: content },
      });
    }
    return this.prisma.context.create({
      data: { description: content },
    });
  }
}
