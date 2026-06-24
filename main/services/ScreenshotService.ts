import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { app, desktopCapturer, systemPreferences } from 'electron';

export class ScreenshotService {
  private queue: string[] = [];
  private screenshotDir: string;

  constructor() {
    this.screenshotDir = path.join(app.getPath('temp'), 'cheatly-screenshots');
    fs.mkdirSync(this.screenshotDir, { recursive: true });
  }

  public getQueue(): string[] {
    return this.queue;
  }

  public clear(): void {
    this.queue = [];
  }

  public async delete(
    pathToDelete: string
  ): Promise<{ success: boolean; error?: string }> {
    this.queue = this.queue.filter((item) => item !== pathToDelete);
    try {
      if (fs.existsSync(pathToDelete)) fs.unlinkSync(pathToDelete);
    } catch {}
    return { success: true };
  }

  public async take(_restoreFocus: boolean = true): Promise<string> {
    if (process.platform === 'darwin' && app.isPackaged) {
      const status = systemPreferences.getMediaAccessStatus('screen');
      if (status === 'denied' || status === 'restricted') {
        throw new Error(
          'Screen Recording permission is denied. Enable it in System Settings > Privacy & Security > Screen Recording, then restart Cheatly.'
        );
      }
    }

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    });

    if (sources.length === 0) {
      throw new Error('No screen sources available for capture');
    }

    const source = sources[0];
    const pngBuffer = source.thumbnail.toPNG();
    const filename = `screenshot-${crypto.randomUUID()}.png`;
    const filepath = path.join(this.screenshotDir, filename);
    fs.writeFileSync(filepath, pngBuffer);
    this.queue.push(filepath);
    return filepath;
  }

  public async getPreview(filepath: string): Promise<string> {
    if (!fs.existsSync(filepath)) {
      throw new Error(`Screenshot not found: ${filepath}`);
    }
    const buffer = fs.readFileSync(filepath);
    return `data:image/png;base64,${buffer.toString('base64')}`;
  }
}
