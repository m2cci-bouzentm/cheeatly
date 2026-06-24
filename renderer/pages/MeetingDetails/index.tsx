import React, { useState } from 'react';
import { ArrowUp, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { motion } from 'framer-motion';
import { genMessageId } from '../../utils/messageId';
import MeetingChatOverlay from '../../components/chat/MeetingChatOverlay';
import EditableTextBlock from './components/./EditableTextBlock';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SyntaxHighlighter, vscDarkPlus } from '../../lib/syntaxHighlighting';
import { formatTimestamp } from '../../utils/dateUtils';

const cleanMarkdown = (content: string) => {
  if (!content) return '';
  // ReactMarkdown needs fenced code blocks on their own line.
  return content.replace(/([^\n])```/g, '$1\n\n```');
};

interface Meeting {
  id: string;
  title: string;
  date: string;
  duration: string;
  summary: string;
  detailedSummary?: {
    overview?: string;
    actionItems: string[];
    keyPoints: string[];
    actionItemsTitle?: string;
    keyPointsTitle?: string;
    sections?: Array<{ title: string; bullets: string[] }>;
    schemaVersion?: 2;
    actionItemsStructured?: Array<{
      id: string;
      text: string;
      owner?: string;
      deadline?: string;
      sourceTimestamp?: number;
    }>;
    followUpDraft?: string;
  };
  transcript?: Array<{
    speaker: string;
    text: string;
    timestamp: number;
  }>;
}

interface MeetingDetailsProps {
  meeting: Meeting;
  onBack: () => void;
  onOpenSettings: () => void;
}

const MeetingDetails: React.FC<MeetingDetailsProps> = ({
  meeting: initialMeeting,
}) => {
  const isLight = false;
  // Local state lets edits render before persistence returns.
  const [meeting, setMeeting] = useState<Meeting>(initialMeeting);
  const [activeTab, setActiveTab] = useState<'summary' | 'transcript'>(
    'summary'
  );
  const [query, setQuery] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [submittedQuery, setSubmittedQuery] = useState('');

  // Persisted arrays have no IDs; stable client keys prevent focus/draft jumps
  // when Enter splices a new row into the middle of the list.
  const [actionItemKeys, setActionItemKeys] = useState<string[]>(() =>
    (initialMeeting.detailedSummary?.actionItems ?? []).map(() =>
      genMessageId()
    )
  );
  const [keyPointKeys, setKeyPointKeys] = useState<string[]>(() =>
    (initialMeeting.detailedSummary?.keyPoints ?? []).map(() => genMessageId())
  );

  const handleSubmitQuestion = () => {
    if (!query.trim()) return;
    setSubmittedQuery(query);
    if (!isChatOpen) setIsChatOpen(true);
    setQuery('');
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && query.trim()) {
      e.preventDefault();
      handleSubmitQuestion();
    }
  };

  const handleCopy = async () => {
    const copyTextByTab = {
      summary: () =>
        meeting.detailedSummary
          ? `
Meeting: ${meeting.title}
Date: ${new Date(meeting.date).toLocaleDateString()}

OVERVIEW:
${meeting.detailedSummary.overview || ''}

ACTION ITEMS:
${meeting.detailedSummary.actionItems?.map((item) => `- ${item}`).join('\n') || 'None'}

KEY POINTS:
${meeting.detailedSummary.keyPoints?.map((item) => `- ${item}`).join('\n') || 'None'}
            `.trim()
          : '',
      transcript: () =>
        meeting.transcript
          ?.map(
            (t) =>
              `[${formatTimestamp(t.timestamp)}] ${t.speaker === 'user' ? 'Me' : 'Them'}: ${t.text}`
          )
          .join('\n') ?? '',
    };
    const textToCopy = copyTextByTab[activeTab]();

    if (!textToCopy) return;

    try {
      await navigator.clipboard.writeText(textToCopy);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy content:', err);
    }
  };

  const handleTitleSave = async (newTitle: string) => {
    setMeeting((prev) => ({ ...prev, title: newTitle }));
    await window.electronAPI.updateMeetingTitle(meeting.id, newTitle);
  };

  const handleActionItemSave = async (index: number, newVal: string) => {
    const newItems = [...(meeting.detailedSummary?.actionItems || [])];
    newItems[index] = newVal;

    setMeeting((prev) => ({
      ...prev,
      detailedSummary: {
        ...prev.detailedSummary!,
        actionItems: newItems,
      },
    }));

    await window.electronAPI.updateMeetingSummary(meeting.id, {
      actionItems: newItems,
    });
  };

  const handleKeyPointSave = async (index: number, newVal: string) => {
    const newItems = [...(meeting.detailedSummary?.keyPoints || [])];
    newItems[index] = newVal;

    setMeeting((prev) => ({
      ...prev,
      detailedSummary: {
        ...prev.detailedSummary!,
        keyPoints: newItems,
      },
    }));

    await window.electronAPI.updateMeetingSummary(meeting.id, {
      keyPoints: newItems,
    });
  };

  return (
    <div className="h-full w-full flex flex-col bg-bg-secondary text-text-secondary font-sans overflow-hidden">
      <main className="flex-1 overflow-y-auto custom-scrollbar">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="max-w-4xl mx-auto px-6 py-6 pb-28"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="w-full pr-4">
              <div className="text-xs text-text-tertiary font-medium mb-0.5">
                {new Date(meeting.date).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                })}
              </div>

              <EditableTextBlock
                initialValue={meeting.title}
                onSave={handleTitleSave}
                tagName="h1"
                className="text-2xl font-bold text-text-primary tracking-tight -ml-1.5 px-1.5 py-0.5 rounded-md transition-colors"
                multiline={false}
              />
            </div>
          </div>

          <div className="flex items-center justify-between mb-6">
            <div
              className={`p-0.5 rounded-lg inline-flex items-center gap-0.5 ${isLight ? 'bg-zinc-200 border border-black/[0.04]' : 'bg-zinc-900 border border-white/[0.08]'}`}
            >
              {['summary', 'transcript'].map((tab) => (
                <Button
                  key={tab}
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveTab(tab as any)}
                  className={`
                                        relative px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-200 z-10
                                        ${activeTab === tab ? (isLight ? 'text-black' : 'text-zinc-200') : `${isLight ? 'text-text-secondary' : 'text-text-tertiary'} hover:text-text-primary`}
                                    `}
                >
                  {activeTab === tab && (
                    <motion.div
                      layoutId="activeTabBackground"
                      className={`absolute inset-0 rounded-md -z-10 shadow-sm ${isLight ? 'bg-white' : 'bg-zinc-700'}`}
                      initial={false}
                      transition={{
                        type: 'spring',
                        stiffness: 400,
                        damping: 30,
                      }}
                    />
                  )}
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Button>
              ))}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              {isCopied ? (
                <Check size={13} className="text-emerald-500" />
              ) : (
                <Copy size={13} />
              )}
              {isCopied
                ? 'Copied'
                : activeTab === 'summary'
                  ? 'Copy summary'
                  : 'Copy transcript'}
            </Button>
          </div>

          <div className="space-y-6">
            {activeTab === 'summary' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {meeting.detailedSummary?.overview && (
                  <div className="mb-6 pb-6 border-b border-border-subtle prose prose-sm max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({ node, ...props }) => (
                          <h1
                            className="text-xl font-bold text-text-primary mt-4 mb-2"
                            {...props}
                          />
                        ),
                        h2: ({ node, ...props }) => (
                          <h2
                            className="text-lg font-semibold text-text-primary mt-4 mb-2"
                            {...props}
                          />
                        ),
                        h3: ({ node, ...props }) => (
                          <h3
                            className="text-base font-semibold text-text-primary mt-3 mb-1"
                            {...props}
                          />
                        ),
                        p: ({ node, ...props }) => (
                          <p
                            className="text-sm text-text-secondary leading-relaxed mb-2"
                            {...props}
                          />
                        ),
                        ul: ({ node, ...props }) => (
                          <ul
                            className="list-disc ml-4 mb-2 space-y-1"
                            {...props}
                          />
                        ),
                        ol: ({ node, ...props }) => (
                          <ol
                            className="list-decimal ml-4 mb-2 space-y-1"
                            {...props}
                          />
                        ),
                        li: ({ node, ...props }) => (
                          <li
                            className="text-sm text-text-secondary"
                            {...props}
                          />
                        ),
                        strong: ({ node, ...props }) => (
                          <strong
                            className="font-semibold text-text-primary"
                            {...props}
                          />
                        ),
                        a: ({ node, ...props }) => (
                          <a
                            className="text-blue-500 hover:underline"
                            {...props}
                          />
                        ),
                      }}
                    >
                      {meeting.detailedSummary?.overview || ''}
                    </ReactMarkdown>
                  </div>
                )}

                {meeting.detailedSummary?.actionItems &&
                  meeting.detailedSummary.actionItems.length > 0 && (
                    <section className="mb-8">
                      <div className="flex items-center justify-between mb-4">
                        <EditableTextBlock
                          initialValue={
                            meeting.detailedSummary?.actionItemsTitle ||
                            'Action Items'
                          }
                          onSave={(val) => {
                            setMeeting((prev) => ({
                              ...prev,
                              detailedSummary: {
                                ...prev.detailedSummary!,
                                actionItemsTitle: val,
                              },
                            }));
                            window.electronAPI.updateMeetingSummary(
                              meeting.id,
                              { actionItemsTitle: val }
                            );
                          }}
                          tagName="h2"
                          className="text-lg font-semibold text-text-primary -ml-2 px-2 py-1 rounded-sm transition-colors"
                          multiline={false}
                        />
                      </div>
                      <ul className="space-y-3">
                        {meeting.detailedSummary.actionItems.map((item, i) => (
                          <li
                            key={actionItemKeys[i] ?? i}
                            className="flex items-start gap-3 group"
                          >
                            <div className="mt-2 w-1.5 h-1.5 rounded-full bg-text-secondary group-hover:bg-blue-500 transition-colors shrink-0" />
                            <div className="flex-1">
                              <EditableTextBlock
                                initialValue={item}
                                onSave={(val) => handleActionItemSave(i, val)}
                                tagName="p"
                                className="text-sm text-text-secondary leading-relaxed -ml-2 px-2 rounded-sm transition-colors"
                                placeholder="Type an action item..."
                                onEnter={() => {
                                  const newItems = [
                                    ...(meeting.detailedSummary?.actionItems ||
                                      []),
                                  ];
                                  newItems.splice(i + 1, 0, '');
                                  setActionItemKeys((prev) => {
                                    const next = [...prev];
                                    next.splice(i + 1, 0, genMessageId());
                                    return next;
                                  });
                                  setMeeting((prev) => ({
                                    ...prev,
                                    detailedSummary: {
                                      ...prev.detailedSummary!,
                                      actionItems: newItems,
                                    },
                                  }));
                                }}
                              />
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                {meeting.detailedSummary?.keyPoints &&
                  meeting.detailedSummary.keyPoints.length > 0 && (
                    <section>
                      <div className="flex items-center justify-between mb-4">
                        <EditableTextBlock
                          initialValue={
                            meeting.detailedSummary?.keyPointsTitle ||
                            'Key Points'
                          }
                          onSave={(val) => {
                            setMeeting((prev) => ({
                              ...prev,
                              detailedSummary: {
                                ...prev.detailedSummary!,
                                keyPointsTitle: val,
                              },
                            }));
                            window.electronAPI.updateMeetingSummary(
                              meeting.id,
                              { keyPointsTitle: val }
                            );
                          }}
                          tagName="h2"
                          className="text-lg font-semibold text-text-primary -ml-2 px-2 py-1 rounded-sm transition-colors"
                          multiline={false}
                        />
                      </div>
                      <ul className="space-y-3">
                        {meeting.detailedSummary.keyPoints.map((item, i) => (
                          <li
                            key={keyPointKeys[i] ?? i}
                            className="flex items-start gap-3 group"
                          >
                            <div className="mt-2 w-1.5 h-1.5 rounded-full bg-text-secondary group-hover:bg-purple-500 transition-colors shrink-0" />
                            <div className="flex-1">
                              <EditableTextBlock
                                initialValue={item}
                                onSave={(val) => handleKeyPointSave(i, val)}
                                tagName="p"
                                className="text-sm text-text-secondary leading-relaxed -ml-2 px-2 rounded-sm transition-colors"
                                placeholder="Type a key point..."
                                onEnter={() => {
                                  const newItems = [
                                    ...(meeting.detailedSummary?.keyPoints ||
                                      []),
                                  ];
                                  newItems.splice(i + 1, 0, '');
                                  setKeyPointKeys((prev) => {
                                    const next = [...prev];
                                    next.splice(i + 1, 0, genMessageId());
                                    return next;
                                  });
                                  setMeeting((prev) => ({
                                    ...prev,
                                    detailedSummary: {
                                      ...prev.detailedSummary!,
                                      keyPoints: newItems,
                                    },
                                  }));
                                }}
                              />
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                {meeting.detailedSummary?.actionItemsStructured &&
                  meeting.detailedSummary.actionItemsStructured.length > 0 && (
                    <section className="mb-8">
                      <h2 className="text-lg font-semibold text-text-primary mb-4">
                        Next Steps
                      </h2>
                      <ul className="space-y-2">
                        {meeting.detailedSummary.actionItemsStructured.map(
                          (item) => (
                            <li
                              key={item.id}
                              className="flex items-start gap-3 group"
                            >
                              <div className="mt-2 w-1.5 h-1.5 rounded-full bg-emerald-500/70 group-hover:bg-emerald-400 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-text-secondary leading-relaxed">
                                  {item.text}
                                </p>
                                {(item.owner || item.deadline) && (
                                  <p className="text-xs text-text-tertiary mt-0.5">
                                    {item.owner && (
                                      <span className="font-medium">
                                        {item.owner}
                                      </span>
                                    )}
                                    {item.owner && item.deadline && (
                                      <span> · </span>
                                    )}
                                    {item.deadline && (
                                      <span>by {item.deadline}</span>
                                    )}
                                  </p>
                                )}
                              </div>
                            </li>
                          )
                        )}
                      </ul>
                    </section>
                  )}

                {meeting.detailedSummary?.followUpDraft &&
                  meeting.detailedSummary.followUpDraft.trim() && (
                    <section className="mb-6">
                      <div className="flex items-center justify-between mb-2.5">
                        <h2 className="text-lg font-semibold text-text-primary">
                          Follow-up Draft
                        </h2>
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          onClick={() => {
                            navigator.clipboard
                              ?.writeText(
                                meeting.detailedSummary?.followUpDraft || ''
                              )
                              .catch(() => {
                                /* swallow */
                              });
                          }}
                          className="text-[11px] px-1.5 py-0.5 rounded-md bg-white/5 hover:bg-white/10 text-text-secondary border border-white/10 transition-colors"
                        >
                          Copy
                        </Button>
                      </div>
                      <pre className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap font-sans select-text cursor-text p-2.5 rounded-lg border border-white/10 bg-white/[0.02]">
                        {meeting.detailedSummary.followUpDraft}
                      </pre>
                    </section>
                  )}

                {meeting.detailedSummary?.sections &&
                  meeting.detailedSummary.sections.length > 0 && (
                    <div className="space-y-6">
                      {meeting.detailedSummary.sections.map(
                        (section, si) =>
                          section.bullets.length > 0 && (
                            <section key={si}>
                              <div className="flex items-center justify-between mb-3">
                                <h2 className="text-lg font-semibold text-text-primary">
                                  {section.title}
                                </h2>
                              </div>
                              <ul className="space-y-2.5">
                                {section.bullets.map((bullet, bi) => (
                                  <li
                                    key={bi}
                                    className="flex items-start gap-2.5 group"
                                  >
                                    <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-text-secondary shrink-0" />
                                    <p className="text-sm text-text-secondary leading-relaxed">
                                      {bullet}
                                    </p>
                                  </li>
                                ))}
                              </ul>
                            </section>
                          )
                      )}
                    </div>
                  )}
              </motion.div>
            )}

            {activeTab === 'transcript' && (
              <motion.section
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="space-y-6">
                  {(() => {
                    console.log('Raw Transcript:', meeting.transcript);
                    const filteredTranscript =
                      meeting.transcript?.filter((entry) => {
                        const isHidden = [
                          'system',
                          'ai',
                          'assistant',
                          'model',
                        ].includes(entry.speaker?.toLowerCase());
                        if (isHidden) console.log('Filtered out:', entry);
                        return !isHidden;
                      }) || [];
                    console.log('Filtered Transcript:', filteredTranscript);

                    if (filteredTranscript.length === 0) {
                      return (
                        <p className="text-text-tertiary">
                          No transcript available.
                        </p>
                      );
                    }

                    return filteredTranscript.map((entry, i) => (
                      <div key={i} className="group">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-text-secondary">
                            {entry.speaker === 'user' ? 'Me' : 'Them'}
                          </span>
                          <span className="text-xs text-text-tertiary font-mono">
                            {entry.timestamp
                              ? formatTimestamp(entry.timestamp)
                              : '0:00'}
                          </span>
                        </div>
                        <p className="text-text-secondary text-sm leading-relaxed transition-colors select-text cursor-text">
                          {entry.text}
                        </p>
                      </div>
                    ));
                  })()}
                </div>
              </motion.section>
            )}
          </div>
        </motion.div>
      </main>

      <div
        className={`absolute bottom-0 left-0 right-0 p-6 flex justify-center pointer-events-none ${isChatOpen ? 'z-50' : 'z-20'}`}
      >
        <div className="w-full max-w-[440px] relative group pointer-events-auto">
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Ask about this meeting..."
            className="w-full pl-5 pr-12 py-3 bg-transparent backdrop-blur-[24px] backdrop-saturate-[140%] shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-white/20 rounded-full text-sm text-text-primary placeholder-text-tertiary/70 focus:outline-none transition-shadow duration-200"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleSubmitQuestion}
            className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full transition-all duration-200 border border-white/5 ${
              query.trim()
                ? 'bg-text-primary text-bg-primary hover:scale-105'
                : 'bg-bg-item-active text-text-primary hover:bg-bg-item-hover'
            }`}
          >
            <ArrowUp size={16} className="transform rotate-45" />
          </Button>
        </div>
      </div>

      <MeetingChatOverlay
        isOpen={isChatOpen}
        onClose={() => {
          setIsChatOpen(false);
          setQuery('');
          setSubmittedQuery('');
        }}
        meetingContext={{
          id: meeting.id,
          title: meeting.title,
          summary: meeting.detailedSummary?.overview,
          keyPoints: meeting.detailedSummary?.keyPoints,
          actionItems: meeting.detailedSummary?.actionItems,
          transcript: meeting.transcript,
        }}
        initialQuery={submittedQuery}
        onNewQuery={(newQuery) => {
          setSubmittedQuery(newQuery);
        }}
      />
    </div>
  );
};

export default MeetingDetails;
