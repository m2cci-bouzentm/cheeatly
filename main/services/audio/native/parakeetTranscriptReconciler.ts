import { filterTranscript } from './transcriptFilter';
import type {
  ParakeetEvent,
  ParakeetTranscriptEvent,
} from './parakeetProtocol';

const normWord = (word: string) =>
  word.toLowerCase().replace(/[^\p{L}\p{N}$%]/gu, '');

const normalizeWords = (text: string): string =>
  text.split(/\s+/).map(normWord).filter(Boolean).join(' ');

function stripCommittedPrefix(
  committedParts: string[],
  incomingText: string
): string {
  const priorStream = committedParts
    .join(' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}$%]/gu, '');
  if (!priorStream) return incomingText;

  const incomingWords = incomingText.split(/\s+/).filter(Boolean);
  let consumed = '';
  let splitIdx = 0;
  for (splitIdx = 0; splitIdx < incomingWords.length; splitIdx++) {
    const wordNorm = normWord(incomingWords[splitIdx]);
    if (!wordNorm) continue;
    const next = consumed + wordNorm;
    if (!priorStream.startsWith(next)) break;
    consumed = next;
  }
  return incomingWords.slice(splitIdx).join(' ');
}

export class ParakeetTranscriptReconciler {
  private committedParts: string[] = [];
  private emittedCommitNorm = '';

  reset(): void {
    this.committedParts = [];
    this.emittedCommitNorm = '';
  }

  handlePartial(
    event: ParakeetEvent,
    isSpeechActive = true
  ): ParakeetTranscriptEvent | null {
    const cleaned = filterTranscript(event.text || '');
    const remainder = stripCommittedPrefix(this.committedParts, cleaned);
    if (!remainder) return null;
    if (!isSpeechActive) {
      const refiltered = filterTranscript(remainder);
      if (!refiltered) return null;
    }
    return {
      text: remainder,
      isFinal: false,
      confidence: 0.7,
      startedAt: event.startedAt,
    };
  }

  handleCommitted(
    event: ParakeetEvent,
    isSessionActive: boolean,
    isSpeechActive = true
  ): ParakeetTranscriptEvent | null {
    const cleaned = filterTranscript(event.text || '');
    if (!cleaned) return null;

    const normalized = normalizeWords(cleaned);
    if (
      !isSessionActive &&
      normalized &&
      this.emittedCommitNorm.includes(normalized)
    ) {
      return null;
    }

    const remainder = stripCommittedPrefix(this.committedParts, cleaned);

    this.emittedCommitNorm += (this.emittedCommitNorm ? ' ' : '') + normalized;
    this.committedParts.push(cleaned);

    if (!remainder) return null;

    if (!isSpeechActive) {
      const refiltered = filterTranscript(remainder);
      if (!refiltered) return null;
    }

    return {
      text: remainder,
      isFinal: true,
      confidence: 0.85,
      startedAt: event.startedAt,
    };
  }

  handleFinal(event: ParakeetEvent): ParakeetTranscriptEvent | null {
    const cleaned = filterTranscript(event.text || '');
    const remainder = stripCommittedPrefix(this.committedParts, cleaned);
    if (!remainder) return null;

    return {
      text: remainder,
      isFinal: true,
      confidence: 0.9,
      startedAt: event.startedAt,
    };
  }
}
