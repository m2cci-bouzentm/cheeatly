import type { AudioService } from './AudioService';
import { SystemAudioCapture } from './native/SystemAudioCapture';
import { MicrophoneCapture } from './native/MicrophoneCapture';
import { formatPermissionMessage } from '../../utils/permissions';

function logTransientChunkGap(
  prefix: string,
  label: string,
  lastChunkAt: number,
  now: number
): void {
  if (lastChunkAt <= 0) return;
  const gap = now - lastChunkAt;
  const isTransientRouteGap = gap > 2000 && gap < 8000;
  if (!isTransientRouteGap) return;
  console.warn(
    `${prefix}${label} chunk gap ${gap}ms — likely transient route change. Resuming.`
  );
}

function peakToPeakSample(chunk: Buffer): number {
  let minS = 32767;
  let maxS = -32768;
  const stride = Math.max(2, (chunk.length >> 5) & ~1);
  for (let i = 0; i + 1 < chunk.length; i += stride) {
    const sample = chunk.readInt16LE(i);
    if (sample < minS) minS = sample;
    if (sample > maxS) maxS = sample;
  }
  return maxS - minS;
}

function reportZeroFillIfNeeded(
  service: AudioService,
  prefix: string,
  channel: 'system' | 'mic',
  chunk: Buffer,
  now: number,
  state: { firstChunkAt: number; latched: boolean; triggered: boolean },
  observationMs: number
): void {
  if (state.latched || state.triggered) return;
  if (state.firstChunkAt === 0) state.firstChunkAt = now;

  const peakToPeak = peakToPeakSample(chunk);
  if (peakToPeak > 100) {
    state.latched = true;
    return;
  }

  if (now - state.firstChunkAt < observationMs) return;

  state.triggered = true;
  if (channel === 'system') {
    console.warn(
      `${prefix}SystemAudio chunks all zero-filled (peak-to-peak < 100) for ${observationMs / 1000}s — TCC denial suspected (Screen Recording grant may not apply to this binary).`
    );
    service.sendAudioCaptureFailed({
      channel: 'system',
      message: formatPermissionMessage('mac-screen-recording-revoked-rebuild'),
      attempt: 0,
      maxAttempts: 3,
      terminal: false,
      stuck: true,
    });
    return;
  }

  console.warn(
    `${prefix}Mic chunks all zero-filled (peak-to-peak < 100) for ${observationMs / 1000}s — TCC denial or device-mute suspected.`
  );
  service.sendAudioCaptureFailed({
    channel: 'mic',
    message: formatPermissionMessage('mic-zero-fill'),
    attempt: 0,
    maxAttempts: 3,
    terminal: false,
    stuck: true,
  });
}

function checkMicHfpDegradation(
  service: AudioService,
  capture: MicrophoneCapture,
  prefix: string
): void {
  const nativeRate = capture.getNativeSampleRate?.() ?? 0;
  if (nativeRate <= 0 || nativeRate > 24000) return;

  const builtIn = service.findBuiltInInputDevice();
  const alreadyBuiltIn =
    !!builtIn &&
    !!service._lastRequestedInputDeviceId &&
    service.normalizeDeviceName(builtIn.name) ===
      service.normalizeDeviceName(service._lastRequestedInputDeviceId);

  if (!builtIn) {
    console.warn(
      `${prefix}Mic in HFP (native ${nativeRate}Hz) but no built-in mic to switch to.`
    );
    service.sendAudioCaptureFailed({
      channel: 'mic',
      message: `Your microphone is in low-quality Bluetooth call mode. Set your audio output to the speakers, or use a different mic, for better transcription.`,
      attempt: 0,
      maxAttempts: 0,
      terminal: false,
      stuck: false,
    });
    return;
  }

  if (alreadyBuiltIn) return;

  console.warn(
    `${prefix}Mic native rate ${nativeRate}Hz indicates Bluetooth HFP (degraded). Auto-switching to built-in mic "${builtIn.name}".`
  );
  service.appBroadcast('audio-input-auto-switched', {
    from: 'Bluetooth mic',
    to: builtIn.name,
    reason: 'bluetooth-hfp-avoided',
  });
  const outputId = service._lastRequestedOutputDeviceId;
  setImmediate(() => {
    const shouldReconfigure =
      service.meetingState.isMeetingActive &&
      service.microphoneCapture === capture;
    if (!shouldReconfigure) return;
    void service
      .reconfigureAudio(builtIn.id, outputId)
      .catch((err: unknown) =>
        console.warn(`${prefix}HFP auto-switch reconfigure failed:`, err)
      );
  });
}

// Recovery is wired here (not at call sites) so every wire-up path gets it.
export function wireSystemCaptureImpl(
  this: AudioService,
  capture: SystemAudioCapture,
  label: string = ''
): void {
  const prefix = label ? `[Main] ${label} ` : '[Main] ';
  let chunkCount = 0;
  this.sendToMeetingSurfaces('audio-capture-active', {
    channel: 'system',
    active: true,
  });
  // 12s avoids false positives during slow SCK cold-start but still surfaces silent capture.
  const STUCK_WATCHDOG_MS = 12000;
  let stuckTimer: NodeJS.Timeout | null = null;
  const armStuckWatchdog = () => {
    if (stuckTimer) clearTimeout(stuckTimer);
    stuckTimer = setTimeout(() => {
      if (this.systemAudioCapture !== capture) return;
      if (chunkCount > 0) return;
      if (!this.meetingState.isMeetingActive) return;

      // CoreAudio Process Tap can initialize but emit zero frames when input+output share hardware.
      const sameDeviceName =
        process.platform === 'darwin'
          ? this.detectSameInputOutputDevice()
          : null;
      if (sameDeviceName) {
        const msg = formatPermissionMessage('mac-same-device-input-output', {
          device: sameDeviceName,
        });
        console.warn(`${prefix}SystemAudioCapture ${msg}`);
        this.sendAudioCaptureFailed({
          channel: 'system',
          message: msg,
          attempt: 0,
          maxAttempts: 3,
          terminal: false,
          stuck: true,
        });
        return;
      }

      console.warn(
        `${prefix}SystemAudioCapture produced 0 chunks in ${STUCK_WATCHDOG_MS / 1000}s — likely silent capture (route mismatch or permission revoked).`
      );
      this.sendAudioCaptureFailed({
        channel: 'system',
        message: formatPermissionMessage('system-audio-stuck'),
        attempt: 0,
        maxAttempts: 3,
        terminal: false,
        stuck: true,
      });
    }, STUCK_WATCHDOG_MS);
  };

  // TCC denial can produce timed zero-filled buffers, so no-chunks watchdogs never fire.
  const ZEROFILL_OBSERVATION_MS = 12000;
  const zeroFillState = { firstChunkAt: 0, latched: false, triggered: false };
  // Teardown must cancel the watchdog before async stop/destroy can lag behind.
  const disarmStuckWatchdog = () => {
    if (stuckTimer) {
      clearTimeout(stuckTimer);
      stuckTimer = null;
    }
  };
  (capture as any).__disarmStuckWatchdog = disarmStuckWatchdog;
  capture.on('start', armStuckWatchdog);
  capture.on('stop', disarmStuckWatchdog);
  // Log short route-change gaps without spamming UI banners during device juggling.
  let lastChunkAt = 0;
  capture.on('data', (chunk: Buffer) => {
    const now = Date.now();
    logTransientChunkGap(prefix, 'SystemAudio', lastChunkAt, now);
    lastChunkAt = now;
    chunkCount++;
    if (chunkCount === 1 && stuckTimer) {
      clearTimeout(stuckTimer);
      stuckTimer = null;
    }
    if (
      !this._sysSttRateApplied &&
      this.interviewerSTT &&
      this.systemAudioCapture === capture
    ) {
      const rate = capture.getSampleRate();
      this.interviewerSTT.setSampleRate(rate);
      this.interviewerSTT.setAudioChannelCount?.(1);
      this._sysSttRateApplied = true;
      console.log(
        `${prefix}Interviewer STT rate locked from first chunk: ${rate}Hz`
      );
    }
    if (chunkCount <= 3 || chunkCount % 500 === 0) {
      console.log(
        `${prefix}SystemAudio->STT: chunk #${chunkCount}, ${chunk.length}B, interviewerSTT=${this.interviewerSTT ? 'active' : 'NULL'}`
      );
    }

    // WASAPI does not map permission revocation to sustained zero-fill like macOS.
    if (process.platform === 'darwin')
      reportZeroFillIfNeeded(
        this,
        prefix,
        'system',
        chunk,
        Date.now(),
        zeroFillState,
        ZEROFILL_OBSERVATION_MS
      );

    this.interviewerSTT?.write(chunk);
  });
  capture.on('sample_rate_changed', (rate: number) => {
    console.log(
      `${prefix}SystemAudioCapture rate updated dynamically to ${rate}Hz`
    );
    this.interviewerSTT?.setSampleRate(rate);
  });
  capture.on('speech_ended', () => {
    this.interviewerSTT?.notifySpeechEnded?.();
  });
  // Recovery owns the error listener to avoid duplicate reports.
  this.setupAudioRecoveryHandler();
}

export function wireMicCaptureImpl(
  this: AudioService,
  capture: MicrophoneCapture,
  label: string = ''
): void {
  const prefix = label ? `[Main] ${label} ` : '[Main] ';
  let chunkCount = 0;
  this.sendToMeetingSurfaces('audio-capture-active', {
    channel: 'mic',
    active: true,
  });
  // cpal cold-start/hot-plug can take seconds; 12s still catches dead mic streams.
  const STUCK_WATCHDOG_MS = 12000;
  let stuckTimer: NodeJS.Timeout | null = null;
  const armStuckWatchdog = () => {
    if (stuckTimer) clearTimeout(stuckTimer);
    stuckTimer = setTimeout(() => {
      if (this.microphoneCapture !== capture) return;
      if (chunkCount > 0) return;
      if (!this.meetingState.isMeetingActive) return;
      console.warn(
        `${prefix}MicrophoneCapture produced 0 chunks in ${STUCK_WATCHDOG_MS / 1000}s — likely silent capture (device contention, hot-unplug, or muted input).`
      );
      this.sendAudioCaptureFailed({
        channel: 'mic',
        message: `No audio detected from your microphone for ${STUCK_WATCHDOG_MS / 1000}s. Check that your input device is unmuted and not in use by another app.`,
        attempt: 0,
        maxAttempts: 3,
        terminal: false,
        stuck: true,
      });
    }, STUCK_WATCHDOG_MS);
  };
  const disarmStuckWatchdog = () => {
    if (stuckTimer) {
      clearTimeout(stuckTimer);
      stuckTimer = null;
    }
  };
  (capture as any).__disarmStuckWatchdog = disarmStuckWatchdog;
  capture.on('start', armStuckWatchdog);
  capture.on('stop', disarmStuckWatchdog);
  let lastChunkAt = 0;
  // Muted/permission-blocked mics can deliver timed all-zero chunks.
  const ZEROFILL_OBSERVATION_MS = 12000;
  const zeroFillState = { firstChunkAt: 0, latched: false, triggered: false };
  let hfpDegradationChecked = false;
  capture.on('data', (chunk: Buffer) => {
    const now = Date.now();
    logTransientChunkGap(prefix, 'Mic', lastChunkAt, now);
    lastChunkAt = now;
    chunkCount++;
    if (chunkCount === 1 && stuckTimer) {
      clearTimeout(stuckTimer);
      stuckTimer = null;
    }
    if (
      !this._micSttRateApplied &&
      this.userSTT &&
      this.microphoneCapture === capture
    ) {
      const rate = capture.getSampleRate();
      this.userSTT.setSampleRate(rate);
      this.userSTT.setAudioChannelCount?.(1);
      this._micSttRateApplied = true;
      console.log(
        `${prefix}User STT rate locked from first mic chunk: ${rate}Hz`
      );
    }

    // Native <=24kHz is the ground-truth HFP signal when names/default routing lie.
    if (
      !hfpDegradationChecked &&
      process.platform === 'darwin' &&
      this.microphoneCapture === capture
    ) {
      hfpDegradationChecked = true;
      try {
        checkMicHfpDegradation(this, capture, prefix);
      } catch (e) {
        console.warn(`${prefix}HFP degradation check failed (non-fatal):`, e);
      }
    }

    reportZeroFillIfNeeded(
      this,
      prefix,
      'mic',
      chunk,
      now,
      zeroFillState,
      ZEROFILL_OBSERVATION_MS
    );

    this.userSTT?.write(chunk);
  });
  capture.on('sample_rate_changed', (rate: number) => {
    console.log(
      `${prefix}MicrophoneCapture rate updated dynamically to ${rate}Hz`
    );
    this.userSTT?.setSampleRate(rate);
  });
  capture.on('speech_ended', () => {
    this.userSTT?.notifySpeechEnded?.();
  });
  // setupMicRecoveryHandler registers its own 'error' listener.
  this.setupMicRecoveryHandler();
}
