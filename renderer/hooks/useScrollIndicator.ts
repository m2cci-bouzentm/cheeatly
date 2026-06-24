import { useState, useEffect, useRef, type RefObject } from 'react';

interface ScrollMetrics {
  scrollRatio: number;
  thumbRatio: number;
  hasOverflow: boolean;
  isScrolling: boolean;
  isHovering: boolean;
}

export function useScrollIndicator(
  containerRef: RefObject<HTMLElement | null>,
  idleTimeout = 1200
): ScrollMetrics {
  const [metrics, setMetrics] = useState<ScrollMetrics>({
    scrollRatio: 0,
    thumbRatio: 1,
    hasOverflow: false,
    isScrolling: false,
    isHovering: false,
  });

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = (scrolling?: boolean) => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const overflow = scrollHeight > clientHeight + 1;
      const maxScroll = scrollHeight - clientHeight;
      setMetrics((prev) => {
        const next: ScrollMetrics = {
          scrollRatio: maxScroll > 0 ? scrollTop / maxScroll : 0,
          thumbRatio: scrollHeight > 0 ? clientHeight / scrollHeight : 1,
          hasOverflow: overflow,
          isScrolling: scrolling ?? prev.isScrolling,
          isHovering: prev.isHovering,
        };
        if (
          prev.scrollRatio === next.scrollRatio &&
          prev.thumbRatio === next.thumbRatio &&
          prev.hasOverflow === next.hasOverflow &&
          prev.isScrolling === next.isScrolling &&
          prev.isHovering === next.isHovering
        )
          return prev;
        return next;
      });
    };

    const onScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        update(true);
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => {
          setMetrics((prev) => (prev.isScrolling ? { ...prev, isScrolling: false } : prev));
        }, idleTimeout);
      });
    };

    const observer = new ResizeObserver(() => update());

    const onEnter = () => setMetrics((prev) => (prev.isHovering ? prev : { ...prev, isHovering: true }));
    const onLeave = () => setMetrics((prev) => (prev.isHovering ? { ...prev, isHovering: false } : prev));

    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mouseleave', onLeave);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);

    update();

    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mouseleave', onLeave);
      observer.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [containerRef, idleTimeout]);

  return metrics;
}
