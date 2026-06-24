import type { AudioService } from './AudioService';
import { LocalParakeetSTT } from './native/LocalParakeetSTT';
import { SettingsService } from '../../services/SettingsService';
function extractHttpError(err: unknown): string {
  const e = err as any;
  const status: number = e?.response?.status || 0;
  const data = e?.response?.data;
  if (data?.error) {
    const respErr = data.error;
    const msg = typeof respErr === 'string' ? respErr : respErr.message || respErr.code || JSON.stringify(respErr);
    return status ? `${status} ${msg}` : msg;
  }
  if (status) return `${status} ${e.response.statusText}`;
  return e?.message || 'Unknown error';
}

type STTProvider = LocalParakeetSTT & {
  finalize?: () => void;
  setAudioChannelCount?: (count: number) => void;
  notifySpeechEnded?: () => void;
};
interface SttStatusPayload {
  state: 'connected' | 'reconnecting' | 'failed' | 'awaiting-audio';
  provider: string;
  error?: string;
  channel: 'user' | 'interviewer';
  reconnectAttempts?: number;
}

export function createSTTProviderImpl(
  this: AudioService,
  speaker: 'interviewer' | 'user'
): STTProvider | null {
  const { CredentialService } = require('../../services/CredentialService');
  const sttProvider = CredentialService.getInstance().getSttProvider();

  // 'none' means the user has explicitly disabled transcription.
  if (sttProvider === 'none') {
    console.log(
      `[Main] STT provider is 'none' — audio capture will proceed but transcription is disabled.`
    );
    return null;
  }

  const sm = SettingsService.getInstance();
  const modelId = sm.get('parakeetModel') ?? 'parakeet-tdt-0.6b-v3';
  console.log(
    `[Main] Using LocalParakeetSTT for ${speaker}, model: ${modelId}`
  );
  const stt: STTProvider = new LocalParakeetSTT(modelId) as STTProvider;
  stt.setChannel(speaker === 'interviewer' ? 'system' : 'mic');
  const lang = sm.get('parakeetLanguage');
  if (lang) stt.setRecognitionLanguage(lang);

  const getCurrentProvider = (): STTProvider | null =>
    speaker === 'interviewer' ? this.interviewerSTT : this.userSTT;
  const setCurrentProvider = (next: STTProvider | null): void => {
    if (speaker === 'interviewer') this.interviewerSTT = next;
    else this.userSTT = next;
  };
  let reconnectTimer: NodeJS.Timeout | null = null;
  let reconnecting = false;
  const scheduleReconnect = (reason: string): void => {
    if (reconnecting || reconnectTimer) return;
    if (!this.meetingState.isMeetingActive) return;
    if (getCurrentProvider() !== stt) return;

    reconnecting = true;
    reconnectTimer = setTimeout(async () => {
      reconnectTimer = null;
      try {
        if (!this.meetingState.isMeetingActive) return;
        if (getCurrentProvider() !== stt) return;

        await stt.destroy?.();
        stt.removeAllListeners();

        const fresh = this.createSTTProvider(speaker) as STTProvider | null;
        if (!fresh) return;
        setCurrentProvider(fresh);

        fresh.start().catch((err: Error) => {
          console.error(
            `[Main] STT (${speaker}) reconnect start failed after ${reason}:`,
            err
          );
        });
      } catch (err) {
        console.error(
          `[Main] STT (${speaker}) reconnect failed after ${reason}:`,
          err
        );
      } finally {
        reconnecting = false;
      }
    }, 500);
  };

  stt.on(
    'transcript',
    (segment: {
      text: string;
      isFinal: boolean;
      confidence: number;
      startedAt?: number;
    }) => {
      const decision = this.transcriptHandler.process(speaker, segment, {
        isMeetingActive: this.meetingState.isMeetingActive,
        isDraining: this.meetingState.isDraining,
        micMuted: this.meetingState.micMuted,
        systemMuted: this.meetingState.systemMuted,
      });

      if (decision.action === 'drop') return;

      // One reducer, two surfaces: main folds the segment into dialogueTurns
      // (persistence + intelligence fallback) with the same rules the overlay
      // applies to the identical payload sent below.
      this.applyTranscriptSegment(decision.segment!);

      const helper = this.windowHelper;
      const payload = {
        speaker: decision.segment!.speaker,
        text: decision.segment!.text,
        timestamp: Date.now(),
        final: decision.segment!.final,
        confidence: decision.segment!.confidence,
      };
      helper
        .getLauncherWindow()
        ?.webContents.send('native-audio-transcript', payload);
      helper
        .getOverlayWindow()
        ?.webContents.send('native-audio-transcript', payload);
    }
  );

  let _consecutiveErrors = 0;

  // Awaiting-audio is neutral until the first final proves the pipeline is flowing.
  let _lastState: 'connected' | 'reconnecting' | 'failed' | 'awaiting-audio' =
    'awaiting-audio';

  stt.on('error', (err: Error) => {
    console.error(`[Main] STT (${speaker}) Error:`, err);

    const errorMessage = extractHttpError(err);

    // Auth/account failures are not recoverable by retry.
    const errLower = errorMessage.toLowerCase();
    const isAuthError =
      errorMessage.startsWith('401 ') ||
      errLower.includes('auth_timeout') ||
      errLower.includes('invalid_key') ||
      errLower.includes('invalid api') ||
      errLower.includes('authentication');

    const isQuotaError =
      errLower.includes('transcription_quota_exceeded') ||
      errLower.includes('quota');

    if (isAuthError) {
      _consecutiveErrors = 0;
      _lastState = 'failed';
      this.sendToMeetingSurfaces('stt-status', {
        state: 'failed',
        provider: sttProvider,
        error: errorMessage,
        channel: speaker,
      } as SttStatusPayload);
      return;
    }

    _consecutiveErrors++;
    const maxErrors = 5;

    if (_consecutiveErrors >= maxErrors || isQuotaError) {
      _lastState = 'failed';
      this.sendToMeetingSurfaces('stt-status', {
        state: 'failed',
        provider: sttProvider,
        error: isQuotaError
          ? errorMessage
          : `STT provider failed (${_consecutiveErrors} consecutive errors): ${errorMessage}`,
        channel: speaker,
        reconnectAttempts: _consecutiveErrors,
      } as SttStatusPayload);
      return;
    }
    _lastState = 'reconnecting';
    this.sendToMeetingSurfaces('stt-status', {
      state: 'reconnecting',
      provider: sttProvider,
      error: errorMessage,
      channel: speaker,
      reconnectAttempts: _consecutiveErrors,
    } as SttStatusPayload);

    scheduleReconnect(errorMessage);
  });

  stt.on(
    'transcript',
    (segment: { text: string; isFinal: boolean; confidence: number }) => {
      if (segment.isFinal) {
        _consecutiveErrors = 0;
      }
      if (segment.isFinal && _lastState !== 'connected') {
        _lastState = 'connected';
        this.sendToMeetingSurfaces('stt-status', {
          state: 'connected',
          provider: sttProvider,
          channel: speaker,
        } as SttStatusPayload);
      }
    }
  );

  // Provider warnings are diagnostic, not meeting status.
  stt.on(
    'warning',
    (w: { code?: string; message?: string; droppedBytes?: number }) => {
      console.warn(`[Main] STT (${speaker}) warning: ${w?.code ?? 'unknown'}`, {
        provider: sttProvider,
        message: w?.message,
        droppedBytes: w?.droppedBytes,
      });
    }
  );

  this.sendToMeetingSurfaces('stt-status', {
    state: 'awaiting-audio',
    provider: sttProvider,
    channel: speaker,
  } as SttStatusPayload);

  return stt;
}

// Prewarm JS provider objects only; sockets still open lazily to avoid idle quota burn.
export function prewarmSttProvidersImpl(this: AudioService): void {
  if (this.interviewerSTT && this.userSTT) return;
  try {
    if (!this.interviewerSTT) {
      console.log('[Main] Pre-warming interviewer STT provider...');
      this.interviewerSTT = this.createSTTProvider('interviewer');
    }
    if (!this.userSTT) {
      console.log('[Main] Pre-warming user STT provider...');
      this.userSTT = this.createSTTProvider('user');
    }
  } catch (err) {
    // setupSystemAudioPipeline retries with full user-facing error handling.
    console.warn(
      '[Main] STT pre-warm failed (will retry on meeting start):',
      err
    );
  }
}

// Serialize STT reconfigures so captures and provider instances never rebuild in parallel.
export async function reconfigureSttProviderImpl(
  this: AudioService
): Promise<void> {
  const run = this._sttReconfigureChain.then(
    () => this.doReconfigureSttProvider(),
    () => this.doReconfigureSttProvider()
  );
  // Keep the chain alive after failures.
  this._sttReconfigureChain = run.then(
    (): void => undefined,
    (): void => undefined
  );
  return run;
}

export async function doReconfigureSttProviderImpl(
  this: AudioService
): Promise<void> {
  console.log('[Main] Reconfiguring STT Provider...');

  // Pause captures before nulling STT so queued data events drain safely.
  if (this.meetingState.isMeetingActive) {
    this.systemAudioCapture?.stop();
    this.microphoneCapture?.stop();
  }

  if (this.interviewerSTT) {
    this.interviewerSTT.stop();
    this.interviewerSTT.removeAllListeners();
    this.interviewerSTT = null;
  }
  if (this.userSTT) {
    this.userSTT.stop();
    this.userSTT.removeAllListeners();
    this.userSTT = null;
  }

  // Outside meetings, avoid constructing MicrophoneCapture and triggering macOS mic UI.
  if (this.meetingState.isMeetingActive) {
    await this.setupSystemAudioPipeline();
    this.systemAudioCapture?.start();
    this.microphoneCapture?.start();
    this.interviewerSTT?.start();
    this.userSTT?.start();
  }

  console.log('[Main] STT Provider reconfigured');

  const {
    CredentialService: CM,
  } = require('../../services/CredentialService');
  const newProvider = CM.getInstance().getSttProvider();
  this.appBroadcast('stt-config-changed', {
    configured: newProvider !== 'none',
    provider: newProvider,
  });
}
