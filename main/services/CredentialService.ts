import { app, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';

const CREDENTIALS_PATH = path.join(app.getPath('userData'), 'credentials.enc');

export type SttProviderId = 'none' | 'local-parakeet';

export interface StoredCredentials {
  openRouterApiKey?: string;
  defaultModel?: string;
  sttProvider?: SttProviderId;
  sttLanguage?: string;
}

export class CredentialService {
  private static instance: CredentialService;
  private credentials: StoredCredentials = {};

  private constructor() {}

  public static getInstance(): CredentialService {
    if (!CredentialService.instance) {
      CredentialService.instance = new CredentialService();
    }
    return CredentialService.instance;
  }

  public init(): void {
    this.loadCredentials();
    console.log('[CredentialService] Initialized');
  }

  public getOpenRouterApiKey(): string | undefined {
    return (
      this.credentials.openRouterApiKey ||
      process.env.OPENROUTER_API_KEY
    );
  }

  public getSttProvider(): SttProviderId {
    const provider = this.credentials.sttProvider || 'local-parakeet';
    const allowed = new Set<SttProviderId>(['none', 'local-parakeet']);
    if (!allowed.has(provider as SttProviderId)) {
      this.credentials.sttProvider = 'local-parakeet';
      this.saveCredentials();
      return 'none';
    }
    return provider;
  }

  public getSttLanguage(): string {
    return this.credentials.sttLanguage || 'auto';
  }


  public getDefaultModel(): string {
    return this.credentials.defaultModel || 'openai/gpt-oss-120b';
  }

  public getAllCredentials(): StoredCredentials {
    return { ...this.credentials };
  }

  public anyVisionProviderConfigured(): boolean {
    return !!this.credentials.openRouterApiKey;
  }

  public anyLocalVisionProviderConfigured(): boolean {
    return false;
  }

  public setOpenRouterApiKey(key: string): void {
    this.credentials.openRouterApiKey = key.trim() || undefined;
    this.saveCredentials();
    console.log('[CredentialService] OpenRouter API Key updated');
  }

  public setSttProvider(provider: SttProviderId): void {
    this.credentials.sttProvider = provider;
    this.saveCredentials();
    console.log(`[CredentialService] STT Provider set to: ${provider}`);
  }

  public setSttLanguage(language: string): void {
    this.credentials.sttLanguage = language;
    this.saveCredentials();
    console.log(`[CredentialService] STT Language set to: ${language}`);
  }


  public setDefaultModel(model: string): void {
    this.credentials.defaultModel = model;
    this.saveCredentials();
    console.log(`[CredentialService] Default Model set to: ${model}`);
  }

  public resolveLlmCredentials(): {
    provider: string;
    apiKey: string;
    model?: string;
  } {
    const key = this.getOpenRouterApiKey();
    if (key) {
      return {
        provider: 'openrouter',
        apiKey: key,
        model: this.getDefaultModel(),
      };
    }
    throw new Error(
      'No LLM provider configured. Set an OpenRouter API key first.'
    );
  }

  public clearAll(): void {
    this.credentials = {};
    if (fs.existsSync(CREDENTIALS_PATH)) {
      fs.unlinkSync(CREDENTIALS_PATH);
    }
    const plaintextPath = CREDENTIALS_PATH + '.json';
    if (fs.existsSync(plaintextPath)) {
      fs.unlinkSync(plaintextPath);
    }
    console.log('[CredentialService] All credentials cleared');
  }

  private saveCredentials(): void {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        console.warn(
          '[CredentialService] Encryption not available; credentials kept in memory only'
        );
        return;
      }

      const data = JSON.stringify(this.credentials);
      const encrypted = safeStorage.encryptString(data);
      const tmpEnc = CREDENTIALS_PATH + '.tmp';
      fs.writeFileSync(tmpEnc, encrypted);
      fs.renameSync(tmpEnc, CREDENTIALS_PATH);
    } catch (error) {
      console.error('[CredentialService] Failed to save credentials:', error);
    }
  }

  private backupUnreadableFile(reason: string): void {
    try {
      const backupPath = `${CREDENTIALS_PATH}.bak-${Date.now()}`;
      fs.copyFileSync(CREDENTIALS_PATH, backupPath);
      console.warn(
        `[CredentialService] ${reason} — backed up to ${backupPath}`
      );
    } catch (backupErr) {
      console.error(
        '[CredentialService] Failed to back up unreadable credentials file:',
        backupErr
      );
    }
  }

  private loadEncryptedCredentials(): boolean {
    if (!fs.existsSync(CREDENTIALS_PATH)) return false;
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn('[CredentialService] Encryption not available for load');
      return true;
    }

    const encrypted = fs.readFileSync(CREDENTIALS_PATH);
    const decrypted = safeStorage.decryptString(encrypted);
    try {
      const parsed = JSON.parse(decrypted);
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Decrypted credentials is not a valid object');
      }
      this.credentials = parsed;
      console.log('[CredentialService] Loaded encrypted credentials');
    } catch (parseError) {
      console.error(
        '[CredentialService] Failed to parse decrypted credentials — file may be corrupted. Starting fresh:',
        parseError
      );
      this.backupUnreadableFile('Unparseable credentials');
      this.credentials = {};
    }

    const plaintextPath = CREDENTIALS_PATH + '.json';
    if (!fs.existsSync(plaintextPath)) return true;
    try {
      fs.unlinkSync(plaintextPath);
      console.log(
        '[CredentialService] Removed stale plaintext credential file'
      );
    } catch (cleanupErr) {
      console.warn(
        '[CredentialService] Could not remove stale plaintext file:',
        cleanupErr
      );
    }
    return true;
  }

  private loadCredentials(): void {
    try {
      if (this.loadEncryptedCredentials()) return;

      const plaintextPath = CREDENTIALS_PATH + '.json';
      if (fs.existsSync(plaintextPath)) {
        try {
          fs.unlinkSync(plaintextPath);
          console.log('[CredentialService] Removed plaintext credential file');
        } catch (cleanupErr) {
          console.warn(
            '[CredentialService] Could not remove plaintext credential file:',
            cleanupErr
          );
        }
      }

      console.log('[CredentialService] No stored credentials found');
    } catch (error) {
      console.error('[CredentialService] Failed to load credentials:', error);
      if (fs.existsSync(CREDENTIALS_PATH)) {
        this.backupUnreadableFile(
          'Undecryptable credentials (different app identity?)'
        );
      }
      this.credentials = {};
    }
  }
}
