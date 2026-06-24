import { tool, jsonSchema } from 'ai';
import * as skills from '../api/skills';
import type { SkillMeta } from '../api/skills';

type RetrieveSkillInput = {
  name: string;
};

const SKILL_TOOL_SCHEMA = jsonSchema<RetrieveSkillInput>({
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Skill name (e.g. "hormozi-offer", "pricing-strategy")' },
  },
  required: ['name'],
} as const);

let cachedSkills: SkillMeta[] = [];

export async function refreshSkillCache(): Promise<void> {
  cachedSkills = await skills.listEnabled();
}

export function invalidateSkillCache(): void {
  cachedSkills = [];
}

export function buildSkillCatalog(): string {
  if (cachedSkills.length === 0) return '';

  const lines = cachedSkills.map(s => `- **${s.name}**: ${s.description}`);
  return [
    'You have access to specialized skills via the retrieveSkill tool. Available skills:',
    ...lines,
    '',
    "Retrieve a skill when the user's request matches its description. Use the skill's instructions to guide your response.",
  ].join('\n');
}

export function buildSkillTool() {
  if (cachedSkills.length === 0) return undefined;

  return {
    retrieveSkill: tool({
      description: 'Retrieve a skill by name to get specialized instructions for the current task.',
      inputSchema: SKILL_TOOL_SCHEMA,
      execute: async ({ name }) => {
        const content = await skills.get(name);
        if (!content) return { error: `Skill "${name}" not found.` };
        return { skill: name, content };
      },
    }),
  };
}

export function hasSkills(): boolean {
  return cachedSkills.length > 0;
}
