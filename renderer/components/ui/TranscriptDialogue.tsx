import React, { useEffect, useRef } from 'react';
import { motion, type MotionValue } from 'framer-motion';
import type {
  DialogueTurn,
  LivePartials,
} from '../../lib/dialogueTranscript.ts';

interface TranscriptDialogueProps {
  turns: DialogueTurn[];
  livePartials: LivePartials;
  scrollMaxH?: MotionValue<number> | number;
}

// Same scrollable-window shape as the Assistant tab's SuggestionPanel — a flat
// flex-1 scroll area in the shared shell, not a bordered card.
const TranscriptDialogue: React.FC<TranscriptDialogueProps> = ({
  turns,
  livePartials,
  scrollMaxH,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Only follow live text when the user is already at the bottom. Once they
  // scroll up to read, new turns must NOT yank them back down.
  const stickToBottomRef = useRef(true);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  return (
    <motion.div
      ref={scrollRef}
      onScroll={handleScroll}
      className="relative z-10 flex-1 min-h-24 overflow-y-auto p-3 flex flex-col gap-1.5 no-drag isolate"
      style={{ scrollbarWidth: 'none', maxHeight: scrollMaxH }}
      data-testid="transcript-dialogue"
    >
      {turns.map((turn, i) => (
        <div
          key={i}
          className={`flex ${turn.speaker === 'Me' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[85%] rounded-[10px] px-2.5 py-1.5 text-sm leading-snug border border-white/[0.06] ${
              turn.speaker === 'Me'
                ? 'bg-blue-500/[0.12] text-[var(--overlay-text-primary,rgba(255,255,255,0.85))]'
                : 'bg-white/[0.04] text-[var(--overlay-text-muted)]'
            }`}
          >
            <span
              className={`block text-xxs font-medium uppercase tracking-wider mb-0.5 ${turn.speaker === 'Me' ? 'text-blue-300/50' : 'opacity-40'}`}
            >
              {turn.speaker}
            </span>
            {turn.text}
          </div>
        </div>
      ))}
      {(['Me', 'Them'] as const).map((speaker) => {
        const text = livePartials[speaker];
        if (!text?.trim()) return null;
        return (
          <div
            key={speaker}
            className={`flex ${speaker === 'Me' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-[10px] px-2.5 py-1.5 text-sm leading-snug border border-white/[0.06] italic opacity-70 ${
                speaker === 'Me'
                  ? 'bg-blue-500/[0.12] text-[var(--overlay-text-primary,rgba(255,255,255,0.85))]'
                  : 'bg-white/[0.04] text-[var(--overlay-text-muted)]'
              }`}
            >
              <span
                className={`block text-xxs font-medium uppercase tracking-wider mb-0.5 ${speaker === 'Me' ? 'text-blue-300/50' : 'opacity-40'}`}
              >
                {speaker}
              </span>
              {text}
            </div>
          </div>
        );
      })}
    </motion.div>
  );
};

export default React.memo(TranscriptDialogue);
