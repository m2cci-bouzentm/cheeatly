import { ContextRepository } from '../repositories/ContextRepository';
import { FileRepository } from '../repositories/FileRepository';
import { FileStorageProvider } from '../contracts/FileStorageProvider';
import { Context, File } from '@prisma/client';
import { ValidationError, NotFoundError } from '../errors';

const MAX_DESCRIPTION_LENGTH = 4000;
const MAX_FILE_SIZE = 512 * 1024;
const MAX_TOTAL_FILES_SIZE = 2 * 1024 * 1024;

export class ContextService {
  constructor(
    private contextRepo: ContextRepository,
    private fileRepo: FileRepository,
    private storage: FileStorageProvider
  ) {}

  async getDescription(): Promise<string | null> {
    const ctx = await this.contextRepo.get();
    return ctx?.description || null;
  }

  async saveDescription(content: string): Promise<Context> {
    if (content.length > MAX_DESCRIPTION_LENGTH) {
      throw new ValidationError(
        'Description exceeds ' + MAX_DESCRIPTION_LENGTH + ' character limit.'
      );
    }
    return this.contextRepo.saveDescription(content);
  }

  async getFiles(): Promise<File[]> {
    const ctx = await this.contextRepo.get();
    if (!ctx) return [];
    return this.fileRepo.findByAttachable('context', ctx.id);
  }

  async uploadFile(filename: string, content: string): Promise<File> {
    if (content.length > MAX_FILE_SIZE) {
      throw new ValidationError(
        'File exceeds ' + MAX_FILE_SIZE / 1024 + 'KB limit.'
      );
    }

    const ctx =
      (await this.contextRepo.get()) ||
      (await this.contextRepo.saveDescription(''));
    const existingFiles = await this.fileRepo.findByAttachable(
      'context',
      ctx.id
    );
    const totalSize = existingFiles.reduce((sum, _f) => sum + MAX_FILE_SIZE, 0);
    if (totalSize + content.length > MAX_TOTAL_FILES_SIZE) {
      throw new ValidationError(
        'Total files exceed ' +
          MAX_TOTAL_FILES_SIZE / 1024 +
          'KB aggregate limit.'
      );
    }

    const stored = await this.storage.upload(content, filename, 'context');
    return this.fileRepo.create(filename, stored.path, 'context', ctx.id);
  }

  async deleteFile(fileId: string): Promise<void> {
    const file = await this.fileRepo.findById(fileId);
    if (!file) throw new NotFoundError('File not found.');
    await this.storage.delete(file.storagePath);
    await this.fileRepo.delete(fileId);
  }

  async buildUserContextBlock(): Promise<string> {
    const description = await this.getDescription();
    const files = await this.getFiles();

    const parts: string[] = [];
    if (description) parts.push(description);

    for (const file of files) {
      try {
        const content = await this.storage.load(file.storagePath);
        parts.push('--- ' + file.filename + ' ---\n' + content);
      } catch {
        // skip unreadable files
      }
    }

    if (parts.length === 0) return '';
    return '<user_context>\n' + parts.join('\n\n') + '\n</user_context>';
  }
}
