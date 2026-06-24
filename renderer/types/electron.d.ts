export interface ElectronAPI {
  updateContentDimensions: (dimensions: {
    width: number;
    height: number;
  }) => Promise<void>;
  onToggleExpand: (callback: () => void) => () => void;
  getRecognitionLanguages: () => Promise<Record<string, any>>;
  getScreenshots: () => Promise<Array<{ path: string; preview: string }>>;
  deleteScreenshot: (
    path: string
  ) => Promise<{ success: boolean; error?: string }>;
  onScreenshotTaken: (
    callback: (data: { path: string; preview: string }) => void
  ) => () => void;
  onCaptureAndProcess: (
    callback: (data: { path: string; preview: string }) => void
  ) => () => void;
  takeScreenshot: () => Promise<{ path: string; preview: string }>;
  moveWindowLeft: () => Promise<void>;
  moveWindowRight: () => Promise<void>;
  moveWindowUp: () => Promise<void>;
  moveWindowDown: () => Promise<void>;
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<void>;
  windowClose: () => Promise<void>;
  windowIsMaximized: () => Promise<boolean>;

  quitApp: () => Promise<void>;
  toggleWindow: () => Promise<void>;
  showWindow: (inactive?: boolean) => Promise<void>;
  hideWindow: () => Promise<void>;
  showOverlay: () => Promise<void>;
  hideOverlay: () => Promise<void>;
  getMeetingActive: () => Promise<boolean>;
  onMeetingStateChanged: (
    callback: (data: { isActive: boolean }) => void
  ) => () => void;
  onWindowMaximizedChanged: (
    callback: (isMaximized: boolean) => void
  ) => () => void;
  onEnsureExpanded: (callback: () => void) => () => void;
  openExternal: (url: string) => Promise<void>;
  // In-app TCC repair — macOS only.
  repairTccPermissions: () => Promise<{
    ok: boolean;
    bundleId?: string;
    results?: Array<{ service: string; ok: boolean; output: string }>;
    promptRelaunch?: boolean;
    error?: string;
    message: string;
  }>;
  setUndetectable: (
    state: boolean
  ) => Promise<{ success: boolean; error?: string }>;
  getUndetectable: () => Promise<boolean>;
  setDisguise: (
    mode: 'terminal' | 'settings' | 'activity' | 'none'
  ) => Promise<{ success: boolean; error?: string }>;
  getDisguise: () => Promise<'none' | 'terminal' | 'settings' | 'activity'>;
  onDisguiseChanged: (
    callback: (mode: 'terminal' | 'settings' | 'activity' | 'none') => void
  ) => () => void;
  setOpenAtLogin: (
    open: boolean
  ) => Promise<{ success: boolean; error?: string }>;
  getOpenAtLogin: () => Promise<boolean>;
  onSettingsVisibilityChange: (
    callback: (isVisible: boolean) => void
  ) => () => void;
  toggleSettingsWindow: (coords?: { x: number; y: number }) => Promise<void>;
  closeSettingsWindow: () => Promise<void>;
  openSettingsTab: (tab: string) => Promise<void>;
  onOpenSettingsTab: (callback: (tab: string) => void) => () => void;

  // LLM Model Management
  getCurrentLlmConfig: () => Promise<{
    provider:
      | 'gemini'
      | 'openai'
      | 'claude'
      | 'groq'
      | 'deepseek'
      | 'custom'
      | 'none';
    model: string;
  }>;
  testLlmConnection: (
    provider: string,
    apiKey?: string
  ) => Promise<{ success: boolean; error?: string }>;

  setApiKey: (
    provider: string,
    apiKey: string
  ) => Promise<{ success: boolean; error?: string }>;
  getStoredCredentials: () => Promise<{
    hasOpenRouterKey: boolean;
    sttProvider: 'none' | 'local-parakeet';
  }>;
  // Permissions
  checkPermissions: () => Promise<{
    microphone: 'granted' | 'denied' | 'not-determined' | 'restricted';
    screen: 'granted' | 'denied' | 'not-determined' | 'restricted';
    platform: string;
  }>;

  // STT Provider Management
  setSttProvider: (
    provider: 'none' | 'local-parakeet'
  ) => Promise<{ success: boolean; error?: string }>;
  getSttProvider: () => Promise<string>;

  // STT Config Events (fired when STT provider/key changes during a meeting)
  onSttConfigChanged: (
    callback: (data: { configured: boolean; provider: string }) => void
  ) => () => void;
  onCredentialsChanged: (callback: () => void) => () => void;

  // Native Audio Service Events
  onNativeAudioTranscript: (
    callback: (transcript: {
      speaker: string;
      text: string;
      final: boolean;
      timestamp?: number;
    }) => void
  ) => () => void;
  analyzeTranscript: (transcript: string) => Promise<{
    questions: Array<{
      text: string;
      speaker?: 'Me' | 'Them';
      type: string;
      intent?: string;
      prompt?: string;
      priority?: string;
    }>;
  }>;
  onAudioCaptureActive: (
    callback: (data: { channel: 'mic' | 'system'; active: boolean }) => void
  ) => () => void;
  setChannelMuted: (
    channel: 'mic' | 'system',
    muted: boolean
  ) => Promise<{ success: boolean }>;
  getInputDevices: () => Promise<Array<{ id: string; name: string }>>;
  getOutputDevices: () => Promise<Array<{ id: string; name: string }>>;
  setRecognitionLanguage: (
    key: string
  ) => Promise<{ success: boolean; error?: string }>;
  getSttLanguage: () => Promise<string>;
  onSystemAudioPermissionDenied: (
    callback: (message: string) => void
  ) => () => void;
  onDeviceSelectionApplied: (
    callback: (payload: {
      kind: 'input' | 'output';
      requested: string | null;
      actual: string | null;
      fellBack: boolean;
      reason?: string;
    }) => void
  ) => () => void;
  onAudioCaptureFailed: (
    callback: (payload: {
      channel: 'system' | 'mic';
      message: string;
      attempt: number;
      maxAttempts: number;
      terminal?: boolean;
      stuck?: boolean;
    }) => void
  ) => () => void;
  onAudioInputAutoSwitched: (
    callback: (payload: {
      from: string;
      to: string;
      reason: string;
      message?: string;
    }) => void
  ) => () => void;

  // STT Status Events
  onSttStatusChanged: (
    callback: (data: {
      state: 'connected' | 'reconnecting' | 'failed' | 'awaiting-audio';
      provider: string;
      error?: string;
      channel: 'user' | 'interviewer';
      reconnectAttempts?: number;
    }) => void
  ) => () => void;

  getNativeAudioStatus: () => Promise<{ connected: boolean }>;

  // Intelligence Mode IPC
  getIntelligenceContext: () => Promise<{
    context: string;
    lastAssistantMessage: string | null;
    activeMode: string;
  }>;
  resetIntelligence: () => Promise<{ success: boolean; error?: string }>;

  // Meeting Lifecycle
  startMeeting: (
    metadata?: any
  ) => Promise<{ success: boolean; error?: string }>;
  endMeeting: () => Promise<{ success: boolean; error?: string }>;
  abortMeeting: () => Promise<void>;
  getRecentMeetings: () => Promise<
    Array<{
      id: string;
      title: string;
      date: string;
      duration: string;
      summary: string;
    }>
  >;
  getMeetingDetails: (id: string) => Promise<any>;
  updateMeetingTitle: (id: string, title: string) => Promise<boolean>;
  updateMeetingSummary: (
    id: string,
    updates: {
      overview?: string;
      actionItems?: string[];
      keyPoints?: string[];
      actionItemsTitle?: string;
      keyPointsTitle?: string;
    }
  ) => Promise<boolean>;
  deleteMeeting: (id: string) => Promise<boolean>;
  retryMeetingSummary: (
    id: string
  ) => Promise<{ success: boolean; error?: string }>;
  setWindowMode: (
    mode: 'launcher' | 'overlay',
    inactive?: boolean
  ) => Promise<void>;
  // Session Management
  onSessionReset: (callback: () => void) => () => void;
  onDialogueDrained: (
    callback: (
      turns: Array<{ speaker: 'Me' | 'Them'; text: string; final: boolean }>
    ) => void
  ) => () => void;

  // useChat-over-IPC bridge (IpcChatTransport)
  chatStreamStart: (
    streamId: string,
    messages: unknown[],
    opts?: { system?: string }
  ) => Promise<{ success: boolean; error?: string }>;
  chatStreamAbort: (streamId: string) => void;
  onChatStreamEvent: (
    callback: (evt: {
      streamId: string;
      type: 'chunk' | 'end' | 'error';
      chunk?: unknown;
      error?: string;
    }) => void
  ) => () => void;
  // Model Management
  getDefaultModel: () => Promise<{ model: string }>;
  setModel: (modelId: string) => Promise<{ success: boolean; error?: string }>;
  toggleModelSelector: (coords: {
    x: number;
    y: number;
    activate?: boolean;
  }) => Promise<void>;
  modelSelectorCloseIfOpen: () => Promise<void>;

  // Settings Window
  toggleSettingsWindow: (coords?: { x: number; y: number }) => Promise<void>;

  extractEmailsFromTranscript: (
    transcript: Array<{ text: string }>
  ) => Promise<string[]>;
  openMailto: (params: {
    to: string;
    subject: string;
    body: string;
  }) => Promise<{ success: boolean; error?: string }>;

  // Audio Test
  startAudioTest: (deviceId?: string) => Promise<{ success: boolean }>;
  stopAudioTest: () => Promise<{ success: boolean }>;
  onAudioTestLevel: (callback: (level: number) => void) => () => void;
  // Parallel system-audio probe — level + error events emitted during
  // the same startAudioTest lifecycle.
  onAudioTestSystemLevel: (callback: (level: number) => void) => () => void;
  onAudioTestSystemError: (
    callback: (errorMessage: string) => void
  ) => () => void;

  // Skills
  skillsList: () => Promise<Array<{
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    bundled: boolean;
  }>>;
  skillsGet: (name: string) => Promise<string | null>;
  skillsImport: () => Promise<{ cancelled: boolean; imported: string[]; error?: string }>;
  skillsToggle: (name: string, enabled: boolean) => Promise<void>;
  skillsUpdate: (name: string, patch: { enabled?: boolean; content?: string; description?: string }) => Promise<void>;
  skillsRemove: (name: string) => Promise<void>;
  onSkillsChanged: (callback: () => void) => () => void;

  // Database
  flushDatabase: () => Promise<{ success: boolean }>;

  onUndetectableChanged: (callback: (state: boolean) => void) => () => void;
  onModelChanged: (callback: (modelId: string) => void) => () => void;

  onMeetingsUpdated: (callback: () => void) => () => void;

  // Keybind Management
  getKeybinds: () => Promise<
    Array<{
      id: string;
      label: string;
      accelerator: string;
      isGlobal: boolean;
      defaultAccelerator: string;
    }>
  >;
  setKeybind: (id: string, accelerator: string) => Promise<boolean>;
  resetKeybinds: () => Promise<
    Array<{
      id: string;
      label: string;
      accelerator: string;
      isGlobal: boolean;
      defaultAccelerator: string;
    }>
  >;
  onKeybindsUpdate: (callback: (keybinds: Array<any>) => void) => () => void;
  onKeybindRegistrationFailed: (
    callback: (data: { id: string; accelerator: string }) => void
  ) => () => void;
  onGlobalShortcut: (
    callback: (data: { action: string }) => void
  ) => () => void;

  // CGEventTap-backed stealth typing (macOS only — graceful degradation elsewhere)
  stealthTapAvailable: () => Promise<boolean>;
  stealthTapOpenSettings: () => Promise<void>;
  stealthTapStop: () => Promise<void>;
  stealthTapStart: () => Promise<boolean>;
  onStealthTapState: (
    cb: (state: { active: boolean; reason?: string }) => void
  ) => () => void;
  onStealthKeyCaptured: (
    cb: (ev: {
      keyCode: number;
      chars: string;
      flags: number;
      isKeyDown: boolean;
    }) => void
  ) => () => void;

  // Context API
  contextGetDescription: () => Promise<{
    success: boolean;
    content: string;
    error?: string;
  }>;
  contextSaveDescription: (
    content: string
  ) => Promise<{ success: boolean; error?: string }>;
  contextGetFiles: () => Promise<{
    success: boolean;
    files: Array<{
      id: string;
      filename: string;
      createdAt: string;
    }>;
    error?: string;
  }>;
  contextUploadFile: () => Promise<{
    success: boolean;
    cancelled?: boolean;
    file?: { id: string; filename: string; createdAt: string };
    error?: string;
  }>;
  contextDeleteFile: (
    id: string
  ) => Promise<{ success: boolean; error?: string }>;

  setProviderPreferredModel: (
    provider: string,
    modelId: string
  ) => Promise<void>;

  // Overlay Opacity (Stealth Mode)
  setOverlayOpacity: (opacity: number) => Promise<void>;
  onOverlayOpacityChanged: (callback: (opacity: number) => void) => () => void;

  // Verbose / Debug Logging
  getVerboseLogging: () => Promise<boolean>;
  setVerboseLogging: (enabled: boolean) => Promise<{ success: boolean }>;
  getQuestionAnalysisConfig: () => Promise<{
    enabled: boolean;
    interval: number;
    model: string;
    openRouterApiKey: string;
    window: number;
  }>;
  setQuestionAnalysisConfig: (config: {
    enabled?: boolean;
    interval?: number;
    model?: string;
    openRouterApiKey?: string;
    window?: number;
  }) => Promise<{ success: boolean }>;
  onQuestionAnalysisConfigChanged: (
    callback: (config: { enabled: boolean; interval: number }) => void
  ) => () => void;
  getLogFilePath: () => Promise<string | null>;
  openLogFile: () => Promise<{ success: boolean; error?: string }>;

  // Arch
  getArch: () => Promise<string>;
  getOsVersion: () => Promise<string>;

  // Platform
  platform: NodeJS.Platform;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
