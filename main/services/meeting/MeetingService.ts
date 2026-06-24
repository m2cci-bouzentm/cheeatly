import { TranscriptHandler } from '../audio/native/TranscriptHandler';
import { WindowService } from '../window/WindowService';
import type { AudioService, TranscriptSegment } from '../audio/AudioService';
import {
  abortMeetingImpl,
  startMeetingImpl,
  endMeetingImpl,
} from './MeetingImpl';
// THE overlay dialogue reducer — main folds the same events with the same
// rules, so the persisted transcript IS the dialogue the Transcript tab
// painted (parity by construction, not by replay).
import {
  appendDialogueFinal,
  type LivePartials,
  type DialogueTurn,
} from '../../../renderer/lib/dialogueTranscript';

// Audio is lazy-injected to avoid the MeetingService/AudioService construction cycle.
export class MeetingService {
  public isMeetingActive: boolean = false;
  public _meetingGeneration = 0;
  public _audioInitPromise: Promise<void> | null = null;
  public _audioInitController: AbortController | null = null;
  public _endMeetingInFlight = false;
  public _isDraining: boolean = false;
  public _pendingTeardown: Promise<void> | null = null;
  public _abortMeeting: boolean = false;
  public dialogueTurns: DialogueTurn[] = [];
  public livePartials: LivePartials = { Me: null, Them: null };
  public transcriptHandler = new TranscriptHandler();

  constructor(
    private readonly getAudioService: () => AudioService,
    public readonly windowHelper: WindowService,
    public readonly appBroadcast: (channel: string, ...args: any[]) => void,
    public readonly sendToMeetingSurfaces: (
      channel: string,
      ...args: any[]
    ) => void,
    public readonly sendAudioCaptureFailed: (payload: any) => void,
    public readonly sendSystemAudioPermissionDenied: (message: string) => void
  ) {}

  public get audioService(): AudioService {
    return this.getAudioService();
  }

  public async abortMeeting(): Promise<void> {
    return abortMeetingImpl.call(this);
  }
  public async startMeeting(metadata?: any): Promise<void> {
    return startMeetingImpl.call(this, metadata);
  }
  public async endMeeting(): Promise<void> {
    return endMeetingImpl.call(this);
  }

  // Every dispatched STT segment flows through here — the exact reducer the
  // overlay applies in useMeetingState, with the exact speaker mapping.
  public applyTranscriptSegment(segment: TranscriptSegment): void {
    const label = segment.speaker === 'interviewer' ? 'Them' : 'Me';
    if (segment.final) {
      this.dialogueTurns = appendDialogueFinal(
        this.dialogueTurns,
        label,
        segment.text
      );
      this.livePartials[label] = null;
      return;
    }
    this.livePartials[label] = segment.text.trim();
  }

  public getTranscriptText(): string {
    // Body stays plain JS: tests extract and run it via new Function.
    // Body stays plain JS: tests extract and run it via new Function.
    const livePartials = Object.entries(this.livePartials)
      .filter(([, text]) => Boolean(text?.trim()))
      .map(([speaker, text]) => `${speaker}: ${text}`);
    return [
      ...this.dialogueTurns.map((t) => `${t.speaker}: ${t.text}`),
      ...livePartials,
    ].join('\n');
  }

  public broadcastMeetingState(): void {
    console.log(`[MeetingState] broadcast isActive=${this.isMeetingActive}`);
    this.appBroadcast('meeting-state-changed', {
      isActive: this.isMeetingActive,
    });
  }

  // Persistence waits for drained STT finals; do not read transcriptBuffer directly.
  private _meetingPersistence:
    | ((transcript: string, aborted: boolean) => void)
    | null = null;
  public setMeetingPersistenceHandler(
    fn: (transcript: string, aborted: boolean) => void
  ): void {
    this._meetingPersistence = fn;
  }
  public emitMeetingTranscriptReady(
    transcript: string,
    aborted: boolean
  ): void {
    try {
      this._meetingPersistence?.(transcript, aborted);
    } catch (err) {
      console.error('[Main] Meeting persistence handler threw:', err);
    }
  }
}
