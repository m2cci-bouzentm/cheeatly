import { ProviderCredentials } from '../types';
import { ValidationError } from '../errors';
import { AIService, ChatOptions } from '../services/AIService';

export type { ChatOptions };

const ai = new AIService();

export async function chat(
  messages: unknown[],
  credentials: ProviderCredentials,
  opts?: ChatOptions
): Promise<string> {
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    throw new ValidationError('Validation failed.', [
      'messages array is required',
    ]);
  }
  return ai.chat(messages, credentials, opts);
}
