import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Check,
  Pencil,
  MessageSquare,
  RefreshCw,
  HelpCircle,
  Zap,
  SlidersHorizontal,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getOverlayAppearance } from '../../lib/overlayAppearance';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import icon from '../../components/icon.png';

export const MockupAssistantOverlay = ({ opacity }: { opacity: number }) => {
  const appearance = useMemo(() => getOverlayAppearance(opacity), [opacity]);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none bg-transparent">
      <div
        id="mockup-cheatly-interface"
        className="flex flex-col items-center pointer-events-none -mt-56"
      >
        <div className="flex justify-center mb-2 select-none z-50">
          <div
            className="flex items-center gap-2 rounded-full overlay-pill-surface backdrop-blur-md pl-1.5 pr-1.5 py-1.5"
            style={appearance.pillStyle}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden overlay-icon-surface"
              style={appearance.iconStyle}
            >
              <img
                src={icon}
                alt="Cheatly"
                className="w-[24px] h-[24px] object-contain opacity-95 scale-105"
                draggable="false"
              />
            </div>
            <div
              className="flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium border overlay-chip-surface overlay-text-interactive"
              style={appearance.chipStyle}
            >
              <ChevronUp className="w-3.5 h-3.5 opacity-70" />
              <span className="opacity-80 tracking-wide">Hide</span>
            </div>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center overlay-icon-surface overlay-text-primary"
              style={appearance.iconStyle}
            >
              <div className="w-3.5 h-3.5 rounded-[3px] bg-red-400 opacity-80" />
            </div>
          </div>
        </div>

        <div
          className="relative w-[600px] max-w-full overlay-shell-surface overlay-text-primary backdrop-blur-2xl border rounded-[24px] overflow-hidden flex flex-col pt-2 pb-3"
          style={appearance.shellStyle}
        >
          <div className="flex items-center gap-1.5 px-4 pt-1 pb-2">
            <span className="px-2.5 py-1 rounded-full border text-xxs font-medium uppercase tracking-wider bg-white/[0.08] border-white/[0.12] overlay-text-primary opacity-80">
              Assistant
            </span>
            <span className="px-2.5 py-1 rounded-full border text-xxs font-medium uppercase tracking-wider bg-white/[0.04] border-white/[0.08] overlay-text-primary opacity-40">
              Transcript
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
            <div className="flex justify-start">
              <div className="max-w-[85%] px-4 py-3 text-base leading-relaxed font-normal overlay-text-primary">
                <span className="font-semibold text-emerald-500 block mb-1">
                  Suggestion
                </span>
                A good approach would be to use a hash map to cache the
                intermediate results, which brings the time complexity down from
                O(n²) to O(n).
              </div>
            </div>
          </div>

          <div className="flex flex-nowrap justify-center items-center gap-1.5 px-4 pb-3 pt-3">
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border shrink-0 overlay-chip-surface overlay-text-interactive"
              style={appearance.chipStyle}
            >
              <Pencil className="w-3 h-3 opacity-70" /> What to answer?
            </div>
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border shrink-0 overlay-chip-surface overlay-text-interactive"
              style={appearance.chipStyle}
            >
              <MessageSquare className="w-3 h-3 opacity-70" /> Clarify
            </div>
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border shrink-0 overlay-chip-surface overlay-text-interactive"
              style={appearance.chipStyle}
            >
              <RefreshCw className="w-3 h-3 opacity-70" /> Recap
            </div>
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border shrink-0 overlay-chip-surface overlay-text-interactive"
              style={appearance.chipStyle}
            >
              <HelpCircle className="w-3 h-3 opacity-70" /> Follow Up Question
            </div>
            <div
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium min-w-[74px] shrink-0 border overlay-chip-surface overlay-text-interactive"
              style={appearance.chipStyle}
            >
              <Zap className="w-3 h-3 opacity-70" /> Answer
            </div>
          </div>

          <div className="px-3">
            <div className="relative group">
              <div
                className="w-full border rounded-xl pl-3 pr-10 py-2.5 h-[38px] flex items-center overlay-input-surface"
                style={appearance.inputStyle}
              >
                <span className="text-base overlay-text-muted">
                  Ask anything on screen or conversation
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between mt-3 px-0.5">
              <div className="flex items-center gap-1.5">
                <div
                  className="flex items-center gap-2 px-3 py-1.5 border rounded-lg text-xs font-medium w-[140px] overlay-control-surface overlay-text-interactive"
                  style={appearance.controlStyle}
                >
                  <span className="truncate min-w-0 flex-1">
                    Gemini 3 Flash
                  </span>
                  <ChevronDown size={14} className="shrink-0" />
                </div>
                <div
                  className="w-px h-3 mx-1"
                  style={appearance.dividerStyle}
                />
                <div
                  className="w-7 h-7 flex items-center justify-center rounded-lg overlay-icon-surface overlay-text-muted"
                  style={appearance.iconStyle}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface CustomSelectProps {
  label: string;
  icon: React.ReactNode;
  value: string;
  options: MediaDeviceInfo[];
  onChange: (value: string) => void;
  placeholder?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  label,
  icon,
  value,
  options,
  onChange,
  placeholder = 'Select device',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedLabel =
    options.find((o) => o.deviceId === value)?.label || placeholder;

  return (
    <Card className="rounded-xl p-4" ref={containerRef}>
      {label && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-text-secondary">{icon}</span>
          <label className="text-xs font-medium text-text-primary uppercase tracking-wide">
            {label}
          </label>
        </div>
      )}

      <div className="relative">
        <Button
          variant="ghost"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full bg-bg-input border border-border-subtle rounded-lg px-3 py-2.5 text-sm text-text-primary flex items-center justify-between hover:bg-bg-elevated transition-colors"
        >
          <span className="truncate pr-4">{selectedLabel}</span>
          <ChevronDown
            size={14}
            className={`text-text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </Button>

        {isOpen && (
          <div className="absolute top-full left-0 w-full mt-1 bg-bg-elevated border border-border-subtle rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto animated fadeIn">
            <div className="p-1 space-y-0.5">
              {options.map((device) => (
                <Button
                  variant="ghost"
                  key={device.deviceId}
                  onClick={() => {
                    onChange(device.deviceId);
                    setIsOpen(false);
                  }}
                  className={`w-full justify-start px-3 py-2 text-sm rounded-md flex items-center justify-between group transition-colors ${value === device.deviceId ? 'bg-bg-input hover:bg-bg-elevated text-text-primary' : 'text-text-secondary hover:bg-bg-input hover:text-text-primary'}`}
                >
                  <span className="truncate">
                    {device.label || `Device ${device.deviceId.slice(0, 5)}...`}
                  </span>
                  {value === device.deviceId && (
                    <Check size={14} className="text-accent-primary" />
                  )}
                </Button>
              ))}
              {options.length === 0 && (
                <div className="px-3 py-2 text-sm text-muted-foreground italic">
                  No devices found
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

interface ProviderOption {
  id: string;
  label: string;
  badge?: string | null;
  recommended?: boolean;
  desc: string;
  color: string;
  icon: React.ReactNode;
}

interface ProviderSelectProps {
  value: string;
  options: ProviderOption[];
  onChange: (value: string) => void;
}

export const ProviderSelect: React.FC<ProviderSelectProps> = ({
  value,
  options,
  onChange,
}) => {
  const isLight = false;
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selected = options.find((o) => o.id === value);

  const getBadgeStyle = (color?: string) => {
    switch (color) {
      case 'blue':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'orange':
        return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 'purple':
        return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      case 'teal':
        return 'bg-teal-500/10 text-teal-500 border-teal-500/20';
      case 'cyan':
        return 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20';
      case 'indigo':
        return 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20';
      case 'green':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getIconStyle = (color?: string, isSelectedItem: boolean = false) => {
    if (isSelectedItem) return 'bg-accent-primary text-white shadow-sm';
    switch (color) {
      case 'blue':
        return 'bg-blue-500/10 text-blue-600';
      case 'orange':
        return 'bg-orange-500/10 text-orange-600';
      case 'purple':
        return 'bg-purple-500/10 text-purple-600';
      case 'teal':
        return 'bg-teal-500/10 text-teal-600';
      case 'cyan':
        return 'bg-cyan-500/10 text-cyan-600';
      case 'indigo':
        return 'bg-indigo-500/10 text-indigo-600';
      case 'green':
        return 'bg-green-500/10 text-green-600';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div ref={containerRef} className="relative z-20 font-sans">
      <Button
        variant="ghost"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full group bg-bg-input border border-border-subtle hover:border-border-muted shadow-sm rounded-xl p-2.5 pr-3.5 flex items-center justify-between transition-all duration-200 outline-none focus:ring-2 focus:ring-accent-primary/20 ${isOpen ? 'ring-2 ring-accent-primary/20 border-accent-primary/50' : 'hover:shadow-md'}`}
      >
        {selected ? (
          <div className="flex items-center gap-3 overflow-hidden">
            <div
              className={`w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 transition-all duration-300 ${getIconStyle(selected.color)}`}
            >
              {selected.icon}
            </div>
            <div className="min-w-0 flex-1 text-left">
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-text-primary truncate leading-tight">
                  {selected.label}
                </span>
                {selected.badge && (
                  <span
                    className={`text-xxs px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide ml-2 ${getBadgeStyle(selected.badge === 'Saved' ? 'green' : selected.color)}`}
                  >
                    {selected.badge}
                  </span>
                )}
                {selected.recommended && (
                  <span
                    className={`text-xxs px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide ml-2 ${getBadgeStyle(selected.color)}`}
                  >
                    Recommended
                  </span>
                )}
              </div>
              <span className="text-sm text-text-tertiary truncate block leading-tight mt-0.5">
                {selected.desc}
              </span>
            </div>
          </div>
        ) : (
          <span className="text-text-secondary px-2 text-sm">
            Select Provider
          </span>
        )}
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-text-tertiary transition-transform duration-300 group-hover:bg-bg-input ${isOpen ? 'rotate-180 bg-bg-input text-text-primary' : ''}`}
        >
          <ChevronDown size={14} strokeWidth={2.5} />
        </div>
      </Button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={`absolute top-full left-0 w-full mt-2 backdrop-blur-xl rounded-xl shadow-2xl overflow-hidden ring-1 ring-black/5 ${isLight ? 'bg-bg-elevated border border-border-subtle' : 'bg-bg-elevated/90 border border-white/5'}`}
          >
            <div className="max-h-[320px] overflow-y-auto p-1.5 space-y-0.5 custom-scrollbar">
              {options.map((option) => {
                const isSelected = value === option.id;
                return (
                  <Button
                    variant="ghost"
                    key={option.id}
                    onClick={() => {
                      onChange(option.id);
                      setIsOpen(false);
                    }}
                    className={`w-full rounded-[10px] p-2 flex items-center gap-3 transition-all duration-200 group relative ${isSelected ? (isLight ? 'bg-bg-item-active shadow-inner' : 'bg-white/10 shadow-inner') : isLight ? 'hover:bg-bg-item-surface' : 'hover:bg-white/5'}`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-200 ${isSelected ? 'scale-100' : 'scale-95 group-hover:scale-100'} ${getIconStyle(option.color, false)}`}
                    >
                      {option.icon}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-base font-medium transition-colors ${isSelected && !isLight ? 'text-white' : 'text-text-primary'}`}
                          >
                            {option.label}
                          </span>
                          {option.badge && (
                            <span
                              className={`text-xxs px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide ${getBadgeStyle(option.badge === 'Saved' ? 'green' : option.color)}`}
                            >
                              {option.badge}
                            </span>
                          )}
                          {option.recommended && (
                            <span
                              className={`text-xxs px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide ${getBadgeStyle(option.color)}`}
                            >
                              Recommended
                            </span>
                          )}
                        </div>
                        {isSelected && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                          >
                            <Check
                              size={14}
                              className="text-accent-primary"
                              strokeWidth={3}
                            />
                          </motion.div>
                        )}
                      </div>
                      <span
                        className={`text-sm block truncate transition-colors ${isSelected && !isLight ? 'text-white/70' : 'text-text-tertiary'}`}
                      >
                        {option.desc}
                      </span>
                    </div>
                    {!isSelected && (
                      <div className="absolute inset-0 rounded-[10px] ring-1 ring-inset ring-transparent group-hover:ring-border-subtle pointer-events-none" />
                    )}
                  </Button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
