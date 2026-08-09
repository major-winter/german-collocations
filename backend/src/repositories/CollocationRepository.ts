import { Pool } from "pg";
import type {
  CollocationLookup,
  CollocationRepository,
  CollocationRow,
} from "../contracts/CollocationRepository.ts";

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
      this.#pool.query<CollocationRow>(
        `SELECT w2.word, c.cooccurrence, c.significance
        FROM collocations c
        JOIN words w1 ON w1.id = c.left_word_id
        JOIN words w2 ON w2.id = c.right_word_id
        WHERE w1.word = $1
        ORDER BY c.significance DESC
        LIMIT 20`,
        [word],
      ),
      this.#pool.query<CollocationRow>(
        `SELECT w1.word, c.cooccurrence, c.significance
       FROM collocations c
       JOIN words w1 ON w1.id = c.left_word_id
       JOIN words w2 ON w2.id = c.right_word_id
       WHERE w2.word = $1
       ORDER BY c.significance DESC
       LIMIT 20`,
        [word],
      ),
    ]);
    return {
      wordId: wordRow.id,
      followedBy: followedByResult.rows,
      precededBy: precededByResult.rows,
    };
  }
}
