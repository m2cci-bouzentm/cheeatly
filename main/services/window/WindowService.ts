import { app, BrowserWindow, Menu, screen } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AppState } from '../../main';
import { KeybindService } from '../keybind/KeybindService';
import { createWindows, type WindowCreationHost } from './WindowCreation';

const isEnvDev = process.env.NODE_ENV === 'development';
const isPackaged = app.isPackaged;
const inAppBundle =
  process.execPath.includes('.app/') || process.execPath.includes('.app\\');

console.log(
  `[WindowHelper] isEnvDev: ${isEnvDev}, isPackaged: ${isPackaged}, inAppBundle: ${inAppBundle}`
);

const isDev = isEnvDev && !isPackaged;
const overlayResizeTracePath = '/tmp/cheatly-overlay-resize-trace.log';

function traceOverlayResize(
  event: string,
  data: Record<string, unknown>
): void {
  if (!isDev) return;
  try {
    fs.appendFileSync(
      overlayResizeTracePath,
      `${new Date().toISOString()} ${event} ${JSON.stringify(data)}\n`
    );
  } catch {
    // Dev-only diagnostics must never affect overlay behavior.
  }
}

const startUrl = isDev
  ? 'http://localhost:5180'
  : `file://${path.join(__dirname, '../../dist/index.html')}`;

export class WindowService {
  private launcherWindow: BrowserWindow | null = null;
  private overlayWindow: BrowserWindow | null = null;
  private isWindowVisible: boolean = false;
  private overlayBounds: Electron.Rectangle | null = null;
  private currentWindowMode: 'launcher' | 'overlay' = 'launcher';

  private appState: AppState;
  private contentProtection: boolean = false;
  private opacityTimeout: NodeJS.Timeout | null = null;

  // Must match renderer collapsed shell width to avoid first-paint resize/slide.
  private static readonly OVERLAY_DEFAULT_WIDTH = 600;
  private static readonly OVERLAY_MIN_HEIGHT = 216;
  private static readonly OVERLAY_DEFAULT_TOP_RATIO = 0.035;

  private step: number = 20;

  constructor(appState: AppState) {
    this.appState = appState;
  }

  private getDisplayWorkArea(bounds?: Electron.Rectangle): Electron.Rectangle {
    if (bounds) {
      return screen.getDisplayMatching(bounds).workArea;
    }
    if (this.overlayBounds) {
      return screen.getDisplayMatching(this.overlayBounds).workArea;
    }
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      return screen.getDisplayMatching(this.overlayWindow.getBounds()).workArea;
    }
    return screen.getPrimaryDisplay().workArea;
  }

  public setContentProtection(enable: boolean): void {
    // Repeated identical calls can churn Windows DWM affinity and flash black frames.
    if (this.contentProtection === enable) return;
    this.contentProtection = enable;
    this.applyContentProtection(enable);
  }

  private applyContentProtection(enable: boolean): void {
    const windows = [this.launcherWindow, this.overlayWindow];
    windows.forEach((win) => {
      if (win && !win.isDestroyed()) {
        win.setContentProtection(enable);
      }
    });
  }

  // macOS activation-policy flips can reset NSWindowSharingType behind our cached flag.
  public reassertContentProtection(): void {
    this.applyContentProtection(this.contentProtection);
  }

  public setWindowDimensions(width: number, height: number): void {
    const activeWindow = this.getActiveWindow();
    if (!activeWindow || activeWindow.isDestroyed()) return;

    const [currentX, currentY] = activeWindow.getPosition();
    const primaryDisplay = screen.getPrimaryDisplay();
    const workArea = primaryDisplay.workAreaSize;
    const maxAllowedWidth = Math.floor(workArea.width * 0.9);
    const newWidth = Math.min(width, maxAllowedWidth);
    const newHeight = Math.ceil(height);
    const maxX = workArea.width - newWidth;
    const newX = Math.min(Math.max(currentX, 0), maxX);

    activeWindow.setBounds({
      x: newX,
      y: currentY,
      width: newWidth,
      height: newHeight,
    });
  }

  public setOverlayDimensions(width: number, height: number): void {
    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return;

    const currentBounds = this.overlayWindow.getBounds();
    const currentContentSize = this.overlayWindow.getContentSize();
    const currentX = currentBounds.x;
    const currentY = currentBounds.y;
    const workArea = this.getDisplayWorkArea(currentBounds);
    const maxAllowedWidth = Math.floor(workArea.width * 0.9);
    const maxAllowedHeight = Math.floor(workArea.height * 0.9);
    const newWidth = Math.min(Math.max(width, 300), maxAllowedWidth);
    const newHeight = Math.min(Math.max(height, 1), maxAllowedHeight);
    const maxX = workArea.x + workArea.width - newWidth;
    const maxY = workArea.y + workArea.height - newHeight;
    const newX = Math.min(Math.max(currentX, workArea.x), maxX);
    const newY = Math.min(Math.max(currentY, workArea.y), maxY);

    if (
      Math.abs(newWidth - currentContentSize[0]) <= 1 &&
      Math.abs(newHeight - currentContentSize[1]) <= 1 &&
      newX === currentBounds.x &&
      newY === currentBounds.y
    ) {
      return;
    }

    this.overlayWindow.setBounds({
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight,
    });
    this.overlayBounds = this.overlayWindow.getBounds();
  }

  // Code expansion resizes around center so the overlay shell does not jump sideways.
  public setOverlayDimensionsCentered(width: number, height: number): void {
    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return;

    const currentBounds = this.overlayWindow.getBounds();
    const currentContentSize = this.overlayWindow.getContentSize();
    const workArea = this.getDisplayWorkArea(currentBounds);
    const maxAllowedWidth = Math.floor(workArea.width * 0.9);
    const maxAllowedHeight = Math.floor(workArea.height * 0.9);
    const newWidth = Math.min(Math.max(width, 300), maxAllowedWidth);
    const newHeight = Math.min(Math.max(height, 1), maxAllowedHeight);
    traceOverlayResize('setOverlayDimensionsCentered:request', {
      requested: { width, height },
      currentBounds,
      currentContentSize,
      workArea,
      maxAllowed: { width: maxAllowedWidth, height: maxAllowedHeight },
      computed: { width: newWidth, height: newHeight },
      clampedHeight: newHeight !== height,
    });

    const widthDelta = newWidth - currentContentSize[0];
    const desiredX = currentBounds.x - Math.floor(widthDelta / 2);

    const maxX = workArea.x + workArea.width - newWidth;
    const newX = Math.min(Math.max(desiredX, workArea.x), maxX);
    const maxY = workArea.y + workArea.height - newHeight;
    const newY = Math.min(Math.max(currentBounds.y, workArea.y), maxY);

    if (
      Math.abs(newWidth - currentContentSize[0]) <= 1 &&
      Math.abs(newHeight - currentContentSize[1]) <= 1 &&
      newX === currentBounds.x &&
      newY === currentBounds.y
    ) {
      traceOverlayResize('setOverlayDimensionsCentered:noop', {
        requested: { width, height },
        currentBounds,
        currentContentSize,
        computed: { x: newX, y: newY, width: newWidth, height: newHeight },
      });
      return;
    }

    // Single setBounds avoids a 1-frame size/origin split during expansion.
    this.overlayWindow.setBounds({
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight,
    });
    this.overlayBounds = this.overlayWindow.getBounds();
    traceOverlayResize('setOverlayDimensionsCentered:applied', {
      requested: { width, height },
      appliedBounds: this.overlayBounds,
      contentSizeAfter: this.overlayWindow.getContentSize(),
    });
  }

  public createWindow(): void {
    createWindows.call(this as unknown as WindowCreationHost, {
      isDev,
      startUrl,
      overlayDefaultWidth: WindowService.OVERLAY_DEFAULT_WIDTH,
      overlayDefaultTopRatio: WindowService.OVERLAY_DEFAULT_TOP_RATIO,
    });
  }

  public setupWindowListeners(): void {
    if (!this.launcherWindow) return;

    this.launcherWindow.on('system-context-menu', (e, point) => {
      e.preventDefault();
      if (!this.appState.getUndetectable()) {
        this.showContextMenu(this.launcherWindow!, point);
      }
    });

    this.launcherWindow.on('move', () => {
      if (this.launcherWindow) {
        this.appState.settingsWindowHelper.reposition(
          this.launcherWindow.getBounds()
        );
      }
    });

    this.launcherWindow.on('resize', () => {
      if (this.launcherWindow) {
        this.appState.settingsWindowHelper.reposition(
          this.launcherWindow.getBounds()
        );
      }
    });

    // Windows/Linux close hides to tray unless the app is actually quitting.
    if (process.platform !== 'darwin') {
      this.launcherWindow.on('close', (e) => {
        if (this.appState.isQuitting()) return;
        e.preventDefault();
        this.launcherWindow?.hide();
        this.isWindowVisible = false;
      });

      this.launcherWindow.on('maximize', () => {
        this.launcherWindow?.webContents.send('window-maximized-changed', true);
      });
      this.launcherWindow.on('unmaximize', () => {
        this.launcherWindow?.webContents.send(
          'window-maximized-changed',
          false
        );
      });
    }

    this.launcherWindow.on('closed', () => {
      this.launcherWindow = null;
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.close();
      }
      this.overlayWindow = null;
      this.isWindowVisible = false;
    });

    // Overlay close hides during meetings and returns to launcher between meetings.
    if (!this.overlayWindow) return;

    this.overlayWindow.on('move', () => {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayBounds = this.overlayWindow.getBounds();
      }
    });

    this.overlayWindow.on('resize', () => {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayBounds = this.overlayWindow.getBounds();
      }
    });

    this.overlayWindow.on('system-context-menu', (e, point) => {
      e.preventDefault();
      if (!this.appState.getUndetectable()) {
        this.showContextMenu(this.overlayWindow!, point);
      }
    });

    // Screen-sharing tools can demote HWND_TOPMOST; macOS reassertion steals focus.
    if (process.platform === 'win32') {
      this.overlayWindow.on('blur', () => {
        if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return;
        if (!this.overlayWindow.isVisible()) return;
        this.overlayWindow.setAlwaysOnTop(true, 'screen-saver');
      });
    }

    this.overlayWindow.on('close', (e) => {
      // Do not cancel app.quit() when overlay is visible.
      if (this.appState.isQuitting()) return;
      if (!this.overlayWindow?.isVisible()) return;
      e.preventDefault();
      if (this.appState.getIsMeetingActive()) {
        this.hideOverlay();
        return;
      }
      this.switchToLauncher();
    });
  }

  public getActiveWindow(): BrowserWindow | null {
    if (this.currentWindowMode === 'overlay' && this.overlayWindow) {
      return this.overlayWindow;
    }
    return this.launcherWindow;
  }

  public getLauncherWindow(): BrowserWindow | null {
    return this.launcherWindow;
  }
  public getOverlayWindow(): BrowserWindow | null {
    return this.overlayWindow;
  }
  public getCurrentWindowMode(): 'launcher' | 'overlay' {
    return this.currentWindowMode;
  }

  public resetOverlayPosition(): void {
    this.overlayBounds = null;
    console.log(
      '[WindowHelper] Overlay position reset to default for next meeting.'
    );
  }

  public getLastOverlayBounds(): Electron.Rectangle | null {
    if (this.overlayBounds) return { ...this.overlayBounds };
    return null;
  }

  public getLastOverlayDisplayId(): number | null {
    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return null;
    const bounds = this.overlayWindow.getBounds();
    return screen.getDisplayMatching(bounds).id;
  }

  public isVisible(): boolean {
    return this.isWindowVisible;
  }

  public isMainWindowMaximized(): boolean {
    const win = this.launcherWindow;
    return !!win && !win.isDestroyed() && win.isMaximized();
  }

  public hideMainWindow(): void {
    // macOS opacity-zero before hide re-registers the app and breaks stealth mode.
    if (process.platform === 'win32') {
      this.launcherWindow?.setOpacity(0);
      this.overlayWindow?.setOpacity(0);
    }
    this.launcherWindow?.hide();
    this.overlayWindow?.hide();
    this.isWindowVisible = false;
  }

  public showOverlay(): void {
    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return;

    this.overlayWindow.setOpacity(1);

    // Windows z-order must be restored before first paint.
    if (process.platform === 'win32') {
      this.overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    }

    this.overlayWindow.showInactive();
    this.overlayWindow.focus();
  }

  public hideOverlay(): void {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.hide();
    }
  }

  public showMainWindow(inactive?: boolean): void {
    if (this.currentWindowMode === 'overlay') {
      this.switchToOverlay(inactive);
      return;
    }
    this.switchToLauncher(inactive);
  }

  public toggleMainWindow(): void {
    if (this.isWindowVisible) {
      this.hideMainWindow();
      return;
    }
    this.showMainWindow(true);
  }

  public toggleOverlayWindow(): void {
    this.toggleMainWindow();
  }

  public centerAndShowWindow(): void {
    // During meetings, showing launcher would expose it in taskbar/dock.
    const stealthShow = this.appState.getUndetectable();
    if (this.currentWindowMode === 'overlay') {
      this.switchToOverlay(stealthShow ? true : undefined);
      return;
    }
    this.switchToLauncher(stealthShow ? true : undefined);
    this.launcherWindow?.center();
  }

  public switchToOverlay(inactive?: boolean): void {
    console.log(
      `[WindowHelper] Switching to OVERLAY (inactive: ${!!inactive})`
    );
    this.currentWindowMode = 'overlay';
    KeybindService.getInstance().setMode('overlay');

    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      const currentBounds = this.overlayWindow.getBounds();
      const savedBounds = this.overlayBounds
        ? {
            ...this.overlayBounds,
            height: Math.max(
              this.overlayBounds.height,
              WindowService.OVERLAY_MIN_HEIGHT
            ),
          }
        : null;
      const workArea = this.getDisplayWorkArea(savedBounds ?? currentBounds);
      const maxAllowedWidth = Math.floor(workArea.width * 0.9);
      const maxAllowedHeight = Math.floor(workArea.height * 0.9);
      const targetBounds = savedBounds
        ? {
            x: Math.min(
              Math.max(savedBounds.x, workArea.x),
              workArea.x +
                workArea.width -
                Math.min(savedBounds.width, maxAllowedWidth)
            ),
            y: Math.min(
              Math.max(savedBounds.y, workArea.y),
              workArea.y +
                workArea.height -
                Math.min(savedBounds.height, maxAllowedHeight)
            ),
            width: Math.min(savedBounds.width, maxAllowedWidth),
            height: Math.min(savedBounds.height, maxAllowedHeight),
          }
        : {
            x: Math.floor(
              workArea.x +
                (workArea.width - WindowService.OVERLAY_DEFAULT_WIDTH) / 2
            ),
            y: Math.floor(
              workArea.y +
                workArea.height * WindowService.OVERLAY_DEFAULT_TOP_RATIO
            ),
            width: WindowService.OVERLAY_DEFAULT_WIDTH,
            height: Math.max(
              Math.min(currentBounds.height, maxAllowedHeight),
              WindowService.OVERLAY_MIN_HEIGHT
            ),
          };

      this.overlayWindow.setBounds(targetBounds);
      this.overlayBounds = this.overlayWindow.getBounds();
      this.overlayWindow.webContents.send('ensure-expanded');

      this.showOverlayForCurrentProtection(inactive);
      this.isWindowVisible = true;
    }

    if (this.launcherWindow && !this.launcherWindow.isDestroyed()) {
      this.launcherWindow.hide();
    }
  }

  public switchToLauncher(inactive?: boolean): void {
    console.log(
      `[WindowHelper] Switching to LAUNCHER (inactive: ${!!inactive})`
    );
    this.currentWindowMode = 'launcher';
    KeybindService.getInstance().setMode('launcher');

    if (this.launcherWindow && !this.launcherWindow.isDestroyed()) {
      this.showLauncherForCurrentProtection(inactive);
      this.isWindowVisible = true;
    }

    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.hide();
    }
  }

  private showOverlayForCurrentProtection(inactive?: boolean): void {
    if (process.platform === 'win32' && this.contentProtection) {
      // Windows DWM can leak frames unless content protection is applied while invisible.
      this.showProtectedOverlayWindow(inactive);
      return;
    }
    this.showOverlayWindowNow(inactive);
  }

  private showLauncherForCurrentProtection(inactive?: boolean): void {
    if (process.platform === 'win32' && this.contentProtection) {
      this.showProtectedLauncherWindow(inactive);
      return;
    }
    this.showLauncherWindowNow(inactive);
  }

  public setWindowMode(mode: 'launcher' | 'overlay', inactive?: boolean): void {
    if (mode === 'launcher') {
      this.switchToLauncher(inactive);
      return;
    }
    this.switchToOverlay(inactive);
  }

  private showOverlayWindowNow(inactive?: boolean): void {
    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return;
    this.overlayWindow.setOpacity(1);
    this.overlayWindow.setContentProtection(this.contentProtection);
    // Windows z-order must be restored before show; macOS would steal focus.
    if (process.platform === 'win32') {
      this.overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    }
    if (inactive) {
      this.overlayWindow.showInactive();
      return;
    }
    this.overlayWindow.show();
    this.overlayWindow.focus();
  }

  private showProtectedOverlayWindow(inactive?: boolean): void {
    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return;
    this.overlayWindow.setOpacity(0);
    if (inactive) this.overlayWindow.showInactive();
    if (!inactive) this.overlayWindow.show();
    this.overlayWindow.setContentProtection(true);

    if (this.opacityTimeout) clearTimeout(this.opacityTimeout);
    this.opacityTimeout = setTimeout(() => {
      if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return;
      this.overlayWindow.setOpacity(1);
      this.overlayWindow.setAlwaysOnTop(true, 'screen-saver');
      if (!inactive) this.overlayWindow.focus();
    }, 60);
  }

  private showProtectedLauncherWindow(inactive?: boolean): void {
    if (!this.launcherWindow || this.launcherWindow.isDestroyed()) return;
    this.launcherWindow.setOpacity(0);
    if (inactive) this.launcherWindow.showInactive();
    if (!inactive) this.launcherWindow.show();
    this.launcherWindow.setContentProtection(true);

    if (this.opacityTimeout) clearTimeout(this.opacityTimeout);
    this.opacityTimeout = setTimeout(() => {
      if (!this.launcherWindow || this.launcherWindow.isDestroyed()) return;
      this.launcherWindow.setOpacity(1);
      if (!inactive) this.launcherWindow.focus();
    }, 60);
  }

  private showLauncherWindowNow(inactive?: boolean): void {
    if (!this.launcherWindow || this.launcherWindow.isDestroyed()) return;
    this.launcherWindow.setOpacity(1);
    this.launcherWindow.setContentProtection(this.contentProtection);
    if (inactive) {
      this.launcherWindow.showInactive();
      return;
    }
    this.launcherWindow.show();
    this.launcherWindow.focus();
  }

  private moveActiveWindow(dx: number, dy: number): void {
    const win = this.getActiveWindow();
    if (!win) return;

    const [x, y] = win.getPosition();
    win.setPosition(x + dx, y + dy);
  }

  public moveWindowRight(): void {
    this.moveActiveWindow(this.step, 0);
  }
  public moveWindowLeft(): void {
    this.moveActiveWindow(-this.step, 0);
  }
  public moveWindowDown(): void {
    this.moveActiveWindow(0, this.step);
  }
  public moveWindowUp(): void {
    this.moveActiveWindow(0, -this.step);
  }

  private showContextMenu(
    win: BrowserWindow,
    point: { x: number; y: number }
  ): void {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: 'Developer Console',
        click: () => {
          win.webContents.toggleDevTools();
        },
      },
      { type: 'separator' },
      { role: 'reload' },
      { role: 'forceReload' },
      { type: 'separator' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ];
    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: win, x: point.x, y: point.y });
  }

  public minimizeWindow(): void {
    const win = this.launcherWindow;
    if (!win || win.isDestroyed()) return;
    if (this.opacityTimeout) clearTimeout(this.opacityTimeout);
    win.minimize();
  }

  public maximizeWindow(): void {
    const win = this.launcherWindow;
    if (!win || win.isDestroyed()) return;
    if (win.isMaximized()) {
      win.unmaximize();
      return;
    }
    win.maximize();
  }

  public closeWindow(): void {
    const win = this.launcherWindow;
    if (!win || win.isDestroyed()) return;
    if (this.opacityTimeout) clearTimeout(this.opacityTimeout);
    win.close();
  }
}
