import { Pool } from "pg";
import type {
  CollocationLookup,
  CollocationRepository,
  CollocationRow,
} from "../contracts/CollocationRepository.ts";
import type { CollocationEntry } from "@collocations/types";

// Decision #36 (docs/decisions-33-35.md): a word's dominant POS tag is
// trusted for grouping only above this share; below it, the word falls
// through to the "other" section rather than being mis-labelled.
const DOMINANCE_THRESHOLD = 0.8;

// Cap per section, not on the flat result set - grouping happens before
// the cut so a section can't be starved by another section dominating
// the top of the significance ranking (see pos-tagging-session-notes.md,
// "LIMIT/pagination interaction").
const PER_SECTION_LIMIT = 10;

// Decision #43 (supersedes #42's per-section significance floors): raw
// `significance` is a chi-square-style statistic - it scales with raw
// frequency, so common function words (prepositions, copula/auxiliary
// verb forms) look "significant" with almost any content word purely by
// volume, even when the actual lexical association is weak ("Einsatz
// war" - "war" is just the copula "sein", not a real collocate).
// logDice (Rychlý 2008, Sketch Engine's default association measure)
// fixes this by normalizing against both words' own corpus frequency.
// 6.3 is the whole collocations table's own 75th-percentile logDice -
// confirmed empirically this cleanly separates flagged-bad pairs like
// "Einsatz war" (5.08) and "Einsatz am" (4.46) from strong ones like
// "Polizei am" (7.19) and "Angst vor" (8.20), and naturally suppresses
// AUX/copula noise without any stopword list (only 2.4% of AUX-tagged
// partners clear this floor, vs 29.0% of true VERB partners) - see
// docs/decisions-43.md.
const MIN_LOG_DICE = 6.3;

// Repeated verbatim inside the same query (Postgres window functions
// can't reference a SELECT-list alias in PARTITION BY), so it's kept as
// a single JS constant rather than two copies that could drift.
const SECTION_CASE = `
  CASE
    WHEN wdp.share IS NULL THEN 'other'
    WHEN wdp.pos = 'NOUN' THEN 'noun'
    WHEN wdp.pos IN ('VERB', 'AUX') THEN 'verb'
    WHEN wdp.pos = 'ADJ' THEN 'adjective'
    WHEN wdp.pos = 'ADP' THEN 'preposition'
    ELSE 'other'
  END
`;

/**
 * Builds one direction's branch: fixedSide is the side holding the
 * queried word, the other side is the "partner" whose dominant POS
 * drives the section. No direction is exposed in the output - this is
 * combined with the other branch in COLLOCATIONS_QUERY below, so a
 * word is shown regardless of whether it's the corpus's left or right
 * neighbor of the queried word.
 */
function buildBranchQuery(fixedSide: "left" | "right"): string {
  const partnerWord = fixedSide === "left" ? "w2.word" : "w1.word";
  const fixedWord = fixedSide === "left" ? "w1.word" : "w2.word";
  const partnerId = fixedSide === "left" ? "w2.id" : "w1.id";

  return `
    SELECT
      c.left_word_id,
      c.right_word_id,
      ${partnerWord} AS word,
      c.cooccurrence,
      c.significance,
      14 + log(2, 2.0 * c.cooccurrence / (w1.frequency + w2.frequency)) AS log_dice,
      ${SECTION_CASE} AS section
    FROM collocations c
    JOIN words w1 ON w1.id = c.left_word_id
    JOIN words w2 ON w2.id = c.right_word_id
    LEFT JOIN word_dominant_pos wdp
      ON wdp.word_id = ${partnerId} AND wdp.share >= ${DOMINANCE_THRESHOLD}
    WHERE ${fixedWord} = $1
  `;
}

// Ranking happens once, over both directions combined - over the
// distinct (left_word_id, right_word_id) pairs, before the example
// sentences join, which can multiply rows per pair and would
// otherwise skew ROW_NUMBER().
const COLLOCATIONS_QUERY = `
  WITH combined AS (
    ${buildBranchQuery("left")}
    UNION ALL
    ${buildBranchQuery("right")}
  ),
  ranked AS (
    SELECT *,
      ROW_NUMBER() OVER (PARTITION BY section ORDER BY log_dice DESC) AS rn
    FROM combined
  )
  SELECT r.left_word_id AS "leftWordId", r.right_word_id AS "rightWordId",
    r.word, r.cooccurrence, r.significance, r.section, s.sentence
  FROM ranked r
  LEFT JOIN collocation_examples ce
    ON ce.left_word_id = r.left_word_id AND ce.right_word_id = r.right_word_id
  LEFT JOIN sentences s ON s.id = ce.sentence_id
  WHERE r.rn <= ${PER_SECTION_LIMIT}
    AND r.log_dice >= ${MIN_LOG_DICE}
  ORDER BY r.log_dice DESC
`;

// Keyed by (left_word_id, right_word_id), not by word text - the same
// partner word can appear via two distinct pairs now that both
// directions are combined (e.g. "X folgt Y" and "Y folgt X" both
// significant), and each pair has its own cooccurrence/significance.
// Keying by word text would silently mix example sentences from two
// unrelated pairs under one entry.
function groupRows(rows: CollocationRow[]): CollocationEntry[] {
  const entries = new Map<string, CollocationEntry>();

  for (const row of rows) {
    const key = `${row.leftWordId}-${row.rightWordId}`;
    const existing = entries.get(key);

    if (existing) {
      if (row.sentence) {
        existing.examples.push(row.sentence);
      }
    } else {
      entries.set(key, {
        word: row.word,
        cooccurrence: row.cooccurrence,
        significance: row.significance,
        section: row.section,
        examples: row.sentence ? [row.sentence] : [],
      });
    }
  }

  return Array.from(entries.values());
}

export class PgCollocationRepository implements CollocationRepository {
  #pool: Pool;
  constructor(pool: Pool) {
    this.#pool = pool;
  }
  async findByWord(word: string): Promise<CollocationLookup | null> {
    const wordResult = await this.#pool.query<{ id: number }>(
      "SELECT * FROM words WHERE word = $1",
      [word],
    );

    const wordRow = wordResult.rows[0];
    if (!wordRow) return null;

    const result = await this.#pool.query<CollocationRow>(COLLOCATIONS_QUERY, [word]);
    return {
      wordId: wordRow.id,
      collocations: groupRows(result.rows),
    };
  }
}
