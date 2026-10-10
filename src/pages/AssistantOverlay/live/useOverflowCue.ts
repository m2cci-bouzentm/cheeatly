import { useCallback, useEffect, useState } from 'react';

// Bottom fade + ↓ button while part of a scroll area is out of view (design: "Overflow cue copied from Cluely").
// `spacerRef` is the thread's bottom spacer: room that only exists to scroll the newest turn to the top
// does not count as hidden content.
export function useOverflowCue(
  ref: React.RefObject<HTMLElement | null>,
  spacerRef?: React.RefObject<HTMLElement | null>
) {
  const [more, setMore] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const pad = spacerRef?.current?.offsetHeight ?? 0;
    setMore(el.scrollTop + el.clientHeight < el.scrollHeight - pad - 4);
  }, [ref, spacerRef]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    const resize = new ResizeObserver(update);
    resize.observe(el);
    const mutations = new MutationObserver(update);
    mutations.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      el.removeEventListener('scroll', update);
      resize.disconnect();
      mutations.disconnect();
    };
  }, [ref, update]);

  const toEnd = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [ref]);

  return { more, toEnd, update };
}
