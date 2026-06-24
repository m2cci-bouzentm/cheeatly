import { buildSkillTool, buildSkillCatalog, hasSkills, refreshSkillCache, invalidateSkillCache } from './skillTool';

export function buildTools() {
  return {
    ...buildSkillTool(),
  };
}

export function buildToolsCatalog(): string {
  return [buildSkillCatalog()].filter(Boolean).join('\n\n');
}

export function hasTools(): boolean {
  return hasSkills();
}

export { refreshSkillCache, invalidateSkillCache };
