import { app, BrowserWindow } from 'electron';
import { WindowService } from '../window/WindowService';

// Table-driven dispatch keeps shortcut additions to one row.
export interface ShortcutDeps {
  windowHelper: WindowService;
  toggleMainWindow(): void;
  showMainWindow(inactive?: boolean): void;
  takeScreenshot(restoreFocus?: boolean): Promise<string>;
  getImagePreview(filepath: string): Promise<string>;
  getActiveWindow(): BrowserWindow | null;
  getUndetectable(): boolean;
  sendToMeetingSurfaces(channel: string, payload: unknown): void;
}

// chat ids forwarded to the meeting surfaces verbatim (renderer handles them)
const FORWARDED_CHAT_ACTIONS: Record<string, string> = {
  'chat:whatToAnswer': 'whatToAnswer',
  'chat:clarify': 'clarify',
  'chat:followUp': 'followUp',
  'chat:dynamicAction4': 'dynamicAction4',
  'chat:scrollUp': 'scrollUp',
  'chat:scrollDown': 'scrollDown',
  'chat:scrollLeft': 'scrollLeft',
  'chat:scrollRight': 'scrollRight',
};

export class ShortcutRouter {
  constructor(private readonly deps: ShortcutDeps) {}

  public async handle(actionId: string): Promise<void> {
    console.log(`[Main] Global shortcut triggered: ${actionId}`);
    try {
      await this.dispatch(actionId);
    } catch (e: any) {
      if (e.message === 'Selection cancelled') return;
      if (e.message === 'Screenshot capture already in progress') return;
      console.error(`[Main] Error handling global shortcut ${actionId}:`, e);
    }
  }

  private async dispatch(actionId: string): Promise<void> {
    const forwarded = FORWARDED_CHAT_ACTIONS[actionId];
    if (forwarded) {
      this.deps.sendToMeetingSurfaces('global-shortcut', { action: forwarded });
      return;
    }

    switch (actionId) {
      case 'general:toggle-visibility':
        this.deps.toggleMainWindow();
        return;
      case 'general:take-screenshot':
        this.sendToMainWindow('global-shortcut', { action: 'takeScreenshot' });
        return;
      case 'general:capture-and-process':
        await this.captureAndProcess();
        return;
      case 'chat:focusInput':
        this.focusChatInput();
        return;
      case 'window:move-up':
        this.deps.windowHelper.moveWindowUp();
        return;
      case 'window:move-down':
        this.deps.windowHelper.moveWindowDown();
        return;
      case 'window:move-left':
        this.deps.windowHelper.moveWindowLeft();
        return;
      case 'window:move-right':
        this.deps.windowHelper.moveWindowRight();
        return;
      case 'general:process-screenshots':
        this.deps.sendToMeetingSurfaces('global-shortcut', {
          action: 'processScreenshots',
        });
        return;
      case 'general:reset-cancel':
        this.deps.sendToMeetingSurfaces('global-shortcut', {
          action: 'resetCancel',
        });
        return;
    }
  }

  private sendToMainWindow(channel: string, payload: unknown): void {
    const win = this.deps.getActiveWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents.send(channel, payload);
  }

  private async captureAndProcess(): Promise<void> {
    const screenshotPath = await this.deps.takeScreenshot(false);
    const preview = await this.deps.getImagePreview(screenshotPath);
    this.deps.showMainWindow(true);
    if (process.platform === 'darwin' && this.deps.getUndetectable()) {
      app.dock.hide();
    }
    this.sendToMainWindow('capture-and-process', {
      path: screenshotPath,
      preview,
    });
  }

  private focusChatInput(): void {
    this.deps.showMainWindow(true);
    const overlay = this.deps.windowHelper.getOverlayWindow();
    if (overlay && !overlay.isDestroyed()) {
      overlay.webContents.send('ensure-expanded');
    }
    const stealthKeyboardManager =
      process.platform === 'darwin'
        ? require('../stealth/StealthKeyboardService').StealthKeyboardService.getInstance()
        : null;
    if (stealthKeyboardManager?.isAvailable()) {
      stealthKeyboardManager.toggle();
      return;
    }
    if (!overlay || overlay.isDestroyed()) return;
    overlay.webContents.send('global-shortcut', { action: 'focusInput' });
    overlay.focus();
  }
}
