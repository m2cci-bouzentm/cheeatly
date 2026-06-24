import { useState, useEffect, useCallback, useRef } from 'react';

export interface DetectedQuestion {
  id: string;
  speaker: 'Me' | 'Them';
  text: string;
  timestamp: number;
  type: string;
  intent?: string;
  prompt?: string;
  priority?: string;
}

interface DialogueTurn {
  speaker: 'Me' | 'Them';
  text: string;
}

function formatTranscript(turns: DialogueTurn[], windowSize: number): string {
  return turns.slice(-windowSize).map((t) => `${t.speaker}: ${t.text}`).join('\n');
}

function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

export function useDetectedQuestions(
  dialogueTurns: DialogueTurn[],
  enabled: boolean
) {
  const [questions, setQuestions] = useState<DetectedQuestion[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [settingsEnabled, setSettingsEnabled] = useState(true);
  const [intervalSeconds, setIntervalSeconds] = useState(20);
  const [windowSize, setWindowSize] = useState(20);
  const lastHashRef = useRef('');
  const seenTextsRef = useRef(new Set<string>());
  const turnsRef = useRef(dialogueTurns);
  turnsRef.current = dialogueTurns;
  const windowRef = useRef(windowSize);
  windowRef.current = windowSize;

  useEffect(() => {
    let mounted = true;
    window.electronAPI.getQuestionAnalysisConfig()
      .then((config) => {
        if (!mounted) return;
        setSettingsEnabled(config.enabled);
        setIntervalSeconds(config.interval || 20);
        setWindowSize(config.window || 20);
      })
      .catch(() => {});
    const unsubscribe = window.electronAPI.onQuestionAnalysisConfigChanged((config) => {
      setSettingsEnabled(config.enabled);
      setIntervalSeconds(config.interval || 20);
    });
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  const analyze = useCallback(async () => {
    const turns = turnsRef.current;
    if (turns.length === 0) return;

    const transcript = formatTranscript(turns, windowRef.current);
    if (!transcript.trim()) return;

    const hash = simpleHash(transcript);
    if (hash === lastHashRef.current) return;
    lastHashRef.current = hash;

    setIsScanning(true);
    try {
      const result = await window.electronAPI.analyzeTranscript(transcript);
      if (!result?.questions?.length) return;

      const newQuestions: DetectedQuestion[] = [];
      for (const q of result.questions) {
        const norm = q.text.toLowerCase().trim();
        if (seenTextsRef.current.has(norm)) continue;
        seenTextsRef.current.add(norm);
        newQuestions.push({
          id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          speaker: q.speaker === 'Me' ? 'Me' : 'Them',
          text: q.text,
          timestamp: Date.now(),
          type: q.type || 'question',
          intent: q.intent,
          prompt: q.prompt,
          priority: q.priority,
        });
      }
      if (newQuestions.length > 0) {
        setQuestions((prev) => [...newQuestions, ...prev]);
      }
    } catch (err) {
      console.error('[useDetectedQuestions] Analysis error:', err);
    } finally {
      setIsScanning(false);
    }
  }, []);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const restartTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!enabled || !settingsEnabled) return;
    timerRef.current = setInterval(analyze, intervalSeconds * 1000);
  }, [analyze, enabled, intervalSeconds, settingsEnabled]);

  const forceRefresh = useCallback(async () => {
    lastHashRef.current = '';
    await analyze();
    restartTimer();
  }, [analyze, restartTimer]);

  useEffect(() => {
    if (!enabled || !settingsEnabled) return;
    timerRef.current = setInterval(analyze, intervalSeconds * 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, settingsEnabled, intervalSeconds, analyze]);

  useEffect(() => {
    setQuestions([]);
    lastHashRef.current = '';
    seenTextsRef.current.clear();
  }, [enabled, settingsEnabled]);

  const dismiss = useCallback((id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  }, []);

  const consume = useCallback((id: string): DetectedQuestion | undefined => {
    let found: DetectedQuestion | undefined;
    setQuestions((prev) => {
      found = prev.find((q) => q.id === id);
      return prev.filter((q) => q.id !== id);
    });
    return found;
  }, []);

  const reset = useCallback(() => {
    setQuestions([]);
    lastHashRef.current = '';
    seenTextsRef.current.clear();
  }, []);

  return { questions, dismiss, consume, reset, forceRefresh, isScanning, settingsEnabled };
}
