// Boots the core library against a throwaway per-worker tmpdir.
// Side-effect import: `import '../helpers/testEnv'` MUST be the first
// project import in every test file so config exists before any module
// touches the database. The boot-SQL in initDatabase() creates the full
// schema (incl. the vec0 virtual table) — no prisma CLI involved.
import os from 'os';
import fs from 'fs';
import path from 'path';
import { initCore } from '../../index';

process.env.NODE_ENV = 'test';

const workerId = process.env.VITEST_POOL_ID || String(process.pid);
const base = fs.mkdtempSync(
  path.join(os.tmpdir(), 'cheatly-test-' + workerId + '-')
);

initCore({
  dbPath: path.join(base, 'test.db'),
  storageDir: path.join(base, 'storage'),
  promptsDir: path.resolve(__dirname, '../../../resources/prompts'),
  skillsDir: path.resolve(__dirname, '../../../resources/skills'),
});
