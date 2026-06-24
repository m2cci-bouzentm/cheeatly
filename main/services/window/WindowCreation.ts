import { app, BrowserWindow, screen } from 'electron';
import path from 'node:path';
import type { AppState } from '../../main';

export interface WindowCreationHost {
  launcherWindow: BrowserWindow | null;
  overlayWindow: BrowserWindow | null;
  isWindowVisible: boolean;
  appState: AppState;
  contentProtection: boolean;
  switchToLauncher(inactive?: boolean): void;
  setupWindowListeners(): void;
}

interface WindowCreationConfig {
  isDev: boolean;
  startUrl: string;
  overlayDefaultWidth: number;
  overlayDefaultTopRatio: number;
}

export function createWindows(
  this: WindowCreationHost,
  config: WindowCreationConfig
): void {
  const { isDev, startUrl, overlayDefaultWidth, overlayDefaultTopRatio } =
    config;

  if (this.launcherWindow !== null) return;

  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;

  const width = 1200;
  const height = 800;

  const x = Math.round(workArea.x + (workArea.width - width) / 2);
  const topMargin = Math.round(workArea.height * 0.05);
  const y = Math.round(workArea.y + topMargin);

  const isMac = process.platform === 'darwin';

  const launcherSettings: Electron.BrowserWindowConstructorOptions = {
    width: width,
    height: height,
    x: x,
    y: y,
    minWidth: 600,
    minHeight: 400,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      scrollBounce: true,
      webSecurity: !isDev,
    },
    show: false,
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 14, y: 14 },
        }
      : { frame: false, titleBarOverlay: false, autoHideMenuBar: true }),
    ...(isMac
      ? {
          vibrancy: 'under-window' as const,
          visualEffectState: 'followWindow' as const,
        }
      : {}),
    transparent: isMac,
    hasShadow: true,
    backgroundColor: isMac ? '#00000000' : '#000000',
    focusable: true,
    resizable: true,
    movable: true,
    center: true,
    icon: (() => {
      const isMac = process.platform === 'darwin';
      const isWin = process.platform === 'win32';
      const mode = this.appState.getDisguise();

      if (mode === 'none' && isMac) {
        return app.isPackaged
          ? path.join(process.resourcesPath, 'cheatly.icns')
          : path.resolve(__dirname, '../../assets/cheatly.icns');
      }
      if (mode === 'none' && isWin) {
        return app.isPackaged
          ? path.join(process.resourcesPath, 'assets/icons/win/icon.ico')
          : path.resolve(__dirname, '../../assets/icons/win/icon.ico');
      }
      if (mode === 'none') {
        return app.isPackaged
          ? path.join(process.resourcesPath, 'icon.png')
          : path.resolve(__dirname, '../../assets/icon.png');
      }

      let iconName = 'terminal.png';
      if (mode === 'settings') iconName = 'settings.png';
      if (mode === 'activity') iconName = 'activity.png';

      const platformDir = isWin ? 'win' : 'mac';
      return app.isPackaged
        ? path.join(
            process.resourcesPath,
            `assets/fakeicon/${platformDir}/${iconName}`
          )
        : path.resolve(
            __dirname,
            `../../assets/fakeicon/${platformDir}/${iconName}`
          );
    })(),
  };

  console.log(`[WindowHelper] Icon Path: ${launcherSettings.icon}`);
  console.log(`[WindowHelper] Start URL: ${startUrl}`);

  try {
    this.launcherWindow = new BrowserWindow(launcherSettings);
    console.log('[WindowHelper] BrowserWindow created successfully');
  } catch (err) {
    console.error('[WindowHelper] Failed to create BrowserWindow:', err);
    return;
  }

  this.launcherWindow.setContentProtection(this.contentProtection);

  this.launcherWindow
    .loadURL(`${startUrl}?window=launcher`)
    .then(() => console.log('[WindowHelper] loadURL success'))
    .catch((e) => {
      console.error('[WindowHelper] Failed to load URL:', e);
    });

  this.launcherWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription) => {
      console.error(
        `[WindowHelper] did-fail-load: ${errorCode} ${errorDescription}`
      );
    }
  );

  // Explicit constructor bounds prevent macOS NSUserDefaults / Windows DWM from
  // restoring a stale overlay position before our in-memory centering logic runs.
  const overlayDefaultX = Math.floor(
    workArea.x + (workArea.width - overlayDefaultWidth) / 2
  );
  const overlayDefaultY = Math.floor(
    workArea.y + workArea.height * overlayDefaultTopRatio
  );

  const overlaySettings: Electron.BrowserWindowConstructorOptions = {
    width: overlayDefaultWidth,
    height: 1,
    x: overlayDefaultX,
    y: overlayDefaultY,
    minWidth: 300,
    minHeight: 1,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      scrollBounce: true,
    },
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    focusable: true,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    hasShadow: false,
    // NSPanel lets chat input receive keys without activating Cheatly in the
    // dock/menu bar/screen-share; Windows/Linux keep a regular focusable window.
    ...(isMac ? { type: 'panel' as const } : {}),
  };

  this.overlayWindow = new BrowserWindow(overlaySettings);
  this.overlayWindow.setContentProtection(this.contentProtection);

  // Captured CGEventTap keys must target only the overlay; broadcasting them to
  // settings windows would leak user keystrokes across surfaces.
  if (process.platform === 'darwin') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { StealthKeyboardService } = require('../stealth/StealthKeyboardService');
      StealthKeyboardService.getInstance().setOverlayWindow(this.overlayWindow);
    } catch (e) {
      console.error(
        '[WindowHelper] failed to register overlay with StealthKeyboardManager:',
        e
      );
    }
  }

  if (process.platform === 'darwin') {
    this.overlayWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
    });
    this.overlayWindow.setHiddenInMissionControl(true);
    this.overlayWindow.setAlwaysOnTop(true, 'floating');

    // NSPanel attributes must wait for NSWindow attachment to preserve stealth focus.
    this.overlayWindow.once('ready-to-show', () => {
      if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return;
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const {
          loadNativeModule,
        } = require('../audio/native/nativeModuleLoader');
        const native = loadNativeModule();
        if (native && typeof native.applyStealthToWindow === 'function') {
          native.applyStealthToWindow(
            this.overlayWindow.getNativeWindowHandle()
          );
          console.log(
            '[WindowHelper] Applied stealth NSPanel attributes to overlay'
          );
          return;
        }
        console.warn(
          '[WindowHelper] applyStealthToWindow unavailable — rebuild native module (npm run build:native) for full stealth'
        );
      } catch (e) {
        console.error('[WindowHelper] Failed to apply stealth attributes:', e);
      }
    });
  }
  if (process.platform === 'win32') {
    // F11 browser fullscreen windows outrank the normal floating TOPMOST level;
    // screen-saver is the Windows equivalent of macOS visibleOnFullScreen here.
    this.overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  }

  this.overlayWindow.loadURL(`${startUrl}?window=overlay`).catch((e) => {
    console.error('[WindowHelper] Failed to load Overlay URL:', e);
  });

  this.launcherWindow.once('ready-to-show', () => {
    this.switchToLauncher();
    this.isWindowVisible = true;
  });

  this.setupWindowListeners();
}
