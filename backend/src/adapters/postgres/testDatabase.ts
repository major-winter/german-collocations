import { spawnSync } from "node:child_process";
import path from "node:path";
import { Client, Pool } from "pg";

// Decision #67: database tests run against a throwaway database next to the
// dev one, in the same Postgres container. It is dropped, re-created and
// migrated once per run, and emptied between tests. The name must end in
// "_test", so a mistyped URL can never wipe the dev data.

const MIGRATE_SCRIPT = path.join(import.meta.dirname, "../../../../database/src/migrate.ts");

function testDatabaseUrl(): URL {
  const configured =
    process.env.TEST_DATABASE_URL ??
    (process.env.DB_PASSWORD
      ? `postgres://app:${process.env.DB_PASSWORD}@localhost:5432/collocations_test`
      : undefined);
  if (!configured) {
    throw new Error("set TEST_DATABASE_URL (or DB_PASSWORD in .env) to run the database tests");
  }
  const url = new URL(configured);
  if (!url.pathname.endsWith("_test")) {
    throw new Error(`refusing to use ${url.pathname.slice(1)}: a test database name must end in "_test"`);
  }
  return url;
}

export interface TestDatabase {
  pool: Pool;
  /** Empties every table, so each test starts from nothing. */
  reset(): Promise<void>;
  close(): Promise<void>;
}

export async function openTestDatabase(): Promise<TestDatabase> {
  const url = testDatabaseUrl();
  const name = url.pathname.slice(1);

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }

  const migrate = spawnSync(process.execPath, [MIGRATE_SCRIPT], {
    env: { ...process.env, DATABASE_URL: url.toString() },
    encoding: "utf8",
  });
  if (migrate.status !== 0) {
    throw new Error(`migrations failed:\n${migrate.stdout}\n${migrate.stderr}`);
  }

  const pool = new Pool({ connectionString: url.toString() });
  const { rows } = await pool.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'",
  );
  const truncate = `TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`;

  return {
    pool,
    reset: async () => {
      await pool.query(truncate);
    },
    close: () => pool.end(),
  };
}

interface WordOptions {
  lemma?: string;        // defaults to the word itself
  pos?: string;          // dominant POS of the word and its lemma; none if left out
  posShare?: number;     // share of that POS, default 1
  frequency?: number;    // word and lemma frequency, default 100
}

interface LabPairOptions {
  relation?: "obj" | "obl" | "nsubj";
  prep?: string;
  phraseNoun?: string;   // defaults to the noun
  score?: number;
  pairFreq?: number;
}

/**
 * Writes the few rows a test needs, by word text instead of ids. Each
 * helper fills every table the lookup reads for that one fact.
 */
export function seeder(pool: Pool) {
  let nextWordId = 1;
  let nextSentenceId = 1;
  const wordIds = new Map<string, number>();
  const lemmaIds = new Map<string, number>();

  async function lemmaId(text: string, pos: string | undefined, share: number, frequency: number) {
    const known = lemmaIds.get(text);
    if (known !== undefined) return known;
    const { rows } = await pool.query<{ id: number }>(
      "INSERT INTO lemmas (lemma) VALUES ($1) RETURNING id",
      [text],
    );
    const id = rows[0].id;
    lemmaIds.set(text, id);
    await pool.query("INSERT INTO lemma_frequency (lemma_id, frequency) VALUES ($1, $2)", [id, frequency]);
    if (pos) {
      await pool.query(
        "INSERT INTO lemma_dominant_pos (lemma_id, pos, count, share) VALUES ($1, $2, 10, $3)",
        [id, pos, share],
      );
    }
    return id;
  }

  function idOf(map: Map<string, number>, text: string): number {
    const id = map.get(text);
    if (id === undefined) throw new Error(`seed "${text}" with word() first`);
    return id;
  }

  return {
    /** A corpus word, mapped to its lemma, with an optional dominant POS. */
    async word(text: string, options: WordOptions = {}): Promise<void> {
      const { lemma = text, pos, posShare = 1, frequency = 100 } = options;
      const id = nextWordId++;
      wordIds.set(text, id);
      await pool.query("INSERT INTO words (id, word, frequency) VALUES ($1, $2, $3)", [id, text, frequency]);
      const lemmaRowId = await lemmaId(lemma, pos, posShare, frequency);
      await pool.query(
        "INSERT INTO word_dominant_lemma (word_id, lemma_id, count, share) VALUES ($1, $2, 10, 1)",
        [id, lemmaRowId],
      );
      await pool.query("INSERT INTO word_lemmas (word_id, lemma_id, count) VALUES ($1, $2, 10)", [id, lemmaRowId]);
      if (pos) {
        await pool.query("INSERT INTO word_pos (word_id, pos, count) VALUES ($1, $2, 10)", [id, pos]);
      }
    },

    /** A further, non-dominant lemma of a seeded word ("lange" -> "lang"); the lemma must exist. */
    async wordLemma(text: string, lemma: string, count: number): Promise<void> {
      await pool.query("INSERT INTO word_lemmas (word_id, lemma_id, count) VALUES ($1, $2, $3)", [
        idOf(wordIds, text),
        idOf(lemmaIds, lemma),
        count,
      ]);
    },

    /** Two lemmas seen next to each other, left then right. */
    async collocation(left: string, right: string, cooccurrence: number): Promise<void> {
      await pool.query(
        "INSERT INTO lemma_collocations (left_lemma_id, right_lemma_id, cooccurrence) VALUES ($1, $2, $3)",
        [idOf(lemmaIds, left), idOf(lemmaIds, right), cooccurrence],
      );
    },

    /** An example sentence for two adjacent surface words. */
    async collocationExample(leftWord: string, rightWord: string, sentence: string): Promise<void> {
      const left = idOf(wordIds, leftWord);
      const right = idOf(wordIds, rightWord);
      const sentenceId = nextSentenceId++;
      await pool.query(
        `INSERT INTO collocations (left_word_id, right_word_id, cooccurrence, significance)
         VALUES ($1, $2, 1, 0) ON CONFLICT DO NOTHING`,
        [left, right],
      );
      await pool.query("INSERT INTO sentences (id, sentence) VALUES ($1, $2)", [sentenceId, sentence]);
      await pool.query(
        "INSERT INTO collocation_examples (left_word_id, right_word_id, sentence_id) VALUES ($1, $2, $3)",
        [left, right, sentenceId],
      );
    },

    /** An adjective seen modifying a noun ("scharfe Kritik"), by lemma. */
    async adjectiveAttribute(noun: string, adjective: string, count: number): Promise<void> {
      await pool.query(
        "INSERT INTO adjective_attributes (noun_lemma_id, adjective_lemma_id, count) VALUES ($1, $2, $3)",
        [idOf(lemmaIds, noun), idOf(lemmaIds, adjective), count],
      );
    },

    async adjectiveAttributeExample(
      noun: string,
      adjective: string,
      sentence: string,
      surfaces: { noun: string; adjective: string },
    ): Promise<void> {
      await pool.query(
        `INSERT INTO adjective_attribute_examples
           (noun_lemma_id, adjective_lemma_id, sentence, noun_surface, adjective_surface)
         VALUES ($1, $2, $3, $4, $5)`,
        [idOf(lemmaIds, noun), idOf(lemmaIds, adjective), sentence, surfaces.noun, surfaces.adjective],
      );
    },

    /** A collocation-lab verb–noun pair, by lemma text (the lab has no ids). */
    async labPair(verb: string, noun: string, options: LabPairOptions = {}): Promise<void> {
      const { relation = "obj", prep = "", phraseNoun = noun, score = 10, pairFreq = 5 } = options;
      await pool.query(
        `INSERT INTO lab_verb_pairs (relation, verb, prep, noun, phrase_noun, score, pair_freq)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [relation, verb, prep, noun, phraseNoun, score, pairFreq],
      );
    },

    /** A collocation-lab noun's article (#69). */
    async labNounGender(noun: string, article: "der" | "die" | "das"): Promise<void> {
      await pool.query(`INSERT INTO lab_noun_genders (noun, article) VALUES ($1, $2)`, [noun, article]);
    },

    async labPairExample(
      verb: string,
      noun: string,
      rank: number,
      sentence: string,
      surfaces: { verb: string; noun: string },
      relation: "obj" | "obl" | "nsubj" = "obj",
      prep = "",
    ): Promise<void> {
      await pool.query(
        `INSERT INTO lab_verb_pair_examples
           (relation, verb, prep, noun, rank, sentence, verb_surface, noun_surface)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [relation, verb, prep, noun, rank, sentence, surfaces.verb, surfaces.noun],
      );
    },
  };
}
