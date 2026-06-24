import { useState, useEffect } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { OPENROUTER_MODELS, prettifyModelId } from '../../utils/modelUtils';
import { Button } from '@/components/ui/button';

interface ModelOption {
  id: string;
  name: string;
}

const ModelSelectorWindow = () => {
  const isLight = false;
  const [currentModel, setCurrentModel] = useState<string>(
    () => localStorage.getItem('cached-current-model') || ''
  );
  const [isLoading, setIsLoading] = useState(false);

  const models: ModelOption[] = OPENROUTER_MODELS.map((m) => ({
    id: m.id,
    name: m.name,
  }));

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await window.electronAPI.getCurrentLlmConfig();
        if (config?.model) {
          setCurrentModel(config.model);
          localStorage.setItem('cached-current-model', config.model);
        }
      } catch (err) {
        console.error('Failed to load config:', err);
      }
    };

    loadConfig();
    window.addEventListener('focus', loadConfig);

    const unsubscribe = window.electronAPI.onModelChanged(
      (modelId: string) => {
        setCurrentModel(modelId);
      }
    );
    return () => {
      unsubscribe?.();
      window.removeEventListener('focus', loadConfig);
    };
  }, []);

  const handleSelectFn = (modelId: string) => {
    setCurrentModel(modelId);
    localStorage.setItem('cached-current-model', modelId);
    window.electronAPI
      .setModel(modelId)
      .catch((err: any) => console.error('Failed to set model:', err));
  };

  const panelClass = isLight
    ? 'bg-bg-component/92 border-black/10 shadow-black/10'
    : 'bg-bg-card/80 border-white/10 shadow-black/40';

  return (
    <div className="w-fit h-fit bg-transparent flex flex-col">
      <div
        className={`w-[140px] h-[200px] backdrop-blur-md border rounded-[16px] overflow-hidden shadow-2xl p-2 flex flex-col animate-scale-in origin-top-left overlay-shell-surface ${panelClass}`}
      >
        <div className="relative z-[1] flex-1 min-h-0 flex flex-col">
          {isLoading ? (
            <div className="flex items-center justify-center py-4 overlay-text-muted text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              <span className="text-xs">Loading...</span>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto scrollbar-hide flex flex-col gap-0.5">
              {models.map((model) => {
                const isSelected = currentModel === model.id;
                return (
                  <Button
                    variant="ghost"
                    key={model.id}
                    onClick={() => handleSelectFn(model.id)}
                    className={`
                      w-full text-left px-3 py-2 flex items-center justify-between group transition-colors duration-200 rounded-lg model-selector-row
                      ${
                        isSelected
                          ? 'model-selector-row-selected overlay-text-primary bg-white/10 text-white'
                          : 'overlay-text-interactive text-slate-400 hover:bg-white/5 hover:text-slate-200'
                      }
                    `}
                  >
                    <span className="text-sm font-medium truncate flex-1 min-w-0">
                      {model.name}
                    </span>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 shrink-0 ml-2 text-emerald-400" />
                    )}
                  </Button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModelSelectorWindow;
