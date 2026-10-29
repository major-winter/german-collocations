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

// Decision #52 (docs/decisions.md): a governed preposition (Rektion) is
// a grammatical fact ("warten" requires "auf" + Akkusativ), not a ranked
// collocate - rendered as its own callout (GovernedPrepositions.tsx), not
// folded into CollocationEntry's "preposition" section. `case` is empty
// when spaCy's morphology didn't resolve a Case feature.
export interface GovernedPreposition {
  preposition: string;
  case: string;
}

// Decision #60 (docs/decisions.md): verb-noun pairs from collocation-lab
// (LL-ranked, Stanza-parsed). obj = "Kritik üben", obl = "in der Kritik
// stehen", nsubj = "die Kritik kommt".
export type VerbNounRelation = 'obj' | 'obl' | 'nsubj';

export interface VerbNounPair {
  relation: VerbNounRelation;
  partner: string;      // the other side's lemma
  chip: string;         // short label on the chip
  phrase: string;       // shown when the chip is open
  score: number;
  frequency: number;
  examples: CollocationExample[];
}

export interface VerbNounPairs {
  side: 'noun' | 'verb'; // the searched word's side
  lemma: string;         // the lab lemma that matched, or the dominant lemma text when none did
  pairs: VerbNounPair[]; // up to 10 per relation, each relation best-first
}

export interface CollocationResponse {
  word: string;
  collocations: CollocationEntry[];
  governedPrepositions: GovernedPreposition[];
  // null when the searched word is neither a noun nor a verb.
  verbNounPairs: VerbNounPairs | null;
}

export type WordSuggestion = { word: string; frequency: number; score: number };

