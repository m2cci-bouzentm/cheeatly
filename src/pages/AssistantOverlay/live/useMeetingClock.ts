import { useEffect, useRef, useState } from 'react';
import { formatElapsed } from './format.ts';

// Elapsed call time for the pill. Counts from the backend's meeting start and, like the design,
// stops while capture is paused (paused time is not counted).
export function useMeetingClock(paused: boolean): string {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const pausedTotalRef = useRef(0);
  const pausedSinceRef = useRef<number | null>(null);

  useEffect(() => {
    window.desktopAPI.getMeetingStartedAt().then(setStartedAt);
    return window.desktopAPI.onMeetingStateChanged(({ isActive }) => {
      pausedTotalRef.current = 0;
      pausedSinceRef.current = null;
      if (isActive) window.desktopAPI.getMeetingStartedAt().then(setStartedAt);
      else setStartedAt(null);
    });
  }, []);

  useEffect(() => {
    if (paused) {
      pausedSinceRef.current = Date.now();
      return;
    }
    if (pausedSinceRef.current !== null) {
      pausedTotalRef.current += Date.now() - pausedSinceRef.current;
      pausedSinceRef.current = null;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [paused]);

  if (startedAt === null) return formatElapsed(0);
  const end = pausedSinceRef.current ?? now;
  return formatElapsed((end - startedAt - pausedTotalRef.current) / 1000);
}
