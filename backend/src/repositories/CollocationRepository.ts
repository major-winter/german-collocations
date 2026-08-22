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
 * Builds the directional collocation query.
 *
 * fixedSide is the side holding the queried word (constant across all
 * result rows); the other side is the "partner" whose dominant POS
 * drives the section. Ranking happens in the `ranked` CTE, over the
 * distinct (left_word_id, right_word_id) pairs - before the example
 * sentences join, which can multiply rows per pair and would otherwise
 * skew ROW_NUMBER().
 */
function buildDirectionalQuery(fixedSide: "left" | "right"): string {
  const partnerWord = fixedSide === "left" ? "w2.word" : "w1.word";
  const fixedWord = fixedSide === "left" ? "w1.word" : "w2.word";
  const partnerId = fixedSide === "left" ? "w2.id" : "w1.id";

  return `
    WITH ranked AS (
      SELECT
        c.left_word_id,
        c.right_word_id,
        ${partnerWord} AS word,
        c.cooccurrence,
        c.significance,
        ${SECTION_CASE} AS section,
        ROW_NUMBER() OVER (
          PARTITION BY ${SECTION_CASE}
          ORDER BY c.significance DESC
        ) AS rn
      FROM collocations c
      JOIN words w1 ON w1.id = c.left_word_id
      JOIN words w2 ON w2.id = c.right_word_id
      LEFT JOIN word_dominant_pos wdp
        ON wdp.word_id = ${partnerId} AND wdp.share >= ${DOMINANCE_THRESHOLD}
      WHERE ${fixedWord} = $1
    )
    SELECT r.word, r.cooccurrence, r.significance, r.section, s.sentence
    FROM ranked r
    LEFT JOIN collocation_examples ce
      ON ce.left_word_id = r.left_word_id AND ce.right_word_id = r.right_word_id
    LEFT JOIN sentences s ON s.id = ce.sentence_id
    WHERE r.rn <= ${PER_SECTION_LIMIT}
    ORDER BY r.significance DESC
  `;
}

const FOLLOWED_BY_QUERY = buildDirectionalQuery("left");
const PRECEDED_BY_QUERY = buildDirectionalQuery("right");

function groupRows(rows: CollocationRow[]): CollocationEntry[] {
  const entries = new Map<string, CollocationEntry>();

  for (const row of rows) {
    const existing = entries.get(row.word);

    if (existing) {
      if (row.sentence) {
        existing.examples.push(row.sentence);
      }
    } else {
      entries.set(row.word, {
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

    const [followedByResult, precededByResult] = await Promise.all([
      this.#pool.query<CollocationRow>(FOLLOWED_BY_QUERY, [word]),
      this.#pool.query<CollocationRow>(PRECEDED_BY_QUERY, [word]),
    ]);
    return {
      wordId: wordRow.id,
      followedBy: groupRows(followedByResult.rows),
      precededBy: groupRows(precededByResult.rows),
    };
  }
}
