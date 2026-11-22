import type {
  CollocationEntry,
  CollocationSection,
  VerbNounPair,
  VerbNounRelation,
} from "@collocations/types";
import { chipOf, phraseOf, type PageSide } from "./verbNounPhrases.ts";

// The domain core: plain data in, plain data out. No SQL, no Express -
// the rows below are what the outbound CollocationStore port promises to
// deliver, whatever is behind it.

// One adjacency row from lemma_collocations, one per example sentence
// (or one with null example fields for a pair without examples).
export interface AdjacencyRow {
  leftLemmaId: number;
  rightLemmaId: number;
  word: string;
  cooccurrence: number;
  significance: number;
  sentence: string | null;
  leftWord: string | null;
  rightWord: string | null;
  section: CollocationSection;
}

// Rows from adjective_attributes (decision #54, docs/decisions.md):
// unlike AdjacencyRow's symmetric left/right shape, a row always has
// a fixed noun side and adjective side.
export interface AdjectiveAttributeRow {
  nounLemmaId: number;
  adjectiveLemmaId: number;
  word: string;
  cooccurrence: number;
  significance: number;
  sentence: string | null;
  nounSurface: string | null;
  adjectiveSurface: string | null;
  section: CollocationSection;
}

// Rows from lab_verb_pairs joined with lab_verb_pair_examples (decision
// #60, docs/decisions.md): one row per example, or one row with null
// example fields for a pair without examples. Keyed by lemma text.
export interface LabVerbPairRow {
  relation: VerbNounRelation;
  verb: string;
  prep: string;
  noun: string;
  phraseNoun: string;
  score: number;
  pairFreq: number;
  sentence: string | null;
  verbSurface: string | null;
  nounSurface: string | null;
}

// Keyed by (left_lemma_id, right_lemma_id), not by word text - the same
// partner lemma can appear via two distinct pairs now that both
// directions are combined (e.g. "X folgt Y" and "Y folgt X" both
// significant), and each pair has its own cooccurrence/logDice.
// Keying by word text would silently mix example sentences from two
// unrelated pairs under one entry.
// queryLemmaId picks out, per row, which of leftWord/rightWord is the
// surface form of the word the user looked up vs. its collocate - by
// lemma id, not by string equality against `word`, since either side's
// literal surface form can differ from its own lemma's spelling.
export function groupAdjacencyRows(
  rows: AdjacencyRow[],
  queryLemmaId: number,
): CollocationEntry[] {
  const entries = new Map<string, CollocationEntry>();

  for (const row of rows) {
    const key = `${row.leftLemmaId}-${row.rightLemmaId}`;
    const isQueryLeft = row.leftLemmaId === queryLemmaId;
    // searchWord/collocateWord are only ever null together with
    // sentence - all three come from the same LATERAL row.
    const example =
      row.sentence && row.leftWord && row.rightWord
        ? {
            sentence: row.sentence,
            searchWord: isQueryLeft ? row.leftWord : row.rightWord,
            collocateWord: isQueryLeft ? row.rightWord : row.leftWord,
          }
        : null;
    const existing = entries.get(key);

    if (existing) {
      if (example) {
        existing.examples.push(example);
      }
    } else {
      entries.set(key, {
        word: row.word,
        cooccurrence: row.cooccurrence,
        significance: row.significance,
        section: row.section,
        examples: example ? [example] : [],
      });
    }
  }

  return Array.from(entries.values());
}

// Same shape as groupAdjacencyRows, but keyed by (nounLemmaId,
// adjectiveLemmaId): adjective_attributes' primary key already
// guarantees a (noun, adjective) pair is never ambiguous between the
// two query branches.
export function groupAdjectiveAttributeRows(
  rows: AdjectiveAttributeRow[],
  queryLemmaId: number,
): CollocationEntry[] {
  const entries = new Map<string, CollocationEntry>();

  for (const row of rows) {
    const key = `${row.nounLemmaId}-${row.adjectiveLemmaId}`;
    const isQueryNounSide = row.nounLemmaId === queryLemmaId;
    const example =
      row.sentence && row.nounSurface && row.adjectiveSurface
        ? {
            sentence: row.sentence,
            searchWord: isQueryNounSide ? row.nounSurface : row.adjectiveSurface,
            collocateWord: isQueryNounSide
              ? row.adjectiveSurface
              : row.nounSurface,
          }
        : null;
    const existing = entries.get(key);

    if (existing) {
      if (example) {
        existing.examples.push(example);
      }
    } else {
      entries.set(key, {
        word: row.word,
        cooccurrence: row.cooccurrence,
        significance: row.significance,
        section: row.section,
        examples: example ? [example] : [],
      });
    }
  }

  return Array.from(entries.values());
}

// One VerbNounPair per (relation, verb, prep, noun), its example rows
// folded in - rows arrive in display order. The searched side's surface
// is the example's searchWord.
export function groupLabVerbPairRows(
  rows: LabVerbPairRow[],
  side: PageSide,
): VerbNounPair[] {
  const pairs = new Map<string, VerbNounPair>();

  for (const row of rows) {
    const key = `${row.relation}\t${row.verb}\t${row.prep}\t${row.noun}`;
    let pair = pairs.get(key);
    if (!pair) {
      pair = {
        relation: row.relation,
        partner: side === "noun" ? row.verb : row.noun,
        chip: chipOf(side, row.relation, row.verb, row.phraseNoun, row.noun),
        phrase: phraseOf(row.relation, row.verb, row.phraseNoun, row.noun),
        score: row.score,
        frequency: row.pairFreq,
        examples: [],
      };
      pairs.set(key, pair);
    }
    if (row.sentence && row.verbSurface !== null && row.nounSurface !== null) {
      pair.examples.push({
        sentence: row.sentence,
        searchWord: side === "noun" ? row.nounSurface : row.verbSurface,
        collocateWord: side === "noun" ? row.verbSurface : row.nounSurface,
      });
    }
  }

  return Array.from(pairs.values());
}

/**
 * Sections adjective_attributes actually produced data for replace the
 * lemma_collocations-sourced section entirely (decision #54). Decision
 * #60: on a noun page the "verb" section, and on a verb page the "noun"
 * section, is the lab pairs' alone - the adjacency one never shows, even
 * when the lab has nothing for this word.
 */
export function mergeSections(
  adjacencyEntries: CollocationEntry[],
  attributeEntries: CollocationEntry[],
  side: PageSide | null,
): CollocationEntry[] {
  const supersededSections = new Set<CollocationSection>(
    attributeEntries.map((e) => e.section),
  );
  if (side === "noun") supersededSections.add("verb");
  if (side === "verb") supersededSections.add("noun");
  return [
    ...adjacencyEntries.filter((entry) => !supersededSections.has(entry.section)),
    ...attributeEntries,
  ];
}
