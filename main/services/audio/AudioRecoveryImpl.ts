import type { AudioService } from './AudioService';
import { SystemAudioCapture } from './native/SystemAudioCapture';
import { MicrophoneCapture } from './native/MicrophoneCapture';
import { loadNativeModule } from './native/nativeModuleLoader';
import {
  resolveMacScreenCaptureCapability,
  formatPermissionMessage,
} from '../../utils/permissions';

export function setupAudioRecoveryHandlerImpl(this: AudioService): void {
  if (!this.systemAudioCapture) return;

  this.systemAudioCapture.on('error', async (err: Error) => {
    const recoveryMeetingGeneration = this.meetingState.meetingGeneration;
    const isRecoveryCurrentMeeting = () =>
      this.meetingState.isMeetingActive &&
      this.meetingState.meetingGeneration === recoveryMeetingGeneration;
    if (!isRecoveryCurrentMeeting()) return;

    // Route-change and recovery both rebuild the same capture; one must win.
    if (this._defaultOutputSwitchInProgress) {
      console.warn(
        '[AudioRecovery] Route change in progress — deferring recovery to that flow.'
      );
      return;
    }

    const now = Date.now();
    this._systemAudioLastFailureAt = now;
    this._systemAudioConsecutiveFailures++;

    if (
      this._systemAudioRecoveryInProgress ||
      this._systemAudioRecoveryAttempts >= 3
    ) {
      console.warn(
        `[AudioRecovery] Skipping recovery — already in progress or max attempts (${this._systemAudioRecoveryAttempts}/3) reached.`
      );
      return;
    }

    this._systemAudioRecoveryInProgress = true;
    this._systemAudioRecoveryAttempts++;
    console.warn(
      `[AudioRecovery] SystemAudioCapture error — attempting recovery #${this._systemAudioRecoveryAttempts}: ${err.message}`
    );

    // Show the capture error separately from generic STT reconnecting.
    this.sendAudioCaptureFailed({
      channel: 'system',
      message: err.message,
      attempt: this._systemAudioRecoveryAttempts,
      maxAttempts: 3,
    });

    try {
      await new Promise<void>((resolve) => {
        this._systemAudioRecoveryTimer = setTimeout(resolve, 1500);
      });
      this._systemAudioRecoveryTimer = null;
      if (!isRecoveryCurrentMeeting()) {
        return;
      }

      // stop()+start races deferred native teardown; recovery needs a fresh instance.
      const oldCapture = this.systemAudioCapture;
      oldCapture?.destroy();
      this.systemAudioCapture = null;
      this._sysSttRateApplied = false;

      const screenCapability = await resolveMacScreenCaptureCapability(
        'system audio recovery'
      );
      if (!isRecoveryCurrentMeeting()) {
        return;
      }
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
        return;
      }

      const fresh = new SystemAudioCapture(this._lastRequestedOutputDeviceId);
      this.systemAudioCapture = fresh;
      this.wireSystemCapture(fresh, '(Recovery)');
      fresh.start();

      this._systemAudioSuccessfulRestarts++;
      this._systemAudioConsecutiveFailures = 0;
      console.log(
        `[AudioRecovery] SystemAudioCapture recreated successfully (total restarts: ${this._systemAudioSuccessfulRestarts}).`
      );
    } catch (recoveryErr: any) {
      console.error(
        `[AudioRecovery] Recovery attempt #${this._systemAudioRecoveryAttempts} failed:`,
        recoveryErr
      );
      // Exhaustion is terminal for this meeting.
      if (
        this._systemAudioRecoveryAttempts >= 3 &&
        isRecoveryCurrentMeeting()
      ) {
        this.sendAudioCaptureFailed({
          channel: 'system',
          message: `System audio capture gave up after 3 attempts. Last error: ${recoveryErr?.message || err.message}`,
          attempt: this._systemAudioRecoveryAttempts,
          maxAttempts: 3,
          terminal: true,
        });
      }
    } finally {
      this._systemAudioRecoveryInProgress = false;
    }
  });
}

export function startDefaultOutputWatcherImpl(this: AudioService): void {
  if (this._defaultOutputWatcherInterval) return;
  const NativeModule: any = loadNativeModule();
  if (
    !NativeModule ||
    typeof NativeModule.getDefaultOutputDeviceId !== 'function'
  ) {
    // Older native binaries still work, just without route-change rebinding.
    console.log(
      '[DefaultOutputWatcher] Native getDefaultOutputDeviceId unavailable — skipping route-change watcher.'
    );
    return;
  }
  try {
    this._lastObservedDefaultOutputId =
      NativeModule.getDefaultOutputDeviceId() || '';
  } catch {
    this._lastObservedDefaultOutputId = '';
  }
  console.log(
    `[DefaultOutputWatcher] Started. Initial default output: ${this._lastObservedDefaultOutputId || '(none)'}`
  );

  this._defaultOutputWatcherInterval = setInterval(() => {
    if (this.meetingState.isQuitting) return;
    if (!this.meetingState.isMeetingActive) return;
    // Explicit output selections should not follow default route changes.
    if (this._lastRequestedOutputDeviceId) return;
    if (this._defaultOutputSwitchInProgress) return;
    if (!this.systemAudioCapture) return;

    let currentId = '';
    try {
      currentId = NativeModule.getDefaultOutputDeviceId() || '';
    } catch (err) {
      return;
    }
    if (!currentId) return;
    if (currentId === this._lastObservedDefaultOutputId) return;

    console.warn(
      `[DefaultOutputWatcher] Default output changed: ${this._lastObservedDefaultOutputId} → ${currentId}. Rebinding CoreAudio Tap.`
    );
    this._lastObservedDefaultOutputId = currentId;
    this.handleDefaultOutputChanged().catch((err: unknown) => {
      console.error('[DefaultOutputWatcher] Failed to rebind tap:', err);
    });
  }, 4000);
}

export function stopDefaultOutputWatcherImpl(this: AudioService): void {
  if (this._defaultOutputWatcherInterval) {
    clearInterval(this._defaultOutputWatcherInterval);
    this._defaultOutputWatcherInterval = null;
  }
  this._lastObservedDefaultOutputId = null;
}

export function stopDefaultOutputWatcherForShutdownImpl(
  this: AudioService
): void {
  this.stopDefaultOutputWatcher();
}

export async function handleDefaultOutputChangedImpl(
  this: AudioService
): Promise<void> {
  const meetingGeneration = this.meetingState.meetingGeneration;
  const isCurrentMeeting = () =>
    this.meetingState.isMeetingActive &&
    this.meetingState.meetingGeneration === meetingGeneration;
  if (this.meetingState.isQuitting) return;
  if (!isCurrentMeeting()) return;
  if (this._defaultOutputSwitchInProgress) return;
  // Recovery also rebuilds systemAudioCapture; defer route changes until it finishes.
  if (this._systemAudioRecoveryInProgress) {
    console.log(
      '[DefaultOutputWatcher] Recovery in progress — deferring route-change rebuild.'
    );
    return;
  }
  this._defaultOutputSwitchInProgress = true;
  try {
    // Rebuild instead of stop+start because native teardown is deferred.
    const oldCapture = this.systemAudioCapture;
    oldCapture?.destroy();
    this.systemAudioCapture = null;
    this._sysSttRateApplied = false;
    this._systemAudioRecoveryAttempts = 0;
    this._systemAudioConsecutiveFailures = 0;

    const screenCapability = await resolveMacScreenCaptureCapability(
      'default output route change'
    );
    if (this.meetingState.isQuitting) return;
    if (!isCurrentMeeting()) {
      return;
    }
    if (screenCapability.effectiveDenied) {
      this.sendSystemAudioPermissionDenied(
        screenCapability.message ??
          formatPermissionMessage('screen-recording-denied')
      );
      this.broadcastDeviceSelection({
        kind: 'output',
        requested: null,
        actual: null,
        fellBack: true,
        reason: 'screen-recording-permission-denied',
      });
      return;
    }

    // Undefined means "current default"; pinning an id would stop route following.
    const fresh = new SystemAudioCapture(undefined);
    this.systemAudioCapture = fresh;
    this.wireSystemCapture(fresh, '(RouteChanged)');
    fresh.start();
    this.broadcastDeviceSelection({
      kind: 'output',
      requested: null,
      actual: 'default',
      fellBack: false,
      reason: 'output-route-changed',
    });
    console.log(
      '[DefaultOutputWatcher] CoreAudio Tap rebound to new default output.'
    );
  } finally {
    this._defaultOutputSwitchInProgress = false;
  }
}

export function setupMicRecoveryHandlerImpl(this: AudioService): void {
  if (!this.microphoneCapture) return;

  this.microphoneCapture.on('error', async (err: Error) => {
    // Generation check prevents delayed recovery from reviving an old meeting's mic.
    const micRecoveryMeetingGeneration = this.meetingState.meetingGeneration;
    const isMicRecoveryCurrentMeeting = () =>
      this.meetingState.isMeetingActive &&
      this.meetingState.meetingGeneration === micRecoveryMeetingGeneration;
    if (!isMicRecoveryCurrentMeeting()) return;

    if (this._micRecoveryInProgress || this._micRecoveryAttempts >= 3) {
      console.warn(
        `[MicRecovery] Skipping recovery — already in progress or max attempts (${this._micRecoveryAttempts}/3) reached.`
      );
      return;
    }

    this._micRecoveryInProgress = true;
    this._micRecoveryAttempts++;
    console.warn(
      `[MicRecovery] MicrophoneCapture error — attempting recovery #${this._micRecoveryAttempts}: ${err.message}`
    );

    try {
      await new Promise<void>((resolve) => {
        this._micRecoveryTimer = setTimeout(resolve, 1500);
      });
      this._micRecoveryTimer = null;
      if (!isMicRecoveryCurrentMeeting()) {
        return;
      }

      if (this.microphoneCapture) {
        this.microphoneCapture.destroy();
        this.microphoneCapture = null;
      }
      this._micSttRateApplied = false;

      try {
        this.microphoneCapture = new MicrophoneCapture(
          this._lastRequestedInputDeviceId
        );
      } catch (createErr) {
        console.warn(
          '[MicRecovery] Saved device unavailable on recovery, falling back to default.',
          createErr
        );
        this.microphoneCapture = new MicrophoneCapture();
      }

      // Canonical wiring includes watchdogs and zero-fill detectors.
      this.wireMicCapture(this.microphoneCapture, '(Recovery)');
      this.microphoneCapture.start();

      this._micRecoveryAttempts = 0;
      console.log('[MicRecovery] MicrophoneCapture restarted successfully.');
    } catch (recoveryErr: any) {
      console.error(
        `[MicRecovery] Recovery attempt #${this._micRecoveryAttempts} failed:`,
        recoveryErr
      );
      // Exhaustion needs a UI banner; later errors are dropped by the cap guard.
      if (this._micRecoveryAttempts >= 3 && isMicRecoveryCurrentMeeting()) {
        this.sendAudioCaptureFailed({
          channel: 'mic',
          message: `Microphone capture gave up after 3 attempts. Last error: ${recoveryErr?.message || err.message}`,
          attempt: this._micRecoveryAttempts,
          maxAttempts: 3,
          terminal: true,
        });
      }
    } finally {
      this._micRecoveryInProgress = false;
    }
  });
}
