import type { Pool } from "pg";
import type { Headword } from "../../application/ports/out/CollocationStore.ts";

// One query for the searched word's dominant lemma and POS. The POS is a
// correlated subquery, not a join: joining the DISTINCT ON view
// word_dominant_pos made Postgres materialize all of it (289 ms against
// 0.16 ms, EXPLAIN ANALYZE in decision #68; database/CLAUDE.md pitfall 3).
const HEADWORD_QUERY = `
  SELECT wdl.lemma_id AS "lemmaId", l.lemma AS "lemmaText",
    (SELECT wdp.pos FROM word_dominant_pos wdp WHERE wdp.word_id = w.id) AS pos
  FROM words w
  LEFT JOIN word_dominant_lemma wdl ON wdl.word_id = w.id
  LEFT JOIN lemmas l ON l.id = wdl.lemma_id
  WHERE w.word = $1
`;

/** Shared by PgCollocationStore and PgCollocationCheckStore. */
export async function resolveHeadword(pool: Pool, word: string): Promise<Headword | null> {
  const result = await pool.query<{
    lemmaId: number | null;
    lemmaText: string | null;
    pos: string | null;
  }>(HEADWORD_QUERY, [word]);
  const row = result.rows[0];
  if (!row) return null;
  return {
    lemma: row.lemmaId !== null && row.lemmaText !== null ? { id: row.lemmaId, text: row.lemmaText } : null,
    pos: row.pos,
  };
}
