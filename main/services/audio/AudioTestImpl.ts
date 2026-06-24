import type { AudioService } from './AudioService';
import { BrowserWindow } from 'electron';
import { SystemAudioCapture } from './native/SystemAudioCapture';
import { MicrophoneCapture } from './native/MicrophoneCapture';
import {
  ensureMacMicrophoneAccess,
  resolveMacScreenCaptureCapability,
  formatPermissionMessage,
} from '../../utils/permissions';

export async function startAudioTestImpl(
  this: AudioService,
  deviceId?: string
): Promise<void> {
  // P2-12: guard against two concurrent calls both passing the async permission check
  // before either has created a capture — the second call would orphan the first capture.
  if (this._audioTestStarting) return;
  // Block audio test while a meeting is live. Both code paths construct
  // their own MicrophoneCapture instance against the same device; on Windows
  // cpal grants exclusive access, so the second open silently degrades, and
  // on macOS the meeting's capture and the test capture compete for the
  // same input handle — symptom: meeting transcript stalls until the test
  // is closed. Reject the request loudly via the IPC error path so the
  // renderer can disable the Test button instead of letting the user think
  // their mic is broken.
  if (this.meetingState.isMeetingActive) {
    throw new Error(
      'Audio test is unavailable while a meeting is active. End the meeting first, then test your microphone.'
    );
  }
  this._audioTestStarting = true;
  try {
    await this.startAudioTestInternal(deviceId);
  } finally {
    this._audioTestStarting = false;
  }
}

export async function startAudioTestInternalImpl(
  this: AudioService,
  deviceId?: string
): Promise<void> {
  console.log(`[Main] Starting Audio Test on device: ${deviceId || 'default'}`);
  this.stopAudioTest(); // Stop any existing test (also bumps _audioTestEpoch)
  // UX4 hardening: snapshot epoch BEFORE the system-audio probe's awaited
  // permission probe. If stopAudioTest fires while we're awaiting, the
  // post-await check below catches it and skips system-capture construction.
  const startEpoch = ++this._audioTestEpoch;
  const isCurrentTest = () => this._audioTestEpoch === startEpoch;

  if (!(await ensureMacMicrophoneAccess('audio test'))) {
    throw new Error(formatPermissionMessage('mic-denied'));
  }

  const broadcastTargets = (): BrowserWindow[] =>
    [
      this.settingsWindowHelper.getSettingsWindow(),
      this.windowHelper.getLauncherWindow(),
      this.windowHelper.getOverlayWindow(),
    ].filter((win): win is BrowserWindow => !!win && !win.isDestroyed());

  const computeRmsLevel = (chunk: Buffer): number => {
    let sum = 0;
    const step = 10;
    const len = chunk.length;
    for (let i = 0; i < len; i += 2 * step) {
      const val = chunk.readInt16LE(i);
      sum += val * val;
    }
    const count = len / (2 * step);
    if (count <= 0) return 0;
    const rms = Math.sqrt(sum / count);
    return Math.min(rms / 10000, 1.0);
  };

  const attachAudioTestListeners = (capture: MicrophoneCapture) => {
    capture.on('data', (chunk: Buffer) => {
      const targets = broadcastTargets();
      if (targets.length === 0) return;
      const level = computeRmsLevel(chunk);
      for (const target of targets) {
        target.webContents.send('audio-test-level', level);
      }
    });

    capture.on('error', (err: Error) => {
      console.error('[Main] AudioTest Error:', err);
    });
  };

  // UX4: parallel system-audio probe. Wired AFTER the mic capture so a
  // missing screen-recording grant doesn't block the mic level meter.
  // Listeners include a TCC zero-fill detector (peak-to-peak < 100 for
  // the entire probe = TCC silently denied even though SCK started).
  const attachSystemTestListeners = (capture: SystemAudioCapture) => {
    capture.on('data', (chunk: Buffer) => {
      const targets = broadcastTargets();
      if (targets.length === 0) return;
      const level = computeRmsLevel(chunk);
      for (const target of targets) {
        target.webContents.send('audio-test-system-level', level);
      }
    });
    capture.on('error', (err: Error) => {
      console.error('[Main] AudioTest System Error:', err);
      for (const target of broadcastTargets()) {
        target.webContents.send(
          'audio-test-system-error',
          err.message || String(err)
        );
      }
    });
  };

  try {
    this.audioTestCapture = new MicrophoneCapture(deviceId || undefined);
    attachAudioTestListeners(this.audioTestCapture);
    this.audioTestCapture.start();
  } catch (err) {
    console.warn(
      '[Main] Failed to start audio test on preferred device. Falling back to default.',
      err
    );
    // RC-02 fix: explicitly stop and null the failed capture before creating
    // the fallback to prevent a brief double-microphone-capture window.
    try {
      this.audioTestCapture?.stop();
    } catch {
      /* ignore errors on already-failed capture */
    }
    this.audioTestCapture = null;
    try {
      this.audioTestCapture = new MicrophoneCapture();
      attachAudioTestListeners(this.audioTestCapture);
      this.audioTestCapture.start();
    } catch (fallbackErr) {
      console.error('[Main] Failed to start audio test:', fallbackErr);
      throw fallbackErr;
    }
  }

  // Independent system-audio probe — failure here does NOT abort the mic
  // test. The renderer renders the system-level bar greyed-out + a
  // permission-denied notice if the screen capture probe couldn't start.
  try {
    const screenCapability =
      await resolveMacScreenCaptureCapability('audio test');
    // UX4 hardening: bail if a stopAudioTest fired during the await.
    // Constructing+starting a SystemAudioCapture after stop would orphan
    // the capture with no shutdown path.
    if (!isCurrentTest()) {
      console.log(
        '[Main] Audio test was stopped during permission probe — skipping system capture construction.'
      );
      return;
    }
    if (screenCapability.effectiveDenied) {
      for (const target of broadcastTargets()) {
        target.webContents.send(
          'audio-test-system-error',
          screenCapability.message ??
            formatPermissionMessage('screen-recording-denied')
        );
      }
      return;
    }
    // HANG FIX: defer the CoreAudio tap creation behind a debounce. If the
    // user switches away from the Audio tab within this window, stopAudioTest
    // clears the timer and the tap is NEVER created — so coreaudiod never has
    // to tear down a freshly-created Bluetooth aggregate-device tap (the
    // operation that stalls the system-wide HAL lock and hangs the machine).
    // 600ms is long enough to absorb a quick tab switch, short enough that a
    // deliberate visit to the Audio tab still shows the system meter promptly.
    if (this._audioTestSystemProbeTimer) {
      clearTimeout(this._audioTestSystemProbeTimer);
      this._audioTestSystemProbeTimer = null;
    }
    this._audioTestSystemProbeTimer = setTimeout(() => {
      this._audioTestSystemProbeTimer = null;
      // Re-check the epoch: a stopAudioTest (tab switch / close) bumps it and
      // would have cleared this timer, but guard anyway against races.
      if (!isCurrentTest()) {
        console.log(
          '[Main] Audio test stopped during system-probe debounce — skipping CoreAudio tap creation.'
        );
        return;
      }
      try {
        this.audioTestSystemCapture = new SystemAudioCapture();
        attachSystemTestListeners(this.audioTestSystemCapture);
        // INVARIANT: SystemAudioCapture.start() MUST remain synchronous (its
        // native CoreAudio init runs on a background thread and start()
        // returns instantly). Because nothing awaits between start() and the
        // isCurrentTest() re-check below, no stopAudioTest can interleave, so
        // this guard cannot itself trigger a create-then-immediately-destroy
        // teardown — the exact HAL stall this debounce exists to avoid. If
        // start() is ever made async/awaiting, this inline stop() would run
        // right after the tap is created and REINTRODUCE the hang; in that
        // case, defer/cancel here instead of calling stop() inline.
        this.audioTestSystemCapture.start();
        if (!isCurrentTest()) {
          try {
            this.audioTestSystemCapture?.stop();
          } catch {
            /* ignore */
          }
          this.audioTestSystemCapture = null;
        }
      } catch (probeErr: any) {
        console.warn(
          '[Main] Deferred system-audio probe failed to start:',
          probeErr
        );
        for (const target of broadcastTargets()) {
          target.webContents.send(
            'audio-test-system-error',
            probeErr?.message || 'System audio probe failed to start.'
          );
        }
      }
    }, 600);
  } catch (sysErr: any) {
    console.warn('[Main] Failed to start system-audio probe:', sysErr);
    for (const target of broadcastTargets()) {
      target.webContents.send(
        'audio-test-system-error',
        sysErr?.message || 'System audio probe failed to start.'
      );
    }
  }
}

export function stopAudioTestImpl(this: AudioService): void {
  // UX4 hardening: bump epoch so any in-flight _startAudioTestImpl that's
  // awaiting resolveMacScreenCaptureCapability sees the change and skips
  // constructing the system capture (avoids orphaned-capture race).
  this._audioTestEpoch++;
  // HANG FIX: cancel a pending debounced system-audio probe. If the user
  // switched away from the Audio tab before the 600ms timer fired, the
  // CoreAudio tap was never created — clearing the timer here ensures it
  // never will be for this (now stale) test, so there is no Bluetooth
  // aggregate-device teardown to stall coreaudiod.
  if (this._audioTestSystemProbeTimer) {
    clearTimeout(this._audioTestSystemProbeTimer);
    this._audioTestSystemProbeTimer = null;
  }
  // Also disable pre-warm so stop() doesn't pre-warm a new monitor that would
  // keep the DSP thread alive after the settings panel is closed. Mirrors
  // the endMeeting() pattern where disablePreWarm() is called before stop().
  this.audioTestCapture?.disablePreWarm();
  if (this.audioTestCapture) {
    console.log('[Main] Stopping Audio Test');
    this.audioTestCapture.stop();
    this.audioTestCapture = null;
  }
  // UX4: also stop the parallel system probe.
  if (this.audioTestSystemCapture) {
    try {
      this.audioTestSystemCapture.stop();
    } catch (e) {
      console.warn('[Main] Stopping system audio test threw:', e);
    }
    this.audioTestSystemCapture = null;
  }
}
