import { ChevronUp, ChevronDown, X, Square } from 'lucide-react';
import icon from '../icon.png';
import type { OverlayAppearance } from '../../lib/overlayAppearance';
import { Button } from '@/components/ui/button';
import { cn } from '../../lib/utils';

interface TopPillProps {
  expanded: boolean;
  onToggle: () => void;
  onBackToApp: () => void;
  onAbort?: () => void;
  onEnd?: () => void;
  appearance: OverlayAppearance;
  onLogoClick?: () => void;
}

export default function TopPill({
  expanded,
  onToggle,
  onBackToApp,
  onAbort,
  onEnd,
  appearance,
  onLogoClick,
}: TopPillProps) {
  const isLightTheme = false;

  return (
    <div className="flex justify-center select-none z-50">
      <div
        className={cn(
          'draggable-area flex items-center gap-2 rounded-full border shadow-xl transition-all duration-500 ease-sculpted p-2 px-3',
          isLightTheme
            ? 'bg-white/90 border-slate-200'
            : 'bg-zinc-900/90 border-zinc-800'
        )}
        style={appearance.pillStyle}
      >
        {/* LOGO BUTTON */}
        <button
          onClick={onLogoClick}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 hover:bg-white/5 active:scale-95 no-drag"
        >
          <img
            src={icon}
            alt="Cheatly"
            className="w-4 h-4 object-contain opacity-80"
            draggable="false"
            onDragStart={(e) => e.preventDefault()}
          />
        </button>

        {/* CENTER SEGMENT */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className={cn(
            'h-8 px-4 rounded-full text-xs font-bold transition-all duration-300 active:scale-95 flex items-center gap-2',
            isLightTheme
              ? 'bg-slate-100 text-slate-900 hover:bg-slate-200'
              : 'bg-white/5 text-white hover:bg-white/10'
          )}
        >
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5 opacity-60" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
          )}
          <span className="tracking-tight">
            {expanded ? 'Hide Overlay' : 'Show Overlay'}
          </span>
        </Button>

        {/* ABORT BUTTON — stop without saving */}
        {onAbort && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onAbort}
            className={cn(
              'h-8 px-4 rounded-full text-xs font-bold transition-all duration-300 active:scale-95 flex items-center gap-2',
              isLightTheme
                ? 'text-slate-500 hover:bg-rose-50 hover:text-rose-600'
                : 'text-zinc-400 hover:bg-rose-500/10 hover:text-rose-400'
            )}
            title="Discard meeting"
          >
            <X className="w-3.5 h-3.5 opacity-60" />
            <span className="tracking-tight">Discard</span>
          </Button>
        )}

        {/* STOP & SAVE BUTTON */}
        {onEnd && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onEnd}
            className={cn(
              'h-8 px-4 rounded-full text-xs font-bold transition-all duration-300 active:scale-95 flex items-center gap-2',
              isLightTheme
                ? 'text-emerald-600 hover:bg-emerald-50'
                : 'text-emerald-400 hover:bg-emerald-500/10'
            )}
            title="Stop & save meeting"
          >
            <Square className="w-3.5 h-3.5 opacity-60" />
            <span className="tracking-tight">Stop & Save</span>
          </Button>
        )}

        {/* BACK BUTTON — keep meeting recording alive */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onBackToApp}
          className={cn(
            'h-8 px-4 rounded-full text-xs font-bold transition-all duration-300 active:scale-95 flex items-center gap-2',
            isLightTheme
              ? 'bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-900/10'
              : 'bg-zinc-950/80 text-white hover:bg-zinc-800 border border-white/10 shadow-lg shadow-black/20'
          )}
          title="Back to Cheatly"
        >
          <img
            src={icon}
            alt=""
            className="w-3.5 h-3.5 object-contain opacity-90"
            draggable="false"
            onDragStart={(e) => e.preventDefault()}
          />
          <span className="tracking-tight">Back to App</span>
        </Button>
      </div>
    </div>
  );
}
