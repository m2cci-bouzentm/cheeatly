import { useState, useEffect, useCallback, useRef } from 'react';
import type { QuestionSnapshot } from '../../types/desktop';
export type { DetectedQuestion } from '../../types/desktop';

const initial: QuestionSnapshot = {
  questions: [],
  isScanning: false,
  scanError: '',
  scanNotice: '',
  settingsEnabled: true,
  isPaused: false,
  revision: -1,
};

export function useDetectedQuestions() {
  const [snapshot, setSnapshot] = useState(initial);
  const mounted = useRef(false);
  const accept = useCallback((next: QuestionSnapshot) => {
    if (mounted.current)
      setSnapshot((current) =>
        next.revision >= current.revision ? next : current
      );
  }, []);
  const request = useCallback(
    async (operation: Promise<QuestionSnapshot>) => {
      try {
        accept(await operation);
      } catch (error) {
        if (mounted.current)
          setSnapshot((current) => ({ ...current, scanError: String(error) }));
      }
    },
    [accept]
  );
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = window.desktopAPI.onQuestionStateChanged(accept);
    void request(window.desktopAPI.getQuestionState());
    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, [accept, request]);
  const dismiss = useCallback(
    (id: string) => {
      void request(window.desktopAPI.dismissQuestion(id));
    },
    [request]
  );
  const reset = useCallback(() => {
    void request(window.desktopAPI.resetQuestions());
  }, [request]);
  const forceRefresh = useCallback(
    () => request(window.desktopAPI.scanQuestions()),
    [request]
  );
  const setPaused = useCallback(
    (paused: boolean) => {
      void request(window.desktopAPI.setQuestionsPaused(paused));
    },
    [request]
  );
  return {
    ...snapshot,
    dismiss,
    consume: dismiss,
    reset,
    forceRefresh,
    setPaused,
  };
}
