import { invoke } from '@tauri-apps/api/core';
import { listen, type Event } from '@tauri-apps/api/event';
import { platform } from '@tauri-apps/plugin-os';
import type { DesktopAPI } from '../../types/desktop';

type EventCallback<T> = (payload: T) => void;

const queuedChatStarts = new Map<string, boolean>();
const pendingListeners = new Set<Promise<unknown>>();

function on<T>(eventName: string, callback: EventCallback<T>): () => void {
  let disposed = false;
  let unlisten: (() => void) | undefined;

  const registration = listen<T>(eventName, (event: Event<T>) => {
    if (!disposed) callback(event.payload);
  }).then((stop) => {
    if (disposed) {
      stop();
      return;
    }
    unlisten = stop;
  });

  pendingListeners.add(registration);
  void registration.then(
    () => pendingListeners.delete(registration),
    (error) => {
      pendingListeners.delete(registration);
      console.error(`Unable to listen for ${eventName}`, error);
    }
  );

  return () => {
    disposed = true;
    unlisten?.();
  };
}

const call = <T>(command: string, args?: Record<string, unknown>): Promise<T> =>
  invoke<T>(command, args);

export const desktopAPI: DesktopAPI = {
  platform: (platform() === 'macos'
    ? 'darwin'
    : platform() === 'windows'
      ? 'win32'
      : platform()) as NodeJS.Platform,
  updateContentDimensions: (dimensions) =>
    call('update_content_dimensions', { dimensions }),
  takeScreenshot: () => call('take_screenshot'),
  onScreenshotTaken: (callback) => on('screenshot-taken', callback),
  onCaptureAndProcess: (callback) => on('capture-and-process', callback),
  moveWindowLeft: () => call('move_window_left'),
  moveWindowRight: () => call('move_window_right'),
  moveWindowUp: () => call('move_window_up'),
  moveWindowDown: () => call('move_window_down'),
  quitApp: () => call('quit_app'),
  toggleWindow: () => call('toggle_window'),
  showWindow: (inactive) => call('show_window', { inactive }),
  hideWindow: () => call('hide_window'),
  showOverlay: () => call('show_overlay'),
  hideOverlay: () => call('hide_overlay'),
  onEnsureExpanded: (callback) => on('ensure-expanded', callback),
  openExternal: (url) => call('open_external', { url }),
  repairTccPermissions: () => call('repair_tcc_permissions'),
  setUndetectable: (state) => call('set_undetectable', { value: state }),
  getUndetectable: () => call('get_undetectable'),
  setOpenAtLogin: (open) => call('set_open_at_login', { open }),
  getOpenAtLogin: () => call('get_open_at_login'),
  setDisguise: (mode) => call('set_disguise', { mode }),
  getDisguise: () => call('get_disguise'),
  onDisguiseChanged: (callback) => on('disguise-changed', callback),
  onToggleExpand: (callback) => on('toggle-expand', callback),
  setWindowMode: (mode, inactive) =>
    call('set_window_mode', { mode, inactive }),
  onUndetectableChanged: (callback) => on('undetectable-changed', callback),
  setOverlayOpacity: (opacity) => call('set_overlay_opacity', { opacity }),
  onOverlayOpacityChanged: (callback) =>
    on('overlay-opacity-changed', callback),
  getRecognitionLanguages: () => call('get_recognition_languages'),
  setSttProvider: (provider) => call('set_stt_provider', { provider }),
  getSttProvider: () => call('get_stt_provider'),
  localParakeetGetConfig: () => call('local_parakeet_get_config'),
  localParakeetSetConfig: (config) =>
    call('local_parakeet_set_config', { config }),
  localParakeetDownloadModel: (modelId) =>
    call('local_parakeet_download_model', { modelId }),
  onLocalParakeetDownloadStatus: (callback) =>
    on('local-parakeet-download-status', callback),
  onLocalParakeetDownloadComplete: (callback) =>
    on('local-parakeet-download-complete', callback),
  onLocalParakeetDownloadError: (callback) =>
    on('local-parakeet-download-error', callback),
  onSttConfigChanged: (callback) => on('stt-config-changed', callback),
  onCredentialsChanged: (callback) => on('credentials-changed', callback),
  onNativeAudioTranscript: (callback) =>
    on('native-audio-transcript', callback),
  getQuestionState: async () => {
    await Promise.all([...pendingListeners]);
    return call('get_question_state');
  },
  scanQuestions: () => call('scan_questions'),
  setQuestionsPaused: (paused) => call('set_questions_paused', { paused }),
  dismissQuestion: (id) => call('dismiss_question', { id }),
  resetQuestions: () => call('reset_questions'),
  onQuestionStateChanged: (callback) => on('questions-changed', callback),
  analyzeTranscript: (transcript) => call('analyze_transcript', { transcript }),
  onAudioCaptureActive: (callback) => on('audio-capture-active', callback),
  setChannelMuted: (channel, muted) =>
    call('set_channel_muted', { channel, muted }),
  getNativeAudioStatus: () => call('get_native_audio_status'),
  getInputDevices: () => call('get_input_devices'),
  getOutputDevices: () => call('get_output_devices'),
  setRecognitionLanguage: (key) => call('set_recognition_language', { key }),
  getSttLanguage: () => call('get_stt_language'),
  onSystemAudioPermissionDenied: (callback) =>
    on('system-audio-permission-denied', callback),
  onDeviceSelectionApplied: (callback) =>
    on('device-selection-applied', callback),
  onAudioCaptureFailed: (callback) => on('audio-capture-failed', callback),
  onAudioInputAutoSwitched: (callback) =>
    on('audio-input-auto-switched', callback),
  onSttStatusChanged: (callback) => on('stt-status', callback),
  startAudioTest: (deviceId) => call('start_audio_test', { deviceId }),
  stopAudioTest: () => call('stop_audio_test'),
  onAudioTestLevel: (callback) => on('audio-test-level', callback),
  onAudioTestSystemLevel: (callback) => on('audio-test-system-level', callback),
  onAudioTestSystemError: (callback) => on('audio-test-system-error', callback),
  getCurrentLlmConfig: () => call('get_current_llm_config'),
  testLlmConnection: (provider, apiKey) =>
    call('test_llm_connection', { provider, apiKey }),
  setApiKey: (provider, apiKey) => call('set_api_key', { provider, apiKey }),
  getStoredCredentials: () => call('get_stored_credentials'),
  getDefaultModel: () => call('get_default_model'),
  setModel: (modelId) => call('set_model', { modelId }),
  toggleModelSelector: (coords) => call('toggle_model_selector', { coords }),
  modelSelectorCloseIfOpen: () => call('model_selector_close_if_open'),
  onModelChanged: (callback) => on('model-changed', callback),
  setProviderPreferredModel: (provider, modelId) =>
    call('set_provider_preferred_model', { provider, modelId }),
  getMeetingActive: () => call('get_meeting_active'),
  getMeetingStartedAt: () => call('get_meeting_started_at'),
  onMeetingStateChanged: (callback) => on('meeting-state-changed', callback),
  getIntelligenceContext: () => call('get_intelligence_context'),
  resetIntelligence: () => call('reset_intelligence'),
  startMeeting: (metadata) => call('start_meeting', { metadata }),
  endMeeting: () => call('end_meeting'),
  abortMeeting: () => call('abort_meeting'),
  resetMeeting: () => call('reset_meeting'),
  getRecentMeetings: () => call('get_recent_meetings'),
  getMeetingDetails: (id) => call('get_meeting_details', { id }),
  updateMeetingTitle: (id, title) =>
    call('update_meeting_title', { id, title }),
  updateMeetingSummary: (id, updates) =>
    call('update_meeting_summary', { id, updates }),
  deleteMeeting: (id) => call('delete_meeting', { id }),
  retryMeetingSummary: (id) => call('retry_meeting_summary', { id }),
  onMeetingsUpdated: (callback) => on('meetings-updated', callback),
  onSessionReset: (callback) => on('session-reset', callback),
  onDialogueDrained: (callback) => on('dialogue-drained', callback),
  chatStreamStart: async (streamId, messages, options) => {
    queuedChatStarts.set(streamId, true);
    try {
      await Promise.all([...pendingListeners]);
      if (!queuedChatStarts.get(streamId))
        throw new DOMException('Aborted', 'AbortError');
    } finally {
      queuedChatStarts.delete(streamId);
    }
    return call('chat_stream_start', { streamId, messages, options });
  },
  chatStreamAbort: (streamId) => {
    if (queuedChatStarts.has(streamId)) {
      queuedChatStarts.set(streamId, false);
      return;
    }
    void call('chat_stream_abort', { streamId }).catch(console.error);
  },
  onChatStreamEvent: (callback) => on('chat-stream-event', callback),
  openSettingsTab: (tab) => call('open_settings_tab', { tab }),
  onOpenSettingsTab: (callback) => on('open-settings-tab', callback),
  onSettingsVisibilityChange: (callback) =>
    on('settings-visibility-changed', callback),
  toggleSettingsWindow: (coords) => call('toggle_settings_window', { coords }),
  closeSettingsWindow: () => call('close_settings_window'),
  getKeybinds: () => call('get_keybinds'),
  setKeybind: (id, accelerator) => call('set_keybind', { id, accelerator }),
  resetKeybinds: () => call('reset_keybinds'),
  onKeybindsUpdate: (callback) => on('keybinds-update', callback),
  onKeybindRegistrationFailed: (callback) =>
    on('keybind-registration-failed', callback),
  onGlobalShortcut: (callback) => on('global-shortcut', callback),
  stealthTapAvailable: () => call('stealth_tap_available'),
  stealthTapOpenSettings: () => call('stealth_tap_open_settings'),
  stealthTapStop: () => call('stealth_tap_stop'),
  stealthTapStart: () => call('stealth_tap_start'),
  onStealthTapState: (callback) => on('stealth-tap-state', callback),
  onStealthKeyCaptured: (callback) => on('stealth-key-captured', callback),
  contextGetDescription: () => call('context_get_description'),
  contextSaveDescription: (content) =>
    call('context_save_description', { content }),
  contextGetFiles: () => call('context_get_files'),
  contextUploadFile: () => call('context_upload_file'),
  contextDeleteFile: (id) => call('context_delete_file', { id }),
  getVerboseLogging: () => call('get_verbose_logging'),
  setVerboseLogging: (enabled) => call('set_verbose_logging', { enabled }),
  getQuestionAnalysisConfig: () => call('get_question_analysis_config'),
  setQuestionAnalysisConfig: (config) =>
    call('set_question_analysis_config', { config }),
  onQuestionAnalysisConfigChanged: (callback) =>
    on('question-analysis-config-changed', callback),
  getLogFilePath: () => call('get_log_file_path'),
  openLogFile: () => call('open_log_file'),
  getArch: () => call('get_arch'),
  getOsVersion: () => call('get_os_version'),
  skillsList: () => call('skills_list'),
  skillsGet: (name) => call('skills_get', { name }),
  skillsImport: () => call('skills_import'),
  skillsToggle: (name, enabled) => call('skills_toggle', { name, enabled }),
  skillsUpdate: (name, patch) => call('skills_update', { name, patch }),
  skillsRemove: (name) => call('skills_remove', { name }),
  onSkillsChanged: (callback) => on('skills-changed', callback),
  openPermissionSettings: (permission) =>
    call('open_permission_settings', { permission }),
  requestMicrophonePermission: () => call('request_microphone_permission'),
  checkPermissions: () => call('check_permissions'),
  flushDatabase: () => call('flush_database'),
};

export function installDesktopBridge(): void {
  window.desktopAPI = desktopAPI;
}
