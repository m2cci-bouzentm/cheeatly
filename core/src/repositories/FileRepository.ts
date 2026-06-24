import { PrismaClient, File } from '@prisma/client';

export class FileRepository {
  constructor(private prisma: PrismaClient) {}

  async findByAttachable(type: string, id: string): Promise<File[]> {
    return this.prisma.file.findMany({
      where: { attachableType: type, attachableId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    filename: string,
    storagePath: string,
    attachableType: string,
    attachableId: string
  ): Promise<File> {
    return this.prisma.file.create({
      data: { filename, storagePath, attachableType, attachableId },
    });
  }

  async findById(id: string): Promise<File | null> {
    return this.prisma.file.findUnique({ where: { id } });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.file.delete({ where: { id } });
  }
}
