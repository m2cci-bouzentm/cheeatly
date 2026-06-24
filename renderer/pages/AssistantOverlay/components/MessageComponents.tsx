import React, { useCallback, useMemo, useState } from 'react';
import { cn } from '../../../lib/utils';
import { Button } from '@/components/ui/button';
import { Check, Copy, Image } from 'lucide-react';
import 'katex/dist/katex.min.css';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { sanitizePartialMarkdown } from '../../../utils/sanitizePartialMarkdown';
import { getMessageText } from '../types';
import type { AppMessage, MessageRowProps, SttStatus, SttSummary } from '../types';

export const ANSWER_PANEL_INTENTS = new Set([
  'chat',
  'recap',
  'clarify',
  'follow_up_questions',
]);

const REMARK_PLUGINS = [remarkGfm, remarkMath];
const REHYPE_PLUGINS: any[] = [
  [rehypeKatex, { throwOnError: false, strict: false, errorColor: '#cc0000' }],
];
export const subtleSurfaceClass = 'overlay-subtle-surface';

const CardCopyButton = ({
  text,
  onCopy,
  isLightTheme,
}: {
  text: string;
  onCopy: (text: string) => void;
  isLightTheme?: boolean;
}) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    onCopy(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const buttonColorClass = isLightTheme
    ? 'text-slate-400 hover:text-slate-700'
    : 'text-slate-500 hover:text-slate-200';

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={handleCopy}
      className={`p-1 transition-colors duration-200 flex items-center justify-center ${buttonColorClass}`}
      title="Copy answer"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-emerald-400" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
    </Button>
  );
};

export const formatProviderLabel = (provider?: string | null): string => {
  if (!provider) return 'not set';
  return provider
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

export const getSttSummary = (
  userStatus: SttStatus,
  interviewerStatus: SttStatus,
  userProvider: string,
  interviewerProvider: string,
  notConfigured: boolean,
  userError?: string | null,
  interviewerError?: string | null
): SttSummary => {
  if (notConfigured) {
    return {
      label: 'STT not configured',
      tone: 'error',
      detail: 'Open Audio settings to select a provider',
    };
  }
  if (userStatus === 'failed' || interviewerStatus === 'failed') {
    const parts = [
      ...(userStatus === 'failed' && userError ? [`Mic: ${userError}`] : []),
      ...(interviewerStatus === 'failed' && interviewerError
        ? [`System: ${interviewerError}`]
        : []),
    ];
    return {
      label: 'STT needs attention',
      tone: 'error',
      detail:
        parts.length > 0
          ? parts.join(' · ')
          : `${formatProviderLabel(userProvider)} mic · ${formatProviderLabel(interviewerProvider)} system`,
    };
  }
  if (userStatus === 'reconnecting' || interviewerStatus === 'reconnecting') {
    return {
      label: 'STT reconnecting',
      tone: 'warn',
      detail: `${formatProviderLabel(userProvider)} mic · ${formatProviderLabel(interviewerProvider)} system`,
    };
  }
  if (
    userStatus === 'awaiting-audio' ||
    interviewerStatus === 'awaiting-audio'
  ) {
    return {
      label: 'Listening for audio…',
      tone: 'warn',
      detail: `${formatProviderLabel(userProvider)} mic · ${formatProviderLabel(interviewerProvider)} system`,
    };
  }
  return {
    label: 'STT healthy',
    tone: 'ok',
    detail: `${formatProviderLabel(userProvider)} mic · ${formatProviderLabel(interviewerProvider)} system`,
  };
};

export const getStatusToneClass = (tone: 'ok' | 'warn' | 'error'): string => {
  if (tone === 'error')
    return 'text-[var(--overlay-error-text)] border-[var(--overlay-error-border)] bg-[var(--overlay-error-bg)]';
  if (tone === 'warn')
    return 'text-[var(--overlay-warning-text)] border-[var(--overlay-warning-border)] bg-[var(--overlay-warning-bg)]';
  return 'text-[var(--overlay-success-text)] border-[var(--overlay-success-text)]/20 bg-[var(--overlay-success-text)]/10';
};

export const MessageRow = React.memo(
  function MessageRow({
    msg,
    isStreaming,
    appearance: _appearance,
    onCopy: _onCopy,
    renderMessageText,
  }: MessageRowProps) {
    const isUser = msg.role === 'user';

    return (
      <div className="w-full">
        <div
          className={cn(
            'flex animate-in fade-in slide-in-from-bottom-2 duration-500',
            isUser ? 'justify-end' : 'justify-start'
          )}
        >
          <div
            className={cn(
              'relative group max-w-[92%]',
              isUser
                ? 'bg-blue-600 text-white px-3 py-1.5 rounded-lg rounded-tr-[2px] shadow-lg shadow-blue-500/10 font-medium text-sm leading-relaxed'
                : ''
            )}
          >
            {isUser && msg.metadata?.hasScreenshot && (
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider opacity-60 mb-2 border-b border-white/10 pb-2">
                <Image className="w-3 h-3" />
                <span>Screenshot Context</span>
              </div>
            )}
            <div
              className={cn(
                !isUser && 'text-slate-900 dark:text-zinc-100',
              )}
            >
              {renderMessageText(msg, isStreaming)}
            </div>
          </div>
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.msg === next.msg &&
    prev.isStreaming === next.isStreaming &&
    prev.isLightTheme === next.isLightTheme &&
    prev.appearance === next.appearance &&
    prev.renderMessageText === next.renderMessageText &&
    prev.onCopy === next.onCopy
);

const stripNode = (props: any) => {
  const { node: _node, ...rest } = props;
  return rest;
};

const useMarkdownComponents = ({ isLightTheme }: { isLightTheme: boolean }) =>
  useMemo(
    () => ({
      standard: {
        p: (props: any) => (
          <p
            className="mb-3 last:mb-0 leading-relaxed text-base whitespace-pre-wrap"
            {...stripNode(props)}
          />
        ),
        strong: (props: any) => (
          <strong
            className="font-bold text-slate-950 dark:text-white"
            {...stripNode(props)}
          />
        ),
        em: (props: any) => (
          <em className="italic opacity-90" {...stripNode(props)} />
        ),
        ul: (props: any) => (
          <ul
            className="list-disc ml-4 mb-4 space-y-1.5 leading-relaxed text-base"
            {...stripNode(props)}
          />
        ),
        ol: (props: any) => (
          <ol
            className="list-decimal ml-4 mb-4 space-y-1.5 leading-relaxed text-base"
            {...stripNode(props)}
          />
        ),
        li: (props: any) => (
          <li
            className="pl-1 leading-relaxed text-base"
            {...stripNode(props)}
          />
        ),
        code: (props: any) => (
          <code
            className={cn(
              'rounded px-1.5 py-0.5 text-[0.9em] font-mono border',
              isLightTheme
                ? 'bg-slate-100 text-slate-800 border-slate-200'
                : 'bg-white/5 text-blue-200 border-white/5'
            )}
            {...stripNode(props)}
          />
        ),
        a: (props: any) => (
          <a
            className="text-blue-500 underline underline-offset-4 hover:text-blue-600 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
            {...stripNode(props)}
          />
        ),
      },
    }),
    [isLightTheme]
  );

export const useMessageRenderer = ({
  isLightTheme,
  handleCopy,
}: {
  isLightTheme: boolean;
  handleCopy: (text: string) => void;
}) => {
  const mdComponents = useMarkdownComponents({ isLightTheme });

  return useCallback(
    (msg: AppMessage, streaming: boolean) => {
      const text = getMessageText(msg);
      const cardBgBorderClass = isLightTheme
        ? 'bg-slate-50/50 border-slate-100 text-slate-900 shadow-sm'
        : 'bg-white/[0.03] border-white/[0.05] text-zinc-100 shadow-xl shadow-black/10';

      const card = (children: React.ReactNode, copy = true) => (
        <div
          className={cn(
            'max-w-full overflow-hidden break-words rounded-lg rounded-tl-[2px] px-3 py-2.5 ai-response-card border transition-all duration-300 relative group',
            cardBgBorderClass
          )}
        >
          {copy && (
            <div className="absolute top-1.5 right-1.5 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto">
              <CardCopyButton
                text={text}
                onCopy={handleCopy}
                isLightTheme={isLightTheme}
              />
            </div>
          )}
          {children}
        </div>
      );

      if (streaming && msg.role === 'assistant') {
        const isThinking = !text;
        return (
          <div
            key="streaming"
            className={cn(
              'rounded-lg rounded-tl-[2px] ai-response-card border transition-all duration-300 markdown-content whitespace-pre-wrap text-sm leading-relaxed',
              isThinking
                ? 'w-fit px-3 py-2'
                : 'max-w-full overflow-hidden break-words px-3 py-2.5',
              cardBgBorderClass
            )}
          >
            {isThinking ? (
              <div className="flex gap-2 items-center py-1">
                <div
                  className="w-1.5 h-1.5 bg-current opacity-40 rounded-full animate-bounce"
                  style={{ animationDelay: '0ms' }}
                />
                <div
                  className="w-1.5 h-1.5 bg-current opacity-40 rounded-full animate-bounce"
                  style={{ animationDelay: '150ms' }}
                />
                <div
                  className="w-1.5 h-1.5 bg-current opacity-40 rounded-full animate-bounce"
                  style={{ animationDelay: '300ms' }}
                />
              </div>
            ) : (
              <ReactMarkdown
                remarkPlugins={REMARK_PLUGINS}
                rehypePlugins={REHYPE_PLUGINS}
                components={mdComponents.standard}
              >
                {sanitizePartialMarkdown(text)}
              </ReactMarkdown>
            )}
          </div>
        );
      }

      if (msg.role === 'assistant') {
        return card(
          <div className="text-sm leading-relaxed markdown-content">
            <ReactMarkdown
              remarkPlugins={REMARK_PLUGINS}
              rehypePlugins={REHYPE_PLUGINS}
              components={mdComponents.standard}
            >
              {text}
            </ReactMarkdown>
          </div>
        );
      }

      return (
        <div className="markdown-content">
          <ReactMarkdown
            remarkPlugins={REMARK_PLUGINS}
            rehypePlugins={REHYPE_PLUGINS}
            components={mdComponents.standard}
          >
            {text}
          </ReactMarkdown>
        </div>
      );
    },
    [isLightTheme, handleCopy, mdComponents]
  );
};
