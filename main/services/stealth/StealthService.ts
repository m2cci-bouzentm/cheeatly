import { app, BrowserWindow, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import { WindowService } from '../window/WindowService';
import { SettingsWindowService } from '../window/SettingsWindowService';
import { ModelSelectorWindowService } from '../window/ModelSelectorWindowService';
import { SettingsService } from '../SettingsService';
import type { TrayControl } from '../TrayService';
function decideToggle(current: boolean, requested: boolean) {
  return { next: requested, changed: current !== requested, broadcast: true as const };
}

function decideDockTransition(settled: boolean, lastApplied: boolean | null) {
  return { shouldApply: settled !== lastApplied, next: settled };
}
import { StealthKeyboardService } from './StealthKeyboardService';

export type DisguiseMode = 'terminal' | 'settings' | 'activity' | 'none';

export class StealthService {
  private isUndetectable: boolean;
  private disguiseMode: DisguiseMode;
  private disguiseTimers: NodeJS.Timeout[] = [];
  private dockDebounceTimer: NodeJS.Timeout | null = null;
  private dockReassertTimers: NodeJS.Timeout[] = [];

  constructor(
    private readonly windowHelper: WindowService,
    private readonly settingsWindowHelper: SettingsWindowService,
    private readonly modelSelectorWindowHelper: ModelSelectorWindowService,
    private readonly tray: TrayControl,
    private readonly settings: SettingsService,
    private readonly appBroadcast: (channel: string, ...args: any[]) => void
  ) {
    this.isUndetectable = this.settings.get('isUndetectable') ?? false;
    this.disguiseMode = this.settings.get('disguiseMode') ?? 'none';
    StealthKeyboardService.getInstance().setAuxWindowCloseHandler(() => {
      const settingsWindow = this.settingsWindowHelper.getSettingsWindow();
      if (
        settingsWindow &&
        !settingsWindow.isDestroyed() &&
        settingsWindow.isVisible()
      ) {
        this.settingsWindowHelper.closeWindow();
      }
      const modelSelectorWindow = this.modelSelectorWindowHelper.getWindow();
      if (
        modelSelectorWindow &&
        !modelSelectorWindow.isDestroyed() &&
        modelSelectorWindow.isVisible()
      ) {
        this.modelSelectorWindowHelper.hideWindow();
      }
    });
    console.log(
      `[AppState] Initialized with isUndetectable=${this.isUndetectable}, disguiseMode=${this.disguiseMode}`
    );
  }

  public applyInitialContentProtection(): void {
    this.windowHelper.setContentProtection(this.isUndetectable);
    this.settingsWindowHelper.setContentProtection(this.isUndetectable);
    this.modelSelectorWindowHelper.setContentProtection(this.isUndetectable);
  }

  public setUndetectable(state: boolean): void {
    const decision = decideToggle(this.isUndetectable, state);

    // No-op toggles still heal optimistic renderer drift.
    if (!decision.changed) {
      this.broadcastToAllWindows('undetectable-changed', this.isUndetectable);
      return;
    }

    console.log(`[Stealth] setUndetectable(${state}) called`);

    this.isUndetectable = state;
    this.windowHelper.setContentProtection(state);
    this.settingsWindowHelper.setContentProtection(state);
    this.modelSelectorWindowHelper.setContentProtection(state);

    if (process.platform === 'win32') {
      this.settingsWindowHelper.syncActivationPolicy();
      this.modelSelectorWindowHelper.syncActivationPolicy();
    }

    this.settings.set('isUndetectable', state);

    // Disguise timers can re-register the dock icon after hide().
    if (state) {
      for (const timer of this.disguiseTimers) {
        clearTimeout(timer);
      }
      this.disguiseTimers = [];
    }

    // New toggles supersede stale sharingType reassertions.
    for (const timer of this.dockReassertTimers) {
      clearTimeout(timer);
    }
    this.dockReassertTimers = [];

    this.broadcastToAllWindows('undetectable-changed', state);

    // Dock activation-policy flips need debounce; macOS drops rapid hide/show bursts.
    if (process.platform !== 'darwin') return;

    if (this.dockDebounceTimer) {
      clearTimeout(this.dockDebounceTimer);
      this.dockDebounceTimer = null;
    }

    this.dockDebounceTimer = setTimeout(() => {
      this.dockDebounceTimer = null;

      const settled = this.isUndetectable;

      // Dock transitions can hand focus to the app behind Cheatly.
      const activeWindow = this.windowHelper.getActiveWindow();
      const settingsWindow = this.settingsWindowHelper.getSettingsWindow();
      let targetFocusWindow = activeWindow;
      if (
        settingsWindow &&
        !settingsWindow.isDestroyed() &&
        settingsWindow.isVisible()
      ) {
        targetFocusWindow = settingsWindow;
      }
      const modelSelectorWindow = this.modelSelectorWindowHelper.getWindow();
      const isModelSelectorVisible =
        modelSelectorWindow &&
        !modelSelectorWindow.isDestroyed() &&
        modelSelectorWindow.isVisible();

      if (targetFocusWindow && targetFocusWindow === settingsWindow) {
        this.settingsWindowHelper.setIgnoreBlur(true);
      }
      if (isModelSelectorVisible) {
        /* this.modelSelectorWindowHelper.setIgnoreBlur(true); */
      }

      // Verify against OS ground truth because dock.hide()/show() can be coalesced.
      this.enforceDockState(settled, targetFocusWindow, 0);

      if (targetFocusWindow && targetFocusWindow === settingsWindow) {
        setTimeout(() => {
          this.settingsWindowHelper.setIgnoreBlur(false);
        }, 500);
      }
      if (isModelSelectorVisible) {
        setTimeout(() => {
          /* this.modelSelectorWindowHelper.setIgnoreBlur(false); */
        }, 500);
      }
    }, 350);
  }

  // Re-apply until dock state sticks; activation-policy flips can reset sharingType.
  private enforceDockState(
    wantUndetectable: boolean,
    targetFocusWindow: BrowserWindow | null,
    attempt: number,
    maxAttempts: number = 6
  ): void {
    if (process.platform !== 'darwin') return;

    if (this.isUndetectable !== wantUndetectable) return;

    const currentlyHidden = !app.dock.isVisible();
    const { shouldApply } = decideDockTransition(
      wantUndetectable,
      currentlyHidden
    );
    const cheatlyWasFocused =
      targetFocusWindow != null &&
      !targetFocusWindow.isDestroyed() &&
      targetFocusWindow.isFocused();

    if (shouldApply && wantUndetectable) {
      console.log(`[Stealth] app.dock.hide() (enforce attempt ${attempt})`);
      app.dock.hide();
      this.tray.hideTray();

      this.reassertAllContentProtection();
    }
    // Use window focus, not app.focus(), to avoid a full app activation.
    const shouldRestoreWindowFocus =
      shouldApply &&
      wantUndetectable &&
      cheatlyWasFocused &&
      targetFocusWindow &&
      !targetFocusWindow.isDestroyed();
    if (shouldRestoreWindowFocus) targetFocusWindow.focus();
    if (shouldApply && !wantUndetectable) {
      console.log(`[Stealth] app.dock.show() (enforce attempt ${attempt})`);
      app.dock.show();
      this.tray.showTray();
    }

    if (attempt < maxAttempts) {
      const t = setTimeout(() => {
        this.dockReassertTimers = this.dockReassertTimers.filter(
          (x: NodeJS.Timeout) => x !== t
        );
        this.enforceDockState(
          wantUndetectable,
          targetFocusWindow,
          attempt + 1,
          maxAttempts
        );
      }, 130);
      this.dockReassertTimers.push(t);
    }
  }

  private reassertAllContentProtection(): void {
    this.windowHelper.reassertContentProtection();
    this.settingsWindowHelper.reassertContentProtection();
    this.modelSelectorWindowHelper.reassertContentProtection();
  }

  public getUndetectable(): boolean {
    return this.isUndetectable;
  }

  // createWindow can re-register the app and undo the pre-window dock.hide().
  public applyInitialUndetectableState(): void {
    if (process.platform !== 'darwin') return;
    if (!this.isUndetectable) return;
    this.reassertAllContentProtection();
    const focusWindow = this.windowHelper.getActiveWindow();
    // Startup dock re-show can land later than normal toggle retries.
    this.enforceDockState(true, focusWindow, 0, 18);
  }

  public setDisguise(mode: DisguiseMode): void {
    this.disguiseMode = mode;
    this.settings.set('disguiseMode', mode);

    // process.title still affects Activity Monitor while dock icon updates are gated below.
    this.applyDisguise(mode);
  }

  public applyInitialDisguise(): void {
    this.applyDisguise(this.disguiseMode);
  }

  private applyDisguise(mode: DisguiseMode): void {
    let appName = 'Cheatly';
    let iconPath = '';

    const isWin = process.platform === 'win32';
    const isMac = process.platform === 'darwin';

    switch (mode) {
      case 'terminal':
        appName = isWin ? 'Command Prompt ' : 'Terminal ';
        if (isWin) {
          iconPath = app.isPackaged
            ? path.join(
                process.resourcesPath,
                'assets/fakeicon/win/terminal.png'
              )
            : path.join(app.getAppPath(), 'assets/fakeicon/win/terminal.png');
        }
        if (!isWin) {
          iconPath = this.resolveMacFakeIconPath('terminal.png');
        }
        break;
      case 'settings':
        appName = isWin ? 'Settings ' : 'System Settings ';
        if (isWin) {
          iconPath = app.isPackaged
            ? path.join(
                process.resourcesPath,
                'assets/fakeicon/win/settings.png'
              )
            : path.join(app.getAppPath(), 'assets/fakeicon/win/settings.png');
        }
        if (!isWin) {
          iconPath = this.resolveMacFakeIconPath('settings.png');
        }
        break;
      case 'activity':
        appName = isWin ? 'Task Manager ' : 'Activity Monitor ';
        if (isWin) {
          iconPath = app.isPackaged
            ? path.join(
                process.resourcesPath,
                'assets/fakeicon/win/activity.png'
              )
            : path.join(app.getAppPath(), 'assets/fakeicon/win/activity.png');
        }
        if (!isWin) {
          iconPath = this.resolveMacFakeIconPath('activity.png');
        }
        break;
      case 'none':
        appName = 'Cheatly';
        if (isMac) {
          iconPath = app.isPackaged
            ? path.join(process.resourcesPath, 'cheatly.icns')
            : path.join(app.getAppPath(), 'assets/cheatly.icns');
        }
        if (isWin) {
          iconPath = app.isPackaged
            ? path.join(process.resourcesPath, 'assets/icons/win/icon.ico')
            : path.join(app.getAppPath(), 'assets/icons/win/icon.ico');
        }
        if (!isMac && !isWin) {
          iconPath = this.resolveLinuxIconPath();
        }
        break;
    }

    console.log(
      `[AppState] Applying disguise: ${mode} (${appName}) on ${process.platform}`
    );

    process.title = appName;

    // Skip when undetectable — app.setName() causes macOS to re-register
    // the app and re-show the dock icon even after dock.hide()
    if (!this.isUndetectable) {
      app.setName(appName);
    }

    if (isMac) {
      process.env.CFBundleName = appName.trim();
    }

    if (isWin) {
      app.setAppUserModelId(`com.cheatly.assistant.${mode}`);
    }

    const iconExists = fs.existsSync(iconPath);
    if (!iconExists) {
      console.warn(`[AppState] Disguise icon not found: ${iconPath}`);
    }
    const image = iconExists ? nativeImage.createFromPath(iconPath) : null;
    if (image && isMac && !this.isUndetectable) app.dock.setIcon(image);
    if (image && !isMac) this.setWindowIcons(image);

    const launcher = this.windowHelper.getLauncherWindow();
    if (launcher && !launcher.isDestroyed()) {
      launcher.setTitle(appName.trim());
      launcher.webContents.send('disguise-changed', mode);
    }

    const overlay = this.windowHelper.getOverlayWindow();
    if (overlay && !overlay.isDestroyed()) {
      overlay.setTitle(appName.trim());
      overlay.webContents.send('disguise-changed', mode);
    }

    const settingsWin = this.settingsWindowHelper.getSettingsWindow();
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.setTitle(appName.trim());
      settingsWin.webContents.send('disguise-changed', mode);
    }

    for (const timer of this.disguiseTimers) {
      clearTimeout(timer);
    }
    this.disguiseTimers = [];

    // Reassert process.title only; repeated app.setName() can spawn a second macOS dock tile.
    const scheduleUpdate = (ms: number) => {
      const ts = setTimeout(() => {
        process.title = appName;
        this.disguiseTimers = this.disguiseTimers.filter(
          (t: NodeJS.Timeout) => t !== ts
        );
      }, ms);
      this.disguiseTimers.push(ts);
    };

    scheduleUpdate(200);
    scheduleUpdate(1000);
    scheduleUpdate(5000);
  }

  private resolveMacFakeIconPath(iconName: string): string {
    return app.isPackaged
      ? path.join(process.resourcesPath, `assets/fakeicon/mac/${iconName}`)
      : path.join(app.getAppPath(), `assets/fakeicon/mac/${iconName}`);
  }

  private resolveLinuxIconPath(): string {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'icon.png')
      : path.join(app.getAppPath(), 'assets/icon.png');
  }

  private setWindowIcons(image: Electron.NativeImage): void {
    this.windowHelper.getLauncherWindow()?.setIcon(image);
    this.windowHelper.getOverlayWindow()?.setIcon(image);
    this.settingsWindowHelper.getSettingsWindow()?.setIcon(image);
  }

  private broadcastToAllWindows(channel: string, ...args: any[]): void {
    const windows = [
      this.windowHelper.getActiveWindow(),
      this.windowHelper.getLauncherWindow(),
      this.windowHelper.getOverlayWindow(),
      this.settingsWindowHelper.getSettingsWindow(),
      this.modelSelectorWindowHelper.getWindow(),
    ];
    const sent = new Set<number>();
    for (const win of windows) {
      if (win && !win.isDestroyed() && !sent.has(win.id)) {
        sent.add(win.id);
        win.webContents.send(channel, ...args);
      }
    }
  }

  public getDisguise(): string {
    return this.disguiseMode;
  }
}
