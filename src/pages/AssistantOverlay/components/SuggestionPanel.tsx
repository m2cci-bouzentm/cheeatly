import { motion } from 'framer-motion';
import { MessageRow } from './MessageComponents';
import ScrollIndicator from '../../../components/ui/ScrollIndicator';
import type { SuggestionPanelProps, AppMessage } from '../types';

const SuggestionPanel = ({
  showSuggestionPanel,
  scrollContainerRef,
  scrollMaxH,
  displayMessages,
  isLightTheme,
  appearance,
  handleCopy,
  renderMessageText,
  isProcessing,
  isStreaming,
  messagesEndRef,
  onScroll,
}: SuggestionPanelProps) => {
  if (!showSuggestionPanel) return null;

  const lastAssistantId = [...displayMessages]
    .reverse()
    .find((m) => m.role === 'assistant')?.id;

  return (
    <div className="relative flex-1 overflow-hidden">
      <motion.div
        ref={scrollContainerRef}
        onScroll={onScroll}
        className="relative z-10 h-full overflow-y-auto px-3 pr-[44px] py-2 space-y-3 no-drag isolate no-scrollbar"
        layout={false}
        style={{ scrollbarWidth: 'none', maxHeight: scrollMaxH }}
      >
        {displayMessages.map((msg: AppMessage) => (
          <MessageRow
            key={msg.id}
            msg={msg}
            isStreaming={isStreaming && msg.id === lastAssistantId}
            isLightTheme={isLightTheme}
            appearance={appearance}
            onCopy={handleCopy}
            renderMessageText={renderMessageText}
          />
        ))}

        {isProcessing && !isStreaming && (
          <div className="flex justify-start">
            <div className="px-4 py-2.5 flex gap-2 bg-black/5 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/5 shadow-sm">
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
          </div>
        )}
        <div ref={messagesEndRef} className="h-2" />
      </motion.div>
      <ScrollIndicator containerRef={scrollContainerRef} />
    </div>
  );
};

export default SuggestionPanel;
