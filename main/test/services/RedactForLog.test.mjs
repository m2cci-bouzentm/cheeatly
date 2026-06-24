import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

test('processGuards console wrapper uses serializeArgs', () => {
  const src = read('main/bootstrap/processGuards.ts');
  assert.match(src, /serializeArgs/);
  assert.match(src, /logToFile/);
});

test('serializeArgs is exported from logger', () => {
  const src = read('main/utils/logger.ts');
  assert.match(src, /export function serializeArgs/);
});
