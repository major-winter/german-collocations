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

// relation is only set for entries sourced from verb_arguments (decision
// #53's noun/verb section replacement) - 'Subjekt' | 'Akkusativobjekt' |
// 'Dativobjekt' | 'Genitivobjekt'. Undefined for lemma_collocations-
// sourced entries, which have no single grammatical relation to name.
export interface CollocationEntry {
  word: string;
  cooccurrence: number;
  significance: number;
  examples: CollocationExample[];
  section: CollocationSection;
  relation?: string;
}

// Decision #52 (docs/decisions-52.md): a governed preposition (Rektion) is
// a grammatical fact ("warten" requires "auf" + Akkusativ), not a ranked
// collocate - rendered as its own callout (GovernedPrepositions.tsx), not
// folded into CollocationEntry's "preposition" section. `case` is empty
// when spaCy's morphology didn't resolve a Case feature.
export interface GovernedPreposition {
  preposition: string;
  case: string;
}

export interface CollocationResponse {
  word: string;
  collocations: CollocationEntry[];
  governedPrepositions: GovernedPreposition[];
}

export type WordSuggestion = { word: string; frequency: number; score: number };

