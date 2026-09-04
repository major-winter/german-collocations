export type CollocationSection = 'noun' | 'verb' | 'adjective' | 'preposition' | 'other';

// searchWord/collocateWord are the literal surface-form tokens (not
// lemmas) that appear in this exact sentence - decision #44 widened
// example sourcing to any surface-form pair mapping to the entry's
// lemma pair, so a sentence's actual words can differ from their own
// lemma text (e.g. "Gedanke"/"Gedankens" for a "Gedanken" entry).
// searchWord is the surface form of the looked-up word; collocateWord
// is the surface form of this entry's partner (CollocationEntry.word,
// which is the partner's lemma, not necessarily this literal spelling).
export interface CollocationExample {
  sentence: string;
  searchWord: string;
  collocateWord: string;
}

export interface CollocationEntry {
  word: string;
  cooccurrence: number;
  significance: number;
  examples: CollocationExample[];
  section: CollocationSection;
}

export interface CollocationResponse {
  word: string;
  collocations: CollocationEntry[];
}

export type WordSuggestion = { word: string; frequency: number; score: number };

