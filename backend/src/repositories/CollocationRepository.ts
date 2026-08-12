import { Pool } from "pg";
import type {
  CollocationLookup,
  CollocationRepository,
  CollocationRow,
} from "../contracts/CollocationRepository.ts";
import type { CollocationEntry } from "@collocations/types";

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
      this.#pool.query<CollocationRow>(
        `SELECT w2.word, c.cooccurrence, c.significance, s.sentence
        FROM collocations c
        JOIN words w1 ON w1.id = c.left_word_id
        JOIN words w2 ON w2.id = c.right_word_id
        LEFT JOIN collocation_examples ce
          ON ce.left_word_id = c.left_word_id and ce.right_word_id = c.right_word_id
        LEFT JOIN sentences s ON s.id = ce.sentence_id
        WHERE w1.word = $1
        ORDER BY c.significance DESC
        LIMIT 60`,
        [word],
      ),
      this.#pool.query<CollocationRow>(
        `SELECT w1.word, c.cooccurrence, c.significance
       FROM collocations c
       JOIN words w1 ON w1.id = c.left_word_id
       JOIN words w2 ON w2.id = c.right_word_id
LEFT JOIN collocation_examples ce
ON ce.left_word_id = c.left_word_id AND ce.right_word_id = c.right_word_id
       WHERE w2.word = $1
       ORDER BY c.significance DESC
       LIMIT 60`,
        [word],
      ),
    ]);
    return {
      wordId: wordRow.id,
      followedBy: groupRows(followedByResult.rows),
      precededBy: groupRows(precededByResult.rows),
    };
  }
}
