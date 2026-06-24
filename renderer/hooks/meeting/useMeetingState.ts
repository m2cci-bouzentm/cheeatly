import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  appendDialogueFinal,
  type LivePartials,
  type DialogueTurn,
} from '../../lib/dialogueTranscript.ts';
import { analytics } from '../../lib/analytics/analytics.service';
import { useLocalStorageSetting } from './useLocalStorageSetting';
import type {
  AppMessage,
  SttStatus,
  SystemAudioWarning,
} from '../../pages/AssistantOverlay/types';

interface UseMeetingStateParams {
  messages: AppMessage[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  setMessages: (messages: AppMessage[] | ((messages: AppMessage[]) => AppMessage[])) => void;
  setIsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  stopChat: () => Promise<void>;
  onSessionReset: () => void;
}

export const useMeetingState = ({
  messages,
  messagesEndRef,
  setMessages: _setMessages,
  setIsExpanded,
  stopChat,
  onSessionReset,
}: UseMeetingStateParams) => {
  const [isConnected, setIsConnected] = useState(false);
  const [sttUserStatus, setSttUserStatus] =
    useState<SttStatus>('awaiting-audio');
  const [sttUserError, setSttUserError] = useState<string>('');
  const [sttUserProvider, setSttUserProvider] = useState<string>('');
  const [sttInterviewerStatus, setSttInterviewerStatus] =
    useState<SttStatus>('awaiting-audio');
  const [sttInterviewerError, setSttInterviewerError] = useState<string>('');
  const [sttInterviewerProvider, setSttInterviewerProvider] =
    useState<string>('');
  const [micCaptureActive, setMicCaptureActive] = useState(false);
  const [systemCaptureActive, setSystemCaptureActive] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [systemMuted, setSystemMuted] = useState(false);
  const showTranscript = useLocalStorageSetting(
    'cheatly_interviewer_transcript',
    (v) => v !== 'false'
  );
  const [dialogueTurns, setDialogueTurns] = useState<DialogueTurn[]>([]);
  const [livePartials, setLivePartials] = useState<LivePartials>({
    Me: null,
    Them: null,
  });
  const [isInterviewerSpeaking, setIsInterviewerSpeaking] = useState(false);
  const [systemAudioWarning, setSystemAudioWarning] =
    useState<SystemAudioWarning | null>(null);
  const [audioNotice, setAudioNotice] = useState<string | null>(null);
  const [tccRepairing, setTccRepairing] = useState(false);
  const [sttNotConfigured, setSttNotConfigured] = useState(false);

  const interviewerSpeakingRef = useRef(false);
  const lastPartialRef = useRef<string>('');
  const stickToBottomRef = useRef(true);

  const handleScrollCapture = useCallback(() => {
    const el = messagesEndRef.current?.parentElement;
    if (!el) return;
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }, [messagesEndRef]);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    if (messages.length === 0) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages, messagesEndRef]);

  // E2E parity probe: a hidden (occluded) window can defer DOM paints
  // indefinitely, so tests read the folded state itself instead of the DOM.
  useEffect(() => {
    (window as any).__cheatlyDialogueTurns = dialogueTurns;
    const dbg = ((window as any).__cheatlyDialogueDebug ??= {
      updates: 0,
      resets: [],
    });
    dbg.updates += 1;
  }, [dialogueTurns]);

  const setInterviewerSpeakingIfChanged = useCallback((next: boolean) => {
    if (interviewerSpeakingRef.current === next) return;
    interviewerSpeakingRef.current = next;
    setIsInterviewerSpeaking(next);
  }, []);

  const resetDialogue = useCallback(() => {
    lastPartialRef.current = '';
    setDialogueTurns([]);
    setLivePartials({ Me: null, Them: null });
  }, []);

  const updateUserSttStatus = useCallback(
    (data: { state: SttStatus; provider: string; error?: string }) => {
      setSttUserStatus(data.state);
      setSttUserProvider(data.provider);
      if (data.error) setSttUserError(data.error);
      if (data.state === 'connected') setSttUserError('');
    },
    []
  );

  const updateInterviewerSttStatus = useCallback(
    (data: { state: SttStatus; provider: string; error?: string }) => {
      setSttInterviewerStatus(data.state);
      setSttInterviewerProvider(data.provider);
      if (data.error) setSttInterviewerError(data.error);
      if (data.state === 'connected') setSttInterviewerError('');
    },
    []
  );

  const applyTranscriptPartial = useCallback(
    (label: 'Me' | 'Them', text: string, isInterviewer: boolean) => {
      const tagged = `${label}: ${text}`;
      if (tagged === lastPartialRef.current) return;
      lastPartialRef.current = tagged;
      if (isInterviewer) setInterviewerSpeakingIfChanged(true);
      setLivePartials((prev) => ({ ...prev, [label]: text.trim() }));
    },
    [setInterviewerSpeakingIfChanged]
  );

  // IPC event listeners — single useEffect for all meeting lifecycle events
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    cleanups.push(
      window.electronAPI.onSystemAudioPermissionDenied((message: string) => {
        setSystemAudioWarning({
          kind: 'screen-recording-permission',
          message,
          channel: 'system',
        });
        setIsExpanded(true);
      })
    );

    cleanups.push(
      window.electronAPI.onAudioInputAutoSwitched((payload) => {
        const msg =
          payload.message ??
          (payload.reason === 'bluetooth-hfp-avoided'
            ? `Using ${payload.to} for better quality while ${payload.from} plays audio.`
            : payload.reason === 'same-device-conflict'
              ? `Switched microphone to ${payload.to} so system audio can be captured.`
              : payload.to
                ? `Microphone switched to ${payload.to}.`
                : 'Microphone quality is degraded.');
        console.log('[AssistantOverlay] Audio input auto-switched:', payload);
        setAudioNotice(msg);
      })
    );

    cleanups.push(
      window.electronAPI.onMeetingStateChanged(({ isActive }) => {
        ((window as any).__cheatlyDialogueDebug ??= {
          updates: 0,
          resets: [],
        }).resets.push(`state:${isActive}@${Date.now()}`);
        if (!isActive) return;
        resetDialogue();
        lastPartialRef.current = '';
        setInterviewerSpeakingIfChanged(false);
      })
    );

    cleanups.push(
      window.electronAPI.onDialogueDrained((turns) => {
        setDialogueTurns(turns);
        setLivePartials({ Me: null, Them: null });
      })
    );

    cleanups.push(
      window.electronAPI.onSessionReset(() => {
        console.log('[AssistantOverlay] Resetting session state...');
        onSessionReset();
        stopChat();
        setInterviewerSpeakingIfChanged(false);
        setSttUserStatus('awaiting-audio');
        setSttInterviewerStatus('awaiting-audio');
        setSttUserError('');
        setSttInterviewerError('');
        setMicCaptureActive(false);
        setSystemCaptureActive(false);
        setMicMuted(false);
        setSystemMuted(false);
        lastPartialRef.current = '';
        setLivePartials({ Me: null, Them: null });
        analytics.trackConversationStarted();
      })
    );

    cleanups.push(
      window.electronAPI.onSttStatusChanged((data) => {
        if (data.channel === 'user') {
          updateUserSttStatus(data);
          return;
        }
        if (data.channel === 'interviewer') {
          updateInterviewerSttStatus(data);
        }
      })
    );

    window.electronAPI
      .getNativeAudioStatus()
      .then((status) => setIsConnected(status.connected))
      .catch(() => setIsConnected(false));

    cleanups.push(
      window.electronAPI.onAudioCaptureActive((data) => {
        if (data.channel === 'mic') {
          setMicCaptureActive(data.active);
          return;
        }
        if (data.channel === 'system') setSystemCaptureActive(data.active);
      })
    );

    cleanups.push(
      window.electronAPI.onNativeAudioTranscript((transcript) => {
        if (
          transcript.speaker !== 'interviewer' &&
          transcript.speaker !== 'user'
        )
          return;
        const label = transcript.speaker === 'interviewer' ? 'Them' : 'Me';
        const isInterviewer = transcript.speaker === 'interviewer';

        if (!transcript.final) {
          applyTranscriptPartial(label, transcript.text, isInterviewer);
          return;
        }

        lastPartialRef.current = '';
        if (isInterviewer) setInterviewerSpeakingIfChanged(false);
        setDialogueTurns((prev) =>
          appendDialogueFinal(prev, label, transcript.text)
        );
        setLivePartials((prev) => ({ ...prev, [label]: null }));
      })
    );

    return () => cleanups.forEach((fn) => fn());
  }, [
    applyTranscriptPartial,
    onSessionReset,
    resetDialogue,
    setInterviewerSpeakingIfChanged,
    setIsExpanded,
    stopChat,
    updateInterviewerSttStatus,
    updateUserSttStatus,
  ]);

  // STT provider config check
  useEffect(() => {
    let mounted = true;
    window.electronAPI
      .getSttProvider()
      .then((provider: string) => {
        if (mounted) setSttNotConfigured(provider === 'none');
      })
      .catch(() => {});

    const unsub = window.electronAPI.onSttConfigChanged(
      (data: { configured: boolean; provider: string }) => {
        if (mounted) setSttNotConfigured(!data.configured);
      }
    );
    return () => {
      mounted = false;
      unsub?.();
    };
  }, []);

  // Auto-dismiss audio notice after 6s
  useEffect(() => {
    if (!audioNotice) return;
    const t = setTimeout(() => setAudioNotice(null), 6000);
    return () => clearTimeout(t);
  }, [audioNotice]);

  const interviewerSttIndicatorError = sttInterviewerError?.replace(
    /\s*\(\d+ consecutive errors\):?/gi,
    ''
  );
  const interviewerChannelStatus = useMemo(
    () => ({
      status: sttInterviewerStatus,
      error: interviewerSttIndicatorError,
      provider: sttInterviewerProvider,
    }),
    [sttInterviewerStatus, interviewerSttIndicatorError, sttInterviewerProvider]
  );
  const microphoneChannelStatus = useMemo(
    () => ({
      status: sttUserStatus,
      error: sttUserError,
      provider: sttUserProvider,
    }),
    [sttUserStatus, sttUserError, sttUserProvider]
  );

  return {
    isConnected,
    sttUserStatus,
    sttUserError,
    sttUserProvider,
    sttInterviewerStatus,
    sttInterviewerError,
    sttInterviewerProvider,
    micCaptureActive,
    systemCaptureActive,
    micMuted,
    setMicMuted,
    systemMuted,
    setSystemMuted,
    showTranscript,
    handleScrollCapture,
    dialogueTurns,
    livePartials,
    isInterviewerSpeaking,
    systemAudioWarning,
    setSystemAudioWarning,
    audioNotice,
    tccRepairing,
    setTccRepairing,
    sttNotConfigured,
    setSttNotConfigured,
    interviewerChannelStatus,
    microphoneChannelStatus,
  };
};
