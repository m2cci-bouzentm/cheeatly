import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
export interface TrayControl {
  hideTray(): void;
  showTray(): void;
}

// Injected capabilities keep tray actions decoupled from AppState.
export interface TrayDeps {
  centerAndShowWindow(): void;
  toggleMainWindow(): void;
  takeScreenshot(): Promise<string>;
  getImagePreview(filepath: string): Promise<string>;
  getActiveWindow(): BrowserWindow | null;
  getKeybind(actionId: string): string | undefined;
}

export class TrayService implements TrayControl {
  private tray: Tray | null = null;

  constructor(private readonly deps: TrayDeps) {}

  public showTray(): void {
    if (this.tray) return;
    const trayIcon = nativeImage
      .createFromPath(this.resolveIconPath())
      .resize({ width: 16, height: 16 });
    trayIcon.setTemplateImage(this.resolveIconPath().endsWith('Template.png'));
    this.tray = new Tray(trayIcon);
    this.tray.setToolTip('Cheatly');
    this.updateMenu();
    this.tray.on('double-click', () => this.deps.centerAndShowWindow());
  }

  public hideTray(): void {
    if (!this.tray) return;
    this.tray.destroy();
    this.tray = null;
  }

  public updateMenu(): void {
    if (!this.tray) return;
    const screenshotAccel =
      this.deps.getKeybind('general:take-screenshot') || 'CommandOrControl+H';
    const toggleAccel =
      this.deps.getKeybind('general:toggle-visibility') || 'CommandOrControl+B';
    this.tray.setToolTip('Cheatly');
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: 'Show Cheatly',
          click: () => this.deps.centerAndShowWindow(),
        },
        {
          label: `Toggle Window (${formatAccel(toggleAccel)})`,
          click: () => this.deps.toggleMainWindow(),
        },
        { type: 'separator' },
        {
          label: `Take Screenshot (${formatAccel(screenshotAccel)})`,
          accelerator: screenshotAccel,
          click: () => this.sendTrayScreenshot(),
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'Command+Q',
          click: () => {
            console.log('[Quit] via tray menu / Cmd+Q');
            app.quit();
          },
        },
      ])
    );
  }

  private async sendTrayScreenshot(): Promise<void> {
    try {
      const screenshotPath = await this.deps.takeScreenshot();
      const preview = await this.deps.getImagePreview(screenshotPath);
      this.deps.getActiveWindow()?.webContents.send('screenshot-taken', {
        path: screenshotPath,
        preview,
      });
    } catch (error) {
      console.error('Error taking screenshot from tray:', error);
    }
  }

  private resolveIconPath(): string {
    const resourcesPath = app.isPackaged
      ? process.resourcesPath
      : app.getAppPath();
    const templatePath = path.join(resourcesPath, 'assets', 'iconTemplate.png');
    if (fs.existsSync(templatePath)) return templatePath;
    const devTemplatePath = path.join(
      app.getAppPath(),
      'src/components/iconTemplate.png'
    );
    if (fs.existsSync(devTemplatePath)) return devTemplatePath;
    return app.isPackaged
      ? path.join(resourcesPath, 'src/components/icon.png')
      : path.join(app.getAppPath(), 'src/components/icon.png');
  }
}

function formatAccel(accel: string): string {
  return accel
    .replace('CommandOrControl', 'Cmd')
    .replace('Command', 'Cmd')
    .replace('Control', 'Ctrl')
    .replace('OrControl', '');
}
