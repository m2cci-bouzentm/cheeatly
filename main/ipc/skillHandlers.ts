import { readFileSync } from 'fs';
import { basename } from 'path';
import { dialog, BrowserWindow } from 'electron';
import { safeHandle } from './safeHandle';
import { ensureCoreStarted } from '../services/core';
import { refreshSkillCache, invalidateSkillCache } from '../../core/src/tools';

function broadcastSkillsChanged(): void {
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) win.webContents.send('skills:changed');
  });
}

function parseFrontmatter(content: string): { name: string; description: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { name: '', description: '' };
  const block = match[1];
  const name = block.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? '';
  const description = block.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? '';
  return { name, description };
}

export function registerSkillHandlers(): void {
  const core = ensureCoreStarted();

  safeHandle('skills:list', async () => {
    return core.skills.list();
  });

  safeHandle('skills:get', async (_event: unknown, name: string) => {
    return core.skills.getContent(name);
  });

  safeHandle('skills:update', async (_event: unknown, name: string, patch: { enabled?: boolean; content?: string; description?: string; name?: string }) => {
    await core.skills.update(name, patch);
    invalidateSkillCache();
    await refreshSkillCache();
    broadcastSkillsChanged();
  });

  safeHandle('skills:import', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Skill files', extensions: ['md'] }],
    });
    if (result.canceled || !result.filePaths.length) {
      return { cancelled: true, imported: [] };
    }

    const nonMd = result.filePaths.filter(f => !f.endsWith('.md'));
    if (nonMd.length > 0) {
      return { cancelled: false, imported: [], error: 'Only Markdown (.md) files are supported as skills.' };
    }

    const imported: string[] = [];
    for (const filePath of result.filePaths) {
      const content = readFileSync(filePath, 'utf-8');
      const meta = parseFrontmatter(content);
      const name = meta.name || basename(filePath, '.md');
      await core.skills.create({ name, description: meta.description, content });
      imported.push(name);
    }

    invalidateSkillCache();
    await refreshSkillCache();
    broadcastSkillsChanged();
    return { cancelled: false, imported };
  });

  safeHandle('skills:toggle', async (_event: unknown, name: string, enabled: boolean) => {
    await core.skills.update(name, { enabled });
    invalidateSkillCache();
    await refreshSkillCache();
    broadcastSkillsChanged();
  });

  safeHandle('skills:remove', async (_event: unknown, name: string) => {
    await core.skills.remove(name);
    invalidateSkillCache();
    await refreshSkillCache();
    broadcastSkillsChanged();
  });
}
