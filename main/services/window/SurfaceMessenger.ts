import { BrowserWindow } from 'electron';
import { WindowService } from './WindowService';
import { SettingsWindowService } from './SettingsWindowService';

// Dedupes overlapping surfaces and ignores quit-time destroyed-window races.
export class SurfaceMessenger {
  constructor(
    private readonly windowHelper: WindowService,
    private readonly settingsWindowHelper: SettingsWindowService
  ) {}

  public sendToWindow(
    win: BrowserWindow | null | undefined,
    channel: string,
    ...args: any[]
  ): boolean {
    if (!win || win.isDestroyed()) return false;
    try {
      win.webContents.send(channel, ...args);
      return true;
    } catch {
      return false;
    }
  }

  public sendToMeetingSurfaces(channel: string, ...args: any[]): void {
    this.sendOnceEach(
      [
        this.windowHelper.getLauncherWindow(),
        this.windowHelper.getOverlayWindow(),
      ],
      channel,
      args
    );
  }

  public sendToSettingsSurfaces(channel: string, ...args: any[]): void {
    this.sendOnceEach(
      [
        this.settingsWindowHelper.getSettingsWindow(),
        this.windowHelper.getLauncherWindow(),
      ],
      channel,
      args
    );
  }

  public broadcast(channel: string, ...args: any[]): void {
    BrowserWindow.getAllWindows().forEach((win) =>
      this.sendToWindow(win, channel, ...args)
    );
  }

  private sendOnceEach(
    wins: Array<BrowserWindow | null | undefined>,
    channel: string,
    args: any[]
  ): void {
    const sent = new Set<number>();
    for (const win of wins) {
      if (!win || sent.has(win.id)) continue;
      if (this.sendToWindow(win, channel, ...args)) sent.add(win.id);
    }
  }
}
