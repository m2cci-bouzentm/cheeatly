import { Button } from '@/components/ui/button';
import { Mic, X } from 'lucide-react';
import { cn } from '../../../lib/utils.ts';
import TranscriptDialogue from '../../../components/ui/TranscriptDialogue.tsx';
import { getStatusToneClass } from './MessageComponents.tsx';
import type {
  DialogueTurn,
  LivePartials,
} from '../../../lib/dialogueTranscript.ts';
import type { SttChannel, SttSummary } from '../types.ts';
import type { MotionValue } from 'framer-motion';

interface TranscriptPanelProps {
  hasStatusPill: boolean;
  shouldShowSttSummaryPill: boolean;
  sttSummary: SttSummary;
  sttNotConfigured: boolean;
  setSttNotConfigured: (value: boolean) => void;
  showTranscript: boolean;
  showDialogue: boolean;
  dialogueTurns: DialogueTurn[];
  livePartials: LivePartials;
  interviewerChannelStatus: SttChannel;
  microphoneChannelStatus: SttChannel;
  scrollMaxH: MotionValue<number> | number;
}

const TranscriptPanel = ({
  hasStatusPill,
  shouldShowSttSummaryPill,
  sttSummary,
  sttNotConfigured,
  setSttNotConfigured,
  showTranscript,
  showDialogue,
  dialogueTurns,
  livePartials,
  interviewerChannelStatus,
  microphoneChannelStatus,
  scrollMaxH,
}: TranscriptPanelProps) => {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {hasStatusPill && (
        <div className="relative flex flex-wrap items-center justify-center gap-2 px-3 pt-3 pb-1.5">
          {shouldShowSttSummaryPill && (
            <div
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-1 text-xs font-bold shadow-sm backdrop-blur-xl border transition-all duration-300',
                getStatusToneClass(sttSummary.tone)
              )}
              title={sttSummary.detail}
            >
              <Mic className="h-3 w-3 opacity-70" />
              <span className="tracking-tight">{sttSummary.label}</span>
            </div>
          )}
        </div>
      )}

      {sttNotConfigured && (
        <div className="mx-3 mt-3 mb-1.5 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg shadow-sm relative group/stt-warning animate-in fade-in slide-in-from-top-2">
          <div className="flex flex-col gap-1.5 pr-8">
            <div className="flex items-center gap-2 text-[13px] text-amber-600 dark:text-amber-400 font-bold tracking-tight">
              <div className="shrink-0 p-1 bg-amber-500/20 rounded-md">
                <Mic className="w-3.5 h-3.5" />
              </div>
              <span>Transcription Not Configured</span>
            </div>
            <p className="text-[11px] text-amber-700/80 dark:text-amber-400/70 leading-relaxed pl-1">
              No STT provider selected. Open Settings → Audio to pick one.
            </p>
          </div>
          <div className="mt-3 flex items-center gap-2 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.electronAPI.toggleSettingsWindow()}
              className="h-7 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-400 text-[10px] font-bold uppercase tracking-wider border-0"
            >
              Open Settings
            </Button>
          </div>
          <button
            onClick={() => setSttNotConfigured(false)}
            className="absolute top-3 right-3 opacity-40 hover:opacity-100 transition-opacity"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        {showTranscript &&
        showDialogue &&
        interviewerChannelStatus.status !== 'failed' &&
        microphoneChannelStatus.status !== 'failed' ? (
          <TranscriptDialogue
            turns={dialogueTurns}
            livePartials={livePartials}
            scrollMaxH={scrollMaxH}
          />
        ) : null}
      </div>
    </div>
  );
};

export default TranscriptPanel;
