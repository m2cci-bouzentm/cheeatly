import { app, BrowserWindow, shell, systemPreferences } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { AppState } from '../main';
import { SettingsService } from '../services/SettingsService';
import { safeHandle, safeOn } from './safeHandle';
import { analyzeTranscript } from '../services/question/QuestionDetectionService';

const execFileAsync = promisify(execFile);

export function registerSettingsHandlers(
  appState: AppState
): void {
  safeHandle('quit-app', () => {
    console.log('[Quit] via quit-app IPC (renderer quitApp())');
    app.quit();
  });
  safeHandle('set-undetectable', async (_event, state: boolean) => {
    appState.setUndetectable(state);
    // Return the AUTHORITATIVE final state so the renderer can reconcile / roll
    // back its optimistic toggle instead of assuming success.
    return { success: true, state: appState.getUndetectable() };
  });
  safeHandle(
    'set-disguise',
    async (_event, mode: 'terminal' | 'settings' | 'activity' | 'none') => {
      appState.setDisguise(mode);
      return { success: true };
    }
  );
  safeHandle('get-undetectable', async () => {
    return appState.getUndetectable();
  });
  safeHandle('get-disguise', async () => {
    return appState.getDisguise();
  });
  safeHandle('set-open-at-login', async (_event, openAtLogin: boolean) => {
    app.setLoginItemSettings({
      openAtLogin,
      openAsHidden: false,
      path: app.getPath('exe'),
    });
    return { success: true };
  });
  safeHandle('get-open-at-login', async () => {
    const settings = app.getLoginItemSettings();
    return settings.openAtLogin;
  });
  safeHandle('get-verbose-logging', async () => {
    return appState.getVerboseLogging();
  });
  safeHandle('set-verbose-logging', async (_event, enabled: boolean) => {
    appState.setVerboseLogging(enabled);
    return { success: true };
  });
  safeHandle('get-question-analysis-config', async () => {
    const sm = SettingsService.getInstance();
    return {
      enabled: sm.get('questionAnalysisEnabled') ?? true,
      interval: sm.get('questionAnalysisInterval') ?? 20,
      model: sm.get('questionAnalysisModel') ?? '',
      openRouterApiKey: sm.get('openRouterApiKey') ?? '',
      window: sm.get('questionAnalysisWindow') ?? 20,
    };
  });
  safeHandle(
    'set-question-analysis-config',
    async (
      _event,
      config: { enabled?: boolean; interval?: number; model?: string; openRouterApiKey?: string; window?: number }
    ) => {
      const sm = SettingsService.getInstance();
      if (typeof config.enabled === 'boolean') {
        sm.set('questionAnalysisEnabled', config.enabled);
      }
      if (typeof config.interval === 'number' && config.interval >= 5 && config.interval <= 120) {
        sm.set('questionAnalysisInterval', config.interval);
      }
      if (typeof config.model === 'string') {
        sm.set('questionAnalysisModel', config.model.trim());
      }
      if (typeof config.openRouterApiKey === 'string') {
        sm.set('openRouterApiKey', config.openRouterApiKey);
      }
      if (typeof config.window === 'number' && config.window >= 5 && config.window <= 100) {
        sm.set('questionAnalysisWindow', config.window);
      }
      BrowserWindow.getAllWindows().forEach((win) => {
        if (win.isDestroyed()) return;
        win.webContents.send('question-analysis-config-changed', {
          enabled: sm.get('questionAnalysisEnabled') ?? true,
          interval: sm.get('questionAnalysisInterval') ?? 20,
        });
      });
      return { success: true };
    }
  );
  safeHandle('analyze-transcript', async (_event, transcript: string) => {
    return analyzeTranscript(transcript);
  });
  safeHandle('get-log-file-path', async () => {
    try {
      return path.join(app.getPath('documents'), 'cheatly_debug.log');
    } catch {
      return null;
    }
  });
  safeHandle('open-log-file', async () => {
    try {
      const logPath = path.join(app.getPath('documents'), 'cheatly_debug.log');
      if (!fs.existsSync(logPath)) {
        fs.writeFileSync(logPath, '');
      }
      await shell.openPath(logPath);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });
  // Renderer log forwarding is verbose-only and treats renderer text as untrusted.
  const FORWARD_LOG_MAX_LEN = 4 * 1024;
  const FORWARD_LOG_RATE_REFILL_MS = 1_000;
  const FORWARD_LOG_RATE_BUCKET = 200;
  const _forwardLogBuckets = new Map<
    number,
    { tokens: number; lastRefill: number }
  >();
  safeOn('forward-log-to-file', (event, level: unknown, msg: unknown) => {
    if (!appState.getVerboseLogging()) return;
    if (typeof level !== 'string' || typeof msg !== 'string') return;

    const senderId = event.sender?.id ?? -1;
    const now = Date.now();
    let bucket = _forwardLogBuckets.get(senderId);
    if (!bucket) {
      bucket = { tokens: FORWARD_LOG_RATE_BUCKET, lastRefill: now };
      _forwardLogBuckets.set(senderId, bucket);
      // Renderer reloads would otherwise leak sender buckets.
      try {
        event.sender?.once?.('destroyed', () => {
          _forwardLogBuckets.delete(senderId);
        });
      } catch {
        /* noop */
      }
    }
    const elapsed = now - bucket.lastRefill;
    const refill =
      elapsed > 0
        ? Math.floor(
            (elapsed * FORWARD_LOG_RATE_BUCKET) / FORWARD_LOG_RATE_REFILL_MS
          )
        : 0;
    if (refill > 0) {
      bucket.tokens = Math.min(FORWARD_LOG_RATE_BUCKET, bucket.tokens + refill);
      bucket.lastRefill += Math.floor(
        (refill * FORWARD_LOG_RATE_REFILL_MS) / FORWARD_LOG_RATE_BUCKET
      );
    }
    if (bucket.tokens <= 0) return;
    bucket.tokens -= 1;

    const tag =
      level === 'error'
        ? '[RENDERER-ERROR]'
        : level === 'warn'
          ? '[RENDERER-WARN]'
          : '[RENDERER]';
    const sanitized = msg
      .replace(/[\r\n\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ')
      .slice(0, FORWARD_LOG_MAX_LEN);
    console.log(`${tag}[${senderId}] ${sanitized}`);
  });
  safeHandle('get-arch', async () => {
    return process.arch;
  });
  safeHandle('get-os-version', async () => {
    const platform = process.platform;
    if (platform === 'darwin') {
      const darwinMajor = parseInt(os.release().split('.')[0] || '0', 10);
      // Darwin 25+ = macOS 26+ calendar-year scheme; Darwin 20-24 = macOS 11-15.
      const macosMajor =
        darwinMajor >= 25
          ? darwinMajor + 1
          : darwinMajor >= 20
            ? darwinMajor - 9
            : null;
      return macosMajor ? `macOS ${macosMajor}` : `macOS ${os.release()}`;
    }
    if (platform === 'win32') {
      const release = os.release();
      const majorBuild = parseInt(release.split('.')[2] || '0', 10);
      return majorBuild >= 22000 ? `Windows 11` : `Windows 10`;
    }
    return os.type();
  });
  safeHandle('repair-tcc-permissions', async () => {
    if (process.platform !== 'darwin') {
      return { ok: false, error: 'TCC repair is macOS-only.' };
    }

    // Dev and packaged builds have different TCC identities.
    let bundleId: string;
    try {
      bundleId = app.isPackaged
        ? 'com.cheatly.assistant'
        : 'com.github.Electron';
    } catch {
      bundleId = 'com.cheatly.assistant';
    }

    const services = ['Microphone', 'ScreenCapture'];
    const results: Array<{ service: string; ok: boolean; output: string }> = [];

    for (const service of services) {
      try {
        // Avoid inherited PATH when resetting security permissions.
        const { stdout, stderr } = await execFileAsync(
          '/usr/bin/tccutil',
          ['reset', service, bundleId],
          {
            timeout: 5000,
          }
        );
        results.push({
          service,
          ok: true,
          output: (stdout || stderr || '').toString().trim(),
        });
        console.log(`[IPC] tccutil reset ${service} ${bundleId}: OK`);
      } catch (err: any) {
        const msg = err?.stderr?.toString?.() || err?.message || String(err);
        results.push({ service, ok: false, output: msg.trim() });
        console.warn(
          `[IPC] tccutil reset ${service} ${bundleId} failed: ${msg}`
        );
      }
    }

    const anyOk = results.some((r) => r.ok);
    return {
      ok: anyOk,
      bundleId,
      results,
      promptRelaunch: anyOk,
      message: anyOk
        ? 'Permissions reset. Quit Cheatly completely (Cmd+Q) and reopen — macOS will ask you to grant Microphone and Screen Recording again. Approve both to restore audio capture.'
        : `Permission reset failed for ${bundleId}. ${results
            .filter((r) => !r.ok)
            .map((r) => `${r.service}: ${r.output}`)
            .join('; ')}`,
    };
  });
  safeHandle('open-external', async (_event, url: string) => {
    try {
      if (typeof url !== 'string') {
        console.warn('[IPC] Blocked invalid open-external request', {
          reason: 'non-string',
        });
        return;
      }

      const parsed = new URL(url);
      const allowedWebUrl = parsed.protocol === 'https:';
      // macOS settings URLs handed to Windows shell trigger Store popups.
      const allowedSystemSettingsUrl =
        parsed.protocol === 'x-apple.systempreferences:' &&
        process.platform === 'darwin';

      if (!allowedWebUrl && !allowedSystemSettingsUrl) {
        console.warn('[IPC] Blocked open-external request', {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
        });
        return;
      }
      await shell.openExternal(url);
    } catch {
      console.warn('[IPC] Invalid URL in open-external');
    }
  });
  safeHandle('permissions:check', async () => {
    if (process.platform === 'darwin') {
      const mic = systemPreferences.getMediaAccessStatus('microphone');
      const screen = systemPreferences.getMediaAccessStatus('screen');
      return { microphone: mic, screen, platform: 'darwin' };
    }
    return {
      microphone: 'granted',
      screen: 'granted',
      platform: process.platform,
    };
  });
}
