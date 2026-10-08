export const OPENROUTER_MODELS = [
  { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', desc: 'Fastest • Cerebras', vision: false },
  { id: 'z-ai/glm-4.7', name: 'GLM 4.7', desc: 'Smart • Cerebras', vision: false },
  { id: 'qwen/qwen3.6-flash', name: 'Qwen 3.6 Flash', desc: 'Fast • Vision', vision: true },
  { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash', desc: 'Cheapest • Fast', vision: false },
  { id: 'google/gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite', desc: 'Google • Fast', vision: true },
  { id: 'anthropic/claude-sonnet-4-6', name: 'Claude Sonnet 4.6', desc: 'Anthropic • Quality', vision: true },
  { id: 'moonshotai/kimi-k2.5', name: 'Kimi 2.5', desc: 'Moonshot • Vision', vision: true },
];

export const modelSupportsVision = (id: string): boolean => {
  const match = OPENROUTER_MODELS.find((m) => m.id === id);
  return match?.vision ?? false;
};

export const prettifyModelId = (id: string): string => {
  const match = OPENROUTER_MODELS.find((m) => m.id === id);
  if (match) return match.name;
  const short = id.includes('/') ? id.split('/').pop()! : id;
  return short.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};
