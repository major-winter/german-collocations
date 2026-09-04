import { Pool } from "pg";
import type {
  CollocationLookup,
  CollocationRepository,
  CollocationRow,
} from "../contracts/CollocationRepository.ts";
import type { CollocationEntry } from "@collocations/types";

// Decision #36 (docs/decisions-33-35.md), now applied at lemma
// granularity (lemma_dominant_pos, decision #44): a lemma's dominant
// POS tag is trusted for grouping only above this share; below it, the
// lemma falls through to the "other" section rather than being
// mis-labelled.
const DOMINANCE_THRESHOLD = 0.8;

// Cap per section, not on the flat result set - grouping happens before
// the cut so a section can't be starved by another section dominating
// the top of the ranking (see pos-tagging-session-notes.md,
// "LIMIT/pagination interaction").
const PER_SECTION_LIMIT = 10;

// Decision #43: logDice (Rychlý 2008) instead of raw significance -
// normalizes against both lemmas' own corpus frequency, which is what
// stops common function words from looking "significant" with almost
// any content word purely by volume. 6.3 is the collocations table's
// own 75th-percentile logDice, established at surface-form granularity
// in decision #43 and re-verified (not re-derived) at lemma granularity
// in decision #44 - see that decision for the re-verification numbers.
const MIN_LOG_DICE = 6.3;

// Repeated verbatim inside the same query (Postgres window functions
// can't reference a SELECT-list alias in PARTITION BY), so it's kept as
// a single JS constant rather than two copies that could drift.
const SECTION_CASE = `
  CASE
    WHEN ldp.share IS NULL THEN 'other'
    WHEN ldp.pos = 'NOUN' THEN 'noun'
    WHEN ldp.pos IN ('VERB', 'AUX') THEN 'verb'
    WHEN ldp.pos = 'ADJ' THEN 'adjective'
    WHEN ldp.pos = 'ADP' THEN 'preposition'
    ELSE 'other'
  END
`;

/**
 * Builds one direction's branch: fixedSide is the side holding the
 * queried lemma, the other side is the "partner" whose dominant POS
 * drives the section. No direction is exposed in the output - this is
 * combined with the other branch in COLLOCATIONS_QUERY below, so a
 * lemma is shown regardless of whether it's the corpus's left or right
 * neighbor of the queried lemma.
 *
 * Decision #44: operates on lemma_collocations/lemmas (re-derived
 * directly from the corpus), not the surface-form-keyed
 * collocations/words - see that decision for why. $1 is now a
 * lemma_id, not a word string.
 */
function buildBranchQuery(fixedSide: "left" | "right"): string {
  const partnerLemmaText = fixedSide === "left" ? "l2.lemma" : "l1.lemma";
  const fixedId = fixedSide === "left" ? "lc.left_lemma_id" : "lc.right_lemma_id";
  const partnerId = fixedSide === "left" ? "lc.right_lemma_id" : "lc.left_lemma_id";

  return `
    SELECT
      lc.left_lemma_id,
      lc.right_lemma_id,
      ${partnerLemmaText} AS word,
      lc.cooccurrence,
      -- log() returns numeric, which node-postgres parses as a string
      -- (to avoid float precision loss) - cast to real so it comes back
      -- as a JS number, same as the old significance column did.
      (14 + log(2, 2.0 * lc.cooccurrence / (fixed_freq.frequency + partner_freq.frequency)))::real AS log_dice,
      ${SECTION_CASE} AS section
    FROM lemma_collocations lc
    JOIN lemmas l1 ON l1.id = lc.left_lemma_id
    JOIN lemmas l2 ON l2.id = lc.right_lemma_id
    JOIN lemma_frequency fixed_freq ON fixed_freq.lemma_id = ${fixedId}
    JOIN lemma_frequency partner_freq ON partner_freq.lemma_id = ${partnerId}
    LEFT JOIN lemma_dominant_pos ldp
      ON ldp.lemma_id = ${partnerId} AND ldp.share >= ${DOMINANCE_THRESHOLD}
    WHERE ${fixedId} = $1
  `;
}

// Ranking happens once, over both directions combined - over the
// distinct (left_lemma_id, right_lemma_id) pairs, before the example
// sentences join, which can multiply rows per pair and would
// otherwise skew ROW_NUMBER().
//
// Example sentences: collocation_examples (decision #41) stays keyed by
// surface-form (left_word_id, right_word_id) pairs - no re-run of that
// extraction was needed. The LATERAL join here widens the match to
// every underlying surface-form pair whose word_dominant_lemma
// resolves to this ranked row's exact (left_lemma_id, right_lemma_id) -
// e.g. a merged "Einsatz"+"kommen" entry can surface an example
// originally captured under the "Einsatz"/"kam" surface pair. LATERAL
// (not a precomputed CTE joined post-hoc) so each lookup is scoped to
// one specific lemma pair via an indexed equality, rather than joining
// the full collocation_examples table before filtering.
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
  SELECT r.left_lemma_id AS "leftLemmaId", r.right_lemma_id AS "rightLemmaId",
    r.word, r.cooccurrence, r.log_dice AS significance, r.section,
    ex.sentence, ex."leftWord", ex."rightWord"
  FROM ranked r
  LEFT JOIN LATERAL (
    -- wl/wr are the literal surface-form words behind this specific
    -- example's (left_word_id, right_word_id) - not necessarily r.word,
    -- since this join already widens past the exact surface pair the
    -- lemma was ranked under (see comment above). Returned alongside
    -- the sentence so the frontend can highlight the words that
    -- actually appear in it, not the lemma text.
    SELECT s.sentence, wl.word AS "leftWord", wr.word AS "rightWord"
    FROM collocation_examples ce
    JOIN word_dominant_lemma wdl_l
      ON wdl_l.word_id = ce.left_word_id AND wdl_l.lemma_id = r.left_lemma_id
    JOIN word_dominant_lemma wdl_r
      ON wdl_r.word_id = ce.right_word_id AND wdl_r.lemma_id = r.right_lemma_id
    JOIN sentences s ON s.id = ce.sentence_id
    JOIN words wl ON wl.id = ce.left_word_id
    JOIN words wr ON wr.id = ce.right_word_id
    ORDER BY s.id
    LIMIT 3
  ) ex ON true
  WHERE r.rn <= ${PER_SECTION_LIMIT}
    AND r.log_dice >= ${MIN_LOG_DICE}
  ORDER BY r.log_dice DESC
`;

// Keyed by (left_lemma_id, right_lemma_id), not by word text - the same
// partner lemma can appear via two distinct pairs now that both
// directions are combined (e.g. "X folgt Y" and "Y folgt X" both
// significant), and each pair has its own cooccurrence/logDice.
// Keying by word text would silently mix example sentences from two
// unrelated pairs under one entry.
// queryLemmaId picks out, per row, which of leftWord/rightWord is the
// surface form of the word the user looked up vs. its collocate - by
// lemma id, not by string equality against `word`, since either side's
// literal surface form can differ from its own lemma's spelling (the
// same divergence documented above for the LATERAL join).
function groupRows(rows: CollocationRow[], queryLemmaId: number): CollocationEntry[] {
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

export class PgCollocationRepository implements CollocationRepository {
  #pool: Pool;
  constructor(pool: Pool) {
    this.#pool = pool;
  }
  async findByWord(word: string): Promise<CollocationLookup | null> {
    const wordResult = await this.#pool.query<{ id: number }>(
      "SELECT id FROM words WHERE word = $1",
      [word],
    );

    const wordRow = wordResult.rows[0];
    if (!wordRow) return null;

    // A word can be missing a lemma mapping if extract_lemmas.py's
    // corpus scan never produced a row for it (e.g. only ever appeared
    // as punctuation-adjacent noise) - degrade to an empty result
    // rather than erroring, same tolerant-of-gaps spirit as the rest of
    // this pipeline (load-lemmas.ts skips unmatched rows instead of
    // failing).
    const lemmaResult = await this.#pool.query<{ lemma_id: number }>(
      "SELECT lemma_id FROM word_dominant_lemma WHERE word_id = $1",
      [wordRow.id],
    );

    const lemmaRow = lemmaResult.rows[0];
    if (!lemmaRow) return { wordId: wordRow.id, collocations: [] };

    const result = await this.#pool.query<CollocationRow>(COLLOCATIONS_QUERY, [
      lemmaRow.lemma_id,
    ]);
    return {
      wordId: wordRow.id,
      collocations: groupRows(result.rows, lemmaRow.lemma_id),
    };
  }
}
