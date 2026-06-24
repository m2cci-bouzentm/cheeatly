import { BrowserWindow, screen, app } from 'electron';
import { WindowService } from './WindowService';
import path from 'node:path';

const isDev = process.env.NODE_ENV === 'development';

const startUrl = isDev
  ? 'http://localhost:5180'
  : `file://${path.join(app.getAppPath(), 'dist/index.html')}`;

type WindowActivationOptions = {
  activate?: boolean;
};

export class SettingsWindowService {
  private settingsWindow: BrowserWindow | null = null;
  private windowHelper: WindowService | null = null;
  private opacityTimeout: NodeJS.Timeout | null = null;

  public getSettingsWindow(): BrowserWindow | null {
    return this.settingsWindow;
  }

  public setWindowDimensions(
    win: BrowserWindow,
    width: number,
    height: number
  ): void {
    if (!win || win.isDestroyed() || !win.isVisible()) return;

    const currentBounds = win.getBounds();
    if (currentBounds.width === width && currentBounds.height === height)
      return;

    win.setSize(width, height);
  }

  private offsetX: number = 0;
  private offsetY: number = 0;

  private lastBlurTime: number = 0;
  private ignoreBlur: boolean = false;

  constructor() {}

  public setIgnoreBlur(ignore: boolean): void {
    this.ignoreBlur = ignore;
  }

  public preloadWindow(): void {
    if (!this.settingsWindow || this.settingsWindow.isDestroyed()) {
      this.createWindow(-10000, -10000, false);
    }
  }

  public setWindowHelper(wh: WindowService): void {
    this.windowHelper = wh;
  }

  public toggleWindow(x?: number, y?: number): void {
    const mainWindow = this.windowHelper?.getActiveWindow() ?? null;
    if (
      mainWindow &&
      !mainWindow.isDestroyed() &&
      x !== undefined &&
      y !== undefined
    ) {
      const bounds = mainWindow.getBounds();
      this.offsetX = x - bounds.x;
      this.offsetY = y - (bounds.y + bounds.height);
    }

    if (!this.settingsWindow || this.settingsWindow.isDestroyed()) {
      this.createWindow(x, y);
      return;
    }

    // A blur caused by the toggle click should not immediately reopen the panel.
    if (
      !this.settingsWindow.isVisible() &&
      Date.now() - this.lastBlurTime < 250
    ) {
      return;
    }

    if (this.settingsWindow.isVisible()) {
      this.closeWindow();
      return;
    }
    this.showWindow(x, y);
  }

  public showWindow(
    x?: number,
    y?: number,
    options: WindowActivationOptions = {}
  ): void {
    if (!this.settingsWindow || this.settingsWindow.isDestroyed()) {
      this.createWindow(x, y);
      return;
    }

    const activate = options.activate ?? true;

    const mainWin = this.windowHelper?.getActiveWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      this.settingsWindow.setParentWindow(mainWin);
    }

    if (x !== undefined && y !== undefined) {
      this.settingsWindow.setPosition(Math.round(x), Math.round(y));
    }

    this.ensureVisibleOnScreen();

    if (process.platform === 'win32' && this.contentProtection) {
      this.showProtectedSettingsWindow(activate);
      return;
    }

    this.settingsWindow.setContentProtection(this.contentProtection);
    if (activate) {
      this.settingsWindow.show();
      this.settingsWindow.focus();
      this.emitVisibilityChange(true);
      return;
    }
    this.settingsWindow.showInactive();
    this.emitVisibilityChange(true);
  }

  private showProtectedSettingsWindow(activate: boolean): void {
    if (!this.settingsWindow) return;
    this.settingsWindow.setOpacity(0);
    if (activate) this.settingsWindow.show();
    if (!activate) this.settingsWindow.showInactive();
    this.settingsWindow.setContentProtection(true);

    if (this.opacityTimeout) clearTimeout(this.opacityTimeout);
    this.opacityTimeout = setTimeout(() => {
      if (!this.settingsWindow || this.settingsWindow.isDestroyed()) return;
      this.settingsWindow.setOpacity(1);
      if (activate) this.settingsWindow.focus();
    }, 60);
    this.emitVisibilityChange(true);
  }

  public reposition(mainBounds: Electron.Rectangle): void {
    if (
      !this.settingsWindow ||
      !this.settingsWindow.isVisible() ||
      this.settingsWindow.isDestroyed()
    )
      return;

    const newX = mainBounds.x + this.offsetX;
    const newY = mainBounds.y + mainBounds.height + this.offsetY;

    this.settingsWindow.setPosition(Math.round(newX), Math.round(newY));
  }

  public closeWindow(): void {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.hide();
      this.emitVisibilityChange(false);
    }
  }

  private emitVisibilityChange(isVisible: boolean): void {
    const mainWindow = this.windowHelper?.getActiveWindow() ?? null;
    if (!mainWindow) {
      console.warn(
        '[SettingsWindowHelper] settings-visibility-changed dropped — no main window bound yet.'
      );
      return;
    }
    if (mainWindow.isDestroyed()) return;
    try {
      mainWindow.webContents.send('settings-visibility-changed', isVisible);
    } catch {
      // Renderer is tearing down; ignore.
    }
  }

  private createWindow(
    x?: number,
    y?: number,
    showWhenReady: boolean = true
  ): void {
    const isMac = process.platform === 'darwin';
    const windowSettings: Electron.BrowserWindowConstructorOptions = {
      width: 180,
      height: 200,
      frame: false,
      transparent: true,
      resizable: false,
      fullscreenable: false,
      hasShadow: false,
      alwaysOnTop: true,
      backgroundColor: '#00000000',
      show: false,
      skipTaskbar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
        backgroundThrottling: false,
      },
      // NSPanel is required for applyStealthToWindow's non-activating SPI;
      // a plain NSWindow still steals focus when settings is clicked.
      ...(isMac ? { type: 'panel' as const } : {}),
    };

    if (x !== undefined && y !== undefined) {
      windowSettings.x = Math.round(x);
      windowSettings.y = Math.round(y);
    }

    this.settingsWindow = new BrowserWindow(windowSettings);

    if (process.platform === 'darwin') {
      this.settingsWindow.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
      });
      this.settingsWindow.setHiddenInMissionControl(true);
      this.settingsWindow.setAlwaysOnTop(true, 'floating');
    }

    console.log(
      `[SettingsWindowHelper] Creating Settings Window with Content Protection: ${this.contentProtection}`
    );
    this.settingsWindow.setContentProtection(this.contentProtection);

    const settingsUrl = isDev
      ? `${startUrl}?window=settings`
      : `${startUrl}?window=settings`;

    this.settingsWindow.loadURL(settingsUrl).catch((e) => {
      console.error('[SettingsWindowHelper] Failed to load URL:', e);
    });

    this.settingsWindow.once('ready-to-show', () => {
      // Apply non-activating panel attributes before first show so settings
      // interaction does not activate Cheatly over the foreground app.
      this.applyStealthToSettingsWindow();
      if (showWhenReady) {
        this.showWindow(
          this.settingsWindow?.getBounds().x || 0,
          this.settingsWindow?.getBounds().y || 0
        );
      }
    });

    this.settingsWindow.on('blur', () => {
      if (this.ignoreBlur) return;
      this.lastBlurTime = Date.now();
      this.closeWindow();
    });

    // Stop the CGEventTap so settings keystrokes do not route into chat input.
    this.settingsWindow.on('show', () => {
      // Stale blur timestamps can keep the 250ms toggle guard hot forever.
      this.lastBlurTime = 0;

      if (process.platform !== 'darwin') return;
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { StealthKeyboardService } = require('../stealth/StealthKeyboardService');
        StealthKeyboardService.getInstance().stop();
      } catch (e) {
        console.error(
          '[SettingsWindowHelper] failed to stop stealth tap on show:',
          e
        );
      }
    });
  }

  private applyStealthToSettingsWindow(): void {
    if (process.platform !== 'darwin') return;
    if (!this.settingsWindow || this.settingsWindow.isDestroyed()) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const {
        loadNativeModule,
      } = require('../audio/native/nativeModuleLoader');
      const native = loadNativeModule();
      if (native && typeof native.applyStealthToWindow === 'function') {
        native.applyStealthToWindow(
          this.settingsWindow.getNativeWindowHandle()
        );
      }
    } catch (e) {
      console.error('[SettingsWindowHelper] applyStealthToWindow failed:', e);
    }
  }

  private ensureVisibleOnScreen() {
    if (!this.settingsWindow) return;
    const { x, y, width, height } = this.settingsWindow.getBounds();
    const display = screen.getDisplayNearestPoint({ x, y });
    const bounds = display.workArea;

    let newX = x;
    let newY = y;

    if (x + width > bounds.x + bounds.width) {
      newX = bounds.x + bounds.width - width;
    }
    if (y + height > bounds.y + bounds.height) {
      newY = bounds.y + bounds.height - height;
    }

    this.settingsWindow.setPosition(newX, newY);
  }
  private contentProtection: boolean = false;

  public setContentProtection(enable: boolean): void {
    // Repeated identical calls churn DWM affinity on Windows.
    if (
      this.contentProtection === enable &&
      this.settingsWindow &&
      !this.settingsWindow.isDestroyed()
    )
      return;
    console.log(
      `[SettingsWindowHelper] Setting content protection to: ${enable}`
    );
    this.contentProtection = enable;

    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.setContentProtection(enable);
    }
  }

  // app.dock.hide()/show() can reset macOS sharingType while our flag is unchanged.
  public reassertContentProtection(): void {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.setContentProtection(this.contentProtection);
    }
  }

  public syncActivationPolicy(): void {
    if (process.platform !== 'win32') return;
    if (!this.settingsWindow || this.settingsWindow.isDestroyed()) return;
    this.settingsWindow.setContentProtection(this.contentProtection);
    if (this.settingsWindow.isVisible()) {
      this.settingsWindow.setOpacity(1);
    }
  }
}
