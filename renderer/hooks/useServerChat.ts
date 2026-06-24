import { useCallback, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { IpcChatTransport } from '../lib/ipcChatTransport';
import type { AppMessage, AppMessageMetadata } from '../pages/AssistantOverlay/types';

export function useServerChat() {
  const transportRef = useRef(new IpcChatTransport());

  const { messages, setMessages, sendMessage, status, stop, error } =
    useChat<AppMessage>({
      transport: transportRef.current,
    });

  const sendWithSystem = useCallback(
    (
      text: string,
      system: string,
      opts?: {
        files?: Array<{ type: 'file'; mediaType: string; url: string }>;
        metadata?: AppMessageMetadata;
      },
    ) =>
      sendMessage(
        { text, files: opts?.files, metadata: opts?.metadata },
        { body: { system } },
      ),
    [sendMessage],
  );

  return {
    messages,
    setMessages,
    sendMessage,
    sendWithSystem,
    status,
    stop,
    error,
  };
}
