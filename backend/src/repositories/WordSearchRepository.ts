import { Pool } from "pg";
import type {
  WordSearchRepository,
  WordSearchResult,
} from "../contracts/WordSearchRepository.ts";

export class PgWordSearchRepository implements WordSearchRepository {
  #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async search(query: string, limit: number): Promise<WordSearchResult[]> {
    const result = await this.#pool.query<WordSearchResult>(
      `
SELECT word, frequency, score
FROM (
    SELECT DISTINCT ON (word_normalized)
           word,
           frequency,
           GREATEST(
               word_similarity(normalize_de($1), word_normalized),
               0.8 * word_similarity(fold_de($1), word_folded)
           ) AS score
    FROM   words
    WHERE  normalize_de($1) <% word_normalized
       OR  fold_de($1)      <% word_folded
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
