import React, { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useScrollIndicator } from '../../hooks/useScrollIndicator';
import { cn } from '../../lib/utils';

interface ContentBlock {
  top: number;
  height: number;
  type: 'user' | 'assistant' | 'default';
}

interface ScrollIndicatorProps {
  containerRef: RefObject<HTMLElement | null>;
  className?: string;
  width?: number;
}

const MIN_VIEWPORT_PX = 16;

function scanBlocks(container: HTMLElement): ContentBlock[] {
  const { scrollHeight } = container;
  if (scrollHeight <= 0) return [];
  const blocks: ContentBlock[] = [];
  const children = container.children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as HTMLElement;
    if (!child.offsetHeight) continue;
    const top = child.offsetTop / scrollHeight;
    const height = child.offsetHeight / scrollHeight;
    let type: ContentBlock['type'] = 'default';
    const cls = child.className || '';
    if (cls.includes('justify-end') || cls.includes('items-end')) type = 'user';
    else if (cls.includes('justify-start') || cls.includes('items-start') || child.querySelector('.markdown-content')) type = 'assistant';
    blocks.push({ top, height, type });
  }
  return blocks;
}

const BLOCK_COLORS: Record<ContentBlock['type'], string> = {
  user: 'bg-blue-400/25',
  assistant: 'bg-white/[0.12]',
  default: 'bg-white/[0.08]',
};

export default function ScrollIndicator({
  containerRef,
  className,
  width = 40,
}: ScrollIndicatorProps) {
  const { scrollRatio, thumbRatio, hasOverflow, isHovering } =
    useScrollIndicator(containerRef);

  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const rescan = () => setBlocks(scanBlocks(el));
    rescan();
    const observer = new MutationObserver(rescan);
    observer.observe(el, { childList: true, subtree: true, attributes: false });
    const resizeObs = new ResizeObserver(rescan);
    resizeObs.observe(el);
    return () => { observer.disconnect(); resizeObs.disconnect(); };
  }, [containerRef]);

  const scrollToRatio = useCallback(
    (ratio: number) => {
      const el = containerRef.current;
      if (!el) return;
      el.scrollTop = Math.max(0, Math.min(1, ratio)) * (el.scrollHeight - el.clientHeight);
    },
    [containerRef]
  );

  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      if (draggingRef.current) return;
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const clickRatio = (e.clientY - rect.top) / rect.height;
      const viewportHalf = thumbRatio / 2;
      scrollToRatio((clickRatio - viewportHalf) / (1 - thumbRatio));
    },
    [thumbRatio, scrollToRatio]
  );

  const handleViewportDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      draggingRef.current = true;
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const trackH = rect.height;
      const startY = e.clientY;
      const startRatio = scrollRatio;

      const onMove = (ev: MouseEvent) => {
        const dy = ev.clientY - startY;
        const delta = dy / (trackH * (1 - thumbRatio));
        scrollToRatio(startRatio + delta);
      };
      const onUp = () => {
        draggingRef.current = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [thumbRatio, scrollRatio, scrollToRatio]
  );

  if (!hasOverflow) return null;

  const viewportPercent = Math.max((MIN_VIEWPORT_PX / (trackRef.current?.clientHeight || 200)) * 100, thumbRatio * 100);
  const viewportTop = scrollRatio * (100 - viewportPercent);

  return (
    <div
      ref={trackRef}
      onClick={handleTrackClick}
      className={cn(
        'absolute right-0 top-0 bottom-0 z-20 pointer-events-auto cursor-default',
        'rounded-l-md',
        'transition-opacity duration-300',
        isHovering || draggingRef.current ? 'opacity-100' : 'opacity-70',
        className
      )}
      style={{
        width,
        background: 'rgba(255,255,255,0.03)',
        borderLeft: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {blocks.map((block, i) => (
        <div
          key={i}
          className={cn('absolute rounded-sm', BLOCK_COLORS[block.type])}
          style={{
            left: 3,
            right: 3,
            top: `${block.top * 100}%`,
            height: `${Math.max(block.height * 100, 0.5)}%`,
            minHeight: 2,
          }}
        />
      ))}

      <div
        onMouseDown={handleViewportDown}
        className={cn(
          'absolute left-0 right-0 cursor-default',
          'border border-white/20 rounded-sm',
          'transition-colors duration-150',
          isHovering || draggingRef.current
            ? 'bg-white/[0.08]'
            : 'bg-white/[0.04]'
        )}
        style={{
          top: `${viewportTop}%`,
          height: `${viewportPercent}%`,
          minHeight: MIN_VIEWPORT_PX,
        }}
      />
    </div>
  );
}
