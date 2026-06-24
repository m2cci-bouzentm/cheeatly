import { app, BrowserWindow } from 'electron';
import { spawn } from 'child_process';
import * as nodePath from 'path';
import { AudioDevices } from '../services/audio/native/AudioDevices';
import { RECOGNITION_LANGUAGES } from '../utils/languages';
import { CredentialService } from '../services/CredentialService';
import type { AppState } from '../main';
import { SettingsService } from '../services/SettingsService';
import { safeHandle } from './safeHandle';

export function registerAudioHandlers(
  appState: AppState
): void {
  safeHandle('get-recognition-languages', async () => {
    return RECOGNITION_LANGUAGES;
  });
  safeHandle('get-stt-language', async () => {
    return CredentialService.getInstance().getSttLanguage();
  });
  safeHandle(
    'set-stt-provider',
    async (_event, provider: 'none' | 'local-parakeet') => {
      try {
        CredentialService.getInstance().setSttProvider(provider);

        await appState.reconfigureSttProvider();

        // Notify all windows so the settings UI reflects the change immediately
        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) win.webContents.send('credentials-changed');
        });

        return { success: true };
      } catch (error: any) {
        console.error('Error setting STT provider:', error);
        return { success: false, error: error.message };
      }
    }
  );

  safeHandle('get-stt-provider', async () => {
    try {
      return CredentialService.getInstance().getSttProvider();
    } catch (error: any) {
      return 'none';
    }
  });
  safeHandle(
    'set-channel-muted',
    async (_event, channel: 'mic' | 'system', muted: boolean) => {
      try {
        if (channel === 'mic') {
          appState.setMicMuted(muted);
        }
        if (channel === 'system') {
          appState.setSystemMuted(muted);
        }
        return { success: true };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }
  );
  safeHandle('local-parakeet-get-config', async () => {
    const sm = SettingsService.getInstance();
    return {
      modelId: sm.get('parakeetModel') ?? 'parakeet-tdt-0.6b-v3',
      language: sm.get('parakeetLanguage') ?? 'auto',
    };
  });
  safeHandle(
    'local-parakeet-set-config',
    async (_event, cfg: { modelId?: string; language?: string }) => {
      try {
        const sm = SettingsService.getInstance();
        if (typeof cfg?.modelId === 'string')
          sm.set('parakeetModel', cfg.modelId);
        if (typeof cfg?.language === 'string')
          sm.set('parakeetLanguage', cfg.language);
        return { success: true };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }
  );
  safeHandle(
    'local-parakeet-download-model',
    async (event, modelId: string) => {
      try {

        let binPath = process.env.SPEECH_TO_TEXT_BINARY?.trim();
        if (!binPath) {
          binPath = app.isPackaged
            ? nodePath.join(
                process.resourcesPath,
                'local-stt-engine',
                'speech-to-text'
              )
            : nodePath.join(
                app.getAppPath(),
                'local-stt-engine',
                '.build',
                'release',
                'speech-to-text'
              );
        }

        const child = spawn(binPath, [
          'download-model',
          '--model',
          modelId || 'parakeet-tdt-0.6b-v3',
        ]);
        const sender = event.sender;
        let stdoutBuf = '';

        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
          stdoutBuf += chunk;
          let nl;
          while ((nl = stdoutBuf.indexOf('\n')) >= 0) {
            const line = stdoutBuf.slice(0, nl).trim();
            stdoutBuf = stdoutBuf.slice(nl + 1);
            if (!line) continue;
            try {
              const evt = JSON.parse(line);
              if (sender.isDestroyed()) return;
              if (evt.type === 'status') {
                sender.send('local-parakeet-download-status', {
                  modelId,
                  message: evt.message,
                });
              }
            } catch {}
          }
        });

        child.on('exit', (code: number) => {
          if (sender.isDestroyed()) return;
          if (code === 0) {
            sender.send('local-parakeet-download-complete', { modelId });
            return;
          }
          sender.send('local-parakeet-download-error', {
            modelId,
            error: `exit code ${code}`,
          });
        });

        child.on('error', (err: Error) => {
          if (sender.isDestroyed()) return;
          sender.send('local-parakeet-download-error', {
            modelId,
            error: err.message,
          });
        });

        return { success: true };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }
  );
  safeHandle('native-audio-status', async () => {
    // Always return true or pseudo-status since it's "driverless"
    return { connected: true };
  });
  safeHandle('get-input-devices', async () => {
    return AudioDevices.getInputDevices();
  });
  safeHandle('get-output-devices', async () => {
    return AudioDevices.getOutputDevices();
  });
  safeHandle('start-audio-test', async (_event, deviceId?: string) => {
    await appState.startAudioTest(deviceId);
    return { success: true };
  });
  safeHandle('stop-audio-test', async () => {
    await appState.stopAudioTest();
    return { success: true };
  });
  safeHandle('set-recognition-language', async (_event, key: string) => {
    appState.setRecognitionLanguage(key);
    return { success: true };
  });
}
