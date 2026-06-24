import { BrowserWindow, screen, app } from 'electron';
import path from 'node:path';

const isDev = process.env.NODE_ENV === 'development';

const startUrl = isDev
  ? 'http://localhost:5180'
  : `file://${path.join(app.getAppPath(), 'dist/index.html')}`;

import type { WindowService } from './WindowService';

type WindowActivationOptions = {
  activate?: boolean;
};

export class ModelSelectorWindowService {
  private window: BrowserWindow | null = null;
  private contentProtection: boolean = false;
  private opacityTimeout: NodeJS.Timeout | null = null;

  constructor() {}

  private windowHelper: WindowService | null = null;

  public setWindowHelper(wh: WindowService): void {
    this.windowHelper = wh;
  }

  public getWindow(): BrowserWindow | null {
    return this.window;
  }

  public preloadWindow(): void {
    if (!this.window || this.window.isDestroyed()) {
      this.createWindow(-10000, -10000, false);
    }
  }

  public showWindow(
    x: number,
    y: number,
    options: WindowActivationOptions = {}
  ): void {
    if (!this.window || this.window.isDestroyed()) {
      this.createWindow(x, y, true, options);
      return;
    }

    const activate = options.activate ?? true;

    const mainWin = this.windowHelper?.getActiveWindow();
    const isOverlay = mainWin === this.windowHelper?.getOverlayWindow();

    if (mainWin && !mainWin.isDestroyed()) {
      this.window.setParentWindow(mainWin);
    }

    const isDarwin = process.platform === 'darwin';
    if (isDarwin)
      this.window.setVisibleOnAllWorkspaces(isOverlay, {
        visibleOnFullScreen: isOverlay,
      });
    // Reapplying the same alwaysOnTop state can activate NSApp on macOS.
    const shouldUpdateAlwaysOnTop =
      isDarwin && this.window.isAlwaysOnTop() !== isOverlay;
    if (shouldUpdateAlwaysOnTop)
      this.window.setAlwaysOnTop(isOverlay, 'floating');
    if (isDarwin) this.window.setHiddenInMissionControl(true);

    this.window.setPosition(Math.round(x), Math.round(y));
    this.ensureVisibleOnScreen();

    if (process.platform === 'win32' && this.contentProtection) {
      this.showProtectedModelSelectorWindow(activate);
      return;
    }

    this.window.setContentProtection(this.contentProtection);
    if (activate) {
      this.window.show();
      this.window.focus();
      return;
    }
    this.window.showInactive();
  }

  private showProtectedModelSelectorWindow(activate: boolean): void {
    if (!this.window) return;
    this.window.setOpacity(0);
    if (activate) this.window.show();
    if (!activate) this.window.showInactive();
    this.window.setContentProtection(true);

    if (this.opacityTimeout) clearTimeout(this.opacityTimeout);
    this.opacityTimeout = setTimeout(() => {
      if (!this.window || this.window.isDestroyed()) return;
      this.window.setOpacity(1);
      if (activate) this.window.focus();
    }, 60);
  }

  public hideWindow(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.setParentWindow(null);
      this.window.hide();
      // Closing the dropdown must not steal OS focus back from the user's app.
    }
  }

  public toggleWindow(
    x: number,
    y: number,
    options: WindowActivationOptions = {}
  ): void {
    if (!this.window || this.window.isDestroyed()) {
      this.createWindow(x, y, true, options);
      return;
    }

    if (this.window.isVisible()) {
      this.hideWindow();
      return;
    }
    this.showWindow(x, y, options);
  }

  public closeWindow(): void {
    this.hideWindow();
  }

  private createWindow(
    x?: number,
    y?: number,
    showWhenReady: boolean = true,
    showOptions: WindowActivationOptions = {}
  ): void {
    const isMac = process.platform === 'darwin';
    const windowSettings: Electron.BrowserWindowConstructorOptions = {
      width: 140,
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
      // outside-close is owned by renderer/app-level hooks.
      ...(isMac ? { type: 'panel' as const } : {}),
    };

    if (x !== undefined && y !== undefined) {
      windowSettings.x = Math.round(x);
      windowSettings.y = Math.round(y);
    }

    this.window = new BrowserWindow(windowSettings);

    if (process.platform === 'darwin') {
      this.window.setHiddenInMissionControl(true);
    }

    console.log(
      `[ModelSelectorWindowHelper] Creating window with Content Protection: ${this.contentProtection}`
    );
    this.window.setContentProtection(this.contentProtection);

    const url = isDev
      ? `${startUrl}?window=model-selector`
      : `${startUrl}?window=model-selector`;

    this.window.loadURL(url).catch((e) => {
      console.error('[ModelSelectorWindowHelper] Failed to load URL:', e);
    });

    this.window.once('ready-to-show', () => {
      // Apply non-activating panel attributes before first show so model
      // selection does not activate Cheatly over the foreground app.
      this.applyStealthToModelSelectorWindow();
      if (showWhenReady) {
        this.showWindow(
          this.window?.getBounds().x || 0,
          this.window?.getBounds().y || 0,
          showOptions
        );
      }
    });

    // Per-window blur races with overlay↔panel focus transfers; close paths
    // live in renderer capture, app blur handling, and model selection.

    // The CGEventTap would otherwise intercept dropdown keystrokes at OS level.
    this.window.on('show', () => {
      if (process.platform !== 'darwin') return;
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { StealthKeyboardService } = require('../stealth/StealthKeyboardService');
        StealthKeyboardService.getInstance().stop();
      } catch (e) {
        console.error(
          '[ModelSelectorWindowHelper] failed to stop stealth tap on show:',
          e
        );
      }
    });
  }

  private applyStealthToModelSelectorWindow(): void {
    if (process.platform !== 'darwin') return;
    if (!this.window || this.window.isDestroyed()) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const {
        loadNativeModule,
      } = require('../audio/native/nativeModuleLoader');
      const native = loadNativeModule();
      if (native && typeof native.applyStealthToWindow === 'function') {
        native.applyStealthToWindow(this.window.getNativeWindowHandle());
      }
    } catch (e) {
      console.error(
        '[ModelSelectorWindowHelper] applyStealthToWindow failed:',
        e
      );
    }
  }

  private ensureVisibleOnScreen() {
    if (!this.window) return;
    const { x, y, width, height } = this.window.getBounds();
    const display = screen.getDisplayNearestPoint({ x, y });
    const bounds = display.workArea;

    let newX = x;
    let newY = y;

    if (x + width > bounds.x + bounds.width) {
      newX = bounds.x + bounds.width - width;
    }
    if (x < bounds.x) {
      newX = bounds.x;
    }

    if (y + height > bounds.y + bounds.height) {
      newY = bounds.y + bounds.height - height;
    }
    if (y < bounds.y) {
      newY = bounds.y;
    }

    this.window.setPosition(newX, newY);
  }

  public setContentProtection(enable: boolean): void {
    // Repeated identical calls churn DWM affinity on Windows.
    if (
      this.contentProtection === enable &&
      this.window &&
      !this.window.isDestroyed()
    )
      return;
    console.log(
      `[ModelSelectorWindowHelper] Setting content protection to: ${enable}`
    );
    this.contentProtection = enable;
    if (this.window && !this.window.isDestroyed()) {
      this.window.setContentProtection(enable);
    }
  }

  // app.dock.hide()/show() can reset macOS sharingType while our flag is unchanged.
  public reassertContentProtection(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.setContentProtection(this.contentProtection);
    }
  }

  public syncActivationPolicy(): void {
    if (process.platform !== 'win32') return;
    if (!this.window || this.window.isDestroyed()) return;
    this.window.setContentProtection(this.contentProtection);
    if (this.window.isVisible()) {
      this.window.setOpacity(1);
    }
  }
}
