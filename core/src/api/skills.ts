import { getPrisma } from '../config/database';
import { ValidationError, NotFoundError } from '../errors';

export type SkillInfo = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  bundled: boolean;
};

export type SkillMeta = {
  name: string;
  description: string;
};

function prisma() {
  return getPrisma();
}

export async function list(): Promise<SkillInfo[]> {
  const rows = await prisma().skill.findMany({
    select: { id: true, name: true, description: true, enabled: true, bundled: true },
    orderBy: { name: 'asc' },
  });
  return rows;
}

export async function listEnabled(): Promise<SkillMeta[]> {
  const rows = await prisma().skill.findMany({
    where: { enabled: true },
    select: { name: true, description: true },
    orderBy: { name: 'asc' },
  });
  return rows;
}

export async function get(name: string): Promise<string | null> {
  const row = await prisma().skill.findUnique({
    where: { name },
    select: { content: true, enabled: true },
  });
  if (!row || !row.enabled) return null;
  return row.content;
}

export async function getContent(name: string): Promise<string | null> {
  const row = await prisma().skill.findUnique({
    where: { name },
    select: { content: true },
  });
  return row?.content ?? null;
}

export async function create(file: {
  name: string;
  description: string;
  content: string;
}): Promise<SkillInfo> {
  if (!file.name.trim()) throw new ValidationError('Validation failed.', ['name is required']);
  if (!file.content.trim()) throw new ValidationError('Validation failed.', ['content is required']);

  const row = await prisma().skill.create({
    data: {
      name: file.name.trim(),
      description: file.description,
      content: file.content,
      bundled: false,
    },
    select: { id: true, name: true, description: true, enabled: true, bundled: true },
  });
  return row;
}

export async function update(
  name: string,
  patch: { enabled?: boolean; content?: string; description?: string }
): Promise<SkillInfo> {
  const existing = await prisma().skill.findUnique({ where: { name } });
  if (!existing) throw new NotFoundError('Skill', name);

  const row = await prisma().skill.update({
    where: { name },
    data: {
      ...(patch.enabled !== undefined && { enabled: patch.enabled }),
      ...(patch.content !== undefined && { content: patch.content }),
      ...(patch.description !== undefined && { description: patch.description }),
    },
    select: { id: true, name: true, description: true, enabled: true, bundled: true },
  });
  return row;
}

export async function remove(name: string): Promise<void> {
  const existing = await prisma().skill.findUnique({ where: { name } });
  if (!existing) throw new NotFoundError('Skill', name);
  if (existing.bundled) throw new ValidationError('Cannot delete bundled skill.', [name]);

  await prisma().skill.delete({ where: { name } });
}
