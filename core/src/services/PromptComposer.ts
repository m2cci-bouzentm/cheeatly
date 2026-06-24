import { buildUserContextBlock } from '../api/context';
import { buildTools, buildToolsCatalog, hasTools } from '../tools';

export class PromptComposer {
  async buildUserContext(): Promise<string> {
    return buildUserContextBlock();
  }

  buildToolsCatalog(): string {
    return buildToolsCatalog();
  }

  hasTools(): boolean {
    return hasTools();
  }

  buildTools(): Record<string, any> | undefined {
    return this.hasTools() ? buildTools() : undefined;
  }

  buildTranscriptBlock(
    transcript: string,
    opts?: { maxLen?: number; label?: string }
  ): string {
    const trimmed = transcript.trim();
    if (!trimmed) return '';
    const label = opts?.label ?? 'LIVE MEETING TRANSCRIPT';
    const text = opts?.maxLen ? trimmed.slice(0, opts.maxLen) : trimmed;
    return `${label}:\n${text}`;
  }

  assembleSystem(parts: (string | undefined | null | false)[]): string | undefined {
    const joined = parts.filter(Boolean).join('\n\n');
    return joined || undefined;
  }
}
