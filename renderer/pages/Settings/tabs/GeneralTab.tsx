import React from 'react';
import packageJson from '../../../../package.json';
import {
  BadgeCheck,
  Power,
  Terminal,
  Eye,
  Layout,
  Settings,
  Activity,
  Ghost,
  MessageSquare,
} from 'lucide-react';

import { motion, AnimatePresence } from 'framer-motion';
import { analytics } from '../../../lib/analytics/analytics.service';
import { OVERLAY_OPACITY_MIN } from '../useOverlayOpacitySettings';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';

import { useSettingsOverlayContext } from '../SettingsContext';

export const GeneralTab: React.FC = () => {
  const {
    isLight,
    isUndetectable,
    setIsUndetectable,
    openOnLogin,
    setOpenOnLogin,
    verboseLogging,
    setVerboseLogging,
    showVerboseToast,
    setShowVerboseToast,
    showTranscript,
    setShowTranscript,
    isPreviewingOpacity,
    previewOverlayOpacity,
    overlayOpacity,
    handleOpacityChange,
    startPreviewingOpacity,
    stopPreviewingOpacity,
    disguiseMode,
    setDisguiseMode,
  } = useSettingsOverlayContext();

  return (
    <div className="space-y-4 animated fadeIn">
      <div className="space-y-3">
        <Card
          className={`p-4 rounded-lg flex items-center justify-between transition-all ${isLight ? '' : 'bg-bg-item-surface'} ${isUndetectable ? 'shadow-lg shadow-blue-500/10' : ''}`}
        >
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              {isUndetectable ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-text-primary"
                >
                  <path
                    d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z"
                    fill="currentColor"
                    stroke="currentColor"
                  />
                  <path
                    d="M9 10h.01"
                    stroke="var(--bg-item-surface)"
                    strokeWidth="2.5"
                  />
                  <path
                    d="M15 10h.01"
                    stroke="var(--bg-item-surface)"
                    strokeWidth="2.5"
                  />
                </svg>
              ) : (
                <Ghost size={16} className="text-text-primary" />
              )}
              <h3 className="text-base font-bold text-text-primary">
                {isUndetectable ? 'Undetectable' : 'Detectable'}
              </h3>
            </div>
            <p className="text-xs text-text-secondary">
              Cheatly is currently{' '}
              {isUndetectable ? 'undetectable' : 'detectable'} by
              screen-sharing.
            </p>
          </div>
          <Switch
            checked={isUndetectable}
            onCheckedChange={(newState) => {
              setIsUndetectable(newState);
              window.electronAPI.setUndetectable(newState);
              analytics.trackModeSelected(
                newState ? 'undetectable' : 'overlay'
              );
            }}
          />
        </Card>

        <div>
          <h3 className="text-base font-bold text-text-primary mb-0.5">
            General settings
          </h3>
          <p className="text-xs text-text-secondary mb-2">
            Customize how Cheatly works for you
          </p>

          <div
            className={`rounded-lg border ${isLight ? 'bg-bg-card border-border-subtle divide-y divide-border-subtle' : 'bg-transparent border-transparent divide-y divide-border-subtle/20'}`}
          >
            <div className="space-y-0">
              <div className="flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 bg-bg-item-surface rounded-md border flex items-center justify-center shrink-0 transition-all duration-200 ${
                      openOnLogin
                        ? isLight
                          ? 'border-indigo-500/30 text-indigo-600 bg-indigo-50/50'
                          : 'border-indigo-500/40 text-indigo-400 bg-indigo-500/5'
                        : 'border-border-subtle text-text-tertiary'
                    }`}
                  >
                    <Power size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-text-primary">
                      Open Cheatly when you log in
                    </h3>
                    <p className="text-xs text-text-secondary mt-0.5">
                      Cheatly will open automatically when you log in to your
                      computer
                    </p>
                  </div>
                </div>
                <Switch
                  checked={openOnLogin}
                  onCheckedChange={(newState) => {
                    setOpenOnLogin(newState);
                    window.electronAPI.setOpenAtLogin(newState);
                  }}
                />
              </div>

              <div className="flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 bg-bg-item-surface rounded-md border flex items-center justify-center shrink-0 transition-all duration-200 ${
                      verboseLogging
                        ? isLight
                          ? 'border-amber-500/30 text-amber-600 bg-amber-50/50'
                          : 'border-amber-500/40 text-amber-400 bg-amber-500/5'
                        : 'border-border-subtle text-text-tertiary'
                    }`}
                  >
                    <Terminal size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-text-primary">
                      Verbose debug logging
                    </h3>
                    <p className="text-xs text-text-secondary mt-0.5">
                      Print detailed audio, STT, and pipeline diagnostics
                    </p>
                  </div>
                </div>
                <Switch
                  checked={verboseLogging}
                  onCheckedChange={(newState) => {
                    setVerboseLogging(newState);
                    window.electronAPI.setVerboseLogging(newState);
                    if (newState) {
                      setShowVerboseToast(true);
                    }
                  }}
                  className="data-[state=checked]:bg-amber-500"
                />
              </div>

              <AnimatePresence>
                {showVerboseToast && (
                  <motion.div
                    key="verbose-toast"
                    initial={{ opacity: 0, y: -6, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -4, height: 0 }}
                    transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
                    className="mx-3 mb-1 overflow-hidden"
                  >
                    <div className="flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <div className="flex items-center gap-2 min-w-0">
                        <Terminal
                          size={13}
                          className="text-amber-400 shrink-0"
                        />
                        <p className="text-xs text-amber-200/80 leading-snug truncate">
                          Logs →{' '}
                          <span className="font-mono text-amber-300">
                            ~/Documents/cheatly_debug.log
                          </span>
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.electronAPI.openLogFile()}
                        className="shrink-0 text-[11px] font-medium text-amber-400 hover:text-amber-300 px-1.5 py-0.5 h-auto rounded-md bg-amber-500/15 hover:bg-amber-500/25"
                      >
                        Open
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 bg-bg-item-surface rounded-md border flex items-center justify-center shrink-0 transition-all duration-200 ${
                      showTranscript
                        ? isLight
                          ? 'border-blue-500/30 text-blue-600 bg-blue-50/50'
                          : 'border-blue-500/40 text-blue-400 bg-blue-500/5'
                        : 'border-border-subtle text-text-tertiary'
                    }`}
                  >
                    <MessageSquare size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-text-primary">
                      Interviewer Transcript
                    </h3>
                    <p className="text-xs text-text-secondary mt-0.5">
                      Show real-time transcription of the interviewer
                    </p>
                  </div>
                </div>
                <Switch
                  checked={showTranscript}
                  onCheckedChange={(newState) => {
                    setShowTranscript(newState);
                    localStorage.setItem(
                      'cheatly_interviewer_transcript',
                      String(newState)
                    );
                    window.dispatchEvent(new Event('storage'));
                  }}
                />
              </div>

              <div className="flex items-start justify-between gap-3 px-3 py-2.5">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-bg-item-surface rounded-md border border-border-subtle flex items-center justify-center text-text-tertiary shrink-0">
                    <BadgeCheck size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-text-primary">
                      Version
                    </h3>
                    <p className="text-xs text-text-secondary mt-0.5">
                      You are currently using Cheatly version{' '}
                      {packageJson.version}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Card
            id="opacity-slider-card"
            style={
              isPreviewingOpacity
                ? { visibility: 'visible', position: 'relative', zIndex: 9999 }
                : {}
            }
            className={`p-4 rounded-lg mt-3 ${isLight ? '' : 'bg-bg-item-surface'}`}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-2 text-[11px] font-medium text-text-secondary uppercase tracking-wide">
                <Eye size={12} className="text-text-secondary" />
                Interface Opacity
              </label>
              {/* Read the preview value so React does not repaint stale committed opacity during drag. */}
              <span className="opacity-percent-label text-[11px] font-semibold text-text-primary tabular-nums">
                {Math.round(previewOverlayOpacity * 100)}%
              </span>
            </div>

            <input
              type="range"
              min={OVERLAY_OPACITY_MIN}
              max={1.0}
              step={0.01}
              defaultValue={overlayOpacity}
              onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
              onPointerDown={startPreviewingOpacity}
              onPointerUp={stopPreviewingOpacity}
              onPointerCancel={stopPreviewingOpacity}
              onPointerLeave={stopPreviewingOpacity}
              className="w-full h-1.5 rounded-full appearance-none bg-bg-input accent-accent-primary"
              style={{ WebkitAppearance: 'none' } as React.CSSProperties}
            />

            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-text-tertiary">
                More Stealth
              </span>
              <span className="text-[10px] text-text-tertiary">
                Fully Visible
              </span>
            </div>

            <p className="text-[10px] text-text-tertiary mt-2">
              Controls the visibility of the in-meeting overlay.{' '}
              <span className="text-text-secondary">
                Hold the slider to preview.
              </span>
            </p>
          </Card>
        </div>
      </div>

      <Card className={`p-4 rounded-lg ${isLight ? '' : 'bg-bg-item-surface'}`}>
        <div className="flex flex-col gap-0.5 mb-2.5">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-text-primary">
              Process Disguise
            </h3>
          </div>
          <p className="text-xs text-text-secondary">
            Disguise Cheatly as another application to prevent detection during
            screen sharing.
            <span className="block mt-0.5 text-text-tertiary">
              Select a disguise to be automatically applied when Undetectable
              mode is on.
            </span>
          </p>
        </div>

        <div
          className={`grid grid-cols-2 gap-2 ${isUndetectable ? 'opacity-50 pointer-events-none' : ''}`}
        >
          {isUndetectable && (
            <p className="col-span-2 text-xs text-yellow-500/80 -mt-1 mb-1">
              ⚠️ Disable Undetectable mode first to change disguise.
            </p>
          )}
          {[
            { id: 'none', label: 'None (Default)', icon: <Layout size={13} /> },
            { id: 'terminal', label: 'Terminal', icon: <Terminal size={13} /> },
            {
              id: 'settings',
              label: 'System Settings',
              icon: <Settings size={13} />,
            },
            {
              id: 'activity',
              label: 'Activity Monitor',
              icon: <Activity size={13} />,
            },
          ].map((option) => (
            <Button
              variant="outline"
              key={option.id}
              disabled={isUndetectable}
              onClick={() => {
                if (isUndetectable) return;
                setDisguiseMode(
                  option.id as 'terminal' | 'settings' | 'activity' | 'none'
                );
                window.electronAPI.setDisguise(
                  option.id as 'terminal' | 'settings' | 'activity' | 'none'
                );
                analytics.trackModeSelected(`disguise_${option.id}`);
              }}
              className={`p-2.5 h-auto rounded-md border text-left flex items-center gap-2.5 transition-all ${
                disguiseMode === option.id
                  ? 'bg-accent-primary border-accent-primary text-white shadow-lg shadow-blue-500/20 hover:bg-accent-primary/90'
                  : 'bg-bg-input border-border-subtle text-text-secondary hover:text-text-primary hover:bg-bg-subtle-hover'
              } ${isUndetectable ? 'cursor-not-allowed' : ''}`}
            >
              <div
                className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                  disguiseMode === option.id
                    ? 'bg-white/20 text-white'
                    : 'bg-bg-item-surface text-text-secondary'
                }`}
              >
                {option.icon}
              </div>
              <span className="text-xs font-medium">{option.label}</span>
            </Button>
          ))}
        </div>
      </Card>
    </div>
  );
};
