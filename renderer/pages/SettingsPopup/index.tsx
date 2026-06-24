import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { MessageSquare, Camera } from 'lucide-react';
import { useShortcuts } from '../../hooks/useShortcuts';
import { getModifierSymbol } from '../../utils/platformUtils';
import { Switch } from '@/components/ui/switch';

const SettingsPopup = () => {
  const { shortcuts } = useShortcuts();
  const isLightTheme = false;
  const [isUndetectable, setIsUndetectable] = useState(false);

  // Fetch initial undetectable state from main process (source of truth)
  useEffect(() => {
    window.electronAPI.getUndetectable().then((state: boolean) => {
      setIsUndetectable(state);
    });
  }, []);

  // One-way listener: receive state changes from main process, never echo back
  useEffect(() => {
    const unsubscribe = window.electronAPI.onUndetectableChanged(
      (newState: boolean) => {
        setIsUndetectable(newState);
        localStorage.setItem('cheatly_undetectable', String(newState));
      }
    );
    return () => unsubscribe();
  }, []);

  const [showTranscript, setShowTranscript] = useState(() => {
    const stored = localStorage.getItem('cheatly_interviewer_transcript');
    return stored !== 'false'; // Default to true if not set
  });

  useEffect(() => {
    const handleStorage = () => {
      const stored = localStorage.getItem('cheatly_interviewer_transcript');
      setShowTranscript(stored !== 'false');
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const contentRef = useRef<HTMLDivElement>(null);

  // Auto-resize Window
  useLayoutEffect(() => {
    if (!contentRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const rect = entry.target.getBoundingClientRect();
        try {
          window.electronAPI.updateContentDimensions({
            width: Math.ceil(rect.width),
            height: Math.ceil(rect.height),
          });
        } catch (e) {
          console.warn('Failed to update dimensions', e);
        }
      }
    });

    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, []);

  const isDarkBg = !isLightTheme;

  const popupPanelClass = isDarkBg
    ? 'bg-bg-card/80 border-white/10 shadow-black/40'
    : 'bg-bg-component/92 border-black/10 shadow-black/10';
  const itemHoverClass = isDarkBg
    ? 'hover:bg-white/5'
    : 'hover:bg-black/[0.04]';
  const glassRowClass = 'glass-popup-row';
  const labelColorClass = isDarkBg ? 'text-white' : 'text-slate-900';
  const inactiveIconColorClass = isDarkBg
    ? 'text-white/60 group-hover:text-white/90'
    : 'text-slate-500 group-hover:text-slate-800';
  const dividerClass = isDarkBg ? 'bg-white/[0.04]' : 'bg-black/[0.06]';
  const shortcutKeyClass = isDarkBg
    ? 'border-white/10 bg-white/5 text-slate-400 glass-shortcut-key'
    : 'border-black/10 bg-black/[0.04] text-slate-600 glass-shortcut-key';
  return (
    <div className="w-fit h-fit bg-transparent flex flex-col">
      <div
        ref={contentRef}
        className={`w-[180px] backdrop-blur-md border rounded-[14px] overflow-hidden shadow-2xl p-1.5 flex flex-col animate-scale-in origin-top-left overlay-shell-surface ${popupPanelClass}`}
      >
        <div className="relative z-[1] flex flex-col">
          {/* Undetectability */}
          <div
            className={`flex items-center justify-between px-2.5 py-1.5 rounded-md transition-colors duration-200 group cursor-default ${itemHoverClass} ${glassRowClass}`}
          >
            <div className="flex items-center gap-2.5">
              <CustomGhost
                className={`w-4 h-4 transition-colors ${isUndetectable ? (isDarkBg ? 'text-white' : 'text-slate-900') : inactiveIconColorClass}`}
                fill={isUndetectable ? 'currentColor' : 'none'}
                stroke={isUndetectable ? 'none' : 'currentColor'}
                eyeColor={
                  isUndetectable
                    ? isDarkBg
                      ? 'black'
                      : 'white'
                    : isDarkBg
                      ? 'white'
                      : '#334155'
                }
              />
              <span
                className={`text-sm font-medium transition-colors ${labelColorClass}`}
              >
                {isUndetectable ? 'Undetectable' : 'Detectable'}
              </span>
            </div>
            <Switch
              checked={isUndetectable}
              onCheckedChange={() => {
                const newState = !isUndetectable;
                setIsUndetectable(newState);
                localStorage.setItem('cheatly_undetectable', String(newState));
                window.electronAPI.setUndetectable(newState);
              }}
            />
          </div>

          {/* Interviewer Transcript Toggle */}
          <div
            className={`flex items-center justify-between px-2.5 py-1.5 rounded-md transition-colors duration-200 group cursor-default ${itemHoverClass} ${glassRowClass}`}
          >
            <div className="flex items-center gap-2.5">
              <MessageSquare
                className={`w-3.5 h-3.5 transition-colors ${showTranscript ? 'text-emerald-400' : inactiveIconColorClass}`}
                fill={showTranscript ? 'currentColor' : 'none'}
              />
              <span
                className={`text-sm font-medium transition-colors ${labelColorClass}`}
              >
                Transcript
              </span>
            </div>
            <Switch
              checked={showTranscript}
              onCheckedChange={() => {
                const newState = !showTranscript;
                setShowTranscript(newState);
                localStorage.setItem(
                  'cheatly_interviewer_transcript',
                  String(newState)
                );
                // Dispatch event for same-window listeners
                window.dispatchEvent(new Event('storage'));
              }}
            />
          </div>

          <div className={`h-px my-0.5 mx-1.5 ${dividerClass}`} />

          {/* Show/Hide Cheatly */}
          <div
            className={`flex items-center justify-between px-2.5 py-1.5 rounded-md transition-colors duration-200 group interaction-base interaction-press ${itemHoverClass} ${glassRowClass}`}
          >
            <div className="flex items-center gap-2.5">
              <MessageSquare
                className={`w-3.5 h-3.5 transition-colors ${inactiveIconColorClass}`}
              />
              <span className={`text-sm transition-colors ${labelColorClass}`}>
                Show/Hide
              </span>
            </div>
            <div className="flex gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
              {/* Dynamic Keys for Toggle Visibility */}
              {(
                shortcuts.toggleVisibility || [getModifierSymbol('cmd'), 'B']
              ).map((key, index) => (
                <div
                  key={index}
                  className={`px-1.5 py-0.5 rounded border text-xs font-medium min-w-[20px] text-center ${shortcutKeyClass}`}
                >
                  {key}
                </div>
              ))}
            </div>
          </div>

          {/* Screenshot */}
          <div
            className={`flex items-center justify-between px-2.5 py-1.5 rounded-md transition-colors duration-200 group interaction-base interaction-press ${itemHoverClass} ${glassRowClass}`}
          >
            <div className="flex items-center gap-2.5">
              <Camera
                className={`w-3.5 h-3.5 transition-colors ${inactiveIconColorClass}`}
              />
              <span className={`text-sm transition-colors ${labelColorClass}`}>
                Screenshot
              </span>
            </div>
            <div className="flex gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
              {/* Dynamic Keys for Take Screenshot */}
              {(
                shortcuts.takeScreenshot || [getModifierSymbol('cmd'), 'H']
              ).map((key, index) => (
                <div
                  key={index}
                  className={`px-1.5 py-0.5 rounded border text-xs font-medium min-w-[20px] text-center ${shortcutKeyClass}`}
                >
                  {key}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface CustomGhostProps {
  className?: string;
  fill?: string;
  stroke?: string;
  eyeColor?: string;
}

// Custom Ghost with dynamic eye color support
const CustomGhost = ({
  className,
  fill,
  stroke,
  eyeColor,
}: CustomGhostProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill={fill || 'none'}
    stroke={stroke || 'currentColor'}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {/* Body */}
    <path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" />
    {/* Eyes - No stroke, just fill */}
    <path
      d="M9 10h.01 M15 10h.01"
      stroke={eyeColor || 'currentColor'}
      strokeWidth="2.5" // Slightly bolder for visibility
      fill="none"
    />
  </svg>
);

export default SettingsPopup;
