import React from 'react';
import { ProviderCard } from './ProviderCard';

export const CloudProvidersSection: React.FC<{ ctx: any }> = ({ ctx }) => {
  const {
    apiKey,
    preferredModels,
    hasStoredKey,
    setApiKey,
    handleSaveKey,
    handleRemoveKey,
    handleTestConnection,
    testStatus,
    testError,
    savingStatus,
    savedStatus,
    groqApiKey,
    setGroqApiKey,
    openaiApiKey,
    setOpenaiApiKey,
    claudeApiKey,
    setClaudeApiKey,
    deepseekApiKey,
    setDeepseekApiKey,
    setPreferredModels,
  } = ctx;

  return (
    <>
      {/* Cloud Providers */}
      <div className="space-y-5">
        <div>
          <h3 className="text-sm font-bold text-text-primary mb-1">
            Cloud Providers
          </h3>
          <p className="text-xs text-text-secondary mb-2">
            Add API keys to unlock cloud AI models.
          </p>
        </div>

        <div className="space-y-4">
          {/* Gemini */}
          <ProviderCard
            providerId="gemini"
            providerName="Gemini"
            apiKey={apiKey}
            preferredModel={preferredModels.gemini}
            hasStoredKey={!!hasStoredKey.gemini}
            onKeyChange={setApiKey}
            onSaveKey={async () => {
              await handleSaveKey('gemini', apiKey, setApiKey);
            }}
            onRemoveKey={() => handleRemoveKey('gemini', setApiKey)}
            onTestConnection={() => handleTestConnection('gemini', apiKey)}
            testStatus={testStatus.gemini || 'idle'}
            testError={testError.gemini}
            savingStatus={!!savingStatus.gemini}
            savedStatus={!!savedStatus.gemini}
            keyPlaceholder="AIzaSy..."
            keyUrl="https://aistudio.google.com/app/apikey"
            onPreferredModelChange={(model) =>
              setPreferredModels((prev: any) => ({ ...prev, gemini: model }))
            }
          />

          {/* Groq */}
          <ProviderCard
            providerId="groq"
            providerName="Groq"
            apiKey={groqApiKey}
            preferredModel={preferredModels.groq}
            hasStoredKey={!!hasStoredKey.groq}
            onKeyChange={setGroqApiKey}
            onSaveKey={async () => {
              await handleSaveKey('groq', groqApiKey, setGroqApiKey);
            }}
            onRemoveKey={() => handleRemoveKey('groq', setGroqApiKey)}
            onTestConnection={() => handleTestConnection('groq', groqApiKey)}
            testStatus={testStatus.groq || 'idle'}
            testError={testError.groq}
            savingStatus={!!savingStatus.groq}
            savedStatus={!!savedStatus.groq}
            keyPlaceholder="gsk_..."
            keyUrl="https://console.groq.com/keys"
            onPreferredModelChange={(model) =>
              setPreferredModels((prev: any) => ({ ...prev, groq: model }))
            }
          />

          {/* OpenAI */}
          <ProviderCard
            providerId="openai"
            providerName="OpenAI"
            apiKey={openaiApiKey}
            preferredModel={preferredModels.openai}
            hasStoredKey={!!hasStoredKey.openai}
            onKeyChange={setOpenaiApiKey}
            onSaveKey={async () => {
              await handleSaveKey('openai', openaiApiKey, setOpenaiApiKey);
            }}
            onRemoveKey={() => handleRemoveKey('openai', setOpenaiApiKey)}
            onTestConnection={() =>
              handleTestConnection('openai', openaiApiKey)
            }
            testStatus={testStatus.openai || 'idle'}
            testError={testError.openai}
            savingStatus={!!savingStatus.openai}
            savedStatus={!!savedStatus.openai}
            keyPlaceholder="sk-..."
            keyUrl="https://platform.openai.com/api-keys"
            onPreferredModelChange={(model) =>
              setPreferredModels((prev: any) => ({ ...prev, openai: model }))
            }
          />

          {/* Claude */}
          <ProviderCard
            providerId="claude"
            providerName="Claude"
            apiKey={claudeApiKey}
            preferredModel={preferredModels.claude}
            hasStoredKey={!!hasStoredKey.claude}
            onKeyChange={setClaudeApiKey}
            onSaveKey={async () => {
              await handleSaveKey('claude', claudeApiKey, setClaudeApiKey);
            }}
            onRemoveKey={() => handleRemoveKey('claude', setClaudeApiKey)}
            onTestConnection={() =>
              handleTestConnection('claude', claudeApiKey)
            }
            testStatus={testStatus.claude || 'idle'}
            testError={testError.claude}
            savingStatus={!!savingStatus.claude}
            savedStatus={!!savedStatus.claude}
            keyPlaceholder="sk-ant-..."
            keyUrl="https://console.anthropic.com/settings/keys"
            onPreferredModelChange={(model) =>
              setPreferredModels((prev: any) => ({ ...prev, claude: model }))
            }
          />

          {/* DeepSeek — text-only; intentionally not part of the screenshot/vision fallback chain. */}
          <ProviderCard
            providerId="deepseek"
            providerName="DeepSeek"
            apiKey={deepseekApiKey}
            preferredModel={preferredModels.deepseek}
            hasStoredKey={!!hasStoredKey.deepseek}
            onKeyChange={setDeepseekApiKey}
            onSaveKey={async () => {
              await handleSaveKey(
                'deepseek',
                deepseekApiKey,
                setDeepseekApiKey
              );
            }}
            onRemoveKey={() => handleRemoveKey('deepseek', setDeepseekApiKey)}
            onTestConnection={() =>
              handleTestConnection('deepseek', deepseekApiKey)
            }
            testStatus={testStatus.deepseek || 'idle'}
            testError={testError.deepseek}
            savingStatus={!!savingStatus.deepseek}
            savedStatus={!!savedStatus.deepseek}
            keyPlaceholder="sk-..."
            keyUrl="https://platform.deepseek.com/api_keys"
            onPreferredModelChange={(model) =>
              setPreferredModels((prev: any) => ({ ...prev, deepseek: model }))
            }
          />
        </div>
      </div>
    </>
  );
};
