import React from 'react';
import { OPENROUTER_MODELS, prettifyModelId } from '../../../utils/modelUtils';
import { ModelSelect } from './ProviderSettingsShared';

export const DefaultModelSection: React.FC<{ ctx: any }> = ({ ctx }) => {
  const { defaultModel, setDefaultModel } = ctx;

  const options = OPENROUTER_MODELS.map((m) => ({ id: m.id, name: m.name }));
  if (defaultModel && !options.find((o) => o.id === defaultModel)) {
    options.unshift({ id: defaultModel, name: prettifyModelId(defaultModel) });
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-bold text-text-primary mb-1">
          Default Model for Chat
        </h3>
        <p className="text-xs text-text-secondary mb-2">
          All models run via OpenRouter.
        </p>
      </div>

      <div className="bg-bg-item-surface rounded-xl p-5 border border-border-subtle flex items-center justify-between">
        <div>
          <label className="block text-xs font-medium text-text-primary uppercase tracking-wide mb-0">
            Active Model
          </label>
          <p className="text-xs text-text-secondary">
            Applies to new chats instantly.
          </p>
        </div>
        <ModelSelect
          value={defaultModel}
          options={options}
          onChange={(val) => {
            setDefaultModel(val);
            window.electronAPI.setModel(val).catch(console.error);
          }}
        />
      </div>
    </div>
  );
};
