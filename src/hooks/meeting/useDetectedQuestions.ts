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
  return turns
    .slice(-windowSize)
    .map((t) => `${t.speaker}: ${t.text}`)
    .join('\n');
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
  const [scanError, setScanError] = useState('');
  const [scanNotice, setScanNotice] = useState('');
  const pendingRef = useRef(false);
  const generationRef = useRef(0);
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
    window.desktopAPI
      .getQuestionAnalysisConfig()
      .then((config) => {
        if (!mounted) return;
        setSettingsEnabled(config.enabled);
        setIntervalSeconds(config.interval || 20);
        setWindowSize(config.window || 20);
      })
      .catch(() => {});
    const unsubscribe = window.desktopAPI.onQuestionAnalysisConfigChanged(
      (config) => {
        setSettingsEnabled(config.enabled);
        setIntervalSeconds(config.interval || 20);
        setWindowSize(config.window || 20);
      }
    );
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  const analyze = useCallback(async (manual = false) => {
    if (pendingRef.current) return;
    const turns = turnsRef.current;
    if (turns.length === 0) {
      if (manual)
        setScanNotice(
          'Waiting for speech. Record a question, then scan again.'
        );
      return;
    }

    const transcript = formatTranscript(turns, windowRef.current);
    if (!transcript.trim()) return;

    const hash = simpleHash(transcript);
    if (!manual && hash === lastHashRef.current) return;
    const generation = generationRef.current;
    pendingRef.current = true;
    setScanError('');
    setScanNotice('');

    setIsScanning(true);
    try {
      const result = await window.desktopAPI.analyzeTranscript(transcript);
      if (generation !== generationRef.current) return;
      lastHashRef.current = hash;
      if (!result?.questions?.length) {
        setScanNotice('Scan complete. No actionable questions found.');
        return;
      }

      const newQuestions: DetectedQuestion[] = [];
      for (const q of result.questions) {
        if (typeof q.text !== 'string' || !q.text.trim()) continue;
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
      if (manual)
        setScanNotice(
          newQuestions.length > 0
            ? `Scan complete. ${newQuestions.length} new suggestions.`
            : 'Scan complete. No new suggestions.'
        );
    } catch (err) {
      console.error('[useDetectedQuestions] Analysis error:', err);
      if (generation === generationRef.current) {
        setScanError(
          String(err).includes('No OpenRouter API key')
            ? 'Add an OpenRouter API key in Settings → AI Providers to detect questions.'
            : `Question scan failed: ${String(err)}`
        );
      }
    } finally {
      pendingRef.current = false;
      setIsScanning(false);
    }
  }, []);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const forceRefresh = useCallback(async () => {
    lastHashRef.current = '';
    await analyze(true);
  }, [analyze]);

  useEffect(() => {
    if (!enabled || !settingsEnabled) return;
    timerRef.current = setInterval(analyze, intervalSeconds * 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, settingsEnabled, intervalSeconds, analyze]);

  useEffect(() => {
    generationRef.current += 1;
    setQuestions([]);
    setScanError('');
    setScanNotice('');
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
    generationRef.current += 1;
    setQuestions([]);
    setScanError('');
    setScanNotice('');
    lastHashRef.current = '';
    seenTextsRef.current.clear();
  }, []);

  return {
    questions,
    dismiss,
    consume,
    reset,
    forceRefresh,
    isScanning,
    scanError,
    scanNotice,
    settingsEnabled,
  };
}
