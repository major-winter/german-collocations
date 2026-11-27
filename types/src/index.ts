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

// Decision #60 (docs/decisions.md): verb-noun pairs from collocation-lab
// (LL-ranked, Stanza-parsed). obj = "Kritik üben", obl = "in der Kritik
// stehen", nsubj = "die Kritik kommt".
export type VerbNounRelation = 'obj' | 'obl' | 'nsubj';

export interface VerbNounPair {
  relation: VerbNounRelation;
  partner: string;      // the other side's lemma
  chip: string;         // short label on the chip
  chipArticle: string | null; // the article inside `chip`, to show muted; null when none (#69)
  phrase: string;       // shown when the chip is open
  phraseNoun: string;   // the noun as written in `phrase` ("Entscheidungen"), for highlighting
  score: number;
  frequency: number;
  examples: CollocationExample[];
}

export interface VerbNounPairs {
  side: 'noun' | 'verb'; // the searched word's side
  lemma: string;         // the lab lemma that matched, or the dominant lemma text when none did
  article: string | null; // the headword's der/die/das on a noun page, when known (#69)
  pairs: VerbNounPair[]; // up to 10 per relation, each relation best-first
}

export interface CollocationResponse {
  word: string;
  collocations: CollocationEntry[];
  // null when the searched word is neither a noun nor a verb.
  verbNounPairs: VerbNounPairs | null;
}

export type WordSuggestion = { word: string; frequency: number; score: number };


// Decisions #70, #74: "Passt das zusammen?" - one checked phrase.
export interface CheckPhrase {
  phrase: string;      // as a learner says it ("sich Mühe geben", "starker Regen")
  nounWord: string;    // the noun as written in `phrase`, for colouring
  partnerWord: string; // the verb (without "sich") or adjective as written in `phrase`
}

export type CheckVerdict = 'usual' | 'unusual' | 'noData';

export type CollocationCheck =
  | { parsed: false }
  | {
      parsed: true;
      phrase: string;        // the query, whitespace-normalised, as typed
      noun: string;          // the noun page to open
      verbTyped: string;     // the verb token as typed ("macht")
      verb: string | null;   // the lab verb lemma, null when unknown
      relation: 'obj';
      verdict: CheckVerdict;
      matched: CheckPhrase | null;  // the matched pair as written, only when usual
      suggestions: CheckPhrase[];
    }
  // Decision #74: adjective + noun ("schwerer Regen"), from the #54 data.
  | {
      parsed: true;
      phrase: string;          // the query, whitespace-normalised, as typed
      noun: string;            // the noun page to open (the noun's lemma)
      adjectiveTyped: string;  // the adjective token as typed ("schwerer")
      adjective: string;       // its lemma ("schwer")
      relation: 'amod';
      verdict: CheckVerdict;
      matched: CheckPhrase | null;
      suggestions: CheckPhrase[];
    }
  // Decision #76: a verb with a prepositional noun ("an einer Sitzung
  // teilnehmen"), from the lab's obl pairs.
  | {
      parsed: true;
      phrase: string;            // the query, whitespace-normalised, as typed
      noun: string;              // the noun page to open
      verbTyped: string;         // the verb token as typed ("teilnehmen")
      verb: string | null;       // the lab verb lemma, null when unknown
      prepositionTyped: string;  // as typed ("zur")
      preposition: string;       // its lemma ("zu")
      relation: 'obl';
      verdict: CheckVerdict;
      otherPreposition: boolean; // unusual because the verb takes another preposition with this noun
      matched: CheckPhrase | null;
      suggestions: CheckPhrase[];
    };
