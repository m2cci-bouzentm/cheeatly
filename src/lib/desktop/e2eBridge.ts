import type { DesktopAPI } from '../../types/desktop';

const listeners = new Map<string, Set<(payload: unknown) => void>>();

function on<T>(event: string, callback: (payload: T) => void): () => void {
  const callbacks = listeners.get(event) ?? new Set();
  callbacks.add(callback as (payload: unknown) => void);
  listeners.set(event, callbacks);
  return () => callbacks.delete(callback as (payload: unknown) => void);
}

const success = async () => ({ success: true });
const nothing = async () => undefined;

export const e2eDesktopAPI = new Proxy(
  {
    platform: 'darwin',
    getQuestionState: async () => ({
      questions: [],
      isScanning: false,
      scanError: '',
      scanNotice: '',
      settingsEnabled: true,
      isPaused: false,
      revision: 0,
    }),
    getRecentMeetings: async () => [],
    getMeetingActive: async () => false,
    getMeetingStartedAt: async () => null,
    getStoredCredentials: async () => ({
      hasOpenRouterKey: false,
      sttProvider: 'none',
    }),
    getCurrentLlmConfig: async () => ({ provider: 'none', model: '' }),
    getDefaultModel: async () => ({ model: 'qwen/qwen3.7-flash' }),
    getRecognitionLanguages: async () => ({ auto: 'Auto', english: 'English' }),
    getInputDevices: async () => [],
    getOutputDevices: async () => [],
    getKeybinds: async () => [],
    getQuestionAnalysisConfig: async () => ({
      enabled: true,
      interval: 20,
      model: '',
      openRouterApiKey: '',
      window: 20,
    }),
    getSttLanguage: async () => 'auto',
    getUndetectable: async () => false,
    getDisguise: async () => 'none',
    getOpenAtLogin: async () => false,
    getVerboseLogging: async () => false,
    openPermissionSettings: async () => undefined,
    requestMicrophonePermission: async () => undefined,
    checkPermissions: async () => ({
      microphone: 'granted',
      screen: 'granted',
      platform: 'darwin',
      getQuestionState: async () => ({
        questions: [],
        isScanning: false,
        scanError: '',
        scanNotice: '',
        settingsEnabled: true,
        isPaused: false,
        revision: 0,
      }),
    }),
    skillsList: async () => [],
    contextGetDescription: async () => ({ success: true, content: '' }),
    contextGetFiles: async () => ({ success: true, files: [] }),
    startMeeting: success,
    endMeeting: success,
    setChannelMuted: success,
    setApiKey: success,
    setModel: success,
    setSttProvider: success,
    setRecognitionLanguage: success,
    setQuestionAnalysisConfig: success,
    setVerboseLogging: success,
    setOpenAtLogin: success,
    setDisguise: success,
    setUndetectable: success,
    resetIntelligence: success,
  },
  {
    get(target, property: string) {
      if (property in target) return target[property as keyof typeof target];
      if (property.startsWith('on')) {
        return (callback: (payload: unknown) => void) => on(property, callback);
      }
      if (property.startsWith('get')) return nothing;
      return success;
    },
  }
) as unknown as DesktopAPI;
