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
import { hasSeenPermsToaster, markPermsToasterSeen } from './lib/firstRunFlags';
import { analytics } from './lib/analytics/analytics.service';
import { ErrorBoundary } from './components/ErrorBoundary';

const queryClient = new QueryClient();

const App: React.FC = () => {
  const [windowMode, setWindowMode] = useState(() => new URLSearchParams(window.location.search).get('window') || 'launcher');
  useEffect(() => {
    const changeMode = (event: Event) => {
      const mode = (event as CustomEvent<string>).detail;
      if (mode !== 'launcher' && mode !== 'overlay') return;
      history.replaceState(null, '', mode === 'launcher' ? '/' : '/?window=overlay');
      setWindowMode(mode);
    };
    window.addEventListener('cheatly-window-mode', changeMode);
    return () => window.removeEventListener('cheatly-window-mode', changeMode);
  }, []);
  const isSettingsWindow = windowMode === 'settings';
  const isLauncherWindow = windowMode === 'launcher';
  const isOverlayWindow = windowMode === 'overlay';
  const isModelSelectorWindow = windowMode === 'model-selector';

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

  const [isSettingsOpen, setIsSettingsOpen] = useState(new URLSearchParams(window.location.search).has('settingsTab'));
  const [settingsInitialTab, setSettingsInitialTab] =
    useState<string>(new URLSearchParams(window.location.search).get('settingsTab') || 'general');
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

    const removeOpenSettingsTab = window.desktopAPI.onOpenSettingsTab?.(
      (tab: string) => {
        openSettingsExclusive(tab);
      }
    );

    const removeMeetingsListener = window.desktopAPI.onMeetingsUpdated?.(() => {
      console.log(
        '[App.tsx] Meetings updated (processing finished), starting ad delay timer'
      );
    });

    return () => {
      if (removeMeetingsListener) removeMeetingsListener();
      if (removeOpenSettingsTab) removeOpenSettingsTab();
    };
  }, []);

  useEffect(() => {
    if (!isOverlayWindow) return;
    const removeOpacityListener = window.desktopAPI.onOverlayOpacityChanged?.(
      (opacity) => {
        setOverlayOpacity(opacity);
      }
    );
    return () => {
      if (removeOpacityListener) removeOpacityListener();
    };
  }, [isOverlayWindow]);

  const [startError, setStartError] = useState('');
  const handleStartMeeting = async () => {
    setStartError('');
    try {
      localStorage.setItem('cheatly_last_meeting_start', Date.now().toString());
      const inputDeviceId = localStorage.getItem('preferredInputDeviceId');
      const outputDeviceId = localStorage.getItem('preferredOutputDeviceId');

      const result = await window.desktopAPI.startMeeting({
        audio: { inputDeviceId, outputDeviceId },
      });
      if (result.success) {
        await window.desktopAPI.setWindowMode('overlay');
        analytics.trackMeetingStarted();
        return;
      }
      setStartError(result.error || 'Unable to start meeting');
    } catch (err) {
      setStartError(String(err));
    }
  };

  if (isSettingsWindow) {
    return (
      <ErrorBoundary context="SettingsPopup">
        <div className="h-full min-h-0 w-full">
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
        <div className="h-full min-h-0 w-full overflow-hidden">
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
                <AssistantOverlay overlayOpacity={overlayOpacity} />
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
                  {startError && <div role="alert" className="px-4 py-2 text-sm text-red-400">{startError}</div>}
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
