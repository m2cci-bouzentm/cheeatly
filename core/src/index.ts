// Main-process-only facade; importing core from preload/worker bundles duplicates DB singletons.

import { CoreOptions, initConfig, config } from './config';
import { initDatabase, closeDatabase } from './config/database';
import type { FileStorageProvider } from './contracts/FileStorageProvider';
import { LocalStorageService } from './services/storage/LocalStorageService';
import * as meetings from './api/meetings';
import * as contextApi from './api/context';
import * as skills from './api/skills';
import { chat } from './api/chat';
import { getProviderNames, ProviderName, resolveModel } from './services/llm/provider';

export type CheatlyCore = {
  meetings: typeof meetings;
  chat: typeof chat;
  context: typeof contextApi;
  skills: typeof skills;
  providers: { list(): ProviderName[] };
  shutdown(): Promise<void>;
};

let core: CheatlyCore | null = null;

const bindings = {
  storage: null as FileStorageProvider | null,
};

function bindImplementations(): void {
  bindings.storage = new LocalStorageService(config().paths.storage);
}

export function getStorage(): FileStorageProvider {
  if (!bindings.storage) {
    throw new Error('Bindings not resolved — call initCore() first.');
  }
  return bindings.storage;
}

export function initCore(options: CoreOptions): CheatlyCore {
  initConfig(options);
  if (core) return core;

  bindImplementations();
  initDatabase();

  core = {
    meetings,
    chat,
    context: contextApi,
    skills,
    providers: { list: getProviderNames },
    shutdown: closeDatabase,
  };
  return core;
}

export { ValidationError, NotFoundError } from './errors';
export type { CoreOptions } from './config';
export type { ProviderCredentials, DetectedMeetingSuggestion } from './types';
export { resolveModel } from './services/llm/provider';
export type { ProviderName } from './services/llm/provider';
export type { ChatOptions } from './api/chat';
export type { MeetingList, SummaryStatus } from './api/meetings';
