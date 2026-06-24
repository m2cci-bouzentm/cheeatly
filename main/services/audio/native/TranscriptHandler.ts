export interface TranscriptHandlerState {
  isMeetingActive: boolean;
  isDraining: boolean;
  micMuted: boolean;
  systemMuted: boolean;
}

export interface STTSegment {
  text: string;
  isFinal: boolean;
  confidence: number;
  startedAt?: number;
}

export interface TranscriptDecision {
  action: 'drop' | 'dispatch';
  reason?: 'inactive' | 'muted' | 'duplicate';
  segment?: {
    speaker: string;
    text: string;
    timestamp: number;
    final: boolean;
    confidence: number;
  };
  feedRag?: boolean;
}

export class TranscriptHandler {
  private _lastFinalBySpeaker = new Map<string, string>();

  reset(): void {
    this._lastFinalBySpeaker.clear();
  }

  process(
    speaker: 'user' | 'interviewer',
    segment: STTSegment,
    state: TranscriptHandlerState
  ): TranscriptDecision {
    if (!state.isMeetingActive && !state.isDraining) {
      return { action: 'drop', reason: 'inactive' };
    }

    if (
      (speaker === 'user' && state.micMuted) ||
      (speaker === 'interviewer' && state.systemMuted)
    ) {
      return { action: 'drop', reason: 'muted' };
    }

    if (
      segment.isFinal &&
      segment.text &&
      this._lastFinalBySpeaker.get(speaker) === segment.text
    ) {
      return { action: 'drop', reason: 'duplicate' };
    }
    if (segment.isFinal && segment.text) {
      this._lastFinalBySpeaker.set(speaker, segment.text);
    }

    const ts = segment.startedAt || Date.now();

    return {
      action: 'dispatch',
      segment: {
        speaker,
        text: segment.text,
        timestamp: ts,
        final: segment.isFinal,
        confidence: segment.confidence,
      },
      feedRag: segment.isFinal,
    };
  }
}
