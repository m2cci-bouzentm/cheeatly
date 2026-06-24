import { app, desktopCapturer, powerMonitor, systemPreferences } from 'electron';
import { CredentialService } from '../services/CredentialService';
import { KeybindService } from '../services/keybind/KeybindService';
import { SettingsService } from '../services/SettingsService';
import { StealthKeyboardService } from '../services/stealth/StealthKeyboardService';
import { ensureCoreStarted } from '../services/core';
import { registerAudioHandlers } from '../ipc/audioHandlers';
import { registerChatAndContextHandlers } from '../ipc/chatAndContextHandlers';
import { registerMeetingHandlers } from '../ipc/meetingHandlers';
import { registerProviderHandlers } from '../ipc/providerHandlers';
import { registerSettingsHandlers } from '../ipc/settingsHandlers';
import { registerKeybindHandlers } from '../ipc/keybindHandlers';
import { registerStealthTapHandlers } from '../ipc/stealthTapHandlers';
import { registerWindowHandlers } from '../ipc/windowHandlers';
import { registerSkillHandlers } from '../ipc/skillHandlers';
import {
  formatPermissionMessage,
  isDevTccBypassEnabled,
  resolveMacScreenCaptureCapability,
} from '../utils/permissions';

import type { AppState } from '../main';

export async function bootstrapApp(AppState: any): Promise<void> {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    console.log('[Main] Another instance is already running. Exiting this instance.');
    app.exit(0);
    return;
  }

  app.on('second-instance', () => {
    try {
      AppState.getInstance().centerAndShowWindow();
    } catch (err) {
      console.error('[Main] second-instance handler failed:', err);
    }
  });

  await app.whenReady();

  if (process.platform === 'darwin' && (SettingsService.getInstance().get('isUndetectable') ?? false)) {
    app.dock.hide();
  }

  CredentialService.getInstance().init();
  const settings = SettingsService.getInstance();
  const { setVerboseLoggingFlag } = require('../utils/logger');
  setVerboseLoggingFlag(settings.getVerboseLogging());
  const appState = AppState.getInstance();

  // IPC registration — core runs in-process
  const core = ensureCoreStarted();
  registerAudioHandlers(appState);
  registerChatAndContextHandlers({
    core,
    resolveLlmCredentials: () => CredentialService.getInstance().resolveLlmCredentials(),
    getFallbackTranscript: () => appState.getTranscriptText(),
  });
  registerWindowHandlers(appState);
  registerSettingsHandlers(appState);
  registerProviderHandlers(appState);
  registerKeybindHandlers();
  registerStealthTapHandlers();
  registerSkillHandlers();
  registerMeetingHandlers(appState, {
    core,
    resolveLlmCredentials: () => CredentialService.getInstance().resolveLlmCredentials(),
  });

  appState.applyInitialDisguise();
  console.log('App is ready');
  appState.startServer();

  try { appState.prewarmSttProviders(); }
  catch (err) { console.warn('[Init] STT pre-warm threw (non-fatal):', err); }

  appState.createWindow();

  if (!appState.getUndetectable()) appState.showTray();
  if (appState.getUndetectable()) appState.applyInitialUndetectableState();

  KeybindService.getInstance().registerGlobalShortcuts();

  powerMonitor.on('resume', () => {
    console.log('[Main] powerMonitor: system resumed from sleep.');
    appState.restartCapturesAfterResume()
      .catch((err: unknown) => console.error('[Main] restartCapturesAfterResume threw:', err));
  });
  powerMonitor.on('suspend', () => {
    console.log('[Main] powerMonitor: system suspending.');
  });

  appState.settingsWindowHelper.preloadWindow();
  appState.modelSelectorWindowHelper.preloadWindow();

  if (process.platform === 'darwin') {
    setTimeout(() => checkMacPermissions(appState), 800);
  }

  app.on('activate', () => {
    console.log('App activated');
    if (process.platform === 'darwin' && !appState.getUndetectable() && !appState.getIsMeetingActive()) {
      app.dock.show();
    }
    if (appState.getActiveWindow() === null) { appState.createWindow(); return; }
    if (!appState.isVisible()) appState.toggleMainWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    console.log('App is quitting, cleaning up resources...');
    appState.stopServer();
    appState.setQuitting(true);
    try { appState.stopDefaultOutputWatcherForShutdown?.(); }
    catch (e) { console.error('[main] Failed to stop DefaultOutputWatcher:', e); }
    if (process.platform === 'darwin') {
      try { StealthKeyboardService.getInstance().stop(); }
      catch (e) { console.error('[main] Failed to stop StealthKeyboardService:', e); }
    }
    appState.clearQueues();
  });

  app.commandLine.appendSwitch('disable-background-timer-throttling');
}

async function checkMacPermissions(appState: AppState): Promise<void> {
  try {
    const screenStatus = systemPreferences.getMediaAccessStatus('screen');
    console.log(`[Init] Screen recording permission status at startup: ${screenStatus}`);

    if (isDevTccBypassEnabled()) {
      console.log('[Init] Dev TCC bypass enabled — skipping startup screen-recording check');
      return;
    }

    if (screenStatus === 'not-determined') {
      console.log('[Init] Screen recording not-determined — showing one-time TCC dialog...');
      try {
        await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } });
      } catch (e) {
        console.log('[Init] getSources threw (expected during TCC pending state):', (e as Error).message);
      }
    }

    if (screenStatus === 'denied') {
      const cap = await resolveMacScreenCaptureCapability('startup permission check');
      if (cap?.effectiveDenied) {
        console.warn('[Init] Screen recording was previously denied — notifying UI banner.');
        appState.sendSystemAudioPermissionDenied(cap.message ?? formatPermissionMessage('screen-recording-denied'));
      }
    } else if (screenStatus !== 'not-determined') {
      console.log(`[Init] Screen recording permission already resolved: ${screenStatus}`);
    }

    const micStatus = systemPreferences.getMediaAccessStatus('microphone');
    console.log(`[Init] Microphone permission status at startup: ${micStatus}`);

    if (micStatus === 'denied') {
      console.warn('[Init] Microphone was previously denied — notifying UI banner.');
      appState.sendAudioCaptureFailed({
        channel: 'mic',
        message: formatPermissionMessage('mic-denied'),
        attempt: 0, maxAttempts: 0, terminal: true, stuck: false,
      });
      return;
    }

    if (micStatus === 'restricted') {
      console.warn('[Init] Microphone is restricted by device policy at startup.');
      appState.sendAudioCaptureFailed({
        channel: 'mic',
        message: 'Microphone is restricted by device policy. Contact your administrator to enable microphone access for Cheatly.',
        attempt: 0, maxAttempts: 0, terminal: true, stuck: false,
      });
    }
  } catch (e) {
    console.warn('[Init] Startup permission check failed:', e);
  }
}
