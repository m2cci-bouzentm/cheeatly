import React, { useLayoutEffect, useRef } from 'react';
import type { DialogueTurn, LivePartials } from '../../../lib/dialogueTranscript';

type TranscriptViewProps = {
  turns: DialogueTurn[];
  partials: LivePartials;
  notice: string | null;
  scrollRef: React.RefObject<HTMLDivElement | null>;
};

const SPEAKER: Record<DialogueTurn['speaker'], string> = { Me: 'You', Them: 'Them' };
const STICK_DISTANCE = 24;

// Transcript view of the conversation panel: one line per turn ("You" / "Them"), live partials faded.
// It follows new lines only while the reader is already at the bottom, so scrolling up to read stays put.
// STT problems (not configured, failed) show as a quiet line on top.
const TranscriptView: React.FC<TranscriptViewProps> = ({ turns, partials, notice, scrollRef }) => {
  const atBottomRef = useRef(true);
  const live = (['Me', 'Them'] as const).filter((speaker) => partials[speaker]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_DISTANCE;
    };
    el.scrollTop = el.scrollHeight;
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [scrollRef]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [scrollRef, turns.length, partials]);

  return (
    <>
      {notice && <p className="quiet">{notice}</p>}
      {turns.map((turn, index) => (
        <p key={index} className={turn.speaker === 'Me' ? 'turn me' : 'turn'}>
          <b>{SPEAKER[turn.speaker]}</b>
          {turn.text}
        </p>
      ))}
      {live.map((speaker) => (
        <p key={`live-${speaker}`} className={speaker === 'Me' ? 'turn me partial' : 'turn partial'}>
          <b>{SPEAKER[speaker]}</b>
          {partials[speaker]}
        </p>
      ))}
    </>
  );
};

export default TranscriptView;
