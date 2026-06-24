import React, { useState, useEffect, useCallback } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider, ToastViewport } from './components/ui/toast';
import AssistantOverlay from './pages/AssistantOverlay';
import SettingsPopup from './pages/SettingsPopup';
import Launcher from './pages/Launcher';
import ModelSelectorWindow from './pages/ModelSelector';
import SettingsPage from './pages/Settings';
import { motion } from 'framer-motion';
import { PermissionsToaster } from './components/onboarding/PermissionsToaster';
import {
  clampOverlayOpacity,
  OVERLAY_OPACITY_DEFAULT,
  getDefaultOverlayOpacity,
} from './lib/overlayAppearance';
import { isMac } from './utils/platformUtils';
import { hasSeenPermsToaster, markPermsToasterSeen } from './lib/firstRunFlags';
import { analytics } from './lib/analytics/analytics.service';
import { ErrorBoundary } from './components/ErrorBoundary';

const queryClient = new QueryClient();

const App: React.FC = () => {
  const isSettingsWindow =
    new URLSearchParams(window.location.search).get('window') === 'settings';
  const isLauncherWindow =
    new URLSearchParams(window.location.search).get('window') === 'launcher';
  const isOverlayWindow =
    new URLSearchParams(window.location.search).get('window') === 'overlay';
  const isModelSelectorWindow =
    new URLSearchParams(window.location.search).get('window') ===
    'model-selector';

  const isDefault =
    !isSettingsWindow && !isOverlayWindow && !isModelSelectorWindow;

  useEffect(() => {
    analytics.initAnalytics();

    if (isLauncherWindow || isDefault) {
      analytics.trackAppOpen();
    }

    if (isOverlayWindow) {
      analytics.trackAssistantStart();
    }

    const handleUnload = () => {
      if (isOverlayWindow) {
        analytics.trackAssistantStop();
      }
      if (isLauncherWindow || isDefault) {
        analytics.trackAppClose();
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [isLauncherWindow, isOverlayWindow, isDefault]);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] =
    useState<string>('general');
  const openSettingsExclusive = useCallback((tab: string = 'general') => {
    setSettingsInitialTab(tab);
    setIsSettingsOpen(true);
  }, []);
  const [overlayOpacity, setOverlayOpacity] = useState<number>(() => {
    const stored = localStorage.getItem('cheatly_overlay_opacity');
    const parsed = stored ? parseFloat(stored) : NaN;
    const isUserSet =
      Number.isFinite(parsed) && parsed !== OVERLAY_OPACITY_DEFAULT;
    return isUserSet ? clampOverlayOpacity(parsed) : getDefaultOverlayOpacity();
  });

  const [showPermissionsToaster, setShowPermissionsToaster] = useState(false);

  useEffect(() => {
    localStorage.removeItem('useLegacyAudioBackend');

    if ((isLauncherWindow || isDefault) && !hasSeenPermsToaster()) {
      setShowPermissionsToaster(true);
    }

    const removeOpenSettingsTab = window.electronAPI.onOpenSettingsTab?.(
      (tab: string) => {
        openSettingsExclusive(tab);
      }
    );

    const removeMeetingsListener = window.electronAPI.onMeetingsUpdated?.(
      () => {
        console.log(
          '[App.tsx] Meetings updated (processing finished), starting ad delay timer'
        );
      }
    );

    return () => {
      if (removeMeetingsListener) removeMeetingsListener();
      if (removeOpenSettingsTab) removeOpenSettingsTab();
    };
  }, []);

  useEffect(() => {
    if (!isOverlayWindow) return;
    const removeOpacityListener = window.electronAPI.onOverlayOpacityChanged?.(
      (opacity) => {
        setOverlayOpacity(opacity);
      }
    );
    return () => {
      if (removeOpacityListener) removeOpacityListener();
    };
  }, [isOverlayWindow]);

  const handleStartMeeting = async () => {
    try {
      localStorage.setItem(
        'cheatly_last_meeting_start',
        Date.now().toString()
      );
      const inputDeviceId = localStorage.getItem('preferredInputDeviceId');
      let outputDeviceId = localStorage.getItem('preferredOutputDeviceId');
      // Restored/cross-OS localStorage can carry the macOS-only SCK backend onto Windows.
      const useExperimentalSck =
        isMac && localStorage.getItem('useExperimentalSckBackend') === 'true';

      if (useExperimentalSck) {
        console.log('[App] Using ScreenCaptureKit backend (Experimental).');
        outputDeviceId = 'sck';
      }
      if (!useExperimentalSck && isMac) {
        console.log('[App] Using CoreAudio backend (Default).');
      }

      const result = await window.electronAPI.startMeeting({
        audio: { inputDeviceId, outputDeviceId },
      });
      if (result.success) {
        analytics.trackMeetingStarted();
        return;
      }
      console.error('Failed to start meeting:', result.error);
    } catch (err) {
      console.error('Failed to start meeting:', err);
    }
  };

  if (isSettingsWindow) {
    return (
      <ErrorBoundary context="SettingsPopup">
        <div
          className="h-full min-h-0 w-full"
        >
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              <SettingsPopup />
              <ToastViewport />
            </ToastProvider>
          </QueryClientProvider>
        </div>
      </ErrorBoundary>
    );
  }

  if (isModelSelectorWindow) {
    return (
      <ErrorBoundary context="ModelSelector">
        <div
          className="h-full min-h-0 w-full overflow-hidden"
        >
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              <ModelSelectorWindow />
              <ToastViewport />
            </ToastProvider>
          </QueryClientProvider>
        </div>
      </ErrorBoundary>
    );
  }

  if (isOverlayWindow) {
    return (
      <ErrorBoundary context="Overlay">
        <div className="w-full h-full relative overflow-hidden bg-transparent">
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              <div
                style={
                  {
                    ['--overlay-opacity' as '--overlay-opacity']:
                      String(overlayOpacity),
                    transition:
                      'background-color 75ms ease, border-color 75ms ease, box-shadow 75ms ease',
                  } as React.CSSProperties
                }
              >
                <AssistantOverlay
                  overlayOpacity={overlayOpacity}
                />
              </div>
              <ToastViewport />
            </ToastProvider>
          </QueryClientProvider>
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary context="Launcher">
      <div className="h-full min-h-0 w-full relative bg-bg-primary">
        <motion.div
          key="main"
          className="h-full w-full"
          initial={{ opacity: 0, scale: 0.98, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{
            duration: 0.8,
            ease: [0.19, 1, 0.22, 1],
            delay: 0.1,
          }}
        >
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              {isSettingsOpen ? (
                <SettingsPage
                  onClose={() => setIsSettingsOpen(false)}
                  initialTab={settingsInitialTab}
                />
              ) : (
                <div id="launcher-container" className="h-full w-full relative">
                  <Launcher
                    onStartMeeting={handleStartMeeting}
                    onOpenSettings={(tab = 'general') =>
                      openSettingsExclusive(tab)
                    }
                  />
                </div>
              )}
              <ToastViewport />
            </ToastProvider>
          </QueryClientProvider>
        </motion.div>

        <PermissionsToaster
          isOpen={showPermissionsToaster}
          onDismiss={() => {
            markPermsToasterSeen();
            setShowPermissionsToaster(false);
          }}
        />
      </div>
    </ErrorBoundary>
  );
};

export default App;
