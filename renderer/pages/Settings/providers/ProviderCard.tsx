import React, { useState, useEffect, useRef } from 'react';
import {
  Trash2,
  AlertCircle,
  CheckCircle,
  ExternalLink,
  Loader2,
  ChevronDown,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

type ProviderId = 'gemini' | 'groq' | 'openai' | 'claude' | 'deepseek';

function saveButtonLabel(saving: boolean, saved: boolean): string {
  if (saving) return 'Saving...';
  if (saved) return 'Saved!';
  return 'Save';
}

interface ProviderModel {
  id: string;
  label: string;
}

const PROVIDER_MODELS: Record<ProviderId, ProviderModel[]> = {
  gemini: [
    { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  ],
  openai: [
    { id: 'gpt-5.5', label: 'GPT-5.5' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { id: 'o3', label: 'o3' },
    { id: 'o4-mini', label: 'o4-mini' },
  ],
  claude: [
    { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  ],
  groq: [
    { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
    { id: 'llama-4-scout', label: 'Llama 4 Scout' },
  ],
  deepseek: [
    { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
    { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
  ],
};

interface ProviderCardProps {
  providerId: ProviderId;
  providerName: string;
  apiKey: string;
  preferredModel?: string;
  hasStoredKey: boolean;
  onKeyChange: (key: string) => void;
  onSaveKey: () => Promise<void>;
  onRemoveKey: () => void;
  onTestConnection: () => void;
  testStatus: 'idle' | 'testing' | 'success' | 'error';
  testError?: string;
  savingStatus: boolean;
  savedStatus: boolean;
  keyPlaceholder: string;
  keyUrl: string;
  onPreferredModelChange?: (modelId: string) => void;
}

export const ProviderCard: React.FC<ProviderCardProps> = ({
  providerId,
  providerName,
  apiKey,
  preferredModel,
  hasStoredKey,
  onKeyChange,
  onSaveKey,
  onRemoveKey,
  onTestConnection,
  testStatus,
  testError,
  savingStatus,
  savedStatus,
  keyPlaceholder,
  keyUrl,
  onPreferredModelChange,
}) => {
  const [selectedModel, setSelectedModel] = useState<string>(
    preferredModel || ''
  );
  const [customModelId, setCustomModelId] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const savedRef = useRef(savedStatus);
  const savingRef = useRef(savingStatus);
  savedRef.current = savedStatus;
  savingRef.current = savingStatus;

  useEffect(() => {
    if (!apiKey.trim()) return;
    const timer = setTimeout(() => {
      if (!savedRef.current && !savingRef.current) {
        onSaveKey().catch(console.error);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [apiKey]);

  useEffect(() => {
    if (preferredModel) setSelectedModel(preferredModel);
  }, [preferredModel]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const models = PROVIDER_MODELS[providerId];

  const handleSelectModel = async (modelId: string) => {
    setSelectedModel(modelId);
    setIsDropdownOpen(false);
    try {
      await window.electronAPI.setProviderPreferredModel(providerId, modelId);
      if (onPreferredModelChange) onPreferredModelChange(modelId);
    } catch (e) {
      console.error('Failed to save preferred model:', e);
    }
  };

  const handleApplyCustomModel = async () => {
    const id = customModelId.trim();
    if (!id) return;
    await handleSelectModel(id);
    setCustomModelId('');
  };

  const selectedOption = models.find((m) => m.id === selectedModel);
  const isCustomModel =
    selectedModel && !models.some((m) => m.id === selectedModel);

  return (
    <Card className="bg-bg-item-surface rounded-xl p-5">
      <div className="mb-2 flex items-center justify-between">
        <label className="flex items-center text-xs font-medium text-text-primary uppercase tracking-wide">
          {providerName} API Key
          {hasStoredKey && (
            <Badge
              variant="secondary"
              className="ml-2 text-green-500 normal-case bg-green-500/10 border-green-500/20"
            >
              ✓ Saved
            </Badge>
          )}
        </label>
        <Button
          variant="ghost"
          onClick={() => {
            window.electronAPI.openExternal(keyUrl);
          }}
          className="h-auto p-0 text-xs text-text-tertiary hover:text-text-primary flex items-center gap-1"
          title={`Get ${providerName} API Key`}
        >
          <span className="text-xs uppercase tracking-wide">Get Key</span>
          <ExternalLink size={12} />
        </Button>
      </div>
      <div className="flex gap-2 mb-3">
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => onKeyChange(e.target.value)}
          placeholder={hasStoredKey ? '••••••••••••' : keyPlaceholder}
          className="flex-1 bg-bg-input border border-border-subtle rounded-lg px-4 py-2.5 text-xs text-text-primary focus:outline-none focus:border-accent-primary transition-colors"
        ></Input>
        <Button
          variant="outline"
          onClick={onSaveKey}
          disabled={savingStatus || !apiKey.trim()}
          className={`px-5 py-2.5 rounded-lg text-xs font-medium ${
            savedStatus
              ? 'bg-green-500/20 text-green-400 border-green-500/20'
              : 'bg-bg-input hover:bg-bg-secondary border-border-subtle text-text-primary'
          }`}
        >
          {saveButtonLabel(savingStatus, savedStatus)}
        </Button>
        {hasStoredKey && (
          <Button
            variant="ghost"
            onClick={onRemoveKey}
            className="px-2.5 py-2.5 h-auto rounded-lg text-xs font-medium text-text-tertiary hover:text-red-500 hover:bg-red-500/10"
            title="Remove API Key"
          >
            <Trash2 size={16} strokeWidth={1.5} />
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between mb-3 w-full">
        <Button
          variant="outline"
          onClick={onTestConnection}
          disabled={
            (!apiKey.trim() && !hasStoredKey) || testStatus === 'testing'
          }
          className={`px-3 py-1.5 h-auto rounded-md text-xs font-medium shrink-0 ${
            testStatus === 'success'
              ? 'bg-green-500/10 text-green-500 border-green-500/20'
              : testStatus === 'error'
                ? 'bg-red-500/10 text-red-500 border-red-500/20'
                : 'bg-bg-input hover:bg-bg-elevated text-text-primary border-border-subtle'
          }`}
          title={testError || 'Test Connection'}
        >
          {testStatus === 'testing' ? (
            <>
              <Loader2 size={12} className="animate-spin" /> Testing...
            </>
          ) : testStatus === 'success' ? (
            <>
              <CheckCircle size={12} /> Connected
            </>
          ) : testStatus === 'error' ? (
            <>
              <AlertCircle size={12} /> Error
            </>
          ) : (
            <>{/* No Icon */} Test Connection</>
          )}
        </Button>

        {/* Model Dropdown */}
        <div className="relative flex-1 max-w-[200px] mx-4" ref={dropdownRef}>
          <Button
            variant="outline"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="w-full h-auto bg-bg-input border-border-subtle rounded-md px-3 py-1.5 text-xs text-text-primary focus:border-accent-primary flex items-center justify-between hover:bg-bg-elevated"
            type="button"
          >
            <span className="truncate pr-2">
              {selectedOption
                ? selectedOption.label
                : isCustomModel
                  ? selectedModel
                  : 'Select model'}
            </span>
            <ChevronDown
              size={14}
              className={`text-text-secondary transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
            />
          </Button>

          {isDropdownOpen && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-full min-w-[220px] bg-bg-elevated border border-border-subtle rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto animated fadeIn">
              <div className="p-1 space-y-0.5">
                {models.map((model) => (
                  <Button
                    variant="ghost"
                    key={model.id}
                    onClick={() => handleSelectModel(model.id)}
                    className={`w-full h-auto text-left px-3 py-2 text-xs rounded-md flex items-center justify-between group ${selectedModel === model.id ? 'bg-bg-input hover:bg-bg-elevated text-text-primary' : 'text-text-secondary hover:bg-bg-input hover:text-text-primary'}`}
                    type="button"
                  >
                    <span className="truncate">{model.label}</span>
                    {selectedModel === model.id && (
                      <Check
                        size={14}
                        className="text-accent-primary shrink-0 ml-2"
                      />
                    )}
                  </Button>
                ))}

                {/* Custom model input */}
                <div className="border-t border-border-subtle mt-1 pt-1 px-1">
                  <div className="flex gap-1">
                    <Input
                      type="text"
                      value={customModelId}
                      onChange={(e) => setCustomModelId(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleApplyCustomModel();
                      }}
                      placeholder="Custom model ID..."
                      className="flex-1 h-7 bg-bg-input border-border-subtle rounded px-2 text-xs text-text-primary"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <Button
                      variant="ghost"
                      onClick={handleApplyCustomModel}
                      disabled={!customModelId.trim()}
                      className="h-7 px-2 text-xs text-accent-primary hover:bg-accent-primary/10"
                      type="button"
                    >
                      Use
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <span className="w-[110px]" />
      </div>

      {testError && (
        <p className="text-xs text-red-400 mt-1.5 mb-2">{testError}</p>
      )}
    </Card>
  );
};
