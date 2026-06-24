import { useCallback, useEffect, useRef } from 'react';
import { shouldDedupeOverlayAction } from '../../lib/overlayActionDedup.ts';
import { shouldDedupeManualSubmit } from '../../lib/overlaySubmitDedup.ts';
import { analytics } from '../../lib/analytics/analytics.service';
import type { AttachmentContext, AppMessage } from '../../pages/AssistantOverlay/types';

interface UseIntelligenceHandlersParams {
  inputValue: string;
  setInputValue: React.Dispatch<React.SetStateAction<string>>;
  attachedContext: AttachmentContext[];
  setAttachedContext: React.Dispatch<React.SetStateAction<AttachmentContext[]>>;
  conversationContext: string;
  hasTranscript: boolean;
  setIsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  pendingCaptureRef: React.MutableRefObject<AttachmentContext | null>;
  pinSuggestionPanel: () => void;
  setScreenContextStatus: React.Dispatch<
    React.SetStateAction<'not_available' | 'available' | 'failed'>
  >;
  setLatestUsedImageInput: React.Dispatch<React.SetStateAction<boolean>>;
  setLatestVisionProviderUsed: React.Dispatch<
    React.SetStateAction<string | undefined>
  >;
  setLatestVisionModelUsed: React.Dispatch<
    React.SetStateAction<string | undefined>
  >;
  setLatestVisionFailureReason: React.Dispatch<
    React.SetStateAction<string | undefined>
  >;
  sendWithSystem: (
    text: string,
    system: string,
    opts?: {
      files?: Array<{ type: 'file'; mediaType: string; url: string }>;
      metadata?: { hasScreenshot?: boolean; screenshotPreview?: string; isError?: boolean };
    },
  ) => Promise<unknown>;
}

export const useSuggestionActions = ({
  inputValue,
  setInputValue,
  attachedContext,
  setAttachedContext,
  conversationContext,
  hasTranscript,
  setIsExpanded,
  pendingCaptureRef,
  pinSuggestionPanel,
  setScreenContextStatus,
  setLatestUsedImageInput,
  setLatestVisionProviderUsed,
  setLatestVisionModelUsed,
  setLatestVisionFailureReason,
  sendWithSystem,
}: UseIntelligenceHandlersParams) => {
  const manualSubmitInFlightRef = useRef(false);
  const lastManualSubmitRef = useRef<{ text: string; atMs: number } | null>(
    null
  );
  const overlayActionInFlightRef = useRef(new Set<string>());
  const lastOverlayActionRef = useRef<{ key: string; atMs: number } | null>(
    null
  );
  const handleManualSubmitRef = useRef<() => void>(() => {});

  const tryBeginOverlayAction = useCallback((actionKey: string): boolean => {
    if (overlayActionInFlightRef.current.has(actionKey)) return false;
    const nowMs = Date.now();
    const last = lastOverlayActionRef.current;
    if (
      shouldDedupeOverlayAction({
        actionKey,
        lastActionKey: last?.key ?? null,
        lastAtMs: last?.atMs ?? null,
        nowMs,
      })
    ) {
      return false;
    }
    overlayActionInFlightRef.current.add(actionKey);
    lastOverlayActionRef.current = { key: actionKey, atMs: nowMs };
    return true;
  }, []);

  const endOverlayAction = useCallback((actionKey: string) => {
    overlayActionInFlightRef.current.delete(actionKey);
    if (lastOverlayActionRef.current?.key === actionKey) {
      lastOverlayActionRef.current = null;
    }
  }, []);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    analytics.trackCopyAnswer();
  }, []);

  const handleScreenshotAttach = useCallback(
    (data: AttachmentContext) => {
      setIsExpanded(true);
      setAttachedContext((prev) => {
        if (prev.some((s) => s.path === data.path)) return prev;
        const updated = [...prev, data];
        return updated.slice(-5);
      });
    },
    [setAttachedContext, setIsExpanded]
  );

  const handleWhatToSay = useCallback(
    async (promptInstruction?: string | React.MouseEvent) => {
      if (!hasTranscript) return;
      if (!tryBeginOverlayAction('what_to_say')) return;
      const dynamicPromptInstruction =
        typeof promptInstruction === 'string' ? promptInstruction : undefined;
      setIsExpanded(true);
      setScreenContextStatus('not_available');
      setLatestUsedImageInput(false);
      setLatestVisionProviderUsed(undefined);
      setLatestVisionModelUsed(undefined);
      setLatestVisionFailureReason(undefined);
      const pending = pendingCaptureRef.current;
      let currentAttachments = attachedContext;
      if (pending && !currentAttachments.some((s) => s.path === pending.path)) {
        currentAttachments = [...currentAttachments, pending].slice(-5);
      }

      if (currentAttachments.length > 0) {
        setAttachedContext([]);
      }

      analytics.trackCommandExecuted('what_to_say');

      try {
        const userText = dynamicPromptInstruction
          ? `What should I say? ${dynamicPromptInstruction}`
          : 'What should I say?';
        const files = currentAttachments
          .filter((a) => a.preview)
          .map((a) => ({ type: 'file' as const, mediaType: 'image/png', url: a.preview }));
        await sendWithSystem(userText, '', {
          files: files.length > 0 ? files : undefined,
          metadata: currentAttachments.length > 0
            ? { hasScreenshot: true, screenshotPreview: currentAttachments[0].preview }
            : undefined,
        });
      } catch (err) {
        console.error('what_to_say failed:', err);
        pinSuggestionPanel();
      } finally {
        endOverlayAction('what_to_say');
      }
    },
    [
      attachedContext,
      endOverlayAction,
      hasTranscript,
      pendingCaptureRef,
      pinSuggestionPanel,
      setAttachedContext,
      setIsExpanded,
      setLatestUsedImageInput,
      setLatestVisionFailureReason,
      setLatestVisionModelUsed,
      setLatestVisionProviderUsed,
      setScreenContextStatus,
      sendWithSystem,
      tryBeginOverlayAction,
    ]
  );

  const handleRecap = useCallback(async () => {
    if (!hasTranscript) return;
    if (!tryBeginOverlayAction('recap')) return;
    setIsExpanded(true);
    analytics.trackCommandExecuted('recap');
    try {
      await sendWithSystem('Give me a recap', '');
    } catch (err) {
      console.error('recap failed:', err);
    } finally {
      endOverlayAction('recap');
    }
  }, [
    endOverlayAction,
    hasTranscript,
    setIsExpanded,
    sendWithSystem,
    tryBeginOverlayAction,
  ]);

  const handleFollowUpQuestions = useCallback(async () => {
    if (!hasTranscript) return;
    if (!tryBeginOverlayAction('follow_up_questions')) return;
    setIsExpanded(true);
    analytics.trackCommandExecuted('suggest_questions');
    try {
      await sendWithSystem('Suggest follow-up questions', '');
    } catch (err) {
      console.error('follow_up_questions failed:', err);
    } finally {
      endOverlayAction('follow_up_questions');
    }
  }, [
    endOverlayAction,
    hasTranscript,
    setIsExpanded,
    sendWithSystem,
    tryBeginOverlayAction,
  ]);

  const handleClarify = useCallback(async () => {
    if (!hasTranscript) return;
    if (!tryBeginOverlayAction('clarify')) return;
    setIsExpanded(true);
    analytics.trackCommandExecuted('clarify');
    try {
      await sendWithSystem('Clarify what was said', '');
    } catch (err) {
      console.error('clarify failed:', err);
    } finally {
      endOverlayAction('clarify');
    }
  }, [
    endOverlayAction,
    hasTranscript,
    setIsExpanded,
    sendWithSystem,
    tryBeginOverlayAction,
  ]);

  const handleManualSubmit = useCallback(async () => {
    if (!inputValue.trim() && attachedContext.length === 0) return;
    const userText = inputValue.trim();
    const nowMs = Date.now();
    if (manualSubmitInFlightRef.current) return;
    const last = lastManualSubmitRef.current;
    if (
      shouldDedupeManualSubmit({
        text: userText,
        lastText: last?.text ?? null,
        lastAtMs: last?.atMs ?? null,
        nowMs,
      })
    ) {
      return;
    }
    manualSubmitInFlightRef.current = true;
    lastManualSubmitRef.current = { text: userText, atMs: nowMs };

    const currentAttachments = attachedContext;
    setInputValue('');
    setAttachedContext([]);

    setIsExpanded(true);
    pinSuggestionPanel();

    try {
      const files = currentAttachments
        .filter((a) => a.preview)
        .map((a) => ({ type: 'file' as const, mediaType: 'image/png', url: a.preview }));
      await sendWithSystem(
        userText || 'Analyze this screenshot',
        conversationContext,
        {
          files: files.length > 0 ? files : undefined,
          metadata: currentAttachments.length > 0
            ? { hasScreenshot: true, screenshotPreview: currentAttachments[0]?.preview }
            : undefined,
        },
      );
    } catch (err: any) {
      const msg =
        typeof err === 'string' ? err : err?.message || 'Unknown error';
      console.error('manual submit failed:', msg);
    } finally {
      manualSubmitInFlightRef.current = false;
    }
  }, [
    attachedContext,
    conversationContext,
    inputValue,
    pinSuggestionPanel,
    setAttachedContext,
    setInputValue,
    setIsExpanded,
    sendWithSystem,
  ]);

  handleManualSubmitRef.current = handleManualSubmit;

  const clearChat = useCallback(() => {
    lastManualSubmitRef.current = null;
    manualSubmitInFlightRef.current = false;
  }, []);

  useEffect(() => {
    const cleanupTaken = window.electronAPI.onScreenshotTaken(
      handleScreenshotAttach
    );
    return () => {
      cleanupTaken?.();
    };
  }, [handleScreenshotAttach]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onCaptureAndProcess((data) => {
      setIsExpanded(true);
      pendingCaptureRef.current = data;
      setAttachedContext((prev) => {
        if (prev.some((s) => s.path === data.path)) return prev;
        return [...prev, data].slice(-5);
      });
      requestAnimationFrame(() => {
        try {
          handleWhatToSay();
        } finally {
          pendingCaptureRef.current = null;
        }
      });
    });
    return unsubscribe;
  }, [handleWhatToSay, pendingCaptureRef, setAttachedContext, setIsExpanded]);

  return {
    handleCopy,
    handleScreenshotAttach,
    handleWhatToSay,
    handleRecap,
    handleFollowUpQuestions,
    handleClarify,
    handleManualSubmit,
    handleManualSubmitRef,
    clearChat,
  };
};
