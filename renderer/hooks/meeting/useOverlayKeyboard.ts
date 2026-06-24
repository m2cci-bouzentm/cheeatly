import { useCallback, useEffect, useRef } from 'react';
import {
  resolveCgEventTapAvailable,
  shouldBlockFocus as shouldBlockStealthFocus,
  shouldFireStealthTapStart,
} from '../../lib/overlayStealthFocusGuards.ts';
import { modelSupportsVision } from '../../utils/modelUtils.ts';
import type {
  AttachmentContext,
  AppMessage,
} from '../../pages/AssistantOverlay/types';

interface IntelligenceKeyboardHandlers {
  handleWhatToSay: () => void;
  handleFollowUpQuestions: () => void;
  handleRecap: () => void;
  handleClarify: () => void;
  handleScreenshotAttach: (data: AttachmentContext) => void;
  handleManualSubmitRef: React.MutableRefObject<() => void>;
}

interface UseOverlayKeyboardParams {
  isShortcutPressed: (event: KeyboardEvent, shortcutId: any) => boolean;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  textInputRef: React.RefObject<HTMLInputElement | null>;
  setIsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  setInputValue: React.Dispatch<React.SetStateAction<string>>;
  setMessages: (messages: AppMessage[] | ((messages: AppMessage[]) => AppMessage[])) => void;
  setAttachedContext: React.Dispatch<React.SetStateAction<AttachmentContext[]>>;
  stopChat: () => Promise<void>;
  isProcessing: boolean;
  answerPanelPinnedRef: React.MutableRefObject<boolean>;
  setSuggestionPanelPinned: React.Dispatch<React.SetStateAction<boolean>>;
  isStealthRef: React.MutableRefObject<boolean>;
  stealthTapActiveRef: React.MutableRefObject<boolean>;
  stealthAutoEngageOkRef: React.MutableRefObject<boolean>;
  isCgEventTapAvailableRef: React.MutableRefObject<boolean>;
  setStealthTapActive: React.Dispatch<React.SetStateAction<boolean>>;
  setStealthPermissionMissing: React.Dispatch<React.SetStateAction<boolean>>;
  setStealthHotkeyConflict: React.Dispatch<React.SetStateAction<string | null>>;
  intelligence: IntelligenceKeyboardHandlers;
  currentModel: string;
  onToast: (message: string) => void;
}

function clampScrollStep(
  current: number,
  maxScroll: number,
  velocity: number,
  intMove: number
) {
  let next = current + intMove;
  let nextVelocity = velocity;
  const hitTop = next <= 0;
  if (hitTop) next = 0;
  if (hitTop && nextVelocity < 0) nextVelocity = 0;

  const hitBottom = next >= maxScroll;
  if (hitBottom) next = maxScroll;
  if (hitBottom && nextVelocity > 0) nextVelocity = 0;

  return { next, velocity: nextVelocity };
}

export const useOverlayKeyboard = ({
  isShortcutPressed,
  scrollContainerRef,
  textInputRef,
  setIsExpanded,
  setInputValue,
  setMessages,
  setAttachedContext,
  stopChat,
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
  onToast,
}: UseOverlayKeyboardParams) => {
  const handlersRef = useRef({
    handleWhatToSay: intelligence.handleWhatToSay,
    handleFollowUpQuestions: intelligence.handleFollowUpQuestions,
    handleRecap: intelligence.handleRecap,
    handleClarify: intelligence.handleClarify,
  });
  handlersRef.current = {
    handleWhatToSay: intelligence.handleWhatToSay,
    handleFollowUpQuestions: intelligence.handleFollowUpQuestions,
    handleRecap: intelligence.handleRecap,
    handleClarify: intelligence.handleClarify,
  };

  useEffect(() => {
    const TERMINAL_VELOCITY = 1400;
    const ACCEL_SECONDS = 0.18;
    const DECAY_K = Math.LN2 / 0.09;
    let direction: -1 | 0 | 1 = 0;
    let upHeld = false;
    let downHeld = false;
    let velocity = 0;
    let positionFraction = 0;
    let lastTs = 0;
    let rafId: number | null = null;
    const recomputeDirection = () => {
      direction = upHeld === downHeld ? 0 : upHeld ? -1 : 1;
    };
    const tick = (ts: number) => {
      const container = scrollContainerRef.current;
      if (!container) {
        rafId = null;
        lastTs = 0;
        return;
      }
      if (lastTs === 0) lastTs = ts;
      const dt = Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts;
      if (direction !== 0) {
        const target = direction * TERMINAL_VELOCITY;
        const step = (TERMINAL_VELOCITY / ACCEL_SECONDS) * dt;
        velocity =
          Math.abs(target - velocity) <= step
            ? target
            : velocity + Math.sign(target - velocity) * step;
      }
      if (direction === 0) {
        velocity *= Math.exp(-DECAY_K * dt);
      }
      if (direction === 0 && Math.abs(velocity) < 6) velocity = 0;
      const maxScroll = container.scrollHeight - container.clientHeight;
      const current = container.scrollTop;
      const move = velocity * dt + positionFraction;
      const intMove = Math.trunc(move);
      positionFraction = move - intMove;
      let next = current;
      if (intMove !== 0) {
        const clamped = clampScrollStep(current, maxScroll, velocity, intMove);
        next = clamped.next;
        velocity = clamped.velocity;
      }
      if (next !== current) container.scrollTop = next;
      if (direction !== 0 || velocity !== 0) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      rafId = null;
      lastTs = 0;
      positionFraction = 0;
    };
    const startScrollLoop = () => {
      if (rafId === null) rafId = requestAnimationFrame(tick);
    };
    const releaseScroll = () => {
      upHeld = false;
      downHeld = false;
      recomputeDirection();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      const handlers = handlersRef.current;
      if (isShortcutPressed(e, 'whatToAnswer')) {
        e.preventDefault();
        handlers.handleWhatToSay();
        return;
      }
      if (isShortcutPressed(e, 'clarify')) {
        e.preventDefault();
        handlers.handleClarify();
        return;
      }
      if (isShortcutPressed(e, 'followUp')) {
        e.preventDefault();
        handlers.handleFollowUpQuestions();
        return;
      }
      if (isShortcutPressed(e, 'dynamicAction4')) {
        e.preventDefault();
        handlers.handleRecap();
        return;
      }
      if (isShortcutPressed(e, 'scrollUp')) {
        e.preventDefault();
        upHeld = true;
        recomputeDirection();
        startScrollLoop();
        return;
      }
      if (isShortcutPressed(e, 'scrollDown')) {
        e.preventDefault();
        downHeld = true;
        recomputeDirection();
        startScrollLoop();
        return;
      }
      if (
        isShortcutPressed(e, 'moveWindowUp') ||
        isShortcutPressed(e, 'moveWindowDown')
      ) {
        e.preventDefault();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        upHeld = false;
        recomputeDirection();
        return;
      }
      if (e.key === 'ArrowDown') {
        downHeld = false;
        recomputeDirection();
        return;
      }
      if (e.key === 'Meta' || e.key === 'Control') releaseScroll();
      recomputeDirection();
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', releaseScroll);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', releaseScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [isShortcutPressed, scrollContainerRef]);

  const generalHandlersRef = useRef({
    toggleVisibility: () => window.electronAPI.toggleWindow(),
    processScreenshots: intelligence.handleWhatToSay,
    resetCancel: async () => {},
    takeScreenshot: async () => {},
  });
  generalHandlersRef.current = {
    toggleVisibility: () => window.electronAPI.toggleWindow(),
    processScreenshots: intelligence.handleWhatToSay,
    resetCancel: async () => {
      if (isProcessing) {
        stopChat();
        return;
      }
      await window.electronAPI.resetIntelligence();
      setMessages([]);
      answerPanelPinnedRef.current = false;
      setSuggestionPanelPinned(false);
      setAttachedContext([]);
      setInputValue('');
    },
    takeScreenshot: async () => {
      if (!modelSupportsVision(currentModel)) {
        onToast('Screenshots require a vision-capable model');
        return;
      }
      try {
        const data = await window.electronAPI.takeScreenshot();
        if (data?.path)
          intelligence.handleScreenshotAttach(data as AttachmentContext);
      } catch (err) {
        console.error('Error triggering screenshot:', err);
      }
    },
  };

  useEffect(() => {
    const handleGeneralKeyDown = (e: KeyboardEvent) => {
      const handlers = generalHandlersRef.current;
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;
      if (isShortcutPressed(e, 'toggleVisibility')) {
        e.preventDefault();
        handlers.toggleVisibility();
        return;
      }
      if (isShortcutPressed(e, 'processScreenshots') && isInput) return;
      if (isShortcutPressed(e, 'processScreenshots')) {
        e.preventDefault();
        handlers.processScreenshots();
        return;
      }
      if (isShortcutPressed(e, 'resetCancel')) {
        e.preventDefault();
        handlers.resetCancel();
        return;
      }
      if (isShortcutPressed(e, 'takeScreenshot')) {
        e.preventDefault();
        handlers.takeScreenshot();
        return;
      }
    };
    window.addEventListener('keydown', handleGeneralKeyDown);
    return () => window.removeEventListener('keydown', handleGeneralKeyDown);
  }, [isShortcutPressed]);

  const inertialScrollRef = useRef<{
    kick: (axis: 'vert' | 'horiz', direction: -1 | 1) => void;
  } | null>(null);
  useEffect(() => {
    const state = {
      raf: null as number | null,
      lastTs: 0,
      vert: { vel: 0, target: null as HTMLElement | null, frac: 0 },
      horiz: { vel: 0, target: null as HTMLElement | null, frac: 0 },
    };
    const resolveHorizontalTarget = (container: HTMLElement) => {
      const containerRect = container.getBoundingClientRect();
      const containerCenter = (containerRect.top + containerRect.bottom) / 2;
      let best: HTMLElement | null = null;
      let bestDistance = Infinity;
      container.querySelectorAll('pre').forEach((pre) => {
        let scroller: HTMLElement | null = pre as HTMLElement;
        while (scroller && scroller !== container) {
          if (scroller.scrollWidth > scroller.clientWidth + 1) break;
          scroller = scroller.parentElement;
        }
        if (
          !scroller ||
          scroller === container ||
          scroller.scrollWidth <= scroller.clientWidth + 1
        )
          return;
        const rect = scroller.getBoundingClientRect();
        if (rect.bottom < containerRect.top || rect.top > containerRect.bottom)
          return;
        const distance = Math.abs(
          (rect.top + rect.bottom) / 2 - containerCenter
        );
        if (distance < bestDistance) {
          bestDistance = distance;
          best = scroller;
        }
      });
      return best;
    };
    const tick = (ts: number) => {
      if (state.lastTs === 0) state.lastTs = ts;
      const dt = Math.min((ts - state.lastTs) / 1000, 0.05);
      state.lastTs = ts;
      const decay = Math.pow(0.5, dt / 0.16);
      const stepAxis = (axis: 'vert' | 'horiz') => {
        const a = state[axis];
        if (Math.abs(a.vel) < 8 || !a.target) {
          a.vel = 0;
          a.frac = 0;
          a.target = null;
          return false;
        }
        const move = a.vel * dt + a.frac;
        const intMove = Math.trunc(move);
        a.frac = move - intMove;
        if (intMove !== 0 && axis === 'vert') a.target.scrollTop += intMove;
        if (intMove !== 0 && axis === 'horiz') a.target.scrollLeft += intMove;
        a.vel *= decay;
        return true;
      };
      const active = stepAxis('vert') || stepAxis('horiz');
      if (active) {
        state.raf = requestAnimationFrame(tick);
        return;
      }
      state.raf = null;
      state.lastTs = 0;
    };
    inertialScrollRef.current = {
      kick: (axis, direction) => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const target =
          axis === 'vert' ? container : resolveHorizontalTarget(container);
        if (!target) return;
        const a = state[axis];
        if (a.target !== target || Math.sign(a.vel) === -direction) {
          a.vel = 0;
          a.frac = 0;
        }
        a.target = target;
        a.vel = Math.max(-3200, Math.min(3200, a.vel + direction * 900));
        if (state.raf === null) state.raf = requestAnimationFrame(tick);
      },
    };
    return () => {
      if (state.raf !== null) cancelAnimationFrame(state.raf);
      inertialScrollRef.current = null;
    };
  }, [scrollContainerRef]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onGlobalShortcut(({ action }) => {
      const handlers = handlersRef.current;
      const generalHandlers = generalHandlersRef.current;
      isStealthRef.current = true;
      const actions: Record<string, () => void> = {
        whatToAnswer: handlers.handleWhatToSay,
        followUp: handlers.handleFollowUpQuestions,
        recap: handlers.handleRecap,
        dynamicAction4: handlers.handleRecap,
        clarify: handlers.handleClarify,
        scrollUp: () => inertialScrollRef.current?.kick('vert', -1),
        scrollDown: () => inertialScrollRef.current?.kick('vert', 1),
        scrollLeft: () => inertialScrollRef.current?.kick('horiz', -1),
        scrollRight: () => inertialScrollRef.current?.kick('horiz', 1),
        processScreenshots: generalHandlers.processScreenshots,
        resetCancel: generalHandlers.resetCancel,
        takeScreenshot: generalHandlers.takeScreenshot,
      };
      if (action === 'focusInput') {
        setIsExpanded(true);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => textInputRef.current?.focus())
        );
        setTimeout(() => {
          isStealthRef.current = false;
        }, 500);
        return;
      }
      actions[action]?.();
      setTimeout(() => {
        isStealthRef.current = false;
      }, 500);
    });
    return () => unsubscribe?.();
  }, [isStealthRef, setIsExpanded, textInputRef]);

  useEffect(() => {
    let escSuppressUntilNextActive = false;
    const unsubState = window.electronAPI.onStealthTapState(
      ({ active, reason }) => {
        stealthTapActiveRef.current = active;
        setStealthTapActive(active);
        if (active) {
          isCgEventTapAvailableRef.current = true;
          isStealthRef.current = true;
          setIsExpanded(true);
          setStealthPermissionMissing(false);
          escSuppressUntilNextActive = false;
        }
        if (!active && reason === 'permission') {
          isCgEventTapAvailableRef.current = false;
          setStealthPermissionMissing(true);
        }
      }
    );
    const unsubKey = window.electronAPI.onStealthKeyCaptured((ev) => {
      if (ev.isKeyDown && ev.keyCode === 53) {
        setInputValue('');
        escSuppressUntilNextActive = true;
        return;
      }
      if (escSuppressUntilNextActive && stealthTapActiveRef.current)
        escSuppressUntilNextActive = false;
      if (
        escSuppressUntilNextActive ||
        !stealthTapActiveRef.current ||
        !ev.isKeyDown
      )
        return;
      if (ev.keyCode === 36 || ev.keyCode === 76) {
        intelligence.handleManualSubmitRef.current();
        window.electronAPI.stealthTapStop().catch(() => {});
        return;
      }
      if (ev.keyCode === 51) {
        setInputValue((prev) => prev.slice(0, -1));
        return;
      }
      if (
        ev.chars &&
        ev.chars.length > 0 &&
        ev.chars !== '\r' &&
        ev.chars !== '\n' &&
        ev.chars !== '\t'
      ) {
        setInputValue((prev) => prev + ev.chars);
      }
    });
    return () => {
      unsubState();
      unsubKey();
    };
  }, [
    intelligence.handleManualSubmitRef,
    isCgEventTapAvailableRef,
    isStealthRef,
    setInputValue,
    setIsExpanded,
    setStealthPermissionMissing,
    setStealthTapActive,
    stealthTapActiveRef,
  ]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onKeybindRegistrationFailed(
      ({ id, accelerator }) => {
        if (id === 'chat:focusInput') setStealthHotkeyConflict(accelerator);
      }
    );
    return () => unsubscribe?.();
  }, [setStealthHotkeyConflict]);

  useEffect(() => {
    stealthAutoEngageOkRef.current = true;
    isCgEventTapAvailableRef.current = resolveCgEventTapAvailable(
      window.electronAPI.platform
    );
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const isStealthEngageTarget = Boolean(
        target?.closest?.('[data-stealth-engage="true"]')
      );
      if (
        !shouldFireStealthTapStart({
          stealthTapActive: stealthTapActiveRef.current,
          stealthAutoEngageOk: stealthAutoEngageOkRef.current,
          isStealthEngageTarget,
        })
      )
        return;
      if (!isCgEventTapAvailableRef.current) return;
      window.electronAPI
        .stealthTapStart()
        .catch((err) => console.warn('[stealth] tap start IPC failed', err));
    };
    document.addEventListener('mousedown', onMouseDown, true);
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true);
    };
  }, [isCgEventTapAvailableRef, stealthAutoEngageOkRef, stealthTapActiveRef]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-model-selector-toggle="true"]')) return;
      window.electronAPI.modelSelectorCloseIfOpen().catch(() => {});
    };
    document.addEventListener('mousedown', onMouseDown, true);
    return () => document.removeEventListener('mousedown', onMouseDown, true);
  }, []);

  return useCallback(
    (e: React.MouseEvent<HTMLInputElement>) => {
      if (
        !shouldBlockStealthFocus({
          stealthAutoEngageOk: stealthAutoEngageOkRef.current,
          isCgEventTapAvailable: isCgEventTapAvailableRef.current,
          stealthTapActive: stealthTapActiveRef.current,
        })
      )
        return;
      e.preventDefault();
      if (document.activeElement === textInputRef.current)
        textInputRef.current?.blur();
    },
    [isCgEventTapAvailableRef, stealthAutoEngageOkRef, stealthTapActiveRef, textInputRef]
  );
};
