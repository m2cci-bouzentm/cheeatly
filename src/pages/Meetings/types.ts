export interface Meeting {
  id: string;
  title: string;
  date: string;
  duration: string;
  summary: string;
  summaryStatus?: 'pending' | 'failed' | 'done';
  detailedSummary?: {
    actionItems: string[];
    keyPoints: string[];
  };
  transcript?: Array<{
    speaker: string;
    text: string;
    timestamp: number;
  }>;
  active?: boolean; // UI state
  time?: string; // Optional for compatibility
}

export interface MeetingsProps {
  onStartMeeting: () => void;
  onOpenSettings: (tab?: string) => void;
  onPageChange?: (isMain: boolean) => void;
}
