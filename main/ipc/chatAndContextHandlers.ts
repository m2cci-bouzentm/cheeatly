import { dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { CheatlyCore, ProviderCredentials } from '../../core/src';
import type { File as ContextFileRecord } from '@prisma/client';
type ChatStreamPayload = { streamId: string; messages: unknown[]; system?: string };
import { safeHandle, safeOn } from './safeHandle';

type ChatAndContextServices = {
  core: CheatlyCore;
  resolveLlmCredentials: () => ProviderCredentials;
  getFallbackTranscript: () => string;
};

type ContextFileForIpc = Pick<ContextFileRecord, 'id' | 'filename'> & {
  createdAt: string;
};

type PdfToMarkdown = (pdfBuffer: Buffer) => Promise<string>;
type Mammoth = {
  extractRawText(input: { path: string }): Promise<{ value: string }>;
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export function registerChatAndContextHandlers(
  services: ChatAndContextServices
): void {
  const { core, resolveLlmCredentials, getFallbackTranscript } = services;
  // Dates cross IPC as ISO strings — serialize context files at the boundary.
  const serializeFileForIpc = (
    file: ContextFileRecord
  ): ContextFileForIpc => ({
    id: file.id,
    filename: file.filename,
    createdAt: file.createdAt.toISOString(),
  });

  let lastAssistantMessage = '';
  let lastIntelligenceContext = '';
  // Keep useChat's stream shape while running over IPC.
  const activeChatStreams = new Map<string, AbortController>();
  safeHandle(
    'chat:stream',
    async (event, { streamId, messages, system }: ChatStreamPayload) => {
      const abortController = new AbortController();
      activeChatStreams.set(streamId, abortController);
      const send = (payload: Record<string, unknown>) => {
        if (event.sender.isDestroyed()) return;
        event.sender.send('chat:stream-event', { streamId, ...payload });
      };

      try {
        const transcript = getFallbackTranscript().trim();
        const fullSystem = [
          system?.trim() ?? '',
          transcript ? `LIVE MEETING TRANSCRIPT:\n${transcript}` : '',
        ]
          .filter(Boolean)
          .join('\n\n');
        lastIntelligenceContext = fullSystem;
        const finalText = await core.chat(messages, resolveLlmCredentials(), {
          signal: abortController.signal,
          onUIChunk: (chunk) => send({ type: 'chunk', chunk }),
          systemExtra: fullSystem || undefined,
        });
        lastAssistantMessage = finalText;
        send({ type: 'end' });
        return { success: true };
      } catch (error: unknown) {
        if (abortController.signal.aborted) {
          send({ type: 'end' });
          return { success: false, error: 'aborted' };
        }
        const message = errorMessage(error);
        send({ type: 'error', error: message });
        return { success: false, error: message };
      } finally {
        activeChatStreams.delete(streamId);
      }
    }
  );
  safeOn('chat:stream-abort', (_event, streamId: string) => {
    activeChatStreams.get(streamId)?.abort();
    activeChatStreams.delete(streamId);
  });

  safeHandle('get-intelligence-context', async () => {
    return {
      context: lastIntelligenceContext,
      lastAssistantMessage,
    };
  });
  safeHandle('reset-intelligence', async () => {
    lastAssistantMessage = '';
    lastIntelligenceContext = '';
    return { success: true };
  });
  safeHandle('context:get-description', async () => {
    try {
      const content = await core.context.getDescription();
      return { success: true, content: content || '' };
    } catch (error: unknown) {
      return { success: false, content: '', error: errorMessage(error) };
    }
  });
  safeHandle('context:save-description', async (_event, content: string) => {
    try {
      const trimmed = typeof content === 'string' ? content.slice(0, 4000) : '';
      await core.context.saveDescription(trimmed);
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: errorMessage(error) };
    }
  });
  safeHandle('context:get-files', async () => {
    try {
      const files = (await core.context.getFiles()).map(serializeFileForIpc);
      return { success: true, files };
    } catch (error: unknown) {
      return { success: false, files: [], error: errorMessage(error) };
    }
  });
  safeHandle('context:upload-file', async () => {
    try {
      const result = (await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          {
            name: 'Documents',
            extensions: [
              'txt',
              'md',
              'json',
              'csv',
              'xml',
              'html',
              'pdf',
              'docx',
            ],
          },
        ],
      })) as unknown as Electron.OpenDialogReturnValue;
      if (result.canceled || !result.filePaths.length) {
        return { success: false, cancelled: true };
      }
      const filePath = result.filePaths[0];
      const fileName = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase();

      let content: string;
      const readers: Record<string, () => Promise<string> | string> = {
        '.pdf': async () => {
          const pdf2md = require('@opendocsg/pdf2md') as PdfToMarkdown;
          const buf = fs.readFileSync(filePath);
          return pdf2md(buf);
        },
        '.docx': async () => {
          const mammoth = require('mammoth') as Mammoth;
          const docResult = await mammoth.extractRawText({ path: filePath });
          return docResult.value;
        },
      };
      content = await (readers[ext]?.() ?? fs.readFileSync(filePath, 'utf8'));

      const file = serializeFileForIpc(await core.context.uploadFile(fileName, content));
      return { success: true, file };
    } catch (error: unknown) {
      return { success: false, error: errorMessage(error) };
    }
  });
  safeHandle('context:delete-file', async (_event, id: string) => {
    try {
      await core.context.deleteFile(id);
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: errorMessage(error) };
    }
  });
}
