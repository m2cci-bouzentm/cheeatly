import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import cheatlyIcon from '../icon.png';
import { useServerChat } from '../../hooks/useServerChat';
import { Button } from '@/components/ui/button';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { SyntaxHighlighter, vscDarkPlus } from '../../lib/syntaxHighlighting';

interface MeetingContext {
  id?: string;
  title: string;
  summary?: string;
  keyPoints?: string[];
  actionItems?: string[];
  transcript?: Array<{ speaker: string; text: string; timestamp: number }>;
}

interface MeetingChatOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  meetingContext: MeetingContext;
  initialQuery?: string;
  onNewQuery: (query: string) => void;
}

const getTextContent = (msg: {
  parts?: Array<{ type: string; text?: string }>;
}) =>
  msg.parts
    ?.filter((p) => p.type === 'text')
    .map((p) => ('text' in p ? p.text : ''))
    .join('')!;

const TypingIndicator: React.FC = () => {
  const isLightTheme = false;
  const cardBgBorderClass = isLightTheme
    ? 'bg-emerald-500/10 backdrop-blur-md border border-emerald-500/20 text-emerald-900'
    : 'bg-emerald-600/20 backdrop-blur-md border border-emerald-500/30 text-emerald-100';

  return (
    <div
      className={`w-fit rounded-lg rounded-tl-[2px] px-3 py-2 ${cardBgBorderClass} my-2 flex items-center justify-center`}
    >
      <div className="flex items-center gap-1 py-0.5">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-emerald-400"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{
              duration: 0.6,
              repeat: Infinity,
              delay: i * 0.15,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
    </div>
  );
};

const UserMessage: React.FC<{ content: string }> = ({ content }) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.15 }}
    className="flex justify-end mb-4"
  >
    <div className="bg-accent-primary text-white px-3 py-2 rounded-lg rounded-tr-[2px] max-w-[75%] text-sm leading-relaxed">
      {content}
    </div>
  </motion.div>
);

const AssistantMessage: React.FC<{
  content: string;
  isStreaming?: boolean;
}> = ({ content, isStreaming }) => {
  const [copied, setCopied] = useState(false);
  const isLightTheme = false;
  const cardBgBorderClass = isLightTheme
    ? 'bg-emerald-500/10 backdrop-blur-md border border-emerald-500/20 text-emerald-900'
    : 'bg-emerald-600/20 backdrop-blur-md border border-emerald-500/30 text-emerald-100';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="flex flex-col items-start mb-4 w-full"
    >
      <div
        className={`w-full max-w-[90%] rounded-lg rounded-tl-[2px] p-3 ai-response-card ${cardBgBorderClass} my-2`}
      >
        {!isStreaming && content && (
          <div className="flex justify-end mb-1.5 select-none w-full">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="flex items-center gap-1 text-[11px] text-text-tertiary hover:text-emerald-400 transition-colors h-auto px-1 py-0.5"
            >
              {copied ? (
                <Check size={11} className="text-emerald-500" />
              ) : (
                <Copy size={11} />
              )}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        )}

        <div className="markdown-content">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[
              [
                rehypeKatex,
                { throwOnError: false, strict: false, errorColor: '#cc0000' },
              ],
            ]}
            components={{
              p: ({ node, ...props }: any) => (
                <p
                  className="mb-1.5 last:mb-0 leading-relaxed whitespace-pre-wrap text-sm"
                  {...props}
                />
              ),
              a: ({ node, ...props }: any) => (
                <a className="text-emerald-400 hover:underline" {...props} />
              ),
              h1: ({ node, ...props }: any) => (
                <h1
                  className="text-xs font-bold mt-1.5 mb-1 leading-relaxed uppercase tracking-wide"
                  {...props}
                />
              ),
              h2: ({ node, ...props }: any) => (
                <h2
                  className="text-[11px] font-bold mt-1 mb-1 leading-relaxed uppercase tracking-wide"
                  {...props}
                />
              ),
              h3: ({ node, ...props }: any) => (
                <h3
                  className="text-[11px] font-semibold mt-1 mb-1 leading-relaxed"
                  {...props}
                />
              ),
              ul: ({ node, ...props }: any) => (
                <ul
                  className="list-disc pl-3.5 mt-1 mb-1 space-y-0.5 leading-relaxed text-sm"
                  {...props}
                />
              ),
              ol: ({ node, ...props }: any) => (
                <ol
                  className="list-decimal pl-3.5 mt-1 mb-1 space-y-0.5 leading-relaxed text-sm"
                  {...props}
                />
              ),
              li: ({ node, ...props }: any) => (
                <li
                  className="pl-0.5 mb-1 last:mb-0 leading-relaxed text-sm"
                  {...props}
                />
              ),
              pre: ({ children }: any) => (
                <div className="not-prose mb-2 mt-1">{children}</div>
              ),
              code: ({ node, inline, className, children, ...props }: any) => {
                const match = /language-(\w+)/.exec(className || '');
                const isInline = inline ?? false;
                const lang = match ? match[1] : '';

                return !isInline ? (
                  <div className="my-1.5 rounded-lg overflow-hidden border border-white/[0.08] shadow-lg bg-zinc-800/60 backdrop-blur-md">
                    <div className="bg-white/[0.04] px-2.5 py-0.5 border-b border-white/[0.08]">
                      <span className="text-[9px] uppercase tracking-widest font-semibold text-white/40 font-mono">
                        {lang || 'CODE'}
                      </span>
                    </div>
                    <div className="bg-transparent">
                      <SyntaxHighlighter
                        language={lang || 'text'}
                        style={vscDarkPlus}
                        customStyle={{
                          margin: 0,
                          borderRadius: 0,
                          fontSize: '11px',
                          lineHeight: '1.4',
                          background: 'transparent',
                          padding: '10px',
                          fontFamily:
                            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                        }}
                        wrapLongLines={true}
                        showLineNumbers={true}
                        lineNumberStyle={{
                          minWidth: '2.5em',
                          paddingRight: '1.2em',
                          color: 'rgba(255,255,255,0.2)',
                          textAlign: 'right',
                          fontSize: '9px',
                        }}
                        {...props}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    </div>
                  </div>
                ) : (
                  <code
                    className="bg-bg-tertiary px-1 py-0.5 rounded text-[13px] font-mono text-text-primary border border-border-subtle whitespace-pre-wrap"
                    {...props}
                  >
                    {children}
                  </code>
                );
              },
            }}
          >
            {content}
          </ReactMarkdown>
          {isStreaming && (
            <motion.span
              className="inline-block w-0.5 h-3 bg-amber-400 ml-1 align-middle"
              animate={{ opacity: [1, 0] }}
              transition={{ duration: 0.5, repeat: Infinity }}
            />
          )}
        </div>
      </div>
    </motion.div>
  );
};

const MeetingChatOverlay: React.FC<MeetingChatOverlayProps> = ({
  isOpen,
  onClose,
  meetingContext,
  initialQuery = '',
}) => {
  const {
    messages: serverMessages,
    sendMessage,
    error,
    setMessages,
    stop,
    status,
  } = useServerChat();
  const isLoading = status === 'streaming' || status === 'submitted';
  const [localErrorMessage, setLocalErrorMessage] = useState<string | null>(
    null
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatWindowRef = useRef<HTMLDivElement>(null);

  const messages = serverMessages.filter(
    (msg) => msg.role === 'user' || msg.role === 'assistant'
  );

  const errorMessage =
    localErrorMessage ??
    (error ? "Couldn't get a response. Please check your settings." : null);

  useEffect(() => {
    if (isOpen && initialQuery && messages.length === 0) {
      setTimeout(() => {
        submitQuestion(initialQuery);
      }, 100);
    }
  }, [isOpen, initialQuery]);

  useEffect(() => {
    if (isOpen && initialQuery && messages.length > 0) {
      submitQuestion(initialQuery);
    }
  }, [initialQuery]);

  useEffect(() => {
    if (!isOpen) {
      stop();
      setMessages([]);
      setLocalErrorMessage(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }, []);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const buildContextString = useCallback((): string => {
    const parts: string[] = [];

    parts.push(`MEETING: ${meetingContext.title}`);

    if (meetingContext.summary) {
      parts.push(`\nSUMMARY:\n${meetingContext.summary}`);
    }

    if (meetingContext.keyPoints?.length) {
      parts.push(
        `\nKEY POINTS:\n${meetingContext.keyPoints.map((p) => `- ${p}`).join('\n')}`
      );
    }

    if (meetingContext.actionItems?.length) {
      parts.push(
        `\nACTION ITEMS:\n${meetingContext.actionItems.map((a) => `- ${a}`).join('\n')}`
      );
    }

    if (meetingContext.transcript?.length) {
      const recentTranscript = meetingContext.transcript.slice(-20);
      const transcriptText = recentTranscript
        .map((t) => `[${t.speaker === 'user' ? 'Me' : 'Them'}]: ${t.text}`)
        .join('\n');
      parts.push(`\nRECENT TRANSCRIPT:\n${transcriptText}`);
    }

    return parts.join('\n');
  }, [meetingContext]);

  const buildSystemPrompt = useCallback((): string => {
    const contextString = buildContextString();

    return `You are recalling a specific meeting. Answer questions ONLY about this meeting. Be concise (2-4 sentences). Sound natural, like a human recalling. If information is not present, say so briefly. Never guess.
${contextString}`;
  }, [buildContextString]);

  const submitQuestion = useCallback(
    async (question: string) => {
      if (!question.trim() || isLoading) return;

      setLocalErrorMessage(null);

      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);

      try {
        await sendMessage(
          { text: question },
          {
            body: {
              system: buildSystemPrompt(),
            },
          }
        );
      } catch (error) {
        console.error('[MeetingChat] Error:', error);
        setLocalErrorMessage('Something went wrong. Please try again.');
      }
    },
    [sendMessage, isLoading, buildSystemPrompt]
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="absolute inset-0 z-40 flex flex-col justify-end"
          onClick={handleBackdropClick}
        >
          <motion.div
            initial={{ backdropFilter: 'blur(0px)' }}
            animate={{ backdropFilter: 'blur(8px)' }}
            exit={{ backdropFilter: 'blur(0px)' }}
            transition={{ duration: 0.16 }}
            className="absolute inset-0 bg-black/40"
          />

          <motion.div
            ref={chatWindowRef}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: '85vh', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: {
                type: 'spring',
                stiffness: 300,
                damping: 30,
                mass: 0.8,
              },
              opacity: { duration: 0.2 },
            }}
            className="relative mx-auto w-full max-w-[680px] mb-0 bg-bg-secondary rounded-t-[24px] border-t border-x border-border-subtle shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle shrink-0">
              <div className="flex items-center gap-2 text-text-tertiary">
                <img
                  src={cheatlyIcon}
                  className="w-3.5 h-3.5 opacity-50"
                  alt="logo"
                />
                <span className="text-base font-medium">
                  Search this meeting
                </span>
              </div>
              <Button
                variant="overlay"
                size="icon-sm"
                onClick={handleClose}
                className="transition-colors group"
              >
                <X
                  size={16}
                  className="text-text-tertiary group-hover:text-red-500 group-hover:drop-shadow-[0_0_8px_rgba(239,68,68,0.5)] transition-all duration-300"
                />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 pb-32 custom-scrollbar">
              {messages.map((msg, i) =>
                msg.role === 'user' ? (
                  <UserMessage key={msg.id} content={getTextContent(msg)} />
                ) : (
                  <AssistantMessage
                    key={msg.id}
                    content={getTextContent(msg)}
                    isStreaming={isLoading && i === messages.length - 1}
                  />
                )
              )}

              {isLoading &&
                messages[messages.length - 1]?.role !== 'assistant' && (
                  <TypingIndicator />
                )}

              {errorMessage && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-red-400 text-base py-2"
                >
                  {errorMessage}
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default MeetingChatOverlay;
