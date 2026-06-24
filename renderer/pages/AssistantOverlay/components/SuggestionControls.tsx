import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowRight,
  HelpCircle,
  MessageSquare,
  Pencil,
  RefreshCw,
  X,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { getModifierSymbol } from '../../../utils/platformUtils';
import { modelSupportsVision } from '../../../utils/modelUtils';
import { subtleSurfaceClass } from './MessageComponents';
import type { AttachmentContext, OverlayAppearance } from '../types';

interface SuggestionControlsProps {
  hasTranscript: boolean;
  showTranscript: boolean;
  quickActionClass: string;
  appearance: OverlayAppearance;
  handleWhatToSay: () => void;
  handleClarify: () => void;
  handleRecap: () => void;
  handleFollowUpQuestions: () => void;
  attachedContext: AttachmentContext[];
  setAttachedContext: React.Dispatch<React.SetStateAction<AttachmentContext[]>>;
  isLightTheme: boolean;
  stealthHotkeyConflict: string | null;
  setStealthHotkeyConflict: React.Dispatch<React.SetStateAction<string | null>>;
  stealthPermissionMissing: boolean;
  setStealthPermissionMissing: React.Dispatch<React.SetStateAction<boolean>>;
  isMac: boolean;
  textInputRef: React.RefObject<HTMLInputElement | null>;
  inputValue: string;
  setInputValue: React.Dispatch<React.SetStateAction<string>>;
  handleManualSubmit: () => void;
  blockInputFocus: (e: React.MouseEvent<HTMLInputElement>) => void;
  stealthTapActive: boolean;
  shortcuts: any;
  currentModel: string;
  controlSurfaceClass: string;
}

const SuggestionControls = ({
  hasTranscript,
  showTranscript,
  handleWhatToSay,
  handleClarify,
  handleRecap,
  handleFollowUpQuestions,
  attachedContext,
  setAttachedContext,
  isLightTheme,
  stealthHotkeyConflict,
  setStealthHotkeyConflict,
  stealthPermissionMissing,
  setStealthPermissionMissing,
  isMac,
  textInputRef,
  inputValue,
  setInputValue,
  handleManualSubmit,
  blockInputFocus,
  stealthTapActive,
  shortcuts,
  currentModel,
}: SuggestionControlsProps) => {
  // Suggestion actions need a transcript — disable them until speech lands
  // instead of letting a click produce an error message.
  const transcriptGateClass = hasTranscript
    ? ''
    : 'opacity-40 grayscale cursor-not-allowed';
  const transcriptGateTitle = hasTranscript
    ? undefined
    : 'Waiting for conversation audio…';

  return (
    <div className="flex flex-col gap-0 select-none">
      <div
        className={cn(
          'flex flex-nowrap justify-start items-center gap-1.5 px-2.5 pb-2 overflow-x-auto no-scrollbar scroll-smooth',
          hasTranscript && showTranscript ? 'pt-1' : 'pt-2'
        )}
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={handleWhatToSay}
          disabled={!hasTranscript}
          title={transcriptGateTitle}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold transition-all duration-300 active:scale-95 shrink-0 border-0 shadow-sm',
            isLightTheme
              ? 'bg-slate-100 text-slate-900 hover:bg-slate-200'
              : 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700',
            !hasTranscript && 'opacity-40'
          )}
        >
          <Pencil className="w-3 h-3" /> What to answer?
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleClarify}
          disabled={!hasTranscript}
          title={transcriptGateTitle}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold transition-all duration-300 active:scale-95 shrink-0 border-0 shadow-sm',
            isLightTheme
              ? 'bg-slate-100 text-slate-900 hover:bg-slate-200'
              : 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700',
            !hasTranscript && 'opacity-40'
          )}
        >
          <MessageSquare className="w-3 h-3" /> Clarify
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleRecap}
          disabled={!hasTranscript}
          title={transcriptGateTitle}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold transition-all duration-300 active:scale-95 shrink-0 border-0 shadow-sm',
            isLightTheme
              ? 'bg-slate-100 text-slate-900 hover:bg-slate-200'
              : 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700',
            !hasTranscript && 'opacity-40'
          )}
        >
          <RefreshCw className="w-3 h-3" /> Recap
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleFollowUpQuestions}
          disabled={!hasTranscript}
          title={transcriptGateTitle}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold transition-all duration-300 active:scale-95 shrink-0 border-0 shadow-sm',
            isLightTheme
              ? 'bg-slate-100 text-slate-900 hover:bg-slate-200'
              : 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700',
            !hasTranscript && 'opacity-40'
          )}
        >
          <HelpCircle className="w-3 h-3" /> Follow Up
        </Button>
      </div>

      <div className="px-2.5 pb-2.5 space-y-2">
        {attachedContext.length > 0 && (
          <div
            className={cn(
              'rounded-lg p-2 border shadow-sm flex flex-col gap-1.5',
              isLightTheme
                ? 'bg-white border-slate-100'
                : 'bg-zinc-800/50 border-zinc-700/50'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">
                {attachedContext.length} Context attached
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setAttachedContext([])}
                className="h-4.5 w-4.5 rounded-full opacity-40 hover:opacity-100"
                title="Remove all"
              >
                <X className="w-2.5 h-2.5" />
              </Button>
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
              {attachedContext.map((ctx, idx) => (
                <div key={ctx.path} className="relative group/thumb shrink-0">
                  <img
                    src={ctx.preview}
                    alt={`Screenshot ${idx + 1}`}
                    className="h-8 w-auto rounded-md border border-black/10 dark:border-white/10 shadow-sm"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() =>
                      setAttachedContext((prev) =>
                        prev.filter((_item, i) => i !== idx)
                      )
                    }
                    className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full shadow-lg opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                  >
                    <X className="w-2 h-2" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {stealthHotkeyConflict && (
          <div
            className="px-2.5 py-1.5 rounded-lg border border-rose-500/20 bg-rose-500/5 text-xs flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-1"
            data-stealth-ignore="true"
          >
            <span className="flex-1 font-medium leading-relaxed opacity-90">
              Hotkey{' '}
              <kbd className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 font-mono text-[9px]">
                {stealthHotkeyConflict}
              </kbd>{' '}
              is busy.
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.electronAPI.openSettingsTab('keybinds')}
              className="h-5 px-1.5 rounded-md text-[9px] font-bold uppercase"
              data-stealth-ignore="true"
            >
              Rebind
            </Button>
            <button
              onClick={() => setStealthHotkeyConflict(null)}
              className="opacity-40 hover:opacity-100"
              data-stealth-ignore="true"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        )}

        {isMac && stealthPermissionMissing && (
          <div
            className="px-2.5 py-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 text-xs flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-1"
            data-stealth-ignore="true"
          >
            <span className="flex-1 font-medium leading-relaxed opacity-90">
              Stealth typing needs Accessibility access.
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.electronAPI.stealthTapOpenSettings()}
              className="h-5 px-1.5 rounded-md text-[9px] font-bold uppercase"
              data-stealth-ignore="true"
            >
              Enable
            </Button>
            <button
              onClick={() => setStealthPermissionMissing(false)}
              className="opacity-40 hover:opacity-100"
              data-stealth-ignore="true"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        )}

        <div className="relative group" data-stealth-engage="true">
          <Input
            ref={textInputRef}
            data-testid="overlay-chat-input"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.repeat) return;
              e.preventDefault();
              handleManualSubmit();
            }}
            onMouseDown={blockInputFocus}
            readOnly={stealthTapActive}
            placeholder={!inputValue ? 'Ask anything on screen...' : ''}
            className={cn(
              'w-full h-9 pl-2.5 pr-8 rounded-lg border-0 shadow-none text-[13px] transition-all duration-300 ring-offset-0 focus-visible:ring-0',
              isLightTheme
                ? 'bg-slate-100/50 text-slate-900'
                : 'bg-white/5 text-white',
              stealthTapActive && 'ring-2 ring-emerald-500/40 bg-emerald-500/5'
            )}
          />

          {!inputValue && (
            <div
              className={cn(
                'absolute right-10 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none sm:flex',
                modelSupportsVision(currentModel)
                  ? 'opacity-20'
                  : 'opacity-10 line-through'
              )}
              title={
                modelSupportsVision(currentModel)
                  ? 'Take screenshot'
                  : 'Screenshots not supported by this model'
              }
            >
              {(
                shortcuts.takeScreenshot || [getModifierSymbol('cmd'), 'H']
              ).map((key: string, i: number) => (
                <kbd
                  key={i}
                  className="px-1 py-0.5 rounded border border-current text-[8px] font-mono min-w-[14px] text-center"
                >
                  {key}
                </kbd>
              ))}
            </div>
          )}

          <Button
            size="icon"
            onClick={handleManualSubmit}
            disabled={!inputValue.trim()}
            className={cn(
              'absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md transition-all duration-300',
              inputValue.trim()
                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                : 'bg-transparent text-current opacity-20'
            )}
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SuggestionControls;
