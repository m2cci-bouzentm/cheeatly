export type ParakeetAudioSource = 'mic' | 'system';

export type ParakeetCommand =
  | {
      type: 'start';
      model: string;
      language: string;
      source: ParakeetAudioSource;
    }
  | {
      type: 'audio';
      source: ParakeetAudioSource;
      pcm16: string;
    }
  | {
      type: 'stop';
    };

export interface ParakeetEvent {
  type:
    | 'session_started'
    | 'partial'
    | 'committed'
    | 'final'
    | 'error'
    | 'status';
  source?: ParakeetAudioSource;
  text?: string;
  message?: string;
  startedAt?: number;
  endedAt?: number;
  timestampSeconds?: number;
}

export interface ParakeetTranscriptEvent {
  text: string;
  isFinal: boolean;
  confidence: number;
  startedAt?: number;
}

export function createStartCommand(
  model: string,
  language: string,
  source: ParakeetAudioSource
): ParakeetCommand {
  return { type: 'start', model, language, source };
}

export function createAudioCommand(
  source: ParakeetAudioSource,
  chunk: Buffer
): ParakeetCommand {
  return { type: 'audio', source, pcm16: chunk.toString('base64') };
}

export function createStopCommand(): ParakeetCommand {
  return { type: 'stop' };
}
