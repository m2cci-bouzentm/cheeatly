import React from 'react';
import {
  Mic,
  Speaker,
  Globe,
  MapPin,
  Info,
  AlertCircle,
  FlaskConical,
  Cpu,
} from 'lucide-react';
import { isMac } from '../../../utils/platformUtils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { CustomSelect, ProviderSelect } from '../SettingsLayout';

import { useSettingsOverlayContext } from '../SettingsContext';

export const AudioTab: React.FC = () => {
  const {
    sttProvider,
    handleSttProviderChange,
    selectedSttGroup,
    languageGroups,
    handleGroupChange,
    currentGroupVariants,
    recognitionLanguage,
    handleLanguageChange,
    availableLanguages,
    autoDetectedLanguage,
    deviceFallbackNotice,
    setDeviceFallbackNotice,
    selectedInput,
    setSelectedInput,
    inputDevices,
    micLevel,
    selectedOutput,
    setSelectedOutput,
    outputDevices,
    useExperimentalSck,
    setUseExperimentalSck,
  } = useSettingsOverlayContext();

  return (
    <div className="space-y-5 animated fadeIn">
      <div>
        <h3 className="text-base font-bold text-text-primary mb-0.5">
          Speech Provider
        </h3>
        <p className="text-xs text-text-secondary mb-4">
          Choose the engine that transcribes audio to text.
        </p>

        <div className="space-y-3">
          <Card className="rounded-lg p-3 space-y-2.5">
            <label className="text-[11px] font-medium text-text-secondary block">
              Speech Provider
            </label>
            <div className="relative">
              <ProviderSelect
                value={sttProvider}
                onChange={(val) => handleSttProviderChange(val as any)}
                options={[
                  {
                    id: 'local-parakeet',
                    label: 'Local Parakeet',
                    badge: null,
                    recommended: true,
                    desc: 'Privacy-first: NVIDIA Parakeet on Apple Neural Engine',
                    color: 'green',
                    icon: <Cpu size={14} />,
                  },
                  {
                    id: 'none',
                    label: 'Disabled',
                    badge: null,
                    desc: 'Audio is captured but not transcribed',
                    color: 'gray',
                    icon: <Mic size={14} />,
                  },
                ]}
              />
            </div>
          </Card>

          {sttProvider === 'local-parakeet' && (
            <Card className="rounded-lg p-3 space-y-1.5">
              <p className="text-[11px] font-medium text-text-secondary">
                Parakeet STT
              </p>
              <p className="text-sm text-text-tertiary">
                NVIDIA Parakeet runs locally on Apple Neural Engine via
                FluidAudio. Model downloads automatically on first use (~494
                MB). Supports 26 European languages.
              </p>
              <p className="text-[11px] text-text-tertiary">
                Requires macOS 14+ on Apple Silicon.
              </p>
            </Card>
          )}

          <CustomSelect
            label="Language"
            icon={<Globe size={13} />}
            value={selectedSttGroup}
            options={languageGroups.map((g: any) => ({
              deviceId: g,
              label: g,
              kind: 'audioinput' as MediaDeviceKind,
              groupId: '',
              toJSON: () => ({}),
            }))}
            onChange={handleGroupChange}
            placeholder="Select Language"
          />

          {currentGroupVariants.length > 1 && (
            <div className="mt-2.5 animated fadeIn">
              <CustomSelect
                label="Accent / Region"
                icon={<MapPin size={13} />}
                value={recognitionLanguage}
                options={currentGroupVariants}
                onChange={handleLanguageChange}
                placeholder="Select Region"
              />
            </div>
          )}

          <div className="flex gap-2 items-center mt-1.5 px-0.5">
            <Info size={13} className="text-text-secondary shrink-0" />
            <p className="text-[11px] text-text-secondary">
              {recognitionLanguage === 'auto'
                ? autoDetectedLanguage
                  ? (() => {
                      const label = (
                        Object.values(availableLanguages) as any[]
                      ).find(
                        (l: any) =>
                          l.bcp47 === autoDetectedLanguage ||
                          l.iso639 === autoDetectedLanguage
                      )?.label as string | undefined;
                      return `Auto mode — detected: ${label ?? autoDetectedLanguage}`;
                    })()
                  : 'Auto mode — language will be detected from the first few seconds of audio.'
                : 'Select the primary language being spoken in the meeting.'}
            </p>
          </div>
        </div>
      </div>

      <div className="h-px bg-border-subtle" />

      <div>
        <h3 className="text-base font-bold text-text-primary mb-0.5">
          Audio Configuration
        </h3>
        <p className="text-xs text-text-secondary mb-4">
          Manage input and output devices.
        </p>

        {/* Device-fallback banner: shown when main process couldn't
                    open the selected device and silently used the default. */}
        {deviceFallbackNotice && (
          <div className="mb-3.5 flex items-start gap-2.5 px-2.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertCircle size={13} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-amber-200/90 leading-snug">
                Selected{' '}
                {deviceFallbackNotice.kind === 'input'
                  ? 'microphone'
                  : 'output device'}
                {deviceFallbackNotice.requested
                  ? ` "${deviceFallbackNotice.requested}"`
                  : ''}{' '}
                couldn't be opened — using{' '}
                <span className="font-medium">
                  {deviceFallbackNotice.actual ?? 'no device'}
                </span>{' '}
                instead.
              </p>
              {deviceFallbackNotice.reason && (
                <p className="text-xs text-amber-200/60 mt-1 font-mono break-all">
                  {deviceFallbackNotice.reason}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                // Clear stale localStorage so the next meeting starts clean.
                if (deviceFallbackNotice.kind === 'input') {
                  localStorage.removeItem('preferredInputDeviceId');
                  setSelectedInput('default');
                  setDeviceFallbackNotice(null);
                  return;
                }
                localStorage.removeItem('preferredOutputDeviceId');
                setSelectedOutput('default');
                setDeviceFallbackNotice(null);
              }}
              className="shrink-0 text-[11px] font-medium text-amber-400 hover:text-amber-300 px-1.5 py-0.5 h-auto rounded-md bg-amber-500/15 hover:bg-amber-500/25"
            >
              Reset
            </Button>
          </div>
        )}

        <div className="space-y-3">
          <CustomSelect
            label="Input Device"
            icon={<Mic size={14} />}
            value={selectedInput}
            options={inputDevices}
            onChange={(id) => {
              setSelectedInput(id);
              localStorage.setItem('preferredInputDeviceId', id);
            }}
            placeholder="Default Microphone"
          />

          <div>
            <div className="flex justify-between text-[11px] text-text-secondary mb-1.5 px-0.5">
              <span>Input Level</span>
            </div>
            <div className="h-1.5 bg-bg-input rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-100 ease-out"
                style={{ width: `${micLevel}%` }}
              />
            </div>
          </div>

          <div className="h-px bg-border-subtle my-1.5" />

          <CustomSelect
            label="Output Device"
            icon={<Speaker size={14} />}
            value={selectedOutput}
            options={outputDevices}
            onChange={(id) => {
              setSelectedOutput(id);
              localStorage.setItem('preferredOutputDeviceId', id);
            }}
            placeholder="Default Speakers"
          />

          <div className="flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                try {
                  const AudioContext =
                    window.AudioContext || (window as any).webkitAudioContext;
                  if (!AudioContext) {
                    console.error('Web Audio API not supported');
                    return;
                  }

                  const ctx = new AudioContext();

                  if (ctx.state === 'suspended') {
                    await ctx.resume();
                  }

                  const oscillator = ctx.createOscillator();
                  const gainNode = ctx.createGain();

                  oscillator.connect(gainNode);
                  gainNode.connect(ctx.destination);

                  oscillator.type = 'sine';
                  oscillator.frequency.setValueAtTime(523.25, ctx.currentTime);
                  gainNode.gain.setValueAtTime(0.5, ctx.currentTime);
                  gainNode.gain.exponentialRampToValueAtTime(
                    0.01,
                    ctx.currentTime + 1.0
                  );

                  if (selectedOutput && (ctx as any).setSinkId) {
                    try {
                      await (ctx as any).setSinkId(selectedOutput);
                    } catch (e) {
                      console.warn('Error setting sink for AudioContext', e);
                    }
                  }

                  oscillator.start();
                  oscillator.stop(ctx.currentTime + 1.0);
                } catch (e) {
                  console.error('Error playing test sound', e);
                }
              }}
              className="text-[11px] bg-bg-input hover:bg-bg-elevated text-text-primary px-2.5 py-1 rounded-md h-auto"
            >
              <Speaker size={11} /> Test Sound
            </Button>
          </div>

          {/* SCK Backend Toggle — macOS only. The ScreenCaptureKit
                        backend is a CoreAudio alternative implemented in the
                        Rust speaker module under #[cfg(target_os="macos")];
                        Windows audio runs via WASAPI loopback so the toggle
                        has no meaning there and routing "sck" as a device id
                        silently breaks system audio. */}
          {isMac && (
            <>
              <div className="h-px bg-border-subtle my-1.5" />
              <div className="bg-amber-500/5 rounded-lg border border-amber-500/20 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 p-1 rounded-md bg-amber-500/10 text-amber-500">
                      <FlaskConical size={16} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-sm font-bold text-text-primary">
                          SCK Backend
                        </h3>
                        <span className="px-1 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-400 uppercase tracking-wide">
                          Alternative
                        </span>
                      </div>
                      <p className="text-[11px] text-text-secondary leading-relaxed max-w-[280px]">
                        Use the ScreenCaptureKit backend. An optimized
                        alternative to CoreAudio if you experience any capture
                        issues.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={useExperimentalSck}
                    onCheckedChange={(newState) => {
                      setUseExperimentalSck(newState);
                      window.localStorage.setItem(
                        'useExperimentalSckBackend',
                        newState ? 'true' : 'false'
                      );
                    }}
                    className="shrink-0 data-[state=checked]:bg-amber-500"
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
