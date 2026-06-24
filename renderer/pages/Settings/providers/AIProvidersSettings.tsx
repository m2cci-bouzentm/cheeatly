import React, { useState, useEffect } from 'react';
import { OPENROUTER_MODELS, prettifyModelId } from '../../../utils/modelUtils';
import { Check, Loader2, ExternalLink, X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

export const AIProvidersSettings: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState('');
  const [defaultModel, setDefaultModel] = useState('openai/gpt-oss-120b');
  const [customModelId, setCustomModelId] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const creds = await window.electronAPI.getStoredCredentials();
        setHasKey(!!(creds as any)?.hasOpenRouterKey);
        const config = await window.electronAPI.getDefaultModel();
        if (config?.model) setDefaultModel(config.model);
      } catch {}
    };
    load();
  }, []);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      const result = await window.electronAPI.setApiKey('openrouter', apiKey);
      if (result?.success) {
        setHasKey(true);
        setApiKey('');
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (e) {
      console.error('Failed to save key:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!confirm('Remove OpenRouter API key?')) return;
    try {
      const result = await window.electronAPI.setApiKey('openrouter', '');
      if (result?.success) {
        setHasKey(false);
        setApiKey('');
      }
    } catch {}
  };

  const handleTest = async () => {
    setTestStatus('testing');
    setTestError('');
    try {
      const result = await window.electronAPI.testLlmConnection('openrouter', apiKey || undefined);
      if (result.success) {
        setTestStatus('success');
        setTimeout(() => setTestStatus('idle'), 3000);
      } else {
        setTestStatus('error');
        setTestError(result.error || 'Connection failed');
      }
    } catch (e: any) {
      setTestStatus('error');
      setTestError(e.message || 'Connection failed');
    }
  };

  const handleSelectModel = (modelId: string) => {
    setDefaultModel(modelId);
    window.electronAPI.setModel(modelId).catch(console.error);
  };

  const handleAddCustomModel = () => {
    if (!customModelId.trim()) return;
    handleSelectModel(customModelId.trim());
    setCustomModelId('');
    setShowCustom(false);
  };

  return (
    <div className="space-y-6 animated fadeIn pb-10">
      {/* OpenRouter API Key */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-text-primary">OpenRouter</h3>
            <p className="text-xs text-text-secondary">
              Single provider for all models — GPT, Claude, Gemini, DeepSeek, and more.
            </p>
          </div>
          <button
            onClick={() => window.electronAPI.openExternal('https://openrouter.ai/keys')}
            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
          >
            Get key <ExternalLink size={10} />
          </button>
        </div>

        <div className="bg-bg-item-surface rounded-xl p-4 border border-border-subtle space-y-3">
          {hasKey ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Check size={14} className="text-emerald-400" />
                <span className="text-sm text-text-primary">API key configured</span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleTest}
                  disabled={testStatus === 'testing'}
                  className="text-xs"
                >
                  {testStatus === 'testing' ? (
                    <><Loader2 size={12} className="animate-spin mr-1" /> Testing</>
                  ) : testStatus === 'success' ? (
                    <><Check size={12} className="text-emerald-400 mr-1" /> Connected</>
                  ) : 'Test'}
                </Button>
                <Button variant="ghost" size="sm" onClick={handleRemove} className="text-xs text-red-400">
                  Remove
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="sk-or-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                className="flex-1 text-sm"
              />
              <Button size="sm" onClick={handleSave} disabled={saving || !apiKey.trim()}>
                {saving ? <Loader2 size={12} className="animate-spin" /> : saved ? <Check size={12} /> : 'Save'}
              </Button>
            </div>
          )}
          {testStatus === 'error' && testError && (
            <p className="text-xs text-red-400">{testError}</p>
          )}
        </div>
      </div>

      {/* Model Selection */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-bold text-text-primary">Model</h3>
          <p className="text-xs text-text-secondary">
            Select a model or enter any OpenRouter model ID.
          </p>
        </div>

        <div className="bg-bg-item-surface rounded-xl p-4 border border-border-subtle space-y-2">
          {OPENROUTER_MODELS.map((m) => {
            const isSelected = defaultModel === m.id;
            return (
              <button
                key={m.id}
                onClick={() => handleSelectModel(m.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center justify-between transition-colors ${
                  isSelected
                    ? 'bg-white/10 text-white'
                    : 'text-text-secondary hover:bg-white/5 hover:text-white'
                }`}
              >
                <div>
                  <span className="text-sm font-medium">{m.name}</span>
                  <span className="text-xs text-text-muted ml-2">{m.desc}</span>
                </div>
                {isSelected && <Check size={14} className="text-emerald-400 shrink-0" />}
              </button>
            );
          })}

          {/* Custom model entry */}
          {!OPENROUTER_MODELS.find((m) => m.id === defaultModel) && defaultModel && (
            <div className="px-3 py-2.5 rounded-lg bg-white/10 text-white flex items-center justify-between">
              <div>
                <span className="text-sm font-medium">{prettifyModelId(defaultModel)}</span>
                <span className="text-xs text-text-muted ml-2">Custom</span>
              </div>
              <Check size={14} className="text-emerald-400 shrink-0" />
            </div>
          )}

          {showCustom ? (
            <div className="flex gap-2 pt-1">
              <Input
                placeholder="provider/model-name"
                value={customModelId}
                onChange={(e) => setCustomModelId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCustomModel()}
                className="flex-1 text-sm"
              />
              <Button size="sm" onClick={handleAddCustomModel} disabled={!customModelId.trim()}>
                Use
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowCustom(false)}>
                <X size={14} />
              </Button>
            </div>
          ) : (
            <button
              onClick={() => setShowCustom(true)}
              className="w-full text-left px-3 py-2 rounded-lg text-text-muted hover:text-text-secondary hover:bg-white/5 transition-colors flex items-center gap-2 text-xs"
            >
              <Plus size={12} /> Custom model ID
            </button>
          )}
        </div>
      </div>
      {/* Question Detection */}
      <QuestionDetectionSection />
    </div>
  );
};

function QuestionDetectionSection() {
  const [enabled, setEnabled] = useState(true);
  const [interval, setIntervalVal] = useState(20);
  const [scanModel, setScanModel] = useState('');
  const [useCustomModel, setUseCustomModel] = useState(false);
  const [scanKey, setScanKey] = useState('');
  const [hasScanKey, setHasScanKey] = useState(false);
  const [scanSaving, setScanSaving] = useState(false);
  const [scanSaved, setScanSaved] = useState(false);
  const [windowSize, setWindowSize] = useState(20);

  useEffect(() => {
    const load = async () => {
      try {
        const config = await window.electronAPI.getQuestionAnalysisConfig();
        setEnabled(config.enabled);
        setIntervalVal(config.interval);
        const hasCustom = !!(config.model && config.model.trim());
        setUseCustomModel(hasCustom);
        setScanModel(hasCustom ? config.model : '');
        setHasScanKey(!!(config.openRouterApiKey && config.openRouterApiKey.trim()));
        setWindowSize(config.window || 20);
      } catch {}
    };
    load();
    const unsub = window.electronAPI.onQuestionAnalysisConfigChanged((config) => {
      setEnabled(config.enabled);
      setIntervalVal(config.interval);
    });
    return unsub;
  }, []);

  const handleToggle = (val: boolean) => {
    setEnabled(val);
    window.electronAPI.setQuestionAnalysisConfig({ enabled: val });
  };

  const handleIntervalChange = (val: string) => {
    const num = parseInt(val, 10);
    setIntervalVal(isNaN(num) ? 0 : num);
  };

  const commitInterval = () => {
    const clamped = Math.max(5, Math.min(120, interval));
    setIntervalVal(clamped);
    window.electronAPI.setQuestionAnalysisConfig({ interval: clamped });
  };

  const handleModelSelect = (modelId: string) => {
    setScanModel(modelId);
    window.electronAPI.setQuestionAnalysisConfig({ model: modelId });
  };

  const handleCustomModelToggle = (val: boolean) => {
    setUseCustomModel(val);
    if (!val) {
      setScanModel('');
      window.electronAPI.setQuestionAnalysisConfig({ model: '' });
    }
  };

  const handleSaveScanKey = async () => {
    if (!scanKey.trim()) return;
    setScanSaving(true);
    try {
      await window.electronAPI.setQuestionAnalysisConfig({ openRouterApiKey: scanKey });
      setHasScanKey(true);
      setScanKey('');
      setScanSaved(true);
      setTimeout(() => setScanSaved(false), 2000);
    } catch {} finally {
      setScanSaving(false);
    }
  };

  const handleRemoveScanKey = async () => {
    await window.electronAPI.setQuestionAnalysisConfig({ openRouterApiKey: '' });
    setHasScanKey(false);
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-bold text-text-primary">Question Detection</h3>
        <p className="text-xs text-text-secondary">
          Auto-detect questions from live transcript during meetings.
        </p>
      </div>

      <div className="bg-bg-item-surface rounded-xl p-4 border border-border-subtle space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-text-primary">Continuous scanning</span>
            <p className="text-xs text-text-secondary">Analyze transcript periodically</p>
          </div>
          <Switch checked={enabled} onCheckedChange={handleToggle} />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-text-primary">Interval (seconds)</span>
            <p className="text-xs text-text-secondary">How often to scan (5–120)</p>
          </div>
          <Input
            type="number"
            min={5}
            max={120}
            value={interval || ''}
            onChange={(e) => handleIntervalChange(e.target.value)}
            onBlur={commitInterval}
            disabled={!enabled}
            className="w-20 text-sm text-center"
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-text-primary">Transcript window</span>
            <p className="text-xs text-text-secondary">Recent turns to analyze (5–100)</p>
          </div>
          <Input
            type="number"
            min={5}
            max={100}
            value={windowSize || ''}
            onChange={(e) => {
              const num = parseInt(e.target.value, 10);
              setWindowSize(isNaN(num) ? 0 : num);
            }}
            onBlur={() => {
              const clamped = Math.max(5, Math.min(100, windowSize || 20));
              setWindowSize(clamped);
              window.electronAPI.setQuestionAnalysisConfig({ window: clamped });
            }}
            disabled={!enabled}
            className="w-20 text-sm text-center"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-text-primary">Custom scanning model</span>
              <p className="text-xs text-text-secondary">
                {useCustomModel ? 'Using a separate model for scanning' : 'Uses same model as AI chat'}
              </p>
            </div>
            <Switch checked={useCustomModel} onCheckedChange={handleCustomModelToggle} disabled={!enabled} />
          </div>

          {useCustomModel && (
            <>
              <div className="flex flex-wrap gap-1.5">
                {OPENROUTER_MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => handleModelSelect(m.id)}
                    disabled={!enabled}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border ${
                      scanModel === m.id
                        ? 'bg-blue-500/20 border-blue-500/40 text-blue-400'
                        : 'bg-white/[0.03] border-white/[0.06] text-text-secondary hover:bg-white/[0.06] hover:text-text-primary'
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
              <Input
                type="text"
                placeholder="Or enter model ID (e.g. meta-llama/llama-4-scout)"
                value={OPENROUTER_MODELS.some((m) => m.id === scanModel) ? '' : scanModel}
                onChange={(e) => setScanModel(e.target.value)}
                onBlur={() => {
                  if (scanModel.trim()) {
                    window.electronAPI.setQuestionAnalysisConfig({ model: scanModel.trim() });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && scanModel.trim()) {
                    window.electronAPI.setQuestionAnalysisConfig({ model: scanModel.trim() });
                  }
                }}
                disabled={!enabled}
                className="text-xs"
              />
              <p className="text-[11px] text-text-secondary">
                {OPENROUTER_MODELS.find((m) => m.id === scanModel)?.desc || scanModel || 'Select a model above'}
              </p>

              <div className="pt-2 border-t border-white/[0.05] space-y-2">
                <div>
                  <span className="text-sm text-text-primary">API Key</span>
                  <p className="text-xs text-text-secondary">
                    {hasScanKey
                      ? 'Using dedicated key for scanning.'
                      : 'Shares the chat API key by default. Set a separate key to isolate costs.'}
                  </p>
                </div>
                {hasScanKey ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Check size={14} className="text-emerald-400" />
                      <span className="text-sm text-text-primary">Dedicated key configured</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={handleRemoveScanKey} className="text-xs text-red-400">
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      placeholder="sk-or-... (optional)"
                      value={scanKey}
                      onChange={(e) => setScanKey(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveScanKey()}
                      className="flex-1 text-sm"
                    />
                    <Button size="sm" onClick={handleSaveScanKey} disabled={scanSaving || !scanKey.trim()}>
                      {scanSaving ? <Loader2 size={12} className="animate-spin" /> : scanSaved ? <Check size={12} /> : 'Save'}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
