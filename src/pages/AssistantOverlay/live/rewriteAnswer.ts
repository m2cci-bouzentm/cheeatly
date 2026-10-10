import type { UIMessage, UIMessageChunk } from 'ai';

// One-off assistant completion for the per-answer tools (Shorter, Another angle). It uses the same
// chat stream as the thread but is not added to the conversation; the result replaces the shown text.
export function rewriteAnswer(instruction: string, answer: string): Promise<string> {
  const streamId = crypto.randomUUID();
  const message: UIMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    parts: [{ type: 'text', text: `${instruction}\n\n${answer}` }],
  };
  return new Promise((resolve, reject) => {
    let text = '';
    const off = window.desktopAPI.onChatStreamEvent((event) => {
      if (event.streamId !== streamId) return;
      if (event.type === 'chunk') {
        const chunk = event.chunk as UIMessageChunk;
        if (chunk.type === 'text-delta') text += chunk.delta;
        return;
      }
      off();
      if (event.type === 'end') resolve(text.trim());
      else reject(new Error(event.error || 'Rewrite failed'));
    });
    window.desktopAPI.chatStreamStart(streamId, [message], { system: '' }).catch((error: Error) => {
      off();
      reject(error);
    });
  });
}

export const SHORTER_INSTRUCTION =
  'Rewrite this answer much shorter: one or two sentences I can say out loud, same meaning. Reply with the rewritten answer only.';
export const ANGLE_INSTRUCTION =
  'Give me another way to say this answer, with a different angle but the same goal, about the same length. Reply with the new answer only.';
