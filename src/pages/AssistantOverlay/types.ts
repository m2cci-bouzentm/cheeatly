import type React from 'react';
import type { MotionValue } from 'framer-motion';
import type { UIMessage } from 'ai';
export type AppMessageMetadata = {
  hasScreenshot?: boolean;
  screenshotPreview?: string;
  isError?: boolean;
};

export type AppMessage = UIMessage<AppMessageMetadata>;

export function getMessageText(msg: AppMessage): string {
  return msg.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

export function getMessageIntent(msg: AppMessage): string | undefined {
  if (msg.role !== 'user') return undefined;
  const text = getMessageText(msg).trim();
  switch (text) {
    case 'What should I say?':
    case 'What should I say about this?':
      return 'chat';
    case 'Give me a recap':
      return 'recap';
    case 'Suggest follow-up questions':
      return 'follow_up_questions';
    case 'Clarify what was said':
      return 'clarify';
    default:
      return undefined;
  }
}

export interface AssistantOverlayProps {
  overlayOpacity?: number;
}

export interface AttachmentContext {
  path: string;
  preview: string;
}

export type SttStatus =
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'awaiting-audio';

export interface SttChannel {
  status: SttStatus;
  error?: string;
  provider: string;
}

export interface SttSummary {
  label: string;
  tone: 'ok' | 'warn' | 'error';
  detail: string;
}

export interface SystemAudioWarning {
  kind: 'screen-recording-permission';
  message: string;
  channel?: 'system' | 'mic';
}

export interface OverlayAppearance {
  [key: string]: any;
}

export interface MessageRowProps {
  msg: AppMessage;
  isStreaming: boolean;
  isLightTheme: boolean;
  appearance: OverlayAppearance;
  onCopy: (text: string) => void;
  renderMessageText: (msg: AppMessage, isStreaming: boolean) => React.ReactNode;
}

export interface SuggestionPanelProps {
  showSuggestionPanel: boolean;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  scrollMaxH: MotionValue<number>;
  displayMessages: AppMessage[];
  isLightTheme: boolean;
  appearance: OverlayAppearance;
  handleCopy: (text: string) => void;
  renderMessageText: (msg: AppMessage, isStreaming: boolean) => React.ReactNode;
  isProcessing: boolean;
  isStreaming: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
}
