import { streamText, generateText, convertToModelMessages, stepCountIs } from 'ai';
import { ProviderCredentials, DetectedMeetingSuggestion } from '../types';
import { resolveModel } from './llm/provider';
import {
  getSystemPrompt,
  getQuestionDetectionPrompt,
  getTitlePrompt,
  getSummaryPrompt,
  render,
} from './promptLoader';
import { PromptComposer } from './PromptComposer';
import { ResponseParser } from './ResponseParser';

export type ChatOptions = {
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
  onUIChunk?: (chunk: unknown) => void;
  systemExtra?: string;
};

const CHAT_MAX_TOOL_STEPS = 3;
const CHAT_TIMEOUT_MS = 60_000;
const DETECTION_TIMEOUT_MS = 30_000;
const DETECTION_MAX_TOOL_STEPS = 2;

export class AIService {
  private composer = new PromptComposer();

  async chat(
    messages: unknown[],
    credentials: ProviderCredentials,
    opts?: ChatOptions
  ): Promise<string> {
    const model = resolveModel(credentials.provider, credentials.apiKey, credentials.model);
    const contextBlock = await this.composer.buildUserContext();
    const toolsAvailable = this.composer.hasTools();

    const system = this.composer.assembleSystem([
      getSystemPrompt(),
      opts?.systemExtra,
      contextBlock,
      this.composer.buildToolsCatalog(),
    ]);

    const modelMessages = await convertToModelMessages(messages as any);
    const timeout = AbortSignal.timeout(CHAT_TIMEOUT_MS);

    const result = streamText({
      model,
      system,
      messages: modelMessages,
      tools: this.composer.buildTools(),
      stopWhen: toolsAvailable ? stepCountIs(CHAT_MAX_TOOL_STEPS) : undefined,
      abortSignal: opts?.signal
        ? AbortSignal.any([opts.signal, timeout])
        : timeout,
    });

    let full = '';
    for await (const chunk of result.toUIMessageStream()) {
      opts?.onUIChunk?.(chunk);
      const c = chunk as { type: string; delta?: string; errorText?: string };
      if (c.type === 'text-delta' && c.delta) {
        full += c.delta;
        opts?.onDelta?.(c.delta);
        continue;
      }
      if (c.type === 'error') {
        throw new Error(c.errorText || 'Chat stream error');
      }
    }
    return full;
  }

  async generateTitle(
    transcript: string,
    credentials: ProviderCredentials
  ): Promise<string> {
    const model = resolveModel(credentials.provider, credentials.apiKey, credentials.model);
    const prompt = render(getTitlePrompt(), { transcript: transcript.slice(0, 2000) });
    const { text } = await generateText({ model, prompt });
    return ResponseParser.cleanTitle(text);
  }

  async generateSummary(
    transcript: string,
    credentials: ProviderCredentials
  ): Promise<string> {
    const model = resolveModel(credentials.provider, credentials.apiKey, credentials.model);
    const prompt = render(getSummaryPrompt(), { transcript });
    const { text } = await generateText({ model, prompt });
    return text;
  }

  async analyzeTranscript(
    transcript: string,
    credentials: ProviderCredentials
  ): Promise<{ questions: DetectedMeetingSuggestion[] }> {
    if (!transcript.trim()) return { questions: [] };

    const model = resolveModel(credentials.provider, credentials.apiKey, credentials.model);
    const userContext = await this.composer.buildUserContext();
    const toolsAvailable = this.composer.hasTools();

    const system = this.composer.assembleSystem([
      getQuestionDetectionPrompt(),
      userContext,
      this.composer.buildToolsCatalog(),
    ]);

    try {
      const { text } = await generateText({
        model,
        system,
        prompt: transcript,
        temperature: 0,
        tools: this.composer.buildTools(),
        stopWhen: toolsAvailable ? stepCountIs(DETECTION_MAX_TOOL_STEPS) : undefined,
        abortSignal: AbortSignal.timeout(DETECTION_TIMEOUT_MS),
      });

      const parsed = ResponseParser.cleanJSON<{ questions: DetectedMeetingSuggestion[] }>(text);
      return {
        questions: parsed.questions
          .filter((q) => q.text.trim())
          .slice(0, 5)
          .map((q) => ({
            text: q.text.trim(),
            speaker: q.speaker,
            type: q.type,
            intent: q.intent.trim(),
            prompt: q.prompt.trim(),
            priority: q.priority,
          })),
      };
    } catch (err) {
      console.error('[AIService] analyzeTranscript failed:', err);
      return { questions: [] };
    }
  }
}
