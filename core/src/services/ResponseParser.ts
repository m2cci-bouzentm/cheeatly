import { escapeSummaryForResponse } from './summaryEscaping';

export class ResponseParser {
  static cleanJSON<T>(text: string): T {
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '');
    return JSON.parse(cleaned) as T;
  }

  static cleanTitle(text: string, maxLen = 80): string {
    return text
      .replace(/^["']|["']$/g, '')
      .trim()
      .slice(0, maxLen);
  }

  static escapeSummary(text: string): string {
    return escapeSummaryForResponse(text);
  }
}
