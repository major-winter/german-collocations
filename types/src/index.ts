export type CollocationSection = 'noun' | 'verb' | 'adjective' | 'preposition' | 'other';

export interface CollocationEntry {
  word: string;
  cooccurrence: number;
  significance: number;
  examples: string[];
  section: CollocationSection;
}

export interface CollocationResponse {
  word: string;
  followedBy: CollocationEntry[];
  precededBy: CollocationEntry[];
}

export type WordSuggestion = { word: string; frequency: number; score: number };

