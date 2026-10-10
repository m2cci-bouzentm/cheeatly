import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FileUIPart } from 'ai';
import { verticalScrollCap } from '../../lib/overlayScrollBudget.ts';
import { useShortcuts } from '../../hooks/useShortcuts.ts';
import { useServerChat } from '../../hooks/useServerChat.ts';
import { modelSupportsVision, prettifyModelId } from '../../utils/modelUtils';
import { isMac } from '../../utils/platformUtils.ts';
import { analytics } from '../../lib/analytics/analytics.service';
import { useDetectedQuestions } from '../../hooks/meeting/useDetectedQuestions.ts';
import type { DetectedQuestion } from '../../hooks/meeting/useDetectedQuestions.ts';
import { getSttSummary } from './components/MessageComponents.tsx';
import { useSuggestionActions } from '../../hooks/meeting/useSuggestionActions.ts';
import { useMeetingState } from '../../hooks/meeting/useMeetingState.ts';
import { useOverlayKeyboard } from '../../hooks/meeting/useOverlayKeyboard.ts';
import { collapseConsecutiveDuplicateAssistantMessages } from '../../lib/overlayActionDedup.ts';
import type { AttachmentContext, AppMessage, AssistantOverlayProps, SttSummary } from './types.ts';
import { getMessageText } from './types.ts';
import './live/liveCall.css';
import RecordingPill from './live/RecordingPill.tsx';
import SessionMenu from './live/SessionMenu.tsx';
import ConversationPanel from './live/ConversationPanel.tsx';
import type { ConversationView } from './live/ConversationPanel.tsx';
import ChatThread from './live/ChatThread.tsx';
import type { AnswerVariant, ThreadTurn } from './live/ChatThread.tsx';
import TranscriptView from './live/TranscriptView.tsx';
import SuggestionsPanel from './live/SuggestionsPanel.tsx';
import TooltipLayer from './live/TooltipLayer.tsx';
import { useMeetingClock } from './live/useMeetingClock.ts';
import { useOverflowCue } from './live/useOverflowCue.ts';
import { ANGLE_INSTRUCTION, SHORTER_INSTRUCTION, rewriteAnswer } from './live/rewriteAnswer.ts';
import { formatShortcut, promptOf, requestLabel, scanResultMessage } from './live/format.ts';

type Toast = { text: string; id: number };
// Channel mute states saved when capture is paused, restored on resume.
type PausedChannels = { micMuted: boolean; systemMuted: boolean };
type UserScan = { revision: number; ids: Set<string> };

// Design maximum for the answer panel body (Chat and Transcript share it) and the suggestions list.
const LIST_MAX_HEIGHT = 380;
const TOAST_MS = 2600;
// Room kept under an open menu so its 0 12px 30px shadow is not cut by the window edge.
const MENU_SHADOW_ROOM = 42;
const NO_VARIANT: AnswerVariant = { short: null, alt: null, showing: 'base', busy: false };

function roleLabel(role: string): string {
  if (role === 'user') return 'User';
  return 'Assistant';
}

const updateShellDimensions = (width: number, height: number) => {
  window.desktopAPI.updateContentDimensions({ width, height });
};

// The native window is exactly the overlay: its own box plus any open menu hanging below it.
function measureOverlay(root: HTMLElement): { width: number; height: number } {
  const box = root.getBoundingClientRect();
  let right = box.right;
  let bottom = box.bottom;
  root.querySelectorAll('.popover, .qa').forEach((el) => {
    const r = el.getBoundingClientRect();
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom + MENU_SHADOW_ROOM);
  });
  return { width: Math.ceil(right - box.left), height: Math.ceil(bottom - box.top) };
}

// Thread turns: each request (user message) with the answer that follows it. A failed request
// gets its error as the answer instead of waiting forever.
function buildTurns(messages: AppMessage[], isProcessing: boolean, error: Error | undefined): ThreadTurn[] {
  const turns: ThreadTurn[] = [];
  messages.forEach((message) => {
    const text = getMessageText(message);
    if (message.role === 'user') {
      turns.push({
        key: message.id,
        label: requestLabel(message, text),
        shots: message.parts.filter((part): part is FileUIPart => part.type === 'file').map((part) => part.url),
        answer: null,
        streaming: false,
      });
      return;
    }
    const last = turns[turns.length - 1];
    if (!last) return;
    last.answer = { id: message.id, text, isError: message.metadata?.isError === true };
  });
  const last = turns[turns.length - 1];
  if (!last) return turns;
  if (isProcessing) last.streaming = true;
  if (error && !last.answer?.text) last.answer = { id: `error-${last.key}`, text: error.message, isError: true };
  return turns;
}

function sttNotice(summary: SttSummary): string | null {
  if (summary.tone !== 'error') return null;
  return `${summary.label}: ${summary.detail}`;
}

function contextFrom(messages: AppMessage[]): string {
  return messages
    .filter((m) => m.role !== 'user' || !m.metadata?.hasScreenshot)
    .map((m) => `${roleLabel(m.role)}: ${getMessageText(m)}`)
    .slice(-20)
    .join('\n');
}

const AssistantOverlay: React.FC<AssistantOverlayProps> = ({ starting, onSessionDiscarded }) => {
  // State
  // Panels visible. Hide keeps the pill on screen; the global toggle (⌘B) still hides the whole window.
  const [isExpanded, setIsExpanded] = useState(true);
  const [view, setView] = useState<ConversationView>('chat');
  const [inputValue, setInputValue] = useState('');
  const [, setSuggestionPanelPinned] = useState(false);
  const [popup, setPopup] = useState<'session' | 'actions' | null>(null);
  const [endingMeeting, setEndingMeeting] = useState(false);
  const [meetingEndError, setMeetingEndError] = useState('');
  const [attachedContext, setAttachedContext] = useState<AttachmentContext[]>([]);
  const [currentModel, setCurrentModel] = useState('qwen/qwen3.7-flash');
  const [isUndetectable, setIsUndetectable] = useState(false);
  const [stealthTapActive, setStealthTapActive] = useState(false);
  const [stealthPermissionMissing, setStealthPermissionMissing] = useState(false);
  const [stealthHotkeyConflict, setStealthHotkeyConflict] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [variants, setVariants] = useState<Record<string, AnswerVariant>>({});
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [verticalCap, setVerticalCap] = useState(Infinity);
  const [announcement, setAnnouncement] = useState('');
  const [pausedChannels, setPausedChannels] = useState<PausedChannels | null>(null);

  const contentRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const rafDimUpdateRef = useRef<number | null>(null);
  const pendingCaptureRef = useRef<AttachmentContext | null>(null);
  const isExpandedEffectInitializedRef = useRef(false);
  const isStealthRef = useRef(false);
  const stealthTapActiveRef = useRef(false);
  const stealthAutoEngageOkRef = useRef(true);
  const isCgEventTapAvailableRef = useRef(false);
  const answerPanelPinnedRef = useRef(false);
  const endingMeetingRef = useRef(false);
  const leavingRef = useRef(false);
  const resetQuestionsRef = useRef<() => void>(() => {});
  const userScanRef = useRef<UserScan | null>(null);
  const toastSeqRef = useRef(0);
  const submitRef = useRef<() => void>(() => {});
  const toggleHideRef = useRef<() => void>(() => {});
  const toggleCaptureRef = useRef<() => void>(() => {});

  // Hooks (the two callbacks are declared here because the meeting hooks take them as parameters)
  const { shortcuts, isShortcutPressed } = useShortcuts();
  const { messages, setMessages, stop: stopServerChat, sendWithSystem, status: chatStatus, error: chatError } =
    useServerChat();
  const {
    questions,
    revision: questionRevision,
    dismiss: dismissQuestion,
    reset: resetQuestions,
    forceRefresh,
    isScanning,
    scanError,
    scanNotice,
    settingsEnabled: questionAnalysisEnabled,
    isPaused: analysisPaused,
    setPaused: setQuestionsPaused,
  } = useDetectedQuestions();
  resetQuestionsRef.current = resetQuestions;

  const pinSuggestionPanel = useCallback(() => {
    answerPanelPinnedRef.current = true;
    setSuggestionPanelPinned(true);
  }, []);

  const resetSessionUi = useCallback(() => {
    answerPanelPinnedRef.current = false;
    setSuggestionPanelPinned(false);
    setInputValue('');
    setAttachedContext([]);
    setVariants({});
    setSelectedQuestionId(null);
    setPausedChannels(null);
    setView('chat');
    stopServerChat();
    setMessages([]);
    resetQuestionsRef.current();
  }, [setMessages, stopServerChat]);

  const meeting = useMeetingState({
    messages,
    messagesEndRef,
    setMessages,
    setIsExpanded,
    stopChat: stopServerChat,
    onSessionReset: resetSessionUi,
  });
  const intelligence = useSuggestionActions({
    inputValue,
    setInputValue,
    attachedContext,
    setAttachedContext,
    conversationContext: contextFrom(messages),
    hasTranscript: meeting.dialogueTurns.length > 0,
    setIsExpanded,
    pendingCaptureRef,
    pinSuggestionPanel,
    sendWithSystem,
  });
  const capturing = pausedChannels === null;
  const elapsed = useMeetingClock(!capturing);
  const threadCue = useOverflowCue(scrollContainerRef, spacerRef);
  // ⌘↵ (global "process screenshots") acts like the send button: typed text, else Help me respond.
  const keyboardIntelligence = useMemo(
    () => ({ ...intelligence, handleWhatToSay: () => submitRef.current() }),
    [intelligence]
  );
  const isProcessing = chatStatus === 'streaming' || chatStatus === 'submitted';
  const blockInputFocus = useOverlayKeyboard({
    isShortcutPressed,
    scrollContainerRef,
    textInputRef,
    setIsExpanded,
    setInputValue,
    setMessages,
    setAttachedContext,
    stopChat: stopServerChat,
    isProcessing,
    answerPanelPinnedRef,
    setSuggestionPanelPinned,
    isStealthRef,
    stealthTapActiveRef,
    stealthAutoEngageOkRef,
    isCgEventTapAvailableRef,
    setStealthTapActive,
    setStealthPermissionMissing,
    setStealthHotkeyConflict,
    intelligence: keyboardIntelligence,
    currentModel,
    onToast: (text: string) => showToast(text),
  });

  // Derived values
  const displayMessages = useMemo(
    () => collapseConsecutiveDuplicateAssistantMessages(messages, getMessageText),
    [messages]
  );
  const turns = useMemo(
    () => buildTurns(displayMessages, isProcessing, chatError),
    [displayMessages, isProcessing, chatError]
  );
  const listMaxHeight = Math.min(LIST_MAX_HEIGHT, verticalCap);
  const questionDetectionPaused = analysisPaused || !questionAnalysisEnabled;
  const userMessageCount = messages.filter((m) => m.role === 'user').length;
  const newestQuestion = questions[0];
  const hasTranscript = meeting.dialogueTurns.length > 0;
  // While capture is paused both channels are muted; the menu shows the settings that resume restores.
  const micOn = pausedChannels ? !pausedChannels.micMuted : !meeting.micMuted;
  const callAudioOn = pausedChannels ? !pausedChannels.systemMuted : !meeting.systemMuted;
  const sttSummary = getSttSummary(
    meeting.sttUserStatus,
    meeting.sttInterviewerStatus,
    meeting.sttUserProvider,
    meeting.sttInterviewerProvider,
    meeting.sttNotConfigured,
    meeting.sttUserError,
    meeting.sttInterviewerError
  );
  const systemNeedsPermission =
    meeting.systemAudioWarning?.channel === 'system' ||
    meeting.systemAudioWarning?.kind === 'screen-recording-permission';

  // Effects
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    window.desktopAPI.getDefaultModel().then(({ model }) => {
      setCurrentModel(model);
      window.desktopAPI.setModel(model);
    });
    return window.desktopAPI.onModelChanged((modelId: string) => setCurrentModel(modelId));
  }, []);

  useEffect(() => {
    window.desktopAPI.getUndetectable().then(setIsUndetectable);
    return window.desktopAPI.onUndetectableChanged((state) => setIsUndetectable(state));
  }, []);

  useEffect(() => {
    localStorage.setItem('cheatly_undetectable', String(isUndetectable));
  }, [isUndetectable]);

  // Screen readers: say when a response is being prepared (design: polite live region).
  useEffect(() => {
    if (chatStatus === 'submitted') setAnnouncement('Preparing a response');
  }, [chatStatus]);

  useEffect(() => {
    if (chatError) showToast(chatError.message);
  }, [chatError]);

  // A new request always shows in Chat.
  useEffect(() => {
    if (userMessageCount > 0) setView('chat');
  }, [userMessageCount]);

  // Menus close on outside click, Esc or window blur (each menu and its button carry data-overlay-popup).
  useEffect(() => {
    if (!popup) return;
    const dismiss = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-overlay-popup]')) setPopup(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPopup(null);
    };
    const blur = () => setPopup(null);
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('keydown', escape);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('blur', blur);
    };
  }, [popup]);

  // Overlay-local shortcuts from the design: ⌘\ hide / show panels, ⌘⇧P pause / resume capture.
  // Kept local on purpose: system-wide they would take ⌘⇧P from other apps (VS Code's command palette).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = isMac ? event.metaKey : event.ctrlKey;
      if (!mod) return;
      if (event.key === '\\' && !event.shiftKey) {
        event.preventDefault();
        toggleHideRef.current();
      }
      if (event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        toggleCaptureRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!isExpandedEffectInitializedRef.current) {
      isExpandedEffectInitializedRef.current = true;
      isStealthRef.current = false;
      return;
    }
    if (!isExpanded) return;
    window.desktopAPI.showWindow(isStealthRef.current);
    isStealthRef.current = false;
  }, [isExpanded]);

  useEffect(() => window.desktopAPI.onToggleExpand(() => setIsExpanded((prev) => !prev)), []);

  useEffect(
    () =>
      window.desktopAPI.onEnsureExpanded(() => {
        isStealthRef.current = true;
        setIsExpanded(true);
      }),
    []
  );

  const reportShellSize = useCallback(() => {
    if (!contentRef.current || leavingRef.current) return;
    const { width, height } = measureOverlay(contentRef.current);
    updateShellDimensions(width, height);
  }, []);

  const measureVerticalCap = useCallback(() => {
    const scrollEl = scrollContainerRef.current;
    const contentEl = contentRef.current;
    if (!scrollEl || !contentEl) {
      setVerticalCap(Infinity);
      return;
    }
    const chromeHeight = contentEl.offsetHeight - scrollEl.clientHeight;
    setVerticalCap(verticalScrollCap({ availHeight: window.screen.availHeight, chromeHeight }));
  }, []);

  useLayoutEffect(() => {
    if (!contentRef.current) return;
    const observer = new ResizeObserver(() => {
      if (rafDimUpdateRef.current) cancelAnimationFrame(rafDimUpdateRef.current);
      rafDimUpdateRef.current = requestAnimationFrame(() => {
        rafDimUpdateRef.current = null;
        measureVerticalCap();
        reportShellSize();
      });
    });
    observer.observe(contentRef.current);
    return () => {
      observer.disconnect();
      if (rafDimUpdateRef.current) cancelAnimationFrame(rafDimUpdateRef.current);
      rafDimUpdateRef.current = null;
    };
  }, [reportShellSize, measureVerticalCap]);

  // Menus hang outside the measured box: resize the window whenever one opens or closes.
  useEffect(() => {
    const id = requestAnimationFrame(reportShellSize);
    return () => cancelAnimationFrame(id);
  }, [popup, isExpanded, reportShellSize]);

  useEffect(() => {
    if (isScanning) setAnnouncement('Scanning');
  }, [isScanning]);

  // Result of a scan the user started: the first settled snapshot after it. Background scans stay silent.
  useEffect(() => {
    const scan = userScanRef.current;
    if (!scan || isScanning || questionRevision <= scan.revision) return;
    userScanRef.current = null;
    if (scanError) return;
    if (!questions.some((q) => !scan.ids.has(q.id))) showToast(scanResultMessage(scanNotice));
  }, [questionRevision, isScanning, questions, scanError, scanNotice]);

  useEffect(() => {
    if (scanError) showToast(scanError);
  }, [scanError]);

  useEffect(() => {
    if (newestQuestion) setAnnouncement(`New suggestion: ${promptOf(newestQuestion)}`);
  }, [newestQuestion]);

  // HTTP / desktop calls
  const finishMeeting = async (save: boolean) => {
    if (endingMeetingRef.current) return;
    endingMeetingRef.current = true;
    setEndingMeeting(true);
    setMeetingEndError('');
    try {
      if (save) await window.desktopAPI.endMeeting();
      else await window.desktopAPI.abortMeeting();
      await window.desktopAPI.modelSelectorCloseIfOpen();
      await window.desktopAPI.closeSettingsWindow();
      leavingRef.current = true;
      await window.desktopAPI.setWindowMode('launcher');
      if (!save) onSessionDiscarded();
    } catch (error) {
      leavingRef.current = false;
      setMeetingEndError(String(error));
    } finally {
      endingMeetingRef.current = false;
      setEndingMeeting(false);
    }
  };

  const setChannelMuted = (channel: 'mic' | 'system', muted: boolean) => {
    if (channel === 'mic') meeting.setMicMuted(muted);
    else meeting.setSystemMuted(muted);
    window.desktopAPI.setChannelMuted(channel, muted);
  };

  const setUndetectable = async (on: boolean) => {
    await window.desktopAPI.setUndetectable(on);
    setIsUndetectable(on);
    showToast(on ? 'Undetectable on' : 'Undetectable off');
  };

  const selectModel = async (id: string) => {
    await window.desktopAPI.setModel(id);
    setCurrentModel(id);
    showToast(`Model: ${prettifyModelId(id)}`);
  };

  const attachScreenshot = async () => {
    if (!modelSupportsVision(currentModel)) {
      showToast('Screenshots require a vision-capable model');
      return;
    }
    intelligence.handleScreenshotAttach(await window.desktopAPI.takeScreenshot());
    showToast('Screenshot attached');
  };

  const rewrite = async (id: string, instruction: string, text: string, key: 'short' | 'alt') => {
    updateVariant(id, { busy: true });
    try {
      const result = await rewriteAnswer(instruction, text);
      updateVariant(id, { [key]: result, showing: key, busy: false });
    } catch (error) {
      updateVariant(id, { busy: false });
      showToast(String(error));
    }
  };

  // Event handlers
  function showToast(text: string) {
    toastSeqRef.current += 1;
    setToast({ text, id: toastSeqRef.current });
  }

  const toggleCapture = () => {
    if (pausedChannels) {
      setChannelMuted('mic', pausedChannels.micMuted);
      setChannelMuted('system', pausedChannels.systemMuted);
      setPausedChannels(null);
      showToast('Capture resumed');
      return;
    }
    setPausedChannels({ micMuted: meeting.micMuted, systemMuted: meeting.systemMuted });
    setChannelMuted('mic', true);
    setChannelMuted('system', true);
    showToast('Capture paused');
  };
  toggleCaptureRef.current = toggleCapture;

  // While paused, a channel toggle changes what resume restores; otherwise it applies right away.
  const setChannelOn = (channel: 'mic' | 'system', on: boolean) => {
    if (!pausedChannels) {
      setChannelMuted(channel, !on);
      return;
    }
    if (channel === 'mic') setPausedChannels({ ...pausedChannels, micMuted: !on });
    else setPausedChannels({ ...pausedChannels, systemMuted: !on });
  };

  const toggleHide = () => {
    setPopup(null);
    setIsExpanded((visible) => !visible);
    if (!isExpanded) return;
    showToast(capturing ? 'Hidden · still recording' : 'Hidden');
  };
  toggleHideRef.current = toggleHide;

  const discard = () => {
    setPopup(null);
    void finishMeeting(false);
  };

  const backToApp = () => {
    leavingRef.current = true;
    setPopup(null);
    window.desktopAPI.setWindowMode('launcher');
  };

  const toggleSuggestions = () => {
    if (!questionAnalysisEnabled) {
      showToast('Turn on suggestions in Settings');
      return;
    }
    setQuestionsPaused(!analysisPaused);
    showToast(analysisPaused ? 'Suggestions on' : 'Suggestions paused');
  };

  const scanNow = () => {
    userScanRef.current = { revision: questionRevision, ids: new Set(questions.map((q) => q.id)) };
    forceRefresh();
  };

  const sendSuggestion = (question: DetectedQuestion) => {
    if (isProcessing || endingMeeting) return;
    setSelectedQuestionId(question.id);
    setIsExpanded(true);
    pinSuggestionPanel();
    sendWithSystem(promptOf(question), '');
  };

  const submit = () => {
    if (inputValue.trim()) {
      intelligence.handleManualSubmit();
      return;
    }
    if (!hasTranscript) {
      showToast('Nothing to respond to yet');
      return;
    }
    intelligence.handleWhatToSay();
  };
  submitRef.current = submit;

  const runQuickAction = (action: () => void) => {
    setPopup(null);
    if (!hasTranscript) {
      showToast('Nothing to respond to yet');
      return;
    }
    action();
  };

  function updateVariant(id: string, patch: Partial<AnswerVariant>) {
    setVariants((all) => ({ ...all, [id]: { ...(all[id] ?? NO_VARIANT), ...patch } }));
  }

  const shorter = (id: string, text: string) => {
    if (variants[id]?.short) updateVariant(id, { showing: 'short' });
    else rewrite(id, SHORTER_INSTRUCTION, text, 'short');
  };

  // Another angle swaps between the answer and its alternative (generated once).
  const anotherAngle = (id: string, text: string) => {
    const variant = variants[id];
    if (variant?.showing === 'alt') updateVariant(id, { showing: 'base' });
    else if (variant?.alt) updateVariant(id, { showing: 'alt' });
    else rewrite(id, ANGLE_INSTRUCTION, text, 'alt');
  };

  const copyAnswer = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => {
        analytics.trackCopyAnswer();
        showToast('Copied');
      },
      () => showToast('Clipboard unavailable')
    );
  };

  const openPermissionPane = (channel: 'mic' | 'system') => {
    if (isMac) {
      window.desktopAPI.openPermissionSettings(channel === 'mic' ? 'microphone' : 'screen');
      return;
    }
    window.desktopAPI.openSettingsTab('audio');
  };

  const notices = (
    <>
      {meeting.systemAudioWarning && (
        <p className="quiet" data-stealth-ignore="true">
          {meeting.systemAudioWarning.message}{' '}
          <button className="text-btn" onClick={() => openPermissionPane(systemNeedsPermission ? 'system' : 'mic')}>
            Open settings
          </button>
        </p>
      )}
      {stealthHotkeyConflict && (
        <p className="quiet" data-stealth-ignore="true">
          Hotkey {stealthHotkeyConflict} is busy.{' '}
          <button className="text-btn" onClick={() => window.desktopAPI.openSettingsTab('keybinds')}>
            Rebind
          </button>
          <button className="text-btn" aria-label="Dismiss" onClick={() => setStealthHotkeyConflict(null)}>
            ×
          </button>
        </p>
      )}
      {isMac && stealthPermissionMissing && (
        <p className="quiet" data-stealth-ignore="true">
          Stealth typing needs Accessibility access.{' '}
          <button className="text-btn" onClick={() => window.desktopAPI.stealthTapOpenSettings()}>
            Enable
          </button>
          <button className="text-btn" aria-label="Dismiss" onClick={() => setStealthPermissionMissing(false)}>
            ×
          </button>
        </p>
      )}
    </>
  );

  const quickActions = (
    <div className="qa" data-overlay-popup style={{ left: 3, top: 'calc(100% + 2px)' }}>
      <button type="button" className="row" onClick={() => runQuickAction(intelligence.handleWhatToSay)}>
        Help me respond <small>{formatShortcut(shortcuts.processScreenshots)}</small>
      </button>
      <button type="button" className="row" onClick={() => runQuickAction(intelligence.handleFollowUpQuestions)}>
        Suggest a question
      </button>
      <button type="button" className="row" onClick={() => runQuickAction(intelligence.handleRecap)}>
        Recap the call
      </button>
    </div>
  );

  const input = (
    <>
      <label htmlFor="lc-question" className="sr">
        Ask about this conversation
      </label>
      <span data-stealth-engage="true" style={{ display: 'contents' }}>
        <input
          id="lc-question"
          ref={textInputRef}
          data-testid="overlay-chat-input"
          placeholder="Ask anything"
          autoComplete="off"
          value={inputValue}
          readOnly={stealthTapActive}
          onChange={(e) => setInputValue(e.target.value)}
          onMouseDown={blockInputFocus}
        />
      </span>
    </>
  );

  return (
    <div className="lc" ref={contentRef}>
      <RecordingPill
        elapsed={elapsed}
        capturing={capturing}
        panelsHidden={!isExpanded}
        ending={endingMeeting}
        menuOpen={popup === 'session'}
        onToggleCapture={toggleCapture}
        onToggleHide={toggleHide}
        onEnd={() => void finishMeeting(true)}
        onToggleMenu={() => setPopup((open) => (open === 'session' ? null : 'session'))}
      >
        {popup === 'session' && (
          <SessionMenu
            micOn={micOn}
            callAudioOn={callAudioOn}
            undetectable={isUndetectable}
            model={currentModel}
            onMic={(on) => setChannelOn('mic', on)}
            onCallAudio={(on) => setChannelOn('system', on)}
            onUndetectable={setUndetectable}
            onModel={selectModel}
            onBackToApp={backToApp}
            onDiscard={discard}
            onClose={() => setPopup(null)}
          />
        )}
      </RecordingPill>

      {meetingEndError && (
        <div className="finish" role="alert">
          <h2>Could not end the session</h2>
          <p>{meetingEndError}</p>
          <button onClick={() => setMeetingEndError('')}>Close</button>
        </div>
      )}

      {isExpanded && !meetingEndError && (
        <div className="panels">
          <ConversationPanel
            view={view}
            onView={setView}
            engineLoading={starting}
            scrollRef={scrollContainerRef}
            maxHeight={listMaxHeight}
            more={threadCue.more}
            onScrollToEnd={threadCue.toEnd}
            busy={isProcessing}
            attachments={attachedContext}
            onRemoveAttachment={(path) => setAttachedContext((all) => all.filter((a) => a.path !== path))}
            notices={notices}
            input={input}
            quickActionsOpen={popup === 'actions'}
            quickActions={quickActions}
            onToggleQuickActions={() => setPopup((open) => (open === 'actions' ? null : 'actions'))}
            onAttachScreenshot={attachScreenshot}
            screenshotTip={`Attach screenshot ${formatShortcut(shortcuts.takeScreenshot)}`}
            onSubmit={submit}
          >
            {view === 'chat' ? (
              <ChatThread
                turns={turns}
                variants={variants}
                maxHeight={listMaxHeight}
                scrollRef={scrollContainerRef}
                spacerRef={spacerRef}
                onShorter={shorter}
                onAngle={anotherAngle}
                onCopy={copyAnswer}
              />
            ) : (
              <TranscriptView
                turns={meeting.dialogueTurns}
                partials={meeting.livePartials}
                notice={sttNotice(sttSummary)}
                scrollRef={scrollContainerRef}
              />
            )}
          </ConversationPanel>
          <SuggestionsPanel
            questions={questions}
            hydrated={questionRevision >= 0}
            on={!questionDetectionPaused}
            scanning={isScanning}
            maxHeight={listMaxHeight}
            selectedId={selectedQuestionId}
            onToggle={toggleSuggestions}
            onScan={scanNow}
            onSend={sendSuggestion}
            onDismiss={dismissQuestion}
          />
        </div>
      )}

      {toast && (
        <div key={toast.id} className="toast" role="status">
          {toast.text}
        </div>
      )}
      <div className="sr" role="status" aria-live="polite">
        {announcement}
      </div>
      <TooltipLayer rootRef={contentRef} />
    </div>
  );
};

export default AssistantOverlay;
