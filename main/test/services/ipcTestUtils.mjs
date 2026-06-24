/** Quote-agnostic helpers for static analysis tests over IPC handler sources. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

export function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

export function readIpcDomainSource(domain) {
  return readRepoFile(`main/ipc/${domain}Handlers.ts`);
}

export function readIpcSource() {
  return [
    'main/ipcBootstrap.ts',
    'main/ipc/audioHandlers.ts',
    'main/ipc/chatAndContextHandlers.ts',
    'main/ipc/windowHandlers.ts',
    'main/ipc/settingsHandlers.ts',
    'main/ipc/providerHandlers.ts',
    'main/ipc/meetingHandlers.ts',
  ]
    .map(readRepoFile)
    .join('\n');
}

export function findSafeHandle(source, channel) {
  const escaped = channel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`safeHandle\\(\\s*['"]${escaped}['"]`, 'm');
  const m = source.match(re);
  return m?.index ?? -1;
}

export function sliceSafeHandleBlock(source, channel) {
  const escaped = channel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const startMatch = source.match(
    new RegExp(`safeHandle\\(\\s*['"]${escaped}['"]`, 'm')
  );
  if (!startMatch || startMatch.index === undefined) return '';
  const start = startMatch.index;
  const searchFrom = start + startMatch[0].length;
  const nextRel = source.slice(searchFrom).search(/safeHandle\s*\(\s*['"]/);
  const end = nextRel === -1 ? source.length : searchFrom + nextRel;
  return source.slice(start, end);
}

export function safeHandlePattern(channel) {
  const escaped = channel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`safeHandle\\(\\s*['"]${escaped}['"]`, 'm');
}
