import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
} from 'framer-motion';
import {
  ExternalLink,
  Pause,
  Play,
  ScanSearch,
  LoaderCircle,
  PanelRightOpen,
  PanelRightClose,
  Sparkles,
  LayoutList,
  ChevronDown,
  SlidersHorizontal,
} from 'lucide-react';
import { prettifyModelId } from '../../utils/modelUtils';
import {
  widthDerivedScrollMax,
  verticalScrollCap,
} from '../../lib/overlayScrollBudget.ts';
import { useShortcuts } from '../../hooks/useShortcuts.ts';
import { useServerChat } from '../../hooks/useServerChat.ts';
import {
  getOverlayAppearance,
  OVERLAY_OPACITY_DEFAULT,
} from '../../lib/overlayAppearance.ts';
import { isMac } from '../../utils/platformUtils.ts';
import { cn } from '../../lib/utils.ts';
import TopPill from '../../components/ui/TopPill.tsx';
import { Card } from '../../components/ui/card.tsx';
import { Button } from '../../components/ui/button.tsx';
import SuggestionPanel from './components/SuggestionPanel.tsx';
import SuggestionControls from './components/SuggestionControls.tsx';
import TranscriptPanel from './components/TranscriptPanel.tsx';
import QuestionsPanel from '../../components/questions/QuestionsPanel.tsx';
import FocusView from './components/FocusView.tsx';
import { useDetectedQuestions } from '../../hooks/meeting/useDetectedQuestions.ts';
import type { DetectedQuestion } from '../../hooks/meeting/useDetectedQuestions.ts';
import {
  formatProviderLabel,
  getSttSummary,
  useMessageRenderer,
} from './components/MessageComponents.tsx';
import { useSuggestionActions } from '../../hooks/meeting/useSuggestionActions.ts';
import { useMeetingState } from '../../hooks/meeting/useMeetingState.ts';
import { useOverlayKeyboard } from '../../hooks/meeting/useOverlayKeyboard.ts';
import { collapseConsecutiveDuplicateAssistantMessages } from '../../lib/overlayActionDedup.ts';
import type {
  AttachmentContext,
  AppMessage,
  AssistantOverlayProps,
} from './types.ts';
import { getMessageText } from './types.ts';

const SHELL_WIDTH_COLLAPSED = 600;

function roleLabel(role: string): string {
  if (role === 'user') return 'User';
  return 'Assistant';
}

const updateShellDimensions = (width: number, height: number) => {
  window.electronAPI.updateContentDimensions({ width, height });
};

const AssistantOverlay: React.FC<AssistantOverlayProps> = ({
  overlayOpacity = OVERLAY_OPACITY_DEFAULT,
}) => {
  const isLightTheme = false;
  const { shortcuts, isShortcutPressed } = useShortcuts();

  const shellRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const rafDimUpdateRef = useRef<number | null>(null);
  const assistantScrollTopRef = useRef(0);
  const pendingCaptureRef = useRef<AttachmentContext | null>(null);
  const isExpandedEffectInitializedRef = useRef(false);
  const hasRenderedExpandedRef = useRef(false);
  const isStealthRef = useRef(false);
  const stealthTapActiveRef = useRef(false);
  const stealthAutoEngageOkRef = useRef(true);
  const isCgEventTapAvailableRef = useRef(false);

  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<'assistant' | 'transcript'>(
    'assistant'
  );
  const [inputValue, setInputValue] = useState('');
  const [answerPanelPinned, setSuggestionPanelPinned] = useState(false);
  const answerPanelPinnedRef = useRef(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [conversationContext, setConversationContext] = useState('');
  const [attachedContext, setAttachedContext] = useState<AttachmentContext[]>(
    []
  );
  const [currentModel, setCurrentModel] = useState('gemini-3-flash-preview');
  const [isUndetectable, setIsUndetectable] = useState(false);
  const [hideChatHidesWidget] = useState(() => {
    const stored = localStorage.getItem('cheatly_hideChatHidesWidget');
    return stored ? stored === 'true' : true;
  });
  const [stealthTapActive, setStealthTapActive] = useState(false);
  const [stealthPermissionMissing, setStealthPermissionMissing] =
    useState(false);
  const [stealthHotkeyConflict, setStealthHotkeyConflict] = useState<
    string | null
  >(null);
  const [llmProviderLabel, setLlmProviderLabel] = useState('unknown');
  const [llmPrivacyLabel, setLlmPrivacyLabel] = useState<string | null>(null);
  const [screenContextStatus, setScreenContextStatus] = useState<
    'not_available' | 'available' | 'failed'
  >('not_available');
  const [latestUsedImageInput, setLatestUsedImageInput] = useState(false);
  const [latestVisionProviderUsed, setLatestVisionProviderUsed] = useState<
    string | undefined
  >(undefined);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [latestVisionModelUsed, setLatestVisionModelUsed] = useState<
    string | undefined
  >(undefined);
  const [latestVisionFailureReason, setLatestVisionFailureReason] = useState<
    string | undefined
  >(undefined);
  const {
    messages,
    setMessages,
    stop: stopServerChat,
    sendWithSystem,
    status: chatStatus,
  } = useServerChat();
  const isStreaming = chatStatus === 'streaming';

  const [analysisPaused, setAnalysisPaused] = useState(false);
  const [questionsPanelOpen, setQuestionsPanelOpen] = useState(true);
  const [focusMode, setFocusMode] = useState(true);

  const shellWidth = useMotionValue(SHELL_WIDTH_COLLAPSED);
  const verticalCap = useMotionValue(Infinity);
  const scrollMaxH = useTransform(
    [shellWidth, verticalCap],
    ([w, cap]: number[]) => Math.min(widthDerivedScrollMax(w), cap)
  );

  const appearance = useMemo(
    () => getOverlayAppearance(overlayOpacity),
    [overlayOpacity]
  );
  const overlayPanelClass = 'overlay-text-primary';
  const quickActionClass = 'overlay-chip-surface overlay-text-interactive';
  const controlSurfaceClass =
    'overlay-control-surface overlay-text-interactive';

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const hasActiveSystemAnswer = useMemo(
    () =>
      messages.some(
        (m) =>
          m.role === 'assistant' &&
          (isStreaming || getMessageText(m).trim().length > 0)
      ),
    [messages, isStreaming]
  );
  useEffect(() => {
    if (hasActiveSystemAnswer) {
      answerPanelPinnedRef.current = true;
      setSuggestionPanelPinned(true);
    }
  }, [hasActiveSystemAnswer]);
  useEffect(() => {
    answerPanelPinnedRef.current = answerPanelPinned;
  }, [answerPanelPinned]);

  const pinSuggestionPanel = useCallback(() => {
    answerPanelPinnedRef.current = true;
    setSuggestionPanelPinned(true);
  }, []);

  const displayMessages = useMemo(
    () =>
      collapseConsecutiveDuplicateAssistantMessages(messages, getMessageText),
    [messages]
  );

  const saveAssistantScrollPosition = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) assistantScrollTopRef.current = container.scrollTop;
  }, []);

  const handleTabChange = useCallback(
    (nextTab: 'assistant' | 'transcript') => {
      if (activeTab === 'assistant') saveAssistantScrollPosition();
      setActiveTab(nextTab);
    },
    [activeTab, saveAssistantScrollPosition]
  );

  const resetShellWidth = useCallback(() => {
    shellWidth.set(SHELL_WIDTH_COLLAPSED);
  }, [shellWidth]);

  const resetQuestionsRef = useRef<() => void>(() => {});

  const resetSessionUi = useCallback(() => {
    setMessages([]);
    resetShellWidth();
    answerPanelPinnedRef.current = false;
    setSuggestionPanelPinned(false);
    setInputValue('');
    setAttachedContext([]);
    stopServerChat();
    setMessages([]);
    resetQuestionsRef.current();
  }, [resetShellWidth, setMessages, stopServerChat]);

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
    conversationContext,
    hasTranscript: meeting.dialogueTurns.length > 0,
    setIsExpanded,
    pendingCaptureRef,
    pinSuggestionPanel,
    setScreenContextStatus,
    setLatestUsedImageInput,
    setLatestVisionProviderUsed,
    setLatestVisionModelUsed,
    setLatestVisionFailureReason,
    sendWithSystem,
  });

  const {
    questions,
    dismiss: dismissQuestion,
    consume: consumeQuestion,
    reset: resetQuestions,
    forceRefresh,
    isScanning,
    settingsEnabled: questionAnalysisEnabled,
  } = useDetectedQuestions(meeting.dialogueTurns, !analysisPaused);
  resetQuestionsRef.current = resetQuestions;
  const questionDetectionPaused = analysisPaused || !questionAnalysisEnabled;

  const handleQuestionSelect = useCallback(
    (q: DetectedQuestion) => {
      consumeQuestion(q.id);
      const prefix =
        q.speaker === 'Them' ? 'Help me answer: ' : 'Follow up on: ';
      const text = q.prompt?.trim() || prefix + q.text;
      setIsExpanded(true);
      pinSuggestionPanel();
      sendWithSystem(text, '');
    },
    [consumeQuestion, sendWithSystem, setIsExpanded, pinSuggestionPanel]
  );

  const handleToggleAnalysis = useCallback(() => {
    setAnalysisPaused((prev) => !prev);
  }, []);

  const renderMessageText = useMessageRenderer({
    isLightTheme,
    handleCopy: intelligence.handleCopy,
  });

  useEffect(() => {
    let mounted = true;
    const loadLlmRoute = async () => {
      const config = await window.electronAPI
        .getCurrentLlmConfig()
        .catch(() => null);
      if (!mounted || !config) return;
      setLlmProviderLabel(formatProviderLabel(config.provider));
      setLlmPrivacyLabel(
        config.provider === 'custom' ? 'Custom endpoint route' : null
      );
    };
    loadLlmRoute();
    const unsub = window.electronAPI.onModelChanged(() => loadLlmRoute());
    return () => {
      mounted = false;
      unsub?.();
    };
  }, []);

  useEffect(() => {
    window.electronAPI
      .getDefaultModel()
      .then((result: any) => {
        if (result?.model) {
          setCurrentModel(result.model);
          window.electronAPI.setModel(result.model).catch(() => {});
        }
      })
      .catch((err: any) =>
        console.error('Failed to fetch default model:', err)
      );
  }, []);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onModelChanged((modelId: string) => {
      setCurrentModel((prev) => (prev === modelId ? prev : modelId));
    });
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    window.electronAPI.getUndetectable().then(setIsUndetectable);
    const unsubscribe = window.electronAPI.onUndetectableChanged((state) =>
      setIsUndetectable(state)
    );
    return () => unsubscribe?.();
  }, []);
  useEffect(() => {
    localStorage.setItem('cheatly_undetectable', String(isUndetectable));
    localStorage.setItem(
      'cheatly_hideChatHidesWidget',
      String(hideChatHidesWidget)
    );
  }, [isUndetectable, hideChatHidesWidget]);

  useEffect(() => {
    const context = messages
      .filter((m) => m.role !== 'user' || !m.metadata?.hasScreenshot)
      .map((m) => `${roleLabel(m.role)}: ${getMessageText(m)}`)
      .slice(-20)
      .join('\n');
    setConversationContext(context);
  }, [messages]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onSettingsVisibilityChange(
      (isVisible) => setIsSettingsOpen(isVisible)
    );
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    if (!isExpandedEffectInitializedRef.current) {
      isExpandedEffectInitializedRef.current = true;
      isStealthRef.current = false;
      return;
    }
    if (isExpanded) {
      setActiveTab('assistant');
      window.electronAPI.showWindow(isStealthRef.current);
      isStealthRef.current = false;
      return;
    }
    setTimeout(() => window.electronAPI.hideWindow(), 400);
  }, [isExpanded]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onToggleExpand(() =>
      setIsExpanded((prev) => !prev)
    );
    return () => unsubscribe?.();
  }, []);
  useEffect(() => {
    const unsubscribe = window.electronAPI.onEnsureExpanded(() => {
      isStealthRef.current = true;
      setIsExpanded(true);
    });
    return () => unsubscribe?.();
  }, []);

  const reportShellSize = useCallback(() => {
    if (!contentRef.current) return;
    const width = contentRef.current.offsetWidth;
    const height = contentRef.current.offsetHeight;
    updateShellDimensions(width, height);
  }, []);

  const measureVerticalCap = useCallback(() => {
    const scrollEl = scrollContainerRef.current;
    const contentEl = contentRef.current;
    if (!scrollEl || !contentEl) {
      verticalCap.set(Infinity);
      return;
    }
    const availHeight = window.screen.availHeight;
    const chromeHeight = contentEl.offsetHeight - scrollEl.clientHeight;
    verticalCap.set(verticalScrollCap({ availHeight, chromeHeight }));
  }, [verticalCap]);

  useEffect(() => {
    let rafId: number | null = null;
    let lastSentWidth = Math.round(shellWidth.get());
    const flush = () => {
      rafId = null;
      if (!contentRef.current) return;
      const width = contentRef.current.offsetWidth;
      if (Math.abs(width - lastSentWidth) < 1) return;
      lastSentWidth = width;
      const height = contentRef.current.offsetHeight;
      updateShellDimensions(width, height);
    };
    const unsubscribe = shellWidth.on('change', () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(flush);
    });
    return () => {
      unsubscribe();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [shellWidth]);

  useLayoutEffect(() => {
    if (!contentRef.current) return;
    const observer = new ResizeObserver(() => {
      if (rafDimUpdateRef.current)
        cancelAnimationFrame(rafDimUpdateRef.current);
      rafDimUpdateRef.current = requestAnimationFrame(() => {
        rafDimUpdateRef.current = null;
        measureVerticalCap();
        reportShellSize();
      });
    });
    observer.observe(contentRef.current);
    return () => {
      observer.disconnect();
      if (rafDimUpdateRef.current)
        cancelAnimationFrame(rafDimUpdateRef.current);
      rafDimUpdateRef.current = null;
    };
  }, [reportShellSize, measureVerticalCap]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      measureVerticalCap();
      reportShellSize();
    });
    return () => cancelAnimationFrame(id);
  }, [
    attachedContext,
    questionsPanelOpen,
    reportShellSize,
    measureVerticalCap,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      measureVerticalCap();
      reportShellSize();
    }, 600);
    return () => clearTimeout(timer);
  }, [reportShellSize, measureVerticalCap]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    let rafId: number | null = null;
    const onScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        saveAssistantScrollPosition();
      });
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [activeTab, messages, saveAssistantScrollPosition]);

  useEffect(() => {
    return () => {
      if (rafDimUpdateRef.current)
        cancelAnimationFrame(rafDimUpdateRef.current);
      rafDimUpdateRef.current = null;
    };
  }, []);

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
    intelligence,
    currentModel,
    onToast: setToastMessage,
  });

  const sttSummary = getSttSummary(
    meeting.sttUserStatus,
    meeting.sttInterviewerStatus,
    meeting.sttUserProvider,
    meeting.sttInterviewerProvider,
    meeting.sttNotConfigured,
    meeting.sttUserError,
    meeting.sttInterviewerError
  );
  const showSuggestionPanel =
    messages.length > 0 || isProcessing || answerPanelPinned;

  useLayoutEffect(() => {
    if (activeTab !== 'assistant' || !showSuggestionPanel) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    const maxScrollTop = Math.max(
      0,
      container.scrollHeight - container.clientHeight
    );
    container.scrollTop = Math.min(assistantScrollTopRef.current, maxScrollTop);
  }, [activeTab, showSuggestionPanel]);

  const shouldShowSttSummaryPill =
    sttSummary.tone === 'error' ||
    meeting.sttUserStatus === 'reconnecting' ||
    meeting.sttInterviewerStatus === 'reconnecting';
  const hasStatusPill = shouldShowSttSummaryPill;
  const statusPillBaseClass = `flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur-xl ${isLightTheme ? 'bg-white/55 border-black/10' : 'bg-black/20 border-white/10'}`;
  const expandedMotionInitial = hasRenderedExpandedRef.current
    ? { opacity: 0, y: 20, scale: 0.95 }
    : false;
  const markExpandedRendered = useCallback(() => {
    hasRenderedExpandedRef.current = true;
  }, []);

  void meeting.isConnected;
  void meeting.handleScrollCapture;
  void llmProviderLabel;
  void llmPrivacyLabel;
  void screenContextStatus;
  void latestUsedImageInput;
  void latestVisionProviderUsed;
  void latestVisionModelUsed;
  void latestVisionFailureReason;
  void intelligence.clearChat;

  const micNeedsPermission = meeting.systemAudioWarning?.channel === 'mic';
  const systemNeedsPermission =
    meeting.systemAudioWarning?.channel === 'system' ||
    meeting.systemAudioWarning?.kind === 'screen-recording-permission';

  const openPermissionPane = (channel: 'mic' | 'system') => {
    const url = !isMac
      ? null
      : channel === 'mic'
        ? 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
        : 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';
    if (url) {
      window.electronAPI.openExternal(url);
      return;
    }
    window.electronAPI.toggleSettingsWindow();
  };

  const channelDotClass = (
    active: boolean,
    muted: boolean,
    needsPermission: boolean
  ) => {
    if (needsPermission)
      return 'bg-amber-400/80 shadow-[0_0_6px_rgba(251,191,36,0.4)]';
    if (muted) return 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.4)]';
    if (active) return 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]';
    return 'bg-zinc-600';
  };

  const renderChannelLabel = (
    channel: 'mic' | 'system',
    label: string,
    muted: boolean,
    needsPermission: boolean
  ) =>
    needsPermission ? (
      <button
        onClick={() => openPermissionPane(channel)}
        title={
          meeting.systemAudioWarning?.message ??
          (channel === 'mic'
            ? 'Open Microphone permissions'
            : 'Open Screen Recording permissions')
        }
        className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-500 hover:text-amber-400 transition-colors cursor-pointer no-drag"
      >
        {label}
        <ExternalLink className="w-2.5 h-2.5" />
      </button>
    ) : (
      <span
        className={cn(
          'text-[10px] font-bold uppercase tracking-wider transition-colors',
          muted ? 'text-rose-500/70' : 'text-zinc-500'
        )}
      >
        {label}
      </span>
    );

  return (
    <div className="w-fit" style={{ pointerEvents: 'none' }}>
      <div
        ref={contentRef}
        className="flex flex-col items-start w-fit h-fit min-h-0 bg-transparent p-0 rounded-xl font-sans gap-1.5 overlay-text-primary"
        style={{ pointerEvents: 'auto' }}
      >
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={expandedMotionInitial}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              onAnimationComplete={markExpandedRendered}
              className="flex flex-col items-start gap-1.5 w-full"
            >
              <div
                className="flex justify-center"
                style={{ width: SHELL_WIDTH_COLLAPSED }}
              >
                <TopPill
                  expanded={isExpanded}
                  onToggle={() => setIsExpanded(!isExpanded)}
                  onBackToApp={() =>
                    window.electronAPI.setWindowMode('launcher')
                  }
                  onAbort={() => window.electronAPI.abortMeeting()}
                  onEnd={() => window.electronAPI.endMeeting()}
                  appearance={appearance}
                  onLogoClick={() =>
                    window.electronAPI.setWindowMode('launcher')
                  }
                />
              </div>
              <div
                className="grid items-stretch gap-2"
                style={{
                  gridTemplateColumns: questionsPanelOpen
                    ? 'auto auto'
                    : 'auto',
                }}
              >
                <motion.div
                  ref={shellRef}
                  className="relative max-w-full overflow-hidden flex flex-col transition-all duration-300"
                  style={{ width: shellWidth }}
                >
                  <Card
                    className={cn(
                      'flex flex-col h-full border rounded-xl overflow-hidden shadow-2xl transition-all duration-500 draggable-area',
                      isLightTheme
                        ? 'bg-white/95 border-slate-200'
                        : 'bg-zinc-900/95 border-zinc-800'
                    )}
                    style={appearance.shellStyle}
                  >
                    {/* Modern Tab Bar */}
                    <div className="flex items-center justify-between px-3 pt-2 select-none">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center bg-black/5 dark:bg-white/5 p-0.5 rounded-lg border border-black/5 dark:border-white/5 no-drag">
                          {(
                            [
                              ['assistant', 'Assistant'],
                              ['transcript', 'Transcript'],
                            ] as const
                          ).map(([key, label]) => (
                            <button
                              key={key}
                              onClick={() => handleTabChange(key)}
                              data-testid={`overlay-tab-${key}`}
                              className={cn(
                                'flex items-center gap-2 px-3 py-1 rounded-md text-xs font-semibold tracking-tight transition-all duration-300 relative no-drag',
                                activeTab === key
                                  ? isLightTheme
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'bg-zinc-800 text-white shadow-lg'
                                  : isLightTheme
                                    ? 'text-slate-500 hover:text-slate-700'
                                    : 'text-zinc-500 hover:text-zinc-300'
                              )}
                            >
                              {label}
                              {activeTab === key && (
                                <motion.div
                                  layoutId="activeTab"
                                  className="absolute inset-0 rounded-md border border-black/5 dark:border-white/10 pointer-events-none"
                                  transition={{
                                    type: 'spring',
                                    bounce: 0.2,
                                    duration: 0.6,
                                  }}
                                />
                              )}
                            </button>
                          ))}
                        </div>
                        {activeTab === 'assistant' && (
                          <button
                            onClick={() => setFocusMode((p) => !p)}
                            className={cn(
                              'w-7 h-7 rounded-lg flex items-center justify-center no-drag',
                              'border transition-all duration-200',
                              focusMode
                                ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400'
                                : 'bg-white/5 border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/10'
                            )}
                            title={focusMode ? 'Chat view' : 'Focus view'}
                          >
                            {focusMode ? (
                              <LayoutList size={13} />
                            ) : (
                              <Sparkles size={13} />
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex-1 flex flex-col overflow-hidden">
                      {activeTab === 'transcript' ? (
                        <TranscriptPanel
                          hasStatusPill={hasStatusPill}
                          shouldShowSttSummaryPill={shouldShowSttSummaryPill}
                          sttSummary={sttSummary}
                          sttNotConfigured={meeting.sttNotConfigured}
                          setSttNotConfigured={meeting.setSttNotConfigured}
                          showTranscript={meeting.showTranscript}
                          showDialogue={true}
                          dialogueTurns={meeting.dialogueTurns}
                          livePartials={meeting.livePartials}
                          interviewerChannelStatus={
                            meeting.interviewerChannelStatus
                          }
                          microphoneChannelStatus={
                            meeting.microphoneChannelStatus
                          }
                          scrollMaxH={scrollMaxH}
                        />
                      ) : focusMode ? (
                        <FocusView
                          messages={messages}
                          isStreaming={isStreaming}
                          onSwitchToChat={() => setFocusMode(false)}
                          scrollMaxH={scrollMaxH}
                        />
                      ) : (
                        <SuggestionPanel
                          showSuggestionPanel={showSuggestionPanel}
                          scrollContainerRef={scrollContainerRef}
                          scrollMaxH={scrollMaxH}
                          displayMessages={displayMessages}
                          isLightTheme={isLightTheme}
                          appearance={appearance}
                          handleCopy={intelligence.handleCopy}
                          renderMessageText={renderMessageText}
                          isProcessing={isProcessing}
                          isStreaming={isStreaming}
                          messagesEndRef={messagesEndRef}
                          onScroll={meeting.handleScrollCapture}
                        />
                      )}
                    </div>

                    {/* Persistent Footer */}
                    <div className="border-t border-black/[0.03] dark:border-white/[0.03] bg-black/[0.01] dark:bg-white/[0.01] flex flex-col">
                      {activeTab === 'assistant' && (
                        <SuggestionControls
                          hasTranscript={meeting.dialogueTurns.length > 0}
                          showTranscript={meeting.showTranscript}
                          quickActionClass={quickActionClass}
                          appearance={appearance}
                          handleWhatToSay={intelligence.handleWhatToSay}
                          handleClarify={intelligence.handleClarify}
                          handleRecap={intelligence.handleRecap}
                          handleFollowUpQuestions={
                            intelligence.handleFollowUpQuestions
                          }
                          attachedContext={attachedContext}
                          setAttachedContext={setAttachedContext}
                          isLightTheme={isLightTheme}
                          stealthHotkeyConflict={stealthHotkeyConflict}
                          setStealthHotkeyConflict={setStealthHotkeyConflict}
                          stealthPermissionMissing={stealthPermissionMissing}
                          setStealthPermissionMissing={
                            setStealthPermissionMissing
                          }
                          isMac={isMac}
                          textInputRef={textInputRef}
                          inputValue={inputValue}
                          setInputValue={setInputValue}
                          handleManualSubmit={intelligence.handleManualSubmit}
                          blockInputFocus={blockInputFocus}
                          stealthTapActive={stealthTapActive}
                          shortcuts={shortcuts}
                          currentModel={currentModel}
                          controlSurfaceClass={controlSurfaceClass}
                        />
                      )}

                      {/* Top Footer Row: Model Selector & Settings */}
                      <div className="flex items-center justify-start gap-2 px-3 py-1.5 border-t border-black/[0.03] dark:border-white/[0.03]">
                        <Button
                          variant="ghost"
                          size="sm"
                          data-model-selector-toggle="true"
                          onClick={(e) => {
                            if (!contentRef.current) return;
                            const contentRect =
                              contentRef.current.getBoundingClientRect();
                            const buttonRect =
                              e.currentTarget.getBoundingClientRect();
                            const GAP = 8;
                            const x = window.screenX + buttonRect.left;
                            const y = window.screenY + contentRect.bottom + GAP;
                            window.electronAPI.toggleModelSelector({
                              x,
                              y,
                              activate: false,
                            });
                          }}
                          className="h-7 px-2 rounded-md hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-1.5 no-drag"
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          <span className="text-[10px] font-bold tracking-tight opacity-70">
                            {prettifyModelId(currentModel)}
                          </span>
                          <ChevronDown size={10} className="opacity-40" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            if (isSettingsOpen) {
                              window.electronAPI.toggleSettingsWindow();
                              return;
                            }
                            if (!contentRef.current) return;
                            const contentRect =
                              contentRef.current.getBoundingClientRect();
                            const buttonRect =
                              e.currentTarget.getBoundingClientRect();
                            const GAP = 8;
                            const x = window.screenX + buttonRect.left;
                            const y = window.screenY + contentRect.bottom + GAP;
                            window.electronAPI.toggleSettingsWindow({
                              x,
                              y,
                            });
                          }}
                          className={cn(
                            'h-7 w-7 rounded-md transition-all duration-300 no-drag',
                            isSettingsOpen
                              ? 'bg-black/10 dark:bg-white/10'
                              : 'hover:bg-black/5 dark:hover:bg-white/5'
                          )}
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5 opacity-60" />
                        </Button>
                      </div>

                      {/* Bottom Footer Row: Audio Controls & Q-Detect */}
                      {(meeting.micCaptureActive ||
                        meeting.systemCaptureActive ||
                        !!meeting.systemAudioWarning) && (
                        <div className="flex items-center justify-between px-3 py-1.5 border-t border-black/[0.03] dark:border-white/[0.03]">
                          {/* Audio Controls */}
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              <div
                                className={cn(
                                  'w-1.5 h-1.5 rounded-full transition-all duration-300',
                                  channelDotClass(
                                    meeting.micCaptureActive,
                                    meeting.micMuted,
                                    micNeedsPermission
                                  )
                                )}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  const next = !meeting.micMuted;
                                  meeting.setMicMuted(next);
                                  window.electronAPI.setChannelMuted(
                                    'mic',
                                    next
                                  );
                                }}
                                className={cn(
                                  'h-7 w-7 rounded-lg border transition-all duration-300',
                                  meeting.micMuted
                                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-500 hover:bg-rose-500/20'
                                    : 'bg-black/5 dark:bg-white/5 border-transparent hover:bg-black/10 dark:hover:bg-white/10'
                                )}
                                title={
                                  meeting.micMuted ? 'Resume mic' : 'Pause mic'
                                }
                              >
                                {meeting.micMuted ? (
                                  <svg
                                    viewBox="0 0 24 24"
                                    className="w-3.5 h-3.5"
                                    stroke="currentColor"
                                    fill="none"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <line x1="1" y1="1" x2="23" y2="23" />
                                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .67-.1 1.32-.27 1.93" />
                                  </svg>
                                ) : (
                                  <svg
                                    viewBox="0 0 24 24"
                                    className="w-3.5 h-3.5"
                                    stroke="currentColor"
                                    fill="none"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                                  </svg>
                                )}
                              </Button>
                            </div>

                            <div className="w-px h-4 bg-black/10 dark:bg-white/10" />

                            <div className="flex items-center gap-2">
                              <div
                                className={cn(
                                  'w-1.5 h-1.5 rounded-full transition-all duration-300',
                                  channelDotClass(
                                    meeting.systemCaptureActive,
                                    meeting.systemMuted,
                                    systemNeedsPermission
                                  )
                                )}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  const next = !meeting.systemMuted;
                                  meeting.setSystemMuted(next);
                                  window.electronAPI.setChannelMuted(
                                    'system',
                                    next
                                  );
                                }}
                                className={cn(
                                  'h-7 w-7 rounded-lg border transition-all duration-300',
                                  meeting.systemMuted
                                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-500 hover:bg-rose-500/20'
                                    : 'bg-black/5 dark:bg-white/5 border-transparent hover:bg-black/10 dark:hover:bg-white/10'
                                )}
                                title={
                                  meeting.systemMuted
                                    ? 'Resume system audio'
                                    : 'Pause system audio'
                                }
                              >
                                {meeting.systemMuted ? (
                                  <svg
                                    viewBox="0 0 24 24"
                                    className="w-3.5 h-3.5"
                                    stroke="currentColor"
                                    fill="none"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                    <line x1="23" y1="9" x2="17" y2="15" />
                                    <line x1="17" y1="9" x2="23" y2="15" />
                                  </svg>
                                ) : (
                                  <svg
                                    viewBox="0 0 24 24"
                                    className="w-3.5 h-3.5"
                                    stroke="currentColor"
                                    fill="none"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                                  </svg>
                                )}
                              </Button>
                            </div>
                          </div>

                          {/* Q-Detect Inline */}
                          <div className="flex items-center gap-2">
                            <div
                              className={cn(
                                'w-1.5 h-1.5 rounded-full transition-all duration-300',
                                questionDetectionPaused
                                  ? 'bg-zinc-600'
                                  : isScanning
                                    ? 'bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.4)]'
                                    : 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]'
                              )}
                            />
                            <span
                              className={cn(
                                'text-[10px] font-bold uppercase tracking-wider transition-colors',
                                questionDetectionPaused
                                  ? 'text-zinc-500'
                                  : 'text-zinc-500'
                              )}
                            >
                              {isScanning ? 'Scanning' : 'Q-Detect'}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={handleToggleAnalysis}
                              className={cn(
                                'h-7 w-7 rounded-lg border transition-all duration-300',
                                questionDetectionPaused
                                  ? 'bg-rose-500/10 border-rose-500/20 text-rose-500 hover:bg-rose-500/20'
                                  : 'bg-black/5 dark:bg-white/5 border-transparent hover:bg-black/10 dark:hover:bg-white/10'
                              )}
                              disabled={!questionAnalysisEnabled}
                              title={
                                !questionAnalysisEnabled
                                  ? 'Enable scanning in settings'
                                  : analysisPaused
                                    ? 'Resume scanning'
                                    : 'Pause scanning'
                              }
                            >
                              {questionDetectionPaused ? (
                                <Play size={13} />
                              ) : (
                                <Pause size={13} />
                              )}
                            </Button>
                            {!questionDetectionPaused && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  if (isScanning) return;
                                  forceRefresh();
                                }}
                                disabled={isScanning}
                                className={cn(
                                  'h-7 w-7 rounded-lg border transition-all duration-300',
                                  isScanning
                                    ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                                    : 'bg-black/5 dark:bg-white/5 border-transparent hover:bg-black/10 dark:hover:bg-white/10'
                                )}
                                title="Scan now"
                              >
                                {isScanning ? (
                                  <LoaderCircle
                                    size={13}
                                    className="animate-spin"
                                  />
                                ) : (
                                  <ScanSearch size={13} />
                                )}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setQuestionsPanelOpen((p) => !p)}
                              className={cn(
                                'h-7 w-7 rounded-lg border transition-all duration-300 relative',
                                questionsPanelOpen
                                  ? 'bg-blue-500/20 border-blue-500/40 text-blue-400'
                                  : 'bg-black/5 dark:bg-white/5 border-transparent hover:bg-black/10 dark:hover:bg-white/10'
                              )}
                              title={
                                questionsPanelOpen
                                  ? 'Hide questions'
                                  : 'Show questions'
                              }
                            >
                              {questionsPanelOpen ? (
                                <PanelRightClose size={13} />
                              ) : (
                                <PanelRightOpen size={13} />
                              )}
                              {questions.length > 0 && !questionsPanelOpen && (
                                <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 px-1 rounded-full bg-blue-500 text-white text-[9px] font-bold flex items-center justify-center">
                                  {questions.length}
                                </span>
                              )}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>
                </motion.div>
                {questionsPanelOpen && (
                  <QuestionsPanel
                    questions={questions}
                    onSelect={handleQuestionSelect}
                    onDismiss={dismissQuestion}
                    paused={questionDetectionPaused}
                    style={{ maxHeight: scrollMaxH }}
                  />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-4 left-4 z-50 px-4 py-2 rounded-lg bg-yellow-500 text-white text-sm font-medium shadow-lg"
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AssistantOverlay;
