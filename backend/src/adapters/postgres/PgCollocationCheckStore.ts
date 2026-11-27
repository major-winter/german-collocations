import type { Pool } from "pg";
import type { AdjectiveLemma, CollocationCheckStore } from "../../application/ports/out/CollocationCheckStore.ts";
import type { Headword } from "../../application/ports/out/CollocationStore.ts";
import { MIN_ADJECTIVE_PAIR_COUNT, type AdjectiveCounts, type AdjectiveCount, type WrittenForm } from "../../domain/adjectiveCheck.ts";
import type { CheckPair, VerbCandidate } from "../../domain/collocationCheck.ts";
import { resolveHeadword } from "./headword.ts";

// Driven adapter for the collocation check (#70).

// Verb forms come from the lab's example sentences (indexed on
// verb_surface, migration 017). A lemma typed as such ("fällen") counts
// even without an example using that exact form.
const VERB_CANDIDATES_QUERY = `
  SELECT verb, count(*)::int AS uses
  FROM lab_verb_pair_examples
  WHERE verb_surface = $1
  GROUP BY verb
  UNION ALL
  SELECT DISTINCT verb, 0
  FROM lab_verb_pairs
  WHERE verb = $1 OR verb = 'sich ' || $1
`;

// All of a noun's object pairs, best-first. subjectScore is the same verb
// + noun as a subject pair (primary-key lookup). The verb's object share
// scans that verb's rows, so it is only computed where the subject-error
// filter can apply at all: subjectScore > score.
const OBJECT_PAIRS_QUERY = `
  WITH obj AS (
    SELECT o.verb, o.noun, o.phrase_noun, o.score,
      (SELECT s.score FROM lab_verb_pairs s
       WHERE s.relation = 'nsubj' AND s.verb = o.verb AND s.prep = '' AND s.noun = o.noun) AS subject_score
    FROM lab_verb_pairs o
    WHERE o.relation = 'obj' AND o.noun = $1
  )
  SELECT verb, noun, phrase_noun AS "phraseNoun", score, subject_score AS "subjectScore",
    CASE WHEN subject_score > score THEN (
      SELECT (sum(v.pair_freq) FILTER (WHERE v.relation = 'obj'))::real
        / nullif(sum(v.pair_freq) FILTER (WHERE v.relation IN ('obj', 'nsubj')), 0)
      FROM lab_verb_pairs v
      WHERE v.verb = obj.verb
    ) END AS "verbObjectShare"
  FROM obj
  ORDER BY score DESC, verb
`;

// Decision #74. A typed adjective form ("hohe") through its lemmas
// (word_lemmas, not only the dominant one: "lange" is mostly the adverb
// "lange", but as an attribute it is "lang"). Of the lemmas that modify
// some noun attributively, the one with the largest attributive total
// wins; the noun is not looked at (the #70 lesson). The attributive check
// also keeps most nouns and verbs out.
const ADJECTIVE_LEMMA_QUERY = `
  SELECT id, lemma FROM (
    SELECT l.id, l.lemma,
      (SELECT sum(aa.count) FROM adjective_attributes aa WHERE aa.adjective_lemma_id = l.id) AS total
    FROM words w
    JOIN word_lemmas wl ON wl.word_id = w.id
    JOIN lemmas l ON l.id = wl.lemma_id
    WHERE w.word = $1
  ) candidates
  WHERE total IS NOT NULL
  ORDER BY total DESC, lemma
  LIMIT 1
`;

// The inputs of the attributive logDice (#74): the noun's total over all
// its adjectives (no floor; a scalar CTE, computed once - the #54 lesson,
// no LATERAL), and per pair the adjective's total over all nouns. Only the
// frequent pairs and the typed one: the f_adj subquery scans every row of
// the adjective (10,016 for "neu"), so the largest nouns ("Mann", 118
// pairs) take ~20-30 ms warm, a typical noun ("Regen") ~4 ms.
const ADJECTIVE_COUNTS_QUERY = `
  WITH noun_total AS MATERIALIZED (
    SELECT coalesce(sum(count), 0)::int AS total FROM adjective_attributes WHERE noun_lemma_id = $1
  )
  SELECT noun_total.total AS "nounTotal", aa.adjective_lemma_id AS "adjectiveId", l.lemma AS adjective,
    aa.count,
    (SELECT sum(a.count)::int FROM adjective_attributes a
     WHERE a.adjective_lemma_id = aa.adjective_lemma_id) AS "adjectiveTotal"
  FROM noun_total
  LEFT JOIN adjective_attributes aa
    ON aa.noun_lemma_id = $1 AND (aa.count >= $3 OR aa.adjective_lemma_id = $2)
  LEFT JOIN lemmas l ON l.id = aa.adjective_lemma_id
`;

// Each pair's written forms with how many examples use them; the domain
// picks the one to show (bestWrittenForm). An adjective capitalised only
// because it starts the sentence counts lowercase; "Erste Hilfe" inside a
// sentence keeps its capital.
const WRITTEN_FORMS_QUERY = `
  SELECT adjective_lemma_id AS "adjectiveId",
    CASE WHEN starts_with(sentence, adjective_surface) THEN lower(adjective_surface)
         ELSE adjective_surface END AS "adjectiveWord",
    noun_surface AS "nounWord",
    count(*)::int AS examples
  FROM adjective_attribute_examples
  WHERE noun_lemma_id = $1 AND adjective_lemma_id = ANY($2::int[])
  GROUP BY 1, 2, 3
`;

export class PgCollocationCheckStore implements CollocationCheckStore {
  #pool: Pool;
  constructor(pool: Pool) {
    this.#pool = pool;
  }

  resolveHeadword(word: string): Promise<Headword | null> {
    return resolveHeadword(this.#pool, word);
  }

  async findVerbCandidates(surface: string): Promise<VerbCandidate[]> {
    const result = await this.#pool.query<VerbCandidate>(VERB_CANDIDATES_QUERY, [surface]);
    return result.rows;
  }

  async findObjectPairs(noun: string): Promise<CheckPair[]> {
    const result = await this.#pool.query<CheckPair>(OBJECT_PAIRS_QUERY, [noun]);
    return result.rows;
  }

  async findAdjectiveLemma(surface: string): Promise<AdjectiveLemma | null> {
    const result = await this.#pool.query<AdjectiveLemma>(ADJECTIVE_LEMMA_QUERY, [surface]);
    return result.rows[0] ?? null;
  }

  async findAdjectiveCounts(nounLemmaId: number, adjectiveLemmaId: number): Promise<AdjectiveCounts> {
    const result = await this.#pool.query<{ nounTotal: number } & { [K in keyof AdjectiveCount]: AdjectiveCount[K] | null }>(
      ADJECTIVE_COUNTS_QUERY,
      [nounLemmaId, adjectiveLemmaId, MIN_ADJECTIVE_PAIR_COUNT],
    );
    const pairs: AdjectiveCount[] = [];
    for (const row of result.rows) {
      if (row.adjectiveId === null) continue; // the noun has no such pairs
      pairs.push({
        adjectiveId: row.adjectiveId,
        adjective: row.adjective!,
        count: row.count!,
        adjectiveTotal: row.adjectiveTotal!,
      });
    }
    return { nounTotal: result.rows[0]?.nounTotal ?? 0, pairs };
  }

  async findWrittenForms(nounLemmaId: number, adjectiveLemmaIds: number[]): Promise<WrittenForm[]> {
    const result = await this.#pool.query<WrittenForm>(WRITTEN_FORMS_QUERY, [nounLemmaId, adjectiveLemmaIds]);
    return result.rows;
  }
}
