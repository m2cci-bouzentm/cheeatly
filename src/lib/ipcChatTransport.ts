import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';

// Preserve useChat semantics over Tauri IPC by streaming raw UIMessageChunks.
type IpcChatBody = {
  system?: string;
};

export class IpcChatTransport implements ChatTransport<UIMessage> {
  async sendMessages(
    options: {
      messages: UIMessage[];
      abortSignal?: AbortSignal;
      body?: unknown;
    } & Record<string, unknown>
  ): Promise<ReadableStream<UIMessageChunk>> {
    const streamId = crypto.randomUUID();
    const body = (options.body ?? {}) as IpcChatBody;

    return new ReadableStream<UIMessageChunk>({
      start(controller) {
        let finished = false;
        const finish = (fn: () => void) => {
          if (finished) return;
          finished = true;
          off();
          options.abortSignal?.removeEventListener('abort', abort);
          fn();
        };

        const off = window.desktopAPI.onChatStreamEvent((evt) => {
          if (finished || evt.streamId !== streamId) return;
          if (evt.type === 'chunk') {
            controller.enqueue(evt.chunk as UIMessageChunk);
            return;
          }
          if (evt.type === 'end') {
            finish(() => controller.close());
            return;
          }
          finish(() =>
            controller.error(new Error(evt.error || 'Chat stream error'))
          );
        });

        const abort = () => {
          window.desktopAPI.chatStreamAbort(streamId);
          finish(() => controller.close());
        };
        options.abortSignal?.addEventListener('abort', abort, { once: true });
        if (options.abortSignal?.aborted) { abort(); return; }

        window.desktopAPI
          .chatStreamStart(streamId, options.messages, {
            system: body.system,
          })
          .catch((err: Error) => {
            finish(() => controller.error(err));
          });
      },
    });
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null;
  }
}
