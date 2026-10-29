// Parsing for the two files `colloc export` (collocation-lab) writes -
// decision #60, docs/decisions.md. Both are tab-separated, no header:
//
//   lab_verb_pairs.tsv          relation verb prep noun phrase_noun score pair_freq
//   lab_verb_pair_examples.tsv  relation verb prep noun rank sentence verb_surface noun_surface
//
// prep is empty unless relation is 'obl'. A malformed line parses to
// null; load-lab-verb-pairs.ts counts those and refuses the whole load
// when there are too many (assertLoadable), rather than half-replacing
// the live pairs with a truncated or garbled export.

export const RELATIONS = ['obj', 'obl', 'nsubj'] as const;
export type Relation = (typeof RELATIONS)[number];

export interface LabVerbPairRow {
  relation: Relation;
  verb: string;
  prep: string;
  noun: string;
  phraseNoun: string;
  score: number;
  pairFreq: number;
}

export interface LabVerbPairExampleRow {
  relation: Relation;
  verb: string;
  prep: string;
  noun: string;
  rank: number;
  sentence: string;
  verbSurface: string;
  nounSurface: string;
}

// Above this share of malformed lines the export is treated as broken.
const MAX_MALFORMED_SHARE = 0.01;

function isRelation(value: string): value is Relation {
  return (RELATIONS as readonly string[]).includes(value);
}

function parseInteger(value: string): number | null {
  return /^\d+$/.test(value) ? Number.parseInt(value, 10) : null;
}

function parseScore(value: string): number | null {
  const score = Number(value);
  return value.trim() !== '' && Number.isFinite(score) ? score : null;
}

export function parsePairLine(line: string): LabVerbPairRow | null {
  const fields = line.split('\t');
  if (fields.length !== 7) return null;

  const [relation, verb, prep, noun, phraseNoun, scoreText, pairFreqText] = fields;
  const score = parseScore(scoreText);
  const pairFreq = parseInteger(pairFreqText);
  if (!isRelation(relation) || !verb || !noun || score === null || pairFreq === null) return null;

  return { relation, verb, prep, noun, phraseNoun, score, pairFreq };
}

export function parseExampleLine(line: string): LabVerbPairExampleRow | null {
  const fields = line.split('\t');
  if (fields.length !== 8) return null;

  const [relation, verb, prep, noun, rankText, sentence, verbSurface, nounSurface] = fields;
  const rank = parseInteger(rankText);
  if (!isRelation(relation) || !verb || !noun || rank === null || !sentence) return null;

  return { relation, verb, prep, noun, rank, sentence, verbSurface, nounSurface };
}

/** Throws unless the pairs file is worth replacing the live pairs with. */
export function assertLoadable(pairCount: number, malformedCount: number): void {
  if (pairCount === 0) {
    throw new Error('no pairs in the export - refusing to replace the live pairs');
  }
  if (malformedCount > pairCount * MAX_MALFORMED_SHARE) {
    throw new Error(
      `${malformedCount.toLocaleString()} malformed lines against ${pairCount.toLocaleString()} pairs ` +
        `(over ${MAX_MALFORMED_SHARE * 100}%) - refusing to load a broken export`,
    );
  }
}
