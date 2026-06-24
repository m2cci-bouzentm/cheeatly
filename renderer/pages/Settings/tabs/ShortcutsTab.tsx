import React from 'react';
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Camera,
  RotateCcw,
  Eye,
  MessageSquare,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { KeyRecorder } from '../../../components/ui/KeyRecorder';
import { Button } from '@/components/ui/button';

import { useSettingsOverlayContext } from '../SettingsContext';

export const ShortcutsTab: React.FC = () => {
  const { shortcuts, updateShortcut, resetShortcuts } =
    useSettingsOverlayContext();

  return (
    <div className="space-y-4 animated fadeIn select-text pb-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-bold text-text-primary mb-0.5">
            Keyboard shortcuts
          </h3>
          <p className="text-xs text-text-secondary">
            Cheatly works with these easy to remember commands.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={resetShortcuts}
          className="rounded-md border-border-subtle bg-bg-subtle/30 hover:bg-bg-subtle hover:border-green-500/30 transition-all duration-200 text-[10px] font-bold uppercase tracking-wider text-text-secondary hover:text-green-500 active:scale-95 mt-0.5 px-3 py-1 h-auto"
        >
          <RotateCcw size={11} strokeWidth={2.5} />
          Restore
        </Button>
      </div>

      <div className="grid gap-5">
        {/* General Category */}
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary mb-2">
            General
          </h4>
          <div className="space-y-0.5">
            <div className="flex items-center justify-between py-1 group">
              <div className="flex items-center gap-2.5">
                <span className="text-text-tertiary group-hover:text-text-primary transition-colors w-4 flex justify-center">
                  <Eye size={13} />
                </span>
                <span className="text-[13px] text-text-secondary font-medium group-hover:text-text-primary transition-colors">
                  Toggle Visibility
                </span>
              </div>
              <KeyRecorder
                currentKeys={shortcuts.toggleVisibility}
                onSave={(keys) => updateShortcut('toggleVisibility', keys)}
              />
            </div>
            <div className="flex items-center justify-between py-1 group">
              <div className="flex items-center gap-2.5">
                <span className="text-text-tertiary group-hover:text-text-primary transition-colors w-4 flex justify-center">
                  <MessageSquare size={13} />
                </span>
                <span className="text-[13px] text-text-secondary font-medium group-hover:text-text-primary transition-colors">
                  Process Screenshots
                </span>
              </div>
              <KeyRecorder
                currentKeys={shortcuts.processScreenshots}
                onSave={(keys) => updateShortcut('processScreenshots', keys)}
              />
            </div>
            <div className="flex items-center justify-between py-1 group">
              <div className="flex items-center gap-2.5">
                <span className="text-text-tertiary group-hover:text-text-primary transition-colors w-4 flex justify-center">
                  <Sparkles size={13} />
                </span>
                <span className="text-[13px] text-text-secondary font-medium group-hover:text-text-primary transition-colors">
                  Capture Screen & Ask AI
                </span>
              </div>
              <KeyRecorder
                currentKeys={shortcuts.captureAndProcess}
                onSave={(keys) => updateShortcut('captureAndProcess', keys)}
              />
            </div>
            <div className="flex items-center justify-between py-1 group">
              <div className="flex items-center gap-2.5">
                <span className="text-text-tertiary group-hover:text-text-primary transition-colors w-4 flex justify-center">
                  <RotateCcw size={13} />
                </span>
                <span className="text-[13px] text-text-secondary font-medium group-hover:text-text-primary transition-colors">
                  Reset / Cancel
                </span>
              </div>
              <KeyRecorder
                currentKeys={shortcuts.resetCancel}
                onSave={(keys) => updateShortcut('resetCancel', keys)}
              />
            </div>
            <div className="flex items-center justify-between py-1 group">
              <div className="flex items-center gap-2.5">
                <span className="text-text-tertiary group-hover:text-text-primary transition-colors w-4 flex justify-center">
                  <Camera size={13} />
                </span>
                <span className="text-[13px] text-text-secondary font-medium group-hover:text-text-primary transition-colors">
                  Take Screenshot
                </span>
              </div>
              <KeyRecorder
                currentKeys={shortcuts.takeScreenshot}
                onSave={(keys) => updateShortcut('takeScreenshot', keys)}
              />
            </div>
          </div>
        </div>

        {/* Chat Category */}
        <div>
          <div className="mb-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
              Chat
            </h4>
          </div>
          <div className="space-y-0.5">
            {[
              {
                id: 'whatToAnswer',
                label: 'What to Answer',
                icon: <Sparkles size={13} />,
              },
              {
                id: 'clarify',
                label: 'Clarify',
                icon: <MessageSquare size={13} />,
              },
              {
                id: 'followUp',
                label: 'Follow Up',
                icon: <MessageSquare size={13} />,
              },
              {
                id: 'dynamicAction4',
                label: 'Recap',
                icon: <RefreshCw size={13} />,
              },
              {
                id: 'scrollUp',
                label: 'Scroll Up',
                icon: <ArrowUp size={13} />,
              },
              {
                id: 'scrollDown',
                label: 'Scroll Down',
                icon: <ArrowDown size={13} />,
              },
              {
                id: 'scrollLeft',
                label: 'Scroll Left (code block)',
                icon: <ArrowLeft size={13} />,
              },
              {
                id: 'scrollRight',
                label: 'Scroll Right (code block)',
                icon: <ArrowRight size={13} />,
              },
              {
                id: 'focusInput',
                label: 'Toggle Stealth Typing',
                icon: <MessageSquare size={13} />,
              },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-1 group"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-text-tertiary group-hover:text-text-primary transition-colors w-4 flex justify-center">
                    {item.icon}
                  </span>
                  <span className="text-[13px] text-text-secondary font-medium group-hover:text-text-primary transition-colors">
                    {item.label}
                  </span>
                </div>
                <KeyRecorder
                  currentKeys={shortcuts[item.id as keyof typeof shortcuts]}
                  onSave={(keys) => updateShortcut(item.id as any, keys)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Window Category */}
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary mb-2">
            Window
          </h4>
          <div className="space-y-0.5">
            {[
              {
                id: 'moveWindowUp',
                label: 'Move Window Up',
                icon: <ArrowUp size={13} />,
              },
              {
                id: 'moveWindowDown',
                label: 'Move Window Down',
                icon: <ArrowDown size={13} />,
              },
              {
                id: 'moveWindowLeft',
                label: 'Move Window Left',
                icon: <ArrowLeft size={13} />,
              },
              {
                id: 'moveWindowRight',
                label: 'Move Window Right',
                icon: <ArrowRight size={13} />,
              },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-1 group"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-text-tertiary group-hover:text-text-primary transition-colors w-4 flex justify-center">
                    {item.icon}
                  </span>
                  <span className="text-[13px] text-text-secondary font-medium group-hover:text-text-primary transition-colors">
                    {item.label}
                  </span>
                </div>
                <KeyRecorder
                  currentKeys={shortcuts[item.id as keyof typeof shortcuts]}
                  onSave={(keys) => updateShortcut(item.id as any, keys)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
