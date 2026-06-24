import { isVerboseLogging } from '../../utils/logger';
import type { AudioService } from './AudioService';
import { SystemAudioCapture } from './native/SystemAudioCapture';
import { MicrophoneCapture } from './native/MicrophoneCapture';
import {
  resolveMacScreenCaptureCapability,
  formatPermissionMessage,
} from '../../utils/permissions';

async function destroySystemCaptureAfterPermissionDenied(
  service: AudioService
): Promise<void> {
  if (!service.systemAudioCapture) return;
  try {
    await service.systemAudioCapture.destroy();
  } catch (destroyErr) {
    console.warn(
      '[Main] Stale system audio capture destroy failed during permission-denied path:',
      destroyErr
    );
  }
  service.systemAudioCapture = null;
  service._sysSttRateApplied = false;
}

export async function setupSystemAudioPipelineImpl(
  this: AudioService
): Promise<void> {
  try {
    // Re-check TCC even when a stale wrapper exists; revoked grants can zero-fill silently.
    const screenCapability = await resolveMacScreenCaptureCapability(
      'system audio pipeline setup'
    );

    if (screenCapability.effectiveDenied) {
      const message =
        screenCapability.message ??
        formatPermissionMessage('screen-recording-denied');
      console.warn(
        '[Main] Screen Recording permission denied at pipeline setup. Tearing down any stale system audio capture; meeting will run mic-only.'
      );
      this.sendSystemAudioPermissionDenied(message);
      this.broadcastDeviceSelection({
        kind: 'output',
        requested: null,
        actual: null,
        fellBack: true,
        reason: 'screen-recording-permission-denied',
      });
      await destroySystemCaptureAfterPermissionDenied(this);
    }
    if (!screenCapability.effectiveDenied && !this.systemAudioCapture) {
      // Constructor failures need a UI banner, not only an outer log.
      try {
        this.systemAudioCapture = new SystemAudioCapture();
        this.wireSystemCapture(this.systemAudioCapture);
        this.broadcastDeviceSelection({
          kind: 'output',
          requested: null,
          actual: 'default',
          fellBack: false,
        });
      } catch (capErr) {
        console.error('[Main] SystemAudioCapture construction failed:', capErr);
        this.systemAudioCapture = null;
        this.sendAudioCaptureFailed({
          channel: 'system',
          message:
            'System audio capture failed to initialize. The native audio module could not allocate the capture device. Restarting Cheatly may help; if the problem persists, file a bug.',
          attempt: 0,
          maxAttempts: 0,
          terminal: true,
          stuck: false,
        });
      }
    }
    if (!this.microphoneCapture) {
      try {
        this.microphoneCapture = new MicrophoneCapture();
        this.wireMicCapture(this.microphoneCapture);
      } catch (capErr) {
        console.error('[Main] MicrophoneCapture construction failed:', capErr);
        this.microphoneCapture = null;
        this.sendAudioCaptureFailed({
          channel: 'mic',
          message:
            'Microphone capture failed to initialize. The native audio module could not open the default input device. Check that the device is connected and not in exclusive use by another app, then restart Cheatly.',
          attempt: 0,
          maxAttempts: 0,
          terminal: true,
          stuck: false,
        });
      }
    }

    // STT provider failures should not hide capture/device failures behind "no transcript".
    const { CredentialService } = require('../../services/CredentialService');
    const sttProv = CredentialService.getInstance().getSttProvider();

    if (!this.interviewerSTT) {
      console.log(`[Main] Creating interviewer STT provider: ${sttProv}`);
      try {
        this.interviewerSTT = this.createSTTProvider('interviewer');
      } catch (sttErr) {
        console.error(
          `[Main] Interviewer STT init failed (${sttProv}):`,
          sttErr
        );
        this.interviewerSTT = null;
      }
    }
    if (!this.interviewerSTT) {
      this.sendAudioCaptureFailed({
        channel: 'system',
        message: `Speech-to-text provider "${sttProv}" failed to initialize for the interviewer channel. Check your API key and credentials in Settings.`,
        attempt: 0,
        maxAttempts: 0,
        terminal: true,
        stuck: false,
      });
    }

    if (!this.userSTT) {
      console.log(`[Main] Creating user STT provider: ${sttProv}`);
      try {
        this.userSTT = this.createSTTProvider('user');
      } catch (sttErr) {
        console.error(`[Main] User STT init failed (${sttProv}):`, sttErr);
        this.userSTT = null;
      }
    }
    if (!this.userSTT) {
      this.sendAudioCaptureFailed({
        channel: 'mic',
        message: `Speech-to-text provider "${sttProv}" failed to initialize for the microphone channel. Check your API key and credentials in Settings.`,
        attempt: 0,
        maxAttempts: 0,
        terminal: true,
        stuck: false,
      });
    }

    // Capture sample rates are reliable only after the first native chunk.
    this._sysSttRateApplied = false;
    this._micSttRateApplied = false;

    if (isVerboseLogging())
      console.log(
        '[Main] Full Audio Pipeline (System + Mic) Initialized (Ready)'
      );
  } catch (err) {
    console.error('[Main] Failed to setup System Audio Pipeline:', err);
  }
}

// Sleep/wake can leave captures and STT sockets half-alive; rebuild active captures on resume.
export async function restartCapturesAfterResumeImpl(
  this: AudioService
): Promise<void> {
  if (!this.meetingState.isMeetingActive) {
    console.log(
      '[Main] System resume — no active meeting, nothing to restart.'
    );
    return;
  }
  console.log(
    '[Main] System resume — restarting captures so CoreAudio/cpal handles are fresh.'
  );

  // Recovery state belongs to the destroyed capture instances.
  this._systemAudioRecoveryInProgress = false;
  this._systemAudioRecoveryAttempts = 0;
  this._systemAudioConsecutiveFailures = 0;
  if (this._systemAudioRecoveryTimer) {
    clearTimeout(this._systemAudioRecoveryTimer);
    this._systemAudioRecoveryTimer = null;
  }
  this._micRecoveryInProgress = false;
  this._micRecoveryAttempts = 0;
  if (this._micRecoveryTimer) {
    clearTimeout(this._micRecoveryTimer);
    this._micRecoveryTimer = null;
  }

  if (this.systemAudioCapture) {
    try {
      this.systemAudioCapture.destroy();
    } catch (e) {
      console.warn('[Main] Resume: system capture destroy threw:', e);
    }
    this.systemAudioCapture = null;
  }
  try {
    const screenCapability = await resolveMacScreenCaptureCapability(
      'resume capture restart'
    );
    if (screenCapability.effectiveDenied) {
      this.sendSystemAudioPermissionDenied(
        screenCapability.message ??
          formatPermissionMessage('screen-recording-denied')
      );
      this.broadcastDeviceSelection({
        kind: 'output',
        requested: this._lastRequestedOutputDeviceId || null,
        actual: null,
        fellBack: true,
        reason: 'screen-recording-permission-denied',
      });
    }
    if (!screenCapability.effectiveDenied) {
      this.systemAudioCapture = new SystemAudioCapture(
        this._lastRequestedOutputDeviceId
      );
      this._sysSttRateApplied = false;
      this.wireSystemCapture(this.systemAudioCapture, '(Resume)');
      this.systemAudioCapture.start();
    }
  } catch (err) {
    console.error('[Main] Resume: failed to restart system capture:', err);
    this.sendAudioCaptureFailed({
      channel: 'system',
      message:
        'System audio capture failed to restart after wake. End and restart the meeting to recover.',
      attempt: 0,
      maxAttempts: 0,
      terminal: true,
      stuck: false,
    });
  }

  // cpal streams can survive-looking but silent after sleep or exclusive-mode churn.
  if (this.microphoneCapture) {
    try {
      this.microphoneCapture.destroy();
    } catch (e) {
      console.warn('[Main] Resume: mic capture destroy threw:', e);
    }
    this.microphoneCapture = null;
  }
  try {
    this.microphoneCapture = new MicrophoneCapture(
      this._lastRequestedInputDeviceId
    );
    this._micSttRateApplied = false;
    this.wireMicCapture(this.microphoneCapture, '(Resume)');
    this.microphoneCapture.start();
  } catch (err) {
    console.error('[Main] Resume: failed to restart mic capture:', err);
    this.sendAudioCaptureFailed({
      channel: 'mic',
      message:
        'Microphone failed to restart after wake. Check that no other app holds the mic, then end and restart the meeting.',
      attempt: 0,
      maxAttempts: 0,
      terminal: true,
      stuck: false,
    });
  }
}
