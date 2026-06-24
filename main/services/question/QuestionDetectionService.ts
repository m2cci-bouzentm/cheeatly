import { AIService } from '../../../core/src/services/AIService';
import { SettingsService } from '../SettingsService';
import { CredentialService } from '../CredentialService';

export type { DetectedMeetingSuggestion } from '../../../core/src/types';

const ai = new AIService();

function resolveCredentials() {
  const settings = SettingsService.getInstance();
  const creds = CredentialService.getInstance();
  const customModel = settings.get('questionAnalysisModel')?.trim();
  const dedicatedKey = settings.get('openRouterApiKey');
  const apiKey = dedicatedKey || creds.getOpenRouterApiKey() || '';
  if (!apiKey) return null;
  return {
    provider: 'openrouter',
    apiKey,
    model: customModel || creds.getDefaultModel() || 'openai/gpt-oss-120b',
  };
}

export async function analyzeTranscript(
  transcript: string
): Promise<{ questions: import('../../../core/src/types').DetectedMeetingSuggestion[] }> {
  const credentials = resolveCredentials();
  if (!credentials) return { questions: [] };
  return ai.analyzeTranscript(transcript, credentials);
}
