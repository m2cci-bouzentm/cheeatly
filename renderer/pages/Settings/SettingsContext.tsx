import React, { useState, useEffect } from 'react';
import { useShortcuts } from '../../hooks/useShortcuts';
import { useOverlayOpacitySettings } from './useOverlayOpacitySettings';
import { useLanguageSettings } from './useLanguageSettings';
import { useAudioSettings } from './useAudioSettings';

const SettingsOverlayContext = React.createContext<any>(null);

export const useSettingsOverlayContext = () =>
  React.useContext(SettingsOverlayContext);

interface SettingsOverlayStateProviderProps {
  isOpen: boolean;
  initialTab: string;
  children: React.ReactNode;
}

export const SettingsOverlayStateProvider: React.FC<
  SettingsOverlayStateProviderProps
> = ({ isOpen, initialTab, children }) => {
  const isLight = false;
  const [activeTab, setActiveTab] = useState(initialTab);

  const languageSettings = useLanguageSettings();

  // Sync active tab when modal opens
  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const { shortcuts, updateShortcut, resetShortcuts } = useShortcuts();
  const [isUndetectable, setIsUndetectable] = useState(false);
  const [disguiseMode, setDisguiseMode] = useState<
    'terminal' | 'settings' | 'activity' | 'none'
  >('none');
  const [openOnLogin, setOpenOnLogin] = useState(false);
  const [verboseLogging, setVerboseLogging] = useState(false);
  const [showVerboseToast, setShowVerboseToast] = useState(false);
  const verboseToastTimerRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Fetch true initial state from main process
      window.electronAPI.getUndetectable()
        .then(setIsUndetectable)
        .catch(() => {});
      window.electronAPI.getDisguise()
        .then(setDisguiseMode)
        .catch(() => {});
      window.electronAPI.getVerboseLogging()
        .then(setVerboseLogging)
        .catch(() => {});
    }
  }, [isOpen]);

  useEffect(() => {
    if (!showVerboseToast) return;
    verboseToastTimerRef.current = setTimeout(
      () => setShowVerboseToast(false),
      5200
    );
    return () => {
      if (verboseToastTimerRef.current)
        clearTimeout(verboseToastTimerRef.current);
    };
  }, [showVerboseToast]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onUndetectableChanged(
      (newState: boolean) => {
        setIsUndetectable(newState);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onDisguiseChanged((newMode: any) => {
      setDisguiseMode(newMode);
    });
    return () => unsubscribe();
  }, []);

  const [showTranscript, setShowTranscript] = useState(() => {
    const stored = localStorage.getItem('cheatly_interviewer_transcript');
    return stored !== 'false';
  });

  const overlaySettings = useOverlayOpacitySettings(isOpen);

  // Sync transcript setting
  useEffect(() => {
    const handleStorage = () => {
      const stored = localStorage.getItem('cheatly_interviewer_transcript');
      setShowTranscript(stored !== 'false');
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const audioSettings = useAudioSettings(isOpen, activeTab, {
    setIsUndetectable,
    setOpenOnLogin,
  });

  const value = {
    isOpen,
    isLight,
    activeTab,
    setActiveTab,
    shortcuts,
    updateShortcut,
    resetShortcuts,
    isUndetectable,
    setIsUndetectable,
    disguiseMode,
    setDisguiseMode,
    openOnLogin,
    setOpenOnLogin,
    verboseLogging,
    setVerboseLogging,
    showVerboseToast,
    setShowVerboseToast,
    verboseToastTimerRef,
    showTranscript,
    setShowTranscript,
    ...languageSettings,
    ...overlaySettings,
    ...audioSettings,
  };

  return (
    <SettingsOverlayContext.Provider value={value}>
      {children}
    </SettingsOverlayContext.Provider>
  );
};
