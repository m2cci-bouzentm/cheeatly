import { PrismaClient } from '@prisma/client';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from './index';
import { randomUUID } from 'crypto';

let prisma: PrismaClient | null = null;
let db: Database.Database | null = null;

export function initDatabase(): PrismaClient {
  if (prisma) return prisma;

  const dbPath = config().paths.db;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  prisma = new PrismaClient({ datasourceUrl: 'file:' + dbPath });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS "Meeting" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "title" TEXT,
      "transcript" TEXT,
      "summary" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "Chunk" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "meetingId" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      CONSTRAINT "Chunk_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE TABLE IF NOT EXISTS "File" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "filename" TEXT NOT NULL,
      "storagePath" TEXT NOT NULL,
      "attachableType" TEXT NOT NULL,
      "attachableId" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS "File_attachableType_attachableId_idx"
      ON "File"("attachableType", "attachableId");

    CREATE TABLE IF NOT EXISTS "Skill" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "description" TEXT NOT NULL DEFAULT '',
      "content" TEXT NOT NULL,
      "enabled" INTEGER NOT NULL DEFAULT 1,
      "bundled" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "Skill_name_key" ON "Skill"("name");
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS "Context" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "description" TEXT,
      "updatedAt" DATETIME NOT NULL
    )
  `);

  seedBundledSkills(db);

  return prisma;
}

function parseFrontmatter(content: string): { name: string; description: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { name: '', description: '' };
  const block = match[1];
  const n = block.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? '';
  const d = block.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? '';
  return { name: n, description: d };
}

function seedBundledSkills(database: Database.Database): void {
  const skillsDir = config().paths.skills;
  let files: string[];
  try {
    files = fs.readdirSync(skillsDir).filter(f => path.extname(f) === '.md');
  } catch {
    return;
  }
  if (files.length === 0) return;

  const count = database.prepare('SELECT COUNT(*) as c FROM "Skill" WHERE "bundled" = 1').get() as { c: number };
  if (count.c >= files.length) return;

  const now = new Date().toISOString();
  const upsert = database.prepare(`
    INSERT INTO "Skill" ("id", "name", "description", "content", "enabled", "bundled", "createdAt", "updatedAt")
    VALUES (?, ?, ?, ?, 1, 1, ?, ?)
    ON CONFLICT("name") DO UPDATE SET "description" = excluded."description", "content" = excluded."content", "updatedAt" = excluded."updatedAt"
  `);

  const tx = database.transaction(() => {
    for (const file of files) {
      const content = fs.readFileSync(path.resolve(skillsDir, file), 'utf-8');
      const meta = parseFrontmatter(content);
      const name = meta.name || path.basename(file, '.md');
      upsert.run(randomUUID(), name, meta.description, content, now, now);
    }
  });
  tx();
}

export function getPrisma(): PrismaClient {
  if (!prisma) {
    throw new Error('Database not initialized. Call initCore() first.');
  }
  return prisma;
}

export async function closeDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
  if (db) {
    db.close();
    db = null;
  }
}
