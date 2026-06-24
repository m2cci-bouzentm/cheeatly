import { createOpenAI } from '@ai-sdk/openai';
import { LanguageModel } from 'ai';

export type ProviderName = 'openrouter';

const DEFAULT_MODELS: Record<ProviderName, string> = {
  openrouter: 'openai/gpt-oss-120b',
};

export function resolveModel(
  provider: string,
  apiKey: string,
  model?: string
): LanguageModel {
  const modelId = model || DEFAULT_MODELS.openrouter;

  return createOpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
  }).chat(modelId);
}

export function getProviderNames(): ProviderName[] {
  return Object.keys(DEFAULT_MODELS) as ProviderName[];
}
