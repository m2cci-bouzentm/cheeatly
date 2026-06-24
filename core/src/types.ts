export type ProviderCredentials = {
  provider: string;
  apiKey: string;
  model?: string;
};

export type SuggestionPriority = 'high' | 'medium' | 'low';
export type SuggestionSpeaker = 'Me' | 'Them';
export type SuggestionType =
  | 'question'
  | 'request'
  | 'objection'
  | 'buying_signal'
  | 'evaluation'
  | 'clarification'
  | 'follow_up'
  | 'action'
  | 'implicit';

export type DetectedMeetingSuggestion = {
  text: string;
  speaker: SuggestionSpeaker;
  type: SuggestionType;
  intent: string;
  prompt: string;
  priority: SuggestionPriority;
};
