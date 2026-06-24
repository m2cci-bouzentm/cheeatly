import { BrowserWindow } from 'electron';
import type { AppState } from '../main';
import { safeHandle } from './safeHandle';

export function registerWindowHandlers(
  appState: AppState
): void {
  safeHandle(
    'update-content-dimensions',
    async (event, { width, height }: { width: number; height: number }) => {
      if (!width || !height) return;

      const senderWebContents = event.sender;
      const settingsWin = appState.settingsWindowHelper.getSettingsWindow();
      const overlayWin = appState.getWindowHelper().getOverlayWindow();
      const launcherWin = appState.getWindowHelper().getLauncherWindow();

      if (
        settingsWin &&
        !settingsWin.isDestroyed() &&
        settingsWin.webContents.id === senderWebContents.id
      ) {
        appState.settingsWindowHelper.setWindowDimensions(
          settingsWin,
          width,
          height
        );
        return;
      }
      if (
        overlayWin &&
        !overlayWin.isDestroyed() &&
        overlayWin.webContents.id === senderWebContents.id
      ) {
        appState.getWindowHelper().setOverlayDimensions(width, height);
        return;
      }
      if (
        launcherWin &&
        !launcherWin.isDestroyed() &&
        launcherWin.webContents.id === senderWebContents.id
      ) {
        // Launcher has fixed dimensions — log instead of resizing so a launcher
        // resize request is visible in logs rather than silently dropped.
        console.log(
          `[IPC] update-content-dimensions: launcher window resize request ${width}x${height} (ignored — launcher has fixed dimensions)`
        );
      }
    }
  );
  safeHandle(
    'update-content-dimensions-centered',
    async (event, { width, height }: { width: number; height: number }) => {
      if (!width || !height) return;
      const senderWebContents = event.sender;
      const overlayWin = appState.getWindowHelper().getOverlayWindow();
      if (
        overlayWin &&
        !overlayWin.isDestroyed() &&
        overlayWin.webContents.id === senderWebContents.id
      ) {
        appState.getWindowHelper().setOverlayDimensionsCentered(width, height);
      }
    }
  );
  safeHandle(
    'set-window-mode',
    async (_event, mode: 'launcher' | 'overlay', inactive?: boolean) => {
      appState.getWindowHelper().setWindowMode(mode, inactive);
      return { success: true };
    }
  );
  safeHandle('toggle-window', async () => {
    appState.toggleMainWindow();
  });
  safeHandle('show-window', async (_event, inactive?: boolean) => {
    // Default show main window (Launcher usually)
    appState.showMainWindow(inactive);
  });
  safeHandle('hide-window', async () => {
    appState.hideMainWindow();
  });
  safeHandle('show-overlay', async () => {
    appState.getWindowHelper().showOverlay();
  });
  safeHandle('hide-overlay', async () => {
    appState.getWindowHelper().hideOverlay();
  });
  safeHandle('move-window-left', async () => {
    appState.moveWindowLeft();
  });
  safeHandle('move-window-right', async () => {
    appState.moveWindowRight();
  });
  safeHandle('move-window-up', async () => {
    appState.moveWindowUp();
  });
  safeHandle('move-window-down', async () => {
    appState.moveWindowDown();
  });
  safeHandle('center-and-show-window', async () => {
    appState.centerAndShowWindow();
  });
  safeHandle('window-minimize', async () => {
    appState.getWindowHelper().minimizeWindow();
  });
  safeHandle('window-maximize', async () => {
    appState.getWindowHelper().maximizeWindow();
  });
  safeHandle('window-close', async () => {
    appState.getWindowHelper().closeWindow();
  });
  safeHandle('window-is-maximized', async () => {
    return appState.getWindowHelper().isMainWindowMaximized();
  });
  safeHandle('toggle-settings-window', (_event, { x, y } = {}) => {
    appState.settingsWindowHelper.toggleWindow(x, y);
  });
  safeHandle('settings:open-tab', (_event, tab: string) => {
    const launcherWin = appState.getWindowHelper().getLauncherWindow();
    if (!launcherWin || launcherWin.isDestroyed()) return;
    launcherWin.webContents.send('settings:open-tab', tab);
    if (appState.getUndetectable()) {
      launcherWin.showInactive();
      return;
    }
    launcherWin.show();
    launcherWin.focus();
  });
  safeHandle('close-settings-window', () => {
    appState.settingsWindowHelper.closeWindow();
  });
  safeHandle(
    'show-model-selector',
    (_event, coords: { x: number; y: number; activate?: boolean }) => {
      appState.modelSelectorWindowHelper.showWindow(coords.x, coords.y, {
        activate: coords.activate,
      });
    }
  );
  safeHandle('hide-model-selector', () => {
    appState.modelSelectorWindowHelper.hideWindow();
  });
  safeHandle(
    'toggle-model-selector',
    (_event, coords: { x: number; y: number; activate?: boolean }) => {
      appState.modelSelectorWindowHelper.toggleWindow(coords.x, coords.y, {
        activate: coords.activate,
      });
    }
  );
  safeHandle('model-selector:close-if-open', () => {
    const win = appState.modelSelectorWindowHelper.getWindow();
    if (win && !win.isDestroyed() && win.isVisible()) {
      appState.modelSelectorWindowHelper.hideWindow();
    }
  });
  safeHandle('set-overlay-opacity', async (_event, opacity: number) => {
    const clamped = Math.min(1.0, Math.max(0.35, opacity));
    // Broadcast to all renderer windows so the overlay picks it up in real-time
    BrowserWindow.getAllWindows().forEach((win) => {
      if (win.isDestroyed()) return;
      win.webContents.send('overlay-opacity-changed', clamped);
    });
    return;
  });
}
