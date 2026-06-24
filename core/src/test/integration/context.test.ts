import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import '../helpers/testEnv';
import * as context from '../../api/context';
import { ValidationError, NotFoundError } from '../../errors';
import { getPrisma } from '../../config/database';

describe('context api', () => {
  beforeAll(async () => {
    const prisma = getPrisma();
    await prisma.file.deleteMany();
    await prisma.context.deleteMany();
  });

  afterAll(async () => {
    const prisma = getPrisma();
    await prisma.file.deleteMany();
    await prisma.context.deleteMany();
    await prisma.$disconnect();
  });

  it('getDescription returns null when empty', async () => {
    expect(await context.getDescription()).toBeNull();
  });

  it('saveDescription persists and getDescription returns content', async () => {
    await context.saveDescription('Remember product positioning.');

    expect(await context.getDescription()).toBe('Remember product positioning.');
  });

  it('saveDescription over 4000 chars throws ValidationError', async () => {
    await expect(context.saveDescription('x'.repeat(4001))).rejects.toThrow(
      ValidationError
    );
  });

  it('saveDescription accepts empty content to clear description', async () => {
    await context.saveDescription('Temporary context.');
    await context.saveDescription('');

    expect(await context.getDescription()).toBeNull();
  });

  it('getFiles returns empty array initially', async () => {
    await getPrisma().file.deleteMany();

    expect(await context.getFiles()).toEqual([]);
  });

  it('uploadFile stores file metadata', async () => {
    const file = await context.uploadFile('notes.txt', 'file content');

    expect(file).toMatchObject({
      filename: 'notes.txt',
      attachableType: 'context',
    });
  });

  it('buildUserContextBlock includes description and files', async () => {
    await context.saveDescription('Context description.');
    await context.uploadFile('profile.md', '# Profile');

    expect(await context.buildUserContextBlock()).toContain(
      'Context description.\n\n--- profile.md ---\n# Profile'
    );
  });

  it('uploadFile without filename throws ValidationError', async () => {
    await expect(context.uploadFile('', 'file content')).rejects.toThrow(
      ValidationError
    );
  });

  it('deleteFile removes the file', async () => {
    const created = await context.uploadFile('delete-me.txt', 'temporary file');

    await context.deleteFile(created.id);

    const remaining = await context.getFiles();
    expect(remaining.find((f) => f.id === created.id)).toBeUndefined();
  });

  it('deleteFile throws NotFoundError for unknown id', async () => {
    await expect(context.deleteFile('nope')).rejects.toThrow(NotFoundError);
  });
});
