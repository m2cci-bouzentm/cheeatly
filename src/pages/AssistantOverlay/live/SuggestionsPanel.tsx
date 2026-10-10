import React, { useEffect, useRef, useState } from 'react';
import type { DetectedQuestion } from '../../../types/desktop';
import { categoryLabel, promptOf } from './format.ts';
import { DownIcon, LoaderIcon, ScanIcon, XIcon } from './icons.tsx';
import { useOverflowCue } from './useOverflowCue.ts';

type SuggestionsPanelProps = {
  questions: DetectedQuestion[];
  hydrated: boolean;
  on: boolean;
  scanning: boolean;
  maxHeight: number;
  selectedId: string | null;
  onToggle: () => void;
  onScan: () => void;
  onSend: (question: DetectedQuestion) => void;
  onDismiss: (id: string) => void;
};

function cardClass(id: string, selectedId: string | null, freshId: string | null): string {
  const classes = ['cue'];
  if (selectedId === id) classes.push('selected');
  if (freshId === id) classes.push('fresh');
  return classes.join(' ');
}

// Suggestions panel: v1 header (title, Scan now, toggle without text), one card per suggestion with its
// category, whole card sends the prompt, × dismisses. The list is capped and shows the overflow cue.
const SuggestionsPanel: React.FC<SuggestionsPanelProps> = ({
  questions,
  hydrated,
  on,
  scanning,
  maxHeight,
  selectedId,
  onToggle,
  onScan,
  onSend,
  onDismiss,
}) => {
  const [freshId, setFreshId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const seenRef = useRef<Set<string> | null>(null);
  const { more, toEnd } = useOverflowCue(listRef);

  // Highlight a card the first time it arrives. Cards in the first backend snapshot (loaded when the
  // overlay opens) are not new.
  useEffect(() => {
    if (!hydrated) return;
    const seen = seenRef.current;
    const arrived = seen ? questions.find((q) => !seen.has(q.id)) : undefined;
    if (arrived) setFreshId(arrived.id);
    seenRef.current = new Set(questions.map((q) => q.id));
  }, [questions, hydrated]);

  return (
    <aside className="panel side" aria-label="Live suggestions">
      <div className="side-head">
        <h2>Suggestions</h2>
        <div className="side-tools">
          {on && (
            <button
              className={scanning ? 'ib scanning' : 'ib'}
              onClick={onScan}
              disabled={scanning}
              data-tip={scanning ? 'Scanning…' : 'Scan now'}
              aria-label="Scan now"
            >
              {scanning ? <LoaderIcon /> : <ScanIcon />}
            </button>
          )}
          <label className="suggestions-switch" data-tip={on ? 'Suggestions on' : 'Suggestions off'}>
            <input
              type="checkbox"
              className="sw"
              role="switch"
              aria-label="Automatic suggestions"
              checked={on}
              onChange={onToggle}
            />
          </label>
        </div>
      </div>
      <div className="scrollwrap">
        <div ref={listRef} className={more ? 'lc-cues more' : 'lc-cues'} style={{ maxHeight }}>
          {on &&
            questions.map((question) => (
              <article
                key={question.id}
                className={cardClass(question.id, selectedId, freshId)}
                onAnimationEnd={() => setFreshId(null)}
              >
                <button
                  className="cue-open"
                  aria-label={`${categoryLabel(question.type)}: ${promptOf(question)}. Send to assistant`}
                  onClick={() => onSend(question)}
                >
                  <span className="cue-label">
                    <span>{categoryLabel(question.type)}</span>
                  </span>
                  {promptOf(question)}
                </button>
                <button
                  className="ib cue-dismiss"
                  data-tip="Dismiss"
                  aria-label="Dismiss suggestion"
                  onClick={() => onDismiss(question.id)}
                >
                  <XIcon />
                </button>
              </article>
            ))}
        </div>
        {more && (
          <button className="down" data-tip="More below" aria-label="Scroll suggestions to the end" onClick={toEnd}>
            <DownIcon />
          </button>
        )}
      </div>
    </aside>
  );
};

export default SuggestionsPanel;
