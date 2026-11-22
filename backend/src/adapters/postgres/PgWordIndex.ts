import { Pool } from "pg";
import type { WordSuggestion } from "@collocations/types";
import type { WordIndex } from "../../application/ports/WordIndex.ts";

// Driven adapter: pg_trgm fuzzy search over words.
export class PgWordIndex implements WordIndex {
  #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async search(query: string, limit: number): Promise<WordSuggestion[]> {
    const result = await this.#pool.query<WordSuggestion>(
      `
SELECT word, frequency, score
FROM (
    SELECT DISTINCT ON (word_normalized)
           word,
           frequency,
           GREATEST(
               similarity(word_normalized, normalize_de($1)),
               0.8 * similarity(word_folded, fold_de($1))
           ) AS score
    FROM   words
    WHERE  word_normalized % normalize_de($1)
       OR  word_folded     % fold_de($1)
    ORDER  BY word_normalized, frequency DESC
) candidates
ORDER BY score * ln(frequency + 1) DESC
LIMIT $2;
`,
      [query, limit],
    );
    return result.rows;
  }
}
