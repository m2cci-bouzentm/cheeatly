// Streaming contract tests for the in-process library.
//
// Regression context: after the AI SDK v6 migration the Electron client kept
// parsing the old SSE format while the server moved formats. The transport is
// now in-process callbacks; these tests pin THAT contract: chat streams
// UIMessageChunks + text deltas in order.
//
// Only the LLM itself is mocked (MockLanguageModelV3) — validation, context
// assembly, and the streaming pipeline are all real.
import { describe, it, expect, afterAll, vi } from 'vitest';
import '../helpers/testEnv';
import { chat } from '../../api/chat';
import { ValidationError } from '../../errors';
import { getPrisma } from '../../config/database';

vi.mock('../../services/llm/provider', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../services/llm/provider')>();
  const { MockLanguageModelV3, simulateReadableStream } =
    await import('ai/test');
  return {
    ...actual,
    resolveModel: () =>
      new MockLanguageModelV3({
        doStream: async (options: any) => {
          capturedPrompts.push(options.prompt);
          return {
            stream: simulateReadableStream({
              chunks: [
                { type: 'stream-start', warnings: [] },
                { type: 'text-start', id: 't1' },
                { type: 'text-delta', id: 't1', delta: 'Hello ' },
                { type: 'text-delta', id: 't1', delta: 'world' },
                { type: 'text-end', id: 't1' },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
                },
              ],
            }),
          };
        },
      }),
  };
});

const CREDS = { provider: 'gemini', apiKey: 'test-key' };

describe('streaming contracts', () => {
  afterAll(async () => {
    await getPrisma().$disconnect();
  });

  it('chat streams text deltas in order and resolves with the concatenation', async () => {
    const deltas: string[] = [];
    const full = await chat(
      [
        {
          id: 'u1',
          role: 'user',
          parts: [{ type: 'text', text: 'Say hello' }],
        },
      ],
      CREDS,
      { onDelta: (d) => deltas.push(d) }
    );

    expect(full).toBe('Hello world');
    expect(deltas).toEqual(['Hello ', 'world']);
  });

  it('chat forwards raw UIMessageChunks (the renderer useChat wire contract)', async () => {
    const types: string[] = [];
    await chat(
      [
        {
          id: 'u1',
          role: 'user',
          parts: [{ type: 'text', text: 'Say hello' }],
        },
      ],
      CREDS,
      { onUIChunk: (c) => types.push((c as { type: string }).type) }
    );

    // The chunk stream must contain text deltas the IpcChatTransport re-enqueues.
    expect(types).toContain('text-delta');
  });

  it('chat accepts a leading system UIMessage (IPC chat sends one)', async () => {
    const full = await chat(
      [
        {
          id: 's1',
          role: 'system',
          parts: [{ type: 'text', text: 'Be terse.' }],
        },
        {
          id: 'u1',
          role: 'user',
          parts: [{ type: 'text', text: 'Say hello' }],
        },
      ],
      CREDS
    );

    expect(full).toBe('Hello world');
  });

  it('chat rejects a missing/empty messages array with ValidationError', async () => {
    await expect(chat([], CREDS)).rejects.toThrow(ValidationError);
    await expect(
      chat(undefined as unknown as unknown[], CREDS)
    ).rejects.toThrow(ValidationError);
  });

});
