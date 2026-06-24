import './bootstrap/processGuards';
import { app, BrowserWindow } from 'electron';
import { ensureCoreStarted, shutdownCore } from './services/core';
import { WindowService } from './services/window/WindowService';
import { SettingsWindowService } from './services/window/SettingsWindowService';
import { ModelSelectorWindowService } from './services/window/ModelSelectorWindowService';
import { KeybindService } from './services/keybind/KeybindService';
import { SettingsService } from './services/SettingsService';
import { AudioService } from './services/audio/AudioService';
import { CredentialService } from './services/CredentialService';
import { MeetingService } from './services/meeting/MeetingService';
import { StealthService } from './services/stealth/StealthService';
import { TrayService } from './services/TrayService';
import { SurfaceMessenger } from './services/window/SurfaceMessenger';
import { ShortcutRouter } from './services/keybind/ShortcutRouter';
import { ScreenshotService } from './services/ScreenshotService';
import { bootstrapApp } from './bootstrap/appLifecycle';

if (!app.isPackaged) {
  require('dotenv').config();
}

interface MeetingState {
  readonly isMeetingActive: boolean;
  readonly meetingGeneration: number;
  readonly isDraining: boolean;
  readonly micMuted: boolean;
  readonly systemMuted: boolean;
  readonly isQuitting: boolean;
}

export class AppState {
  private static instance: AppState | null = null;
  private windowHelper: WindowService;
  public settingsWindowHelper: SettingsWindowService;
  public modelSelectorWindowHelper: ModelSelectorWindowService;
  private audioService!: AudioService;
  private meetingService!: MeetingService;
  private stealthService!: StealthService;
  private trayService!: TrayService;
  private messenger!: SurfaceMessenger;
  private _isQuitting: boolean = false;
  private screenshots = new ScreenshotService();
  constructor() {
    const settingsManager = SettingsService.getInstance();
    this.windowHelper = new WindowService(this);
    this.settingsWindowHelper = new SettingsWindowService();
    this.modelSelectorWindowHelper = new ModelSelectorWindowService();
    this.messenger = new SurfaceMessenger(
      this.windowHelper,
      this.settingsWindowHelper
    );
    this.trayService = new TrayService({
      centerAndShowWindow: () => this.centerAndShowWindow(),
      toggleMainWindow: () => this.toggleMainWindow(),
      takeScreenshot: () => this.takeScreenshot(),
      getImagePreview: (p) => this.getImagePreview(p),
      getActiveWindow: () => this.getActiveWindow(),
      getKeybind: (id) => KeybindService.getInstance().getKeybind(id),
    });
    this.stealthService = new StealthService(
      this.windowHelper,
      this.settingsWindowHelper,
      this.modelSelectorWindowHelper,
      this.trayService,
      settingsManager,
      (channel, ...args) => this.broadcast(channel, ...args)
    );
    this.stealthService.applyInitialContentProtection();
    // Audio is lazy because MeetingService and AudioService reference each other.
    this.meetingService = new MeetingService(
      () => this.audioService,
      this.windowHelper,
      (channel, ...args) => this.broadcast(channel, ...args),
      (channel, ...args) => this.sendToMeetingSurfaces(channel, ...args),
      (payload) => this.sendAudioCaptureFailed(payload),
      (message) => this.sendSystemAudioPermissionDenied(message)
    );
    const self = this;
    const audioMeetingState: MeetingState = {
      get isMeetingActive() {
        return self.meetingService.isMeetingActive;
      },
      get meetingGeneration() {
        return self.meetingService._meetingGeneration;
      },
      get isDraining() {
        return self.meetingService._isDraining;
      },
      get micMuted() {
        return self.audioService.micMuted;
      },
      get systemMuted() {
        return self.audioService.systemMuted;
      },
      get isQuitting() {
        return self._isQuitting;
      },
    };
    this.audioService = new AudioService(
      this.windowHelper,
      this.settingsWindowHelper,
      CredentialService.getInstance(),
      settingsManager,
      audioMeetingState,
      this.meetingService.transcriptHandler,
      (channel, ...args) => this.broadcast(channel, ...args),
      (channel, ...args) => this.sendToMeetingSurfaces(channel, ...args),
      (channel, ...args) => this.sendToSettingsSurfaces(channel, ...args),
      (payload) => this.sendAudioCaptureFailed(payload),
      (message) => this.sendSystemAudioPermissionDenied(message),
      (segment) => this.meetingService.applyTranscriptSegment(segment)
    );
    setImmediate(() => {
      try {
        const { CredentialService } = require('./services/CredentialService');
        if (
          CredentialService.getInstance().getSttProvider() === 'local-parakeet'
        ) {
          console.log(
            '[AppState] Local Parakeet STT selected — model loads on first session start'
          );
        }
      } catch (e) {
        console.warn('[AppState] Local Parakeet check skipped:', e);
      }
    });
    const keybindManager = KeybindService.getInstance();
    keybindManager.setShortcutTargetWindow(this.windowHelper);
    keybindManager.onUpdate(() => {
      this.updateTrayMenu();
    });
    const shortcutRouter = new ShortcutRouter({
      windowHelper: this.windowHelper,
      toggleMainWindow: () => this.toggleMainWindow(),
      showMainWindow: (inactive) => this.showMainWindow(inactive),
      takeScreenshot: (restoreFocus) => this.takeScreenshot(restoreFocus),
      getImagePreview: (p) => this.getImagePreview(p),
      getActiveWindow: () => this.getActiveWindow(),
      getUndetectable: () => this.stealthService.getUndetectable(),
      sendToMeetingSurfaces: (channel, payload) =>
        this.messenger.sendToMeetingSurfaces(channel, payload),
    });
    keybindManager.onShortcutTriggered((actionId) =>
      shortcutRouter.handle(actionId)
    );
    this.settingsWindowHelper.setWindowHelper(this.windowHelper);
    this.modelSelectorWindowHelper.setWindowHelper(this.windowHelper);
  }
  private sendToMeetingSurfaces(channel: string, ...args: any[]): void {
    this.messenger.sendToMeetingSurfaces(channel, ...args);
  }
  private sendToSettingsSurfaces(channel: string, ...args: any[]): void {
    this.messenger.sendToSettingsSurfaces(channel, ...args);
  }
  public sendAudioCaptureFailed(payload: any): void {
    this.sendToMeetingSurfaces('audio-capture-failed', payload);
  }
  public sendSystemAudioPermissionDenied(message: string): void {
    this.sendToMeetingSurfaces('system-audio-permission-denied', message);
  }
  public setMicMuted(muted: boolean): void {
    this.audioService.setMicMuted(muted);
  }
  public setSystemMuted(muted: boolean): void {
    this.audioService.setSystemMuted(muted);
  }
  public getTranscriptText(): string {
    return this.meetingService.getTranscriptText();
  }

  public setMeetingPersistenceHandler(
    fn: (transcript: string, aborted: boolean) => void
  ): void {
    this.meetingService.setMeetingPersistenceHandler(fn);
  }
  // Business logic runs in-process via main/core — no spawned server, no port, no HTTP.
  public startServer(): void {
    ensureCoreStarted();
  }
  public stopServer(): void {
    void shutdownCore();
  }
  public broadcast(channel: string, ...args: any[]): void {
    this.messenger.broadcast(channel, ...args);
  }
  public getIsMeetingActive(): boolean {
    return this.meetingService.isMeetingActive;
  }
  public isQuitting(): boolean {
    return this._isQuitting;
  }
  public setQuitting(value: boolean): void {
    this._isQuitting = value;
  }
  public setRecognitionLanguage(key: string): void {
    this.audioService.setRecognitionLanguage(key);
  }
  public static getInstance(): AppState {
    if (!AppState.instance) {
      AppState.instance = new AppState();
    }
    return AppState.instance;
  }
  public getActiveWindow(): BrowserWindow | null {
    return this.windowHelper.getActiveWindow();
  }
  public getWindowHelper(): WindowService {
    return this.windowHelper;
  }
  public isVisible(): boolean {
    return this.windowHelper.isVisible();
  }
  public getScreenshotQueue(): string[] {
    return this.screenshots.getQueue();
  }
  public createWindow(): void {
    this.windowHelper.createWindow();
  }
  public hideMainWindow(): void {
    this.windowHelper.hideMainWindow();
  }
  public showMainWindow(inactive?: boolean): void {
    this.windowHelper.showMainWindow(inactive);
  }
  public toggleMainWindow(): void {
    if (this.windowHelper.getCurrentWindowMode() === 'launcher') {
      this.windowHelper.toggleMainWindow();
      return;
    }
    const overlay = this.windowHelper.getOverlayWindow();
    if (!overlay || overlay.isDestroyed()) return;
    overlay.webContents.send('toggle-expand');
  }
  public setWindowDimensions(width: number, height: number): void {
    this.windowHelper.setWindowDimensions(width, height);
  }
  public clearQueues(): void {
    this.screenshots.clear();
  }
  public async takeScreenshot(restoreFocus: boolean = true): Promise<string> {
    return this.screenshots.take(restoreFocus);
  }
  public async getImagePreview(filepath: string): Promise<string> {
    return this.screenshots.getPreview(filepath);
  }
  public async deleteScreenshot(
    path: string
  ): Promise<{ success: boolean; error?: string }> {
    return this.screenshots.delete(path);
  }
  public moveWindowLeft(): void {
    this.windowHelper.moveWindowLeft();
  }
  public moveWindowRight(): void {
    this.windowHelper.moveWindowRight();
  }
  public moveWindowDown(): void {
    this.windowHelper.moveWindowDown();
  }
  public moveWindowUp(): void {
    this.windowHelper.moveWindowUp();
  }
  public centerAndShowWindow(): void {
    this.windowHelper.centerAndShowWindow();
  }
  public createTray(): void {
    this.showTray();
  }
  public showTray(): void {
    this.trayService.showTray();
  }
  public updateTrayMenu(): void {
    this.trayService.updateMenu();
  }
  public hideTray(): void {
    this.trayService.hideTray();
  }
  public async abortMeeting(): Promise<void> {
    return this.meetingService.abortMeeting();
  }
  public async startMeeting(metadata?: any): Promise<void> {
    return this.meetingService.startMeeting(metadata);
  }
  public async endMeeting(): Promise<void> {
    return this.meetingService.endMeeting();
  }
  public prewarmSttProviders(): void {
    return this.audioService.prewarmSttProviders();
  }
  public async restartCapturesAfterResume(): Promise<void> {
    return this.audioService.restartCapturesAfterResume();
  }
  public async reconfigureSttProvider(): Promise<void> {
    return this.audioService.reconfigureSttProvider();
  }
  public stopDefaultOutputWatcherForShutdown(): void {
    return this.audioService.stopDefaultOutputWatcherForShutdown();
  }
  public async startAudioTest(deviceId?: string): Promise<void> {
    return this.audioService.startAudioTest(deviceId);
  }
  public stopAudioTest(): void {
    return this.audioService.stopAudioTest();
  }
  public setUndetectable(state: boolean): void {
    return this.stealthService.setUndetectable(state);
  }
  public getUndetectable(): boolean {
    return this.stealthService.getUndetectable();
  }
  public applyInitialUndetectableState(): void {
    return this.stealthService.applyInitialUndetectableState();
  }
  public getVerboseLogging(): boolean {
    return SettingsService.getInstance().getVerboseLogging();
  }
  public setVerboseLogging(enabled: boolean): void {
    SettingsService.getInstance().setVerboseLogging(enabled);
    this.broadcast('verbose-logging-changed', enabled);
  }
  public setDisguise(
    mode: 'terminal' | 'settings' | 'activity' | 'none'
  ): void {
    return this.stealthService.setDisguise(mode);
  }
  public applyInitialDisguise(): void {
    return this.stealthService.applyInitialDisguise();
  }
  public getDisguise(): string {
    return this.stealthService.getDisguise();
  }
}
async function initializeApp() {
  await bootstrapApp(AppState);
}

initializeApp().catch(console.error);