import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Copy, Check, LayoutList } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { MotionValue } from 'framer-motion';
import { cn } from '../../../lib/utils';
import { sanitizePartialMarkdown } from '../../../utils/sanitizePartialMarkdown';
import ScrollIndicator from '../../../components/ui/ScrollIndicator';
import { getMessageText } from '../types';
import type { AppMessage } from '../types';

const REMARK_PLUGINS = [remarkGfm, remarkMath];
const REHYPE_PLUGINS: any[] = [
  [rehypeKatex, { throwOnError: false, strict: false, errorColor: '#cc0000' }],
];

const stripNode = (props: any) => {
  const { node: _node, ...rest } = props;
  return rest;
};

const mdComponents = {
  p: (props: any) => (
    <p className="mb-2 last:mb-0 leading-relaxed whitespace-pre-wrap" {...stripNode(props)} />
  ),
  strong: (props: any) => (
    <strong className="font-bold text-white" {...stripNode(props)} />
  ),
  em: (props: any) => (
    <em className="italic opacity-90" {...stripNode(props)} />
  ),
  ul: (props: any) => (
    <ul className="list-disc ml-4 mb-2 space-y-1 leading-relaxed" {...stripNode(props)} />
  ),
  ol: (props: any) => (
    <ol className="list-decimal ml-4 mb-2 space-y-1 leading-relaxed" {...stripNode(props)} />
  ),
  li: (props: any) => <li className="pl-0.5" {...stripNode(props)} />,
  code: (props: any) => {
    const { children, className } = stripNode(props);
    const isBlock = className?.startsWith('language-');
    if (isBlock) {
      return (
        <pre className="bg-black/30 rounded-lg px-3 py-2 my-2 overflow-x-auto text-[12px]">
          <code className={className}>{children}</code>
        </pre>
      );
    }
    return (
      <code className="bg-white/[0.06] px-1.5 py-0.5 rounded text-[12px]">{children}</code>
    );
  },
  blockquote: (props: any) => (
    <blockquote
      className="border-l-2 border-indigo-500/30 pl-3 my-2 text-white/60 italic"
      {...stripNode(props)}
    />
  ),
};

interface FocusViewProps {
  messages: AppMessage[];
  isStreaming: boolean;
  onSwitchToChat: () => void;
  scrollMaxH: MotionValue<number>;
}

const FocusView: React.FC<FocusViewProps> = ({
  messages,
  isStreaming,
  onSwitchToChat,
  scrollMaxH,
}) => {
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lastSeenResponseIdRef = useRef<string | null>(null);

  const latestResponse = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((m) => m.role === 'assistant' && getMessageText(m).trim()),
    [messages]
  );

  const isResponseStreaming =
    isStreaming &&
    latestResponse &&
    latestResponse.id === messages.filter((m) => m.role === 'assistant').at(-1)?.id;

  const isStale =
    isStreaming &&
    latestResponse &&
    !isResponseStreaming &&
    latestResponse.id === lastSeenResponseIdRef.current;

  useEffect(() => {
    if (latestResponse && !isStreaming) {
      lastSeenResponseIdRef.current = latestResponse.id;
    }
  }, [latestResponse, isStreaming]);

  const latestUserMsg = useMemo(
    () => [...messages].reverse().find((m) => m.role === 'user'),
    [messages]
  );

  const historyCount = useMemo(
    () =>
      messages.filter((m) => m.role === 'assistant' && getMessageText(m).trim())
        .length,
    [messages]
  );

  useEffect(() => {
    if (copied) {
      const t = setTimeout(() => setCopied(false), 1500);
      return () => clearTimeout(t);
    }
  }, [copied]);

  const handleCopy = () => {
    if (!latestResponse) return;
    navigator.clipboard.writeText(getMessageText(latestResponse));
    setCopied(true);
  };

  const responseText = latestResponse ? getMessageText(latestResponse) : '';

  return (
    <div className="relative flex-1 overflow-hidden">
    <motion.div
      ref={scrollRef}
      className="h-full flex flex-col px-3 pr-[44px] py-2 overflow-y-auto no-scrollbar no-drag"
      layout={false}
      style={{ scrollbarWidth: 'none', maxHeight: scrollMaxH }}>
      <AnimatePresence mode="wait">
        {(isStreaming && !isResponseStreaming) || isStale ? (
          <motion.div
            key="thinking"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
            className="flex-1 flex items-center justify-center"
          >
            <div className="flex gap-2 items-center">
              <div className="w-1.5 h-1.5 bg-current opacity-40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 bg-current opacity-40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 bg-current opacity-40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </motion.div>
        ) : latestResponse ? (
          <motion.div
            key={latestResponse.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="flex-1 flex flex-col"
          >
            {latestUserMsg && (
              <div className="flex items-center gap-2 mb-1.5 px-0.5">
                <span className="text-[10px] text-white/25 truncate">
                  {getMessageText(latestUserMsg)}
                </span>
              </div>
            )}

            <div
              className={cn(
                'relative group flex-1',
                'rounded-lg px-3 py-2.5',
                'bg-white/[0.02] border border-white/[0.05]',
                'transition-colors duration-200',
                'hover:border-white/[0.08]'
              )}
            >
              <button
                onClick={handleCopy}
                className={cn(
                  'absolute top-2 right-2 w-6 h-6 rounded-md',
                  'flex items-center justify-center',
                  'border transition-all duration-150',
                  'opacity-0 group-hover:opacity-100',
                  copied
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                    : 'bg-white/[0.04] border-white/[0.06] text-white/25 hover:text-white/50 hover:bg-white/[0.08]'
                )}
              >
                {copied ? <Check size={11} /> : <Copy size={11} />}
              </button>

              <div
                ref={contentRef}
                className="text-[13px] leading-[1.6] text-white/[0.88] pr-7 markdown-content"
              >
                {isResponseStreaming ? (
                  <>
                    <ReactMarkdown
                      remarkPlugins={REMARK_PLUGINS}
                      rehypePlugins={REHYPE_PLUGINS}
                      components={mdComponents}
                    >
                      {sanitizePartialMarkdown(responseText)}
                    </ReactMarkdown>
                    <span className="inline-block w-[2px] h-[13px] bg-indigo-400 ml-0.5 align-text-bottom animate-pulse" />
                  </>
                ) : (
                  <ReactMarkdown
                    remarkPlugins={REMARK_PLUGINS}
                    rehypePlugins={REHYPE_PLUGINS}
                    components={mdComponents}
                  >
                    {responseText}
                  </ReactMarkdown>
                )}
              </div>
            </div>

            {historyCount > 1 && (
              <button
                onClick={onSwitchToChat}
                className="mt-2 self-start flex items-center gap-1.5 px-1 text-[11px] text-white/15 hover:text-white/35 transition-colors"
              >
                <LayoutList size={11} />
                {historyCount} in history
              </button>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 flex items-center justify-center"
          >
            <p className="text-[13px] text-white/20">
              Ask a question or use a quick action
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
    <ScrollIndicator containerRef={scrollRef} />
    </div>
  );
};

export default FocusView;
