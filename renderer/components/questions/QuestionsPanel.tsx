import React, { useRef } from 'react';
import { X } from 'lucide-react';
import { motion } from 'framer-motion';
import type { MotionStyle } from 'framer-motion';
import { cn } from '../../lib/utils';
import { formatTimeAgo } from '../../utils/dateUtils';
import ScrollIndicator from '../ui/ScrollIndicator';
import type { DetectedQuestion } from '../../hooks/meeting/useDetectedQuestions';

interface QuestionsPanelProps {
  questions: DetectedQuestion[];
  onSelect: (question: DetectedQuestion) => void;
  onDismiss: (id: string) => void;
  paused: boolean;
  style?: MotionStyle;
}

function QuestionCard({
  question,
  onSelect,
  onDismiss,
}: {
  question: DetectedQuestion;
  onSelect: () => void;
  onDismiss: () => void;
}) {
  const displayText = question.prompt || question.text;

  return (
    <div
      onClick={onSelect}
      className={cn(
        'group relative px-3.5 py-3 pr-8 rounded-2xl cursor-pointer',
        'bg-white/[0.02] border border-transparent',
        'transition-all duration-200',
        'hover:bg-white/[0.05] hover:border-white/[0.1]',
        'hover:-translate-y-px'
      )}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        className={cn(
          'absolute top-2 right-2 w-5 h-5 rounded-full',
          'bg-white/[0.05] border border-white/[0.08]',
          'text-white/25 text-[11px]',
          'flex items-center justify-center',
          'opacity-0 group-hover:opacity-100',
          'transition-opacity duration-200',
          'hover:bg-red-500/15 hover:border-red-500/30 hover:text-red-400'
        )}
      >
        <X size={10} />
      </button>
      <div className="text-[13px] leading-snug text-white/85">
        {displayText}
      </div>
      {question.intent && (
        <div className="mt-2 text-[11px] leading-snug text-white/35">
          {question.intent}
        </div>
      )}
      <div className="mt-2">
        <span className="text-[10px] text-white/20">
          {formatTimeAgo(question.timestamp)}
        </span>
      </div>
    </div>
  );
}

export default function QuestionsPanel({
  questions,
  onSelect,
  onDismiss,
  paused,
  style,
}: QuestionsPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <motion.div
      className={cn(
        'w-[280px] flex flex-col overflow-hidden',
        'rounded-[24px] bg-zinc-900/[0.92] backdrop-blur-[40px]',
        'border border-white/[0.05]',
        'shadow-[0_8px_32px_rgba(0,0,0,0.4)]'
      )}
      style={style}
    >
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.05]">
        <span className="text-[13px] font-semibold text-white">
          Suggestions
        </span>
        {questions.length > 0 && (
          <span className="text-[11px] font-semibold text-white/50 bg-white/[0.08] px-2 py-0.5 rounded-full">
            {questions.length}
          </span>
        )}
      </div>

      {questions.length > 0 ? (
        <div className="relative flex-1 overflow-hidden">
          <div ref={scrollRef} className="h-full overflow-y-auto p-2 pr-[44px] space-y-1.5 no-scrollbar">
            {questions.map((q) => (
              <QuestionCard
                key={q.id}
                question={q}
                onSelect={() => onSelect(q)}
                onDismiss={() => onDismiss(q.id)}
              />
            ))}
          </div>
          <ScrollIndicator containerRef={scrollRef} />
        </div>
      ) : (
        <div className="px-4 py-6 text-center">
          <span className="text-[12px] text-white/30">
            {paused ? 'Analysis paused' : 'Listening for helpful moments...'}
          </span>
        </div>
      )}

      <div className="px-4 py-2.5 border-t border-white/[0.04] text-center">
        <span className="text-[10px] text-white/20">
          Click suggestion to send to Assistant
        </span>
      </div>
    </motion.div>
  );
}
