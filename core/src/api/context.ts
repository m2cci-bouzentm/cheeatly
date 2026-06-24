import { Context, File } from '@prisma/client';
import { ValidationError } from '../errors';
import { ContextService } from '../services/ContextService';
import { ContextRepository } from '../repositories/ContextRepository';
import { FileRepository } from '../repositories/FileRepository';
import { getPrisma } from '../config/database';
import { getStorage } from '../index';

function service(): ContextService {
  const prisma = getPrisma();
  return new ContextService(
    new ContextRepository(prisma),
    new FileRepository(prisma),
    getStorage()
  );
}

export async function getDescription(): Promise<string | null> {
  return service().getDescription();
}

export async function saveDescription(content: string): Promise<Context> {
  return service().saveDescription(content);
}

export async function getFiles(): Promise<File[]> {
  return service().getFiles();
}

export async function uploadFile(
  filename: string,
  content: string
): Promise<File> {
  const errors: string[] = [];
  if (!filename) errors.push('filename is required');
  if (!content) errors.push('content is required');
  if (errors.length > 0) {
    throw new ValidationError('Validation failed.', errors);
  }
  return service().uploadFile(filename, content);
}

export async function deleteFile(id: string): Promise<void> {
  await service().deleteFile(id);
}

export async function buildUserContextBlock(): Promise<string> {
  return service().buildUserContextBlock();
}
