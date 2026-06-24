import type { MeetingService } from './MeetingService';
import { isVerboseLogging } from '../../utils/logger';
import { appendDialogueFinal } from '../../../renderer/lib/dialogueTranscript';
import {
  ensureMacMicrophoneAccess,
  resolveMacScreenCaptureCapability,
  formatPermissionMessage,
} from '../../utils/permissions';

export async function abortMeetingImpl(this: MeetingService): Promise<void> {
  console.log('[AppState] Aborting meeting (no save)');
  this._abortMeeting = true;
  await this.endMeeting();
}

export async function startMeetingImpl(
  this: MeetingService,
  metadata?: any
): Promise<void> {
  console.log('[Main] Starting Meeting...', metadata);

  // Previous teardown owns native/STT handles until it resolves.
  if (this._pendingTeardown) {
    try {
      await this._pendingTeardown;
    } catch {}
    this._pendingTeardown = null;
  }

  // Fresh meetings must not inherit recovery backoff or stale watchdog timers.
  this.audioService._systemAudioRecoveryInProgress = false;
  this.audioService._systemAudioRecoveryAttempts = 0;
  this.audioService._systemAudioConsecutiveFailures = 0;
  this.audioService._micRecoveryAttempts = 0;
  if (this.audioService._systemAudioRecoveryTimer) {
    clearTimeout(this.audioService._systemAudioRecoveryTimer);
    this.audioService._systemAudioRecoveryTimer = null;
  }

  if (!(await ensureMacMicrophoneAccess('meeting start'))) {
    const message = formatPermissionMessage('mic-denied');
    // Only audio-capture-failed has a live renderer banner here.
    this.sendAudioCaptureFailed({
      channel: 'mic',
      message,
      attempt: 0,
      maxAttempts: 0,
      terminal: true,
      stuck: false,
    });
    throw new Error(message);
  }

  // Explicit Screen Recording denial degrades to mic-only; startup owns the TCC prompt.
  const screenCapability =
    process.platform === 'darwin'
      ? await resolveMacScreenCaptureCapability('meeting start')
      : null;
  if (screenCapability) {
    console.log(
      `[Main] macOS screen recording permission status: ${screenCapability.status}; capturable=${screenCapability.capturable}; sources=${screenCapability.sourceCount}`
    );
  }
  if (screenCapability?.effectiveDenied) {
    // Do not auto-open System Settings on every meeting start.
    const message =
      screenCapability.message ??
      formatPermissionMessage('screen-recording-denied');
    console.warn('[Main]', message);
    this.sendSystemAudioPermissionDenied(message);
  }

  // setWindowMode('overlay') reads these bounds.
  this.windowHelper.resetOverlayPosition();

  // Hide the launcher before state flips so its CTA never flashes active.
  this.windowHelper.setWindowMode('overlay');

  const meetingGeneration = ++this._meetingGeneration;
  this.isMeetingActive = true;
  this.transcriptHandler.reset();
  this.dialogueTurns = [];
  this._abortMeeting = false;
  this.broadcastMeetingState();

  this.windowHelper.getOverlayWindow()?.webContents.send('session-reset');
  this.windowHelper.getLauncherWindow()?.webContents.send('session-reset');

  // Audio init can take seconds; keep startMeeting IPC/UI transition immediate.
  const audioInitController = new AbortController();
  this._audioInitController = audioInitController;
  const audioInitSignal = audioInitController.signal;
  this._audioInitPromise = (async () => {
    const isCurrentMeeting = () =>
      this.isMeetingActive &&
      this._meetingGeneration === meetingGeneration &&
      !audioInitSignal.aborted;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    let systemCaptureOwnedByInit = this.audioService.systemAudioCapture;
    let microphoneCaptureOwnedByInit = this.audioService.microphoneCapture;
    let systemSttOwnedByInit = this.audioService.interviewerSTT;
    let userSttOwnedByInit = this.audioService.userSTT;
    let systemSttStartedByInit = false;
    let userSttStartedByInit = false;
    const abortStaleAudioInit = () => {
      if (this.audioService.systemAudioCapture === systemCaptureOwnedByInit) {
        (
          this.audioService.systemAudioCapture as any
        )?.__disarmStuckWatchdog?.();
        this.audioService.systemAudioCapture?.destroy();
        this.audioService.systemAudioCapture = null;
      }
      if (
        this.audioService.microphoneCapture === microphoneCaptureOwnedByInit
      ) {
        (this.audioService.microphoneCapture as any)?.__disarmStuckWatchdog?.();
        this.audioService.microphoneCapture?.destroy();
        this.audioService.microphoneCapture = null;
      }
      if (
        systemSttStartedByInit &&
        this.audioService.interviewerSTT === systemSttOwnedByInit
      )
        this.audioService.interviewerSTT?.stop();
      if (
        userSttStartedByInit &&
        this.audioService.userSTT === userSttOwnedByInit
      )
        this.audioService.userSTT?.stop();
    };

    if (!isCurrentMeeting()) {
      console.warn(
        '[Main] Meeting was cancelled before audio pipeline could start — aborting init.'
      );
      return;
    }
    try {
      if (metadata?.audio) {
        await this.audioService.reconfigureAudio(
          metadata.audio.inputDeviceId,
          metadata.audio.outputDeviceId
        );
        systemCaptureOwnedByInit = this.audioService.systemAudioCapture;
        microphoneCaptureOwnedByInit = this.audioService.microphoneCapture;
        systemSttOwnedByInit = this.audioService.interviewerSTT;
        userSttOwnedByInit = this.audioService.userSTT;
      }
      if (metadata?.audio && !isCurrentMeeting()) {
        abortStaleAudioInit();
        return;
      }

      await this.audioService.setupSystemAudioPipeline();
      if (!isCurrentMeeting()) {
        abortStaleAudioInit();
        return;
      }
      systemCaptureOwnedByInit = this.audioService.systemAudioCapture;
      microphoneCaptureOwnedByInit = this.audioService.microphoneCapture;
      systemSttOwnedByInit = this.audioService.interviewerSTT;
      userSttOwnedByInit = this.audioService.userSTT;

      this.audioService.systemAudioCapture?.start();
      this.audioService.interviewerSTT?.start();
      systemSttStartedByInit = true;

      this.audioService.microphoneCapture?.start();
      this.audioService.userSTT?.start();
      userSttStartedByInit = true;

      if (!isCurrentMeeting()) {
        abortStaleAudioInit();
        return;
      }

      // Default-output sessions must follow mid-meeting route changes.
      this.audioService.startDefaultOutputWatcher();

      if (isVerboseLogging()) {
        const requestedInput = metadata?.audio?.inputDeviceId || 'default';
        const requestedOutput = metadata?.audio?.outputDeviceId || 'default';
        const backend = requestedOutput === 'sck' ? 'sck' : 'coreaudio';
        const sysRate =
          this.audioService.systemAudioCapture?.getSampleRate() || 48000;
        const micRate =
          this.audioService.microphoneCapture?.getSampleRate() || 48000;
        console.log(
          `[Main][debug] Audio pipeline: input=${requestedInput} output=${requestedOutput} backend=${backend} sysRate=${sysRate}Hz micRate=${micRate}Hz`
        );
      }
      console.log('[Main] Audio pipeline started successfully.');
    } catch (err) {
      const isAbort =
        (err as Error)?.message === 'audio_init_aborted' || !isCurrentMeeting();
      if (!isAbort) {
        console.error('[Main] Error initializing audio pipeline:', err);
        this.sendAudioCaptureFailed({
          channel: 'mic',
          message: (err as Error).message || 'Audio pipeline failed to start',
          attempt: 0,
          maxAttempts: 0,
          terminal: true,
          stuck: false,
        });
        return;
      }
      abortStaleAudioInit();
    } finally {
      if (this._meetingGeneration === meetingGeneration)
        this._audioInitPromise = null;
      if (this._audioInitController === audioInitController) {
        this._audioInitController = null;
      }
    }
  })(); // next tick lets the renderer receive the start response before audio init
}

export async function endMeetingImpl(this: MeetingService): Promise<void> {
  // Double Stop/reset calls must not race one teardown against another.
  if (
    this._endMeetingInFlight ||
    (!this.isMeetingActive && this._pendingTeardown)
  ) {
    console.log('[Main] endMeeting() ignored — teardown already in flight.');
    await this._pendingTeardown?.catch((): void => {});
    return;
  }
  // Covers the yield before `_pendingTeardown` is assigned.
  this._endMeetingInFlight = true;
  console.log('[Main] Ending Meeting...');

  // startMeeting() can reset this before the background drain persists.
  const wasAborted: boolean = this._abortMeeting === true;

  // Hide overlay before state flips so teardown effects never paint onscreen.
  this.windowHelper.setWindowMode('launcher');

  // UI flips immediately; `_isDraining` keeps trailing STT finals accepted.
  this.isMeetingActive = false;
  this._meetingGeneration++;
  this._isDraining = true;
  this.broadcastMeetingState();

  // Cold-start Stop must abort init before teardown to avoid duplicate native handles.
  this._audioInitController?.abort();
  try {
    await this._audioInitPromise;
  } catch {}
  this._audioInitPromise = null;
  this._endMeetingInFlight = false;

  // Stop can defer native teardown; disarm watchdogs before they false-fire.
  (this.audioService.systemAudioCapture as any)?.__disarmStuckWatchdog?.();
  (this.audioService.microphoneCapture as any)?.__disarmStuckWatchdog?.();

  // Null wrappers now so fast Stop→Start cannot reuse handles still releasing CoreAudio.
  const dyingSystemCapture = this.audioService.systemAudioCapture;
  const dyingMicrophoneCapture = this.audioService.microphoneCapture;
  this.audioService.systemAudioCapture = null;
  this.audioService.microphoneCapture = null;
  this.sendToMeetingSurfaces('audio-capture-active', {
    channel: 'system',
    active: false,
  });
  this.sendToMeetingSurfaces('audio-capture-active', {
    channel: 'mic',
    active: false,
  });
  const captureTeardownPromise = Promise.all([
    Promise.resolve(dyingSystemCapture?.destroy()).catch((e) => {
      console.error('[Main] System capture teardown failed:', e);
    }),
    Promise.resolve(dyingMicrophoneCapture?.destroy()).catch((e) => {
      console.error('[Main] Microphone capture teardown failed:', e);
    }),
  ]).then(() => {});

  this.audioService.stopDefaultOutputWatcher();

  // finalize() happens per-channel inside the drain below — stopping both
  // engines here made their commit/final bursts interleave nondeterministically.

  // Background drain preserves trailing finals without blocking Stop UI.
  this._pendingTeardown = (async () => {
    // Native release must finish before any next meeting opens the same device.
    await captureTeardownPromise;
    try {
      // Drain ONE channel at a time: stop it, then wait for its terminal
      // 'final' before touching the next. A fixed delay races the post-stop
      // commit pass (words vanish), and PARALLEL drains interleave the two
      // channels' commit/final bursts nondeterministically — the renderer
      // and persistence then fold the same events with different adjacency
      // and the meeting page stops matching the Transcript tab.
      this.audioService.interviewerSTT?.finalize?.();
      await this.audioService.interviewerSTT?.awaitDrained?.();
      this.audioService.userSTT?.finalize?.();
      await this.audioService.userSTT?.awaitDrained?.();

      for (const [speaker, text] of Object.entries(this.livePartials)) {
        if (!text?.trim()) continue;
        this.dialogueTurns = appendDialogueFinal(
          this.dialogueTurns,
          speaker as 'Me' | 'Them',
          text
        );
        this.livePartials[speaker as 'Me' | 'Them'] = null;
      }

      // Close the dispatch gate BEFORE snapshotting: an engine straggler
      // landing between the persistence read and the overlay sync would give
      // the two surfaces different dialogues — the entire bug class this
      // drain exists to prevent.
      this._isDraining = false;

      console.log(
        `[Main] Meeting transcript captured (${this.dialogueTurns.length} dialogue turns).`
      );

      // Persist only after the drain; early reads miss trailing finals.
      this.emitMeetingTranscriptReady(this.getTranscriptText(), wasAborted);
    } catch (err) {
      console.error('[Main] Background meeting teardown failed:', err);
    } finally {
      this._isDraining = false;
      // Authoritative sync: live streaming raced the window hide often enough
      // to drop a terminal final on the renderer side. Main's folded turns ARE
      // the persisted transcript — hand the overlay that exact state.
      this.sendToMeetingSurfaces('dialogue-drained', this.dialogueTurns);
      this.windowHelper.getOverlayWindow()?.webContents.send('session-reset');
    }
  })();
}
