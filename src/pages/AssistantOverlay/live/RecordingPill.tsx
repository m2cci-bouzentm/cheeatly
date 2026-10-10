import React, { useEffect, useRef, useState } from 'react';
import { EyeIcon, EyeOffIcon, GripDots, LogoMark, PauseIcon, PlayIcon, StopIcon } from './icons.tsx';

type RecordingPillProps = {
  elapsed: string;
  capturing: boolean;
  panelsHidden: boolean;
  ending: boolean;
  menuOpen: boolean;
  onToggleCapture: () => void;
  onToggleHide: () => void;
  onEnd: () => void;
  onToggleMenu: () => void;
  children: React.ReactNode;
};

// The pill: always on screen during a call. Only the grip drags the window (design: "Drag to move").
// End & save needs a second click within 3s. The Session options menu renders as its child.
const RecordingPill: React.FC<RecordingPillProps> = ({
  elapsed,
  capturing,
  panelsHidden,
  ending,
  menuOpen,
  onToggleCapture,
  onToggleHide,
  onEnd,
  onToggleMenu,
  children,
}) => {
  const [endArmed, setEndArmed] = useState(false);
  const disarmRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (disarmRef.current !== null) window.clearTimeout(disarmRef.current);
  }, []);

  const handleEnd = () => {
    if (endArmed) {
      if (disarmRef.current !== null) window.clearTimeout(disarmRef.current);
      setEndArmed(false);
      onEnd();
      return;
    }
    setEndArmed(true);
    disarmRef.current = window.setTimeout(() => setEndArmed(false), 3000);
  };

  return (
    <div className="pill">
      <span
        className="grip"
        role="img"
        aria-label="Drag to move"
        data-tip="Drag to move"
        data-tauri-drag-region="deep"
      >
        <GripDots />
      </span>
      <LogoMark />
      <span className="timer">
        <i className={capturing ? 'dot' : 'dot paused'} />
        <span>{elapsed}</span>
      </span>
      <span className="sep" />
      <button
        className="ib"
        onClick={onToggleCapture}
        data-tip={capturing ? 'Pause capture ⌘⇧P' : 'Resume capture ⌘⇧P'}
        aria-label={capturing ? 'Pause capture' : 'Resume capture'}
      >
        {capturing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <button
        className="ib"
        onClick={onToggleHide}
        data-tip={panelsHidden ? 'Show ⌘\\' : 'Hide ⌘\\'}
        aria-label={panelsHidden ? 'Show overlay' : 'Hide overlay'}
      >
        {panelsHidden ? <EyeIcon /> : <EyeOffIcon />}
      </button>
      <button
        className={endArmed ? 'ib stop confirm' : 'ib stop'}
        onClick={handleEnd}
        disabled={ending}
        data-tip="End & save"
        aria-label={ending ? 'Stopping…' : 'End and save'}
      >
        <StopIcon />
        {endArmed && 'End & save'}
      </button>
      <button
        className="more-btn"
        aria-label="More session options"
        aria-expanded={menuOpen}
        data-tip="Session options"
        data-overlay-popup
        onClick={onToggleMenu}
      >
        ···
      </button>
      {children}
    </div>
  );
};

export default RecordingPill;
