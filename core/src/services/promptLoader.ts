import { readFileSync } from 'fs';
import { resolve } from 'path';
import { config } from '../config';

const cache = new Map<string, string>();

function loadPrompt(relativePath: string): string {
  if (cache.has(relativePath)) {
    return cache.get(relativePath)!;
  }
  const content = readFileSync(
    resolve(config().paths.prompts, relativePath),
    'utf-8'
  );
  cache.set(relativePath, content);
  return content;
}

export function render(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (t, [key, val]) => t.replaceAll('{{' + key + '}}', val),
    template
  );
}

export function getSystemPrompt(): string {
  return loadPrompt('system.md');
}

export function getSummaryPrompt(): string {
  return loadPrompt('summary.md');
}

export function getTitlePrompt(): string {
  return loadPrompt('title.md');
}

export function getQuestionDetectionPrompt(): string {
  return loadPrompt('question-detection.md');
}
