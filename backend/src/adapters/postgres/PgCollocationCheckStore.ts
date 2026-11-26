import type { Pool } from "pg";
import type { CollocationCheckStore } from "../../application/ports/out/CollocationCheckStore.ts";
import type { Headword } from "../../application/ports/out/CollocationStore.ts";
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
}
