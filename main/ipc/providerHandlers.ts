import { generateText } from 'ai';
import type { AppState } from '../main';
import { CredentialService } from '../services/CredentialService';
import { resolveModel } from '../../core/src';
import { safeHandle } from './safeHandle';

export function registerProviderHandlers(appState: AppState): void {
  safeHandle('get-current-llm-config', async () => {
    const cm = CredentialService.getInstance();
    const model = cm.getDefaultModel();
    const hasKey = cm.getOpenRouterApiKey();
    return { provider: hasKey ? 'openrouter' : 'none', model };
  });

  safeHandle(
    'set-api-key',
    async (_event, _provider: string, apiKey: string) => {
      try {
        CredentialService.getInstance().setOpenRouterApiKey(apiKey);
        return { success: true };
      } catch (error: any) {
        console.error('Error saving API key:', error);
        return { success: false, error: error.message };
      }
    }
  );

  safeHandle('get-stored-credentials', async () => {
    try {
      const cm = CredentialService.getInstance();
      const creds = cm.getAllCredentials();
      const hasKey = !!(
        creds.openRouterApiKey && creds.openRouterApiKey.trim().length > 0
      );
      return {
        hasOpenRouterKey: hasKey,
        sttProvider: cm.getSttProvider(),
      };
    } catch {
      return { hasOpenRouterKey: false, sttProvider: 'none' };
    }
  });

  safeHandle(
    'set-provider-preferred-model',
    async (_event, _provider: string, modelId: string) => {
      CredentialService.getInstance().setDefaultModel(modelId);
    }
  );

  safeHandle(
    'test-llm-connection',
    async (_event, _provider: string, apiKey?: string) => {
      try {
        if (!apiKey || !apiKey.trim()) {
          apiKey = CredentialService.getInstance().getOpenRouterApiKey();
        }
        if (!apiKey || !apiKey.trim()) {
          return { success: false, error: 'No API key provided' };
        }

        const model = resolveModel('openrouter', apiKey);
        await generateText({
          model,
          prompt: 'Hello',
          maxOutputTokens: 5,
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(15_000),
        });
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error?.message || 'Connection failed' };
      }
    }
  );

  safeHandle('set-model', async (_event, modelId: string) => {
    try {
      CredentialService.getInstance().setDefaultModel(modelId);
      appState.broadcast('model-changed', modelId);
      appState.modelSelectorWindowHelper.hideWindow();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  safeHandle('get-default-model', async () => {
    try {
      return { model: CredentialService.getInstance().getDefaultModel() };
    } catch {
      return { model: 'openai/gpt-oss-120b' };
    }
  });
}
