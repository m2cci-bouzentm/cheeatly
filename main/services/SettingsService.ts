import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { setVerboseLoggingFlag } from '../utils/logger';

export interface AppSettings {
  // Only boot-critical or non-encrypted settings should live here.
  isUndetectable?: boolean;
  disguiseMode?: 'terminal' | 'settings' | 'activity' | 'none';
  verboseLogging?: boolean;
  parakeetModel?: string;
  parakeetLanguage?: string;
  questionAnalysisEnabled?: boolean;
  questionAnalysisInterval?: number;
  questionAnalysisModel?: string;
  questionAnalysisWindow?: number;
  openRouterApiKey?: string;
}

export class SettingsService {
  private static instance: SettingsService;
  private settings: AppSettings = {};
  private settingsPath: string;

  private constructor() {
    if (!app.isReady()) {
      throw new Error(
        '[SettingsService] Cannot initialize before app.whenReady()'
      );
    }
    this.settingsPath = path.join(app.getPath('userData'), 'settings.json');
    this.loadSettings();
  }

  public static getInstance(): SettingsService {
    if (!SettingsService.instance) {
      SettingsService.instance = new SettingsService();
    }
    return SettingsService.instance;
  }

  public get<K extends keyof AppSettings>(key: K): AppSettings[K] {
    return this.settings[key];
  }

  public set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    this.settings[key] = value;
    this.saveSettings();
  }

  public getVerboseLogging(): boolean {
    return this.settings.verboseLogging ?? false;
  }

  public setVerboseLogging(enabled: boolean): void {
    this.settings.verboseLogging = enabled;
    setVerboseLoggingFlag(enabled);
    this.saveSettings();
  }

  private loadSettings(): void {
    try {
      if (!fs.existsSync(this.settingsPath)) return;
      const data = fs.readFileSync(this.settingsPath, 'utf8');
      try {
        const parsed = JSON.parse(data);
        if (typeof parsed !== 'object' || parsed === null) {
          throw new Error('Settings JSON is not a valid object');
        }
        this.settings = parsed;
        console.log('[SettingsService] Settings loaded successfully', {
          keys: Object.keys(this.settings).length,
        });
      } catch (parseError) {
        console.error(
          '[SettingsService] Failed to parse settings.json. Continuing with empty settings. Error:',
          parseError
        );
        this.settings = {};
      }
      console.log('[SettingsService] Settings loaded');
    } catch (e) {
      console.error('[SettingsService] Failed to read settings file:', e);
      this.settings = {};
    }
  }
  private saveSettings(): void {
    try {
      const tmpPath = this.settingsPath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(this.settings, null, 2));
      fs.renameSync(tmpPath, this.settingsPath);
    } catch (e) {
      console.error('[SettingsService] Failed to save settings:', e);
    }
  }
}
