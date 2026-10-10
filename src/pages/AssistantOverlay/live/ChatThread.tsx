import React, { useEffect, useLayoutEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { sanitizePartialMarkdown } from '../../../utils/sanitizePartialMarkdown';
import { AngleIcon, CopyIcon, ShorterIcon } from './icons.tsx';

export type TurnAnswerData = { id: string; text: string; isError: boolean };

export type ThreadTurn = {
  key: string;
  label: string;
  shots: string[];
  answer: TurnAnswerData | null;
  streaming: boolean;
};

export type AnswerVariant = {
  short: string | null;
  alt: string | null;
  showing: 'base' | 'short' | 'alt';
  busy: boolean;
};

type TurnAnswerProps = {
  answer: TurnAnswerData;
  text: string;
  streaming: boolean;
  shortShown: boolean;
  onShorter: () => void;
  onAngle: () => void;
  onCopy: () => void;
};

type ChatThreadProps = {
  turns: ThreadTurn[];
  variants: Record<string, AnswerVariant>;
  maxHeight: number;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  spacerRef: React.RefObject<HTMLDivElement | null>;
  onShorter: (answerId: string, text: string) => void;
  onAngle: (answerId: string, text: string) => void;
  onCopy: (text: string) => void;
};

const REMARK_PLUGINS = [remarkGfm, remarkMath];
const REHYPE_PLUGINS = [rehypeKatex];

function shownText(base: string, variant: AnswerVariant | undefined): string {
  if (variant?.showing === 'short' && variant.short) return variant.short;
  if (variant?.showing === 'alt' && variant.alt) return variant.alt;
  return base;
}

// Skeleton while the request waits for its first words, or while Shorter / Another angle rewrites it.
function isLoading(turn: ThreadTurn, variant: AnswerVariant | undefined): boolean {
  if (variant?.busy) return true;
  return turn.streaming && !turn.answer?.text;
}

const TurnAnswer: React.FC<TurnAnswerProps> = ({ answer, text, streaming, shortShown, onShorter, onAngle, onCopy }) => (
  <>
    <div className={answer.isError ? 'answer error' : 'answer'}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS}>
        {streaming ? sanitizePartialMarkdown(text) : text}
      </ReactMarkdown>
    </div>
    {!streaming && !answer.isError && (
      <div className="tools">
        <button className="ib" data-tip="Shorter" aria-label="Shorter" disabled={shortShown} onClick={onShorter}>
          <ShorterIcon />
        </button>
        <button className="ib" data-tip="Another angle" aria-label="Another angle" onClick={onAngle}>
          <AngleIcon />
        </button>
        <button className="ib" data-tip="Copy" aria-label="Copy answer" onClick={onCopy}>
          <CopyIcon />
        </button>
      </div>
    )}
  </>
);

// One Cluely-style thread: request bubble on the right, the answer under it. A new turn scrolls to the
// top of the thread; the spacer below the newest turn gives it room to do so once there is history above.
const ChatThread: React.FC<ChatThreadProps> = ({
  turns,
  variants,
  maxHeight,
  scrollRef,
  spacerRef,
  onShorter,
  onAngle,
  onCopy,
}) => {
  const lastTurnRef = useRef<HTMLDivElement>(null);
  const turnCountRef = useRef(turns.length);
  // While the newest turn is pinned it stays at the top as its answer streams in (a streaming answer
  // briefly changes height and would otherwise nudge the scroll position). Any other scroll (wheel,
  // scrollbar, keyboard, the ⌘↑/⌘↓ shortcuts, the ↓ button) unpins it.
  const pinnedRef = useRef(false);
  const placedAtRef = useRef(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (Math.abs(el.scrollTop - placedAtRef.current) > 2) pinnedRef.current = false;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [scrollRef]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const spacer = spacerRef.current;
    if (!el || !spacer) return;
    const top = el.scrollTop;
    const last = lastTurnRef.current;
    // Room under the newest turn so it can reach the top: thread height minus its 8px + 6px padding.
    const room = last ? Math.max(0, maxHeight - 14 - last.offsetHeight) : 0;
    spacer.style.height = `${turns.length > 1 ? room : 0}px`;
    if (turns.length > turnCountRef.current) pinnedRef.current = true;
    turnCountRef.current = turns.length;
    // Only write the position when it must change: any write cancels a smooth scroll (the ↓ button).
    const target = pinnedRef.current && last ? last.offsetTop - 8 : top;
    if (Math.abs(el.scrollTop - target) > 1) el.scrollTop = target;
    placedAtRef.current = el.scrollTop;
  });

  return (
    <>
      {turns.map((turn, index) => {
        const answer = turn.answer;
        const variant = answer ? variants[answer.id] : undefined;
        return (
          <div key={turn.key} className="chat-turn" ref={index === turns.length - 1 ? lastTurnRef : undefined}>
            <div className="ub">
              {turn.shots.length > 0 && (
                <div className="shots">
                  {turn.shots.map((src) => (
                    <img key={src} src={src} alt="Screenshot" />
                  ))}
                </div>
              )}
              {turn.label}
            </div>
            {isLoading(turn, variant) ? (
              <>
                <div className="skel" />
                <div className="skel" />
              </>
            ) : (
              answer && (
                <TurnAnswer
                  answer={answer}
                  text={shownText(answer.text, variant)}
                  streaming={turn.streaming}
                  shortShown={variant?.showing === 'short'}
                  onShorter={() => onShorter(answer.id, shownText(answer.text, variant))}
                  onAngle={() => onAngle(answer.id, shownText(answer.text, variant))}
                  onCopy={() => onCopy(shownText(answer.text, variant))}
                />
              )
            )}
          </div>
        );
      })}
      <div ref={spacerRef} />
    </>
  );
};

export default ChatThread;
