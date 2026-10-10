import type { DetectedQuestion } from '../../../types/desktop';
import { isMac } from '../../../utils/platformUtils.ts';
import { getMessageIntent } from '../types.ts';
import type { AppMessage, MessageIntent } from '../types.ts';

// Request bubbles show the action's design label, not the prompt text sent to the assistant.
const INTENT_LABEL: Record<MessageIntent, string> = {
  chat: 'Help me respond',
  follow_up_questions: 'Suggest a question',
  recap: 'Recap the call',
  clarify: 'Clarify',
};

const KEY_SYMBOL: Record<string, string> = { Enter: '↵', Space: '␣', Shift: '⇧' };

// "⌘↵" on macOS (symbols run together), "Ctrl+H" elsewhere.
export function formatShortcut(keys: string[]): string {
  const symbols = keys.map((key) => KEY_SYMBOL[key] ?? key);
  return symbols.join(isMac ? '' : '+');
}

// Same shape as the design's timer: minutes without padding, seconds padded ("12:08", "75:03").
export function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// Backend suggestion types ("buying_signal") shown as the card category ("BUYING SIGNAL" via CSS uppercase).
export function categoryLabel(type: string): string {
  return type.replace(/_/g, ' ');
}

export function requestLabel(message: AppMessage, text: string): string {
  const intent = getMessageIntent(message);
  if (!intent) return text;
  return INTENT_LABEL[intent];
}

// The card text is the prompt sent to the assistant (backend `prompt`, else the detected phrase).
export function promptOf(question: DetectedQuestion): string {
  const prompt = question.prompt?.trim();
  if (prompt) return prompt;
  if (question.speaker === 'Them') return `Help me answer: ${question.text}`;
  return `Follow up on: ${question.text}`;
}

// After a scan the user started: the backend's reason when it gives one ("Waiting for speech…"),
// otherwise the design's "No new suggestions".
export function scanResultMessage(notice: string): string {
  if (notice && !notice.startsWith('Scan complete')) return notice;
  return 'No new suggestions';
}
