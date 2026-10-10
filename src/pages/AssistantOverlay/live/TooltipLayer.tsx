import React, { useEffect, useRef, useState } from 'react';

type Tip = { text: string; left: number; top: number };

// One floating tooltip for every element with data-tip (design: shown after 250ms of hover or on
// keyboard focus; above the pill, below everything else; clamped to the window; hidden on pointerdown).
const TooltipLayer: React.FC<{ rootRef: React.RefObject<HTMLElement | null> }> = ({ rootRef }) => {
  const [tip, setTip] = useState<Tip | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const hide = () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      setTarget(null);
    };
    const over = (event: MouseEvent) => {
      const el = (event.target as Element).closest<HTMLElement>('[data-tip]');
      hide();
      if (el) timerRef.current = window.setTimeout(() => setTarget(el), 250);
    };
    const focusIn = (event: FocusEvent) => {
      const el = (event.target as Element).closest<HTMLElement>('[data-tip]');
      if (el && el.matches(':focus-visible')) setTarget(el);
    };
    root.addEventListener('mouseover', over);
    root.addEventListener('mouseleave', hide);
    root.addEventListener('focusin', focusIn);
    root.addEventListener('focusout', hide);
    root.addEventListener('pointerdown', hide);
    return () => {
      hide();
      root.removeEventListener('mouseover', over);
      root.removeEventListener('mouseleave', hide);
      root.removeEventListener('focusin', focusIn);
      root.removeEventListener('focusout', hide);
      root.removeEventListener('pointerdown', hide);
    };
  }, [rootRef]);

  // Measure first (hidden at 0,0), then place: centred on the target, clamped to the window.
  useEffect(() => {
    if (!target) {
      setTip(null);
      return;
    }
    setTip({ text: target.dataset.tip as string, left: 0, top: -9999 });
  }, [target]);

  useEffect(() => {
    const el = tipRef.current;
    if (!el || !target || !tip || tip.top !== -9999) return;
    const r = target.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const above = !!target.closest('.pill') && !target.closest('.session-menu');
    setTip({
      text: tip.text,
      left: Math.max(4, Math.min(window.innerWidth - w - 4, r.left + r.width / 2 - w / 2)),
      top: above ? r.top - h - 7 : r.bottom + 7,
    });
  }, [tip, target]);

  if (!tip) return null;
  return (
    <div
      ref={tipRef}
      className="lc-tip"
      role="tooltip"
      style={{ left: tip.left, top: tip.top, visibility: tip.top === -9999 ? 'hidden' : 'visible' }}
    >
      {tip.text}
    </div>
  );
};

export default TooltipLayer;
