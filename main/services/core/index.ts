// Core must stay in the main-process bundle to avoid duplicate DB singletons.
import { app } from 'electron';
import path from 'path';
import { initCore, CheatlyCore } from '../../../core/src';
import { refreshSkillCache } from '../../../core/src/tools';

let core: CheatlyCore | null = null;

export function ensureCoreStarted(): CheatlyCore {
  if (core) return core;

  const dev = !app.isPackaged;
  const repoRoot = app.getAppPath();

  const useRepoRoot = dev;
  const userData = app.getPath('userData');

  core = initCore({
    dbPath: useRepoRoot
      ? path.join(repoRoot, 'core', 'data', 'cheatly.db')
      : path.join(userData, 'data', 'cheatly.db'),
    storageDir: useRepoRoot
      ? path.join(repoRoot, 'core', 'storage')
      : path.join(userData, 'storage'),
    // Prompts and skills are read-only assets — always from the repo/bundle, never userData.
    promptsDir: dev
      ? path.join(repoRoot, 'core', 'resources', 'prompts')
      : path.join(process.resourcesPath, 'prompts'),
    skillsDir: dev
      ? path.join(repoRoot, 'core', 'resources', 'skills')
      : path.join(process.resourcesPath, 'skills'),
  });

  refreshSkillCache().catch(err => {
    console.error('[Core] Skill cache failed:', err);
  });

  console.log('[Core] In-process core started (dev=' + dev + ')');
  return core;
}

export async function shutdownCore(): Promise<void> {
  if (!core) return;
  await core.shutdown();
  core = null;
}
