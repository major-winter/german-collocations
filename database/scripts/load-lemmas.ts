import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { Client } from 'pg';

const BATCH_SIZE = 1000;

interface WordLemmaRow {
  word: string;
  lemma: string;
  count: number;
}

function getDataDir(): string {
  return process.env.DATA_DIR ?? '/data';
}

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  return url;
}

/**
 * Reads word_lemma.tsv fully into memory as parsed rows - same
 * "small-ish reference file, fine to hold in memory" judgment already
 * applied to word_pos.tsv (see load-pos.ts's loadWordIdMap comment for
 * the words table, which is the same order of magnitude).
 *
 * Buffered once (not streamed twice) so the distinct-lemma pass below
 * doesn't re-read the file from disk.
 */
async function readWordLemmaRows(filePath: string): Promise<WordLemmaRow[]> {
  const rl = createInterface({
    input: createReadStream(filePath, 'utf8'),
    crlfDelay: Infinity,
  });

  const rows: WordLemmaRow[] = [];
  let lineNumber = 0;

  for await (const line of rl) {
    lineNumber += 1;
    if (!line.trim()) continue;

    const parts = line.split('\t');
    if (parts.length !== 3) {
      console.warn(
        `warning: skipping malformed line ${lineNumber} (expected 3 tab-separated fields)`,
      );
      continue;
    }

    const [word, lemma, countStr] = parts;
    const count = Number.parseInt(countStr, 10);
    if (Number.isNaN(count)) {
      console.warn(`warning: skipping line ${lineNumber}, unparseable count "${countStr}"`);
      continue;
    }

    rows.push({ word, lemma, count });
  }

  return rows;
}

/**
 * Inserts every distinct lemma text seen, then reads back the full
 * (lemma -> id) map. Two steps because `lemmas.id` is generated here
 * (unlike `words.id`, which is Leipzig's own ID) - there is no ID to
 * insert with, so the map has to be built after insertion, not loaded
 * alongside it the way loadWordIdMap loads `words`.
 */
async function upsertLemmasAndBuildMap(
  client: Client,
  rows: WordLemmaRow[],
): Promise<Map<string, number>> {
  const distinctLemmas = [...new Set(rows.map((r) => r.lemma))];
  console.log(`inserting ${distinctLemmas.length.toLocaleString()} distinct lemmas`);

  for (let i = 0; i < distinctLemmas.length; i += BATCH_SIZE) {
    const batch = distinctLemmas.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map((_, j) => `($${j + 1})`).join(', ');
    await client.query(
      `INSERT INTO lemmas (lemma) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
      batch,
    );
  }

  const result = await client.query<{ id: number; lemma: string }>('SELECT id, lemma FROM lemmas');
  const map = new Map<string, number>();
  for (const row of result.rows) {
    map.set(row.lemma, row.id);
  }

  console.log(`loaded ${map.size.toLocaleString()} lemmas for lookup`);
  return map;
}

async function loadWordIdMap(client: Client): Promise<Map<string, number>> {
  const result = await client.query<{ id: number; word: string }>('SELECT id, word FROM words');

  const map = new Map<string, number>();
  for (const row of result.rows) {
    map.set(row.word, row.id);
  }

  console.log(`loaded ${map.size.toLocaleString()} words for lookup`);
  return map;
}

interface WordLemmaInsertRow {
  wordId: number;
  lemmaId: number;
  count: number;
}

async function insertBatch(client: Client, batch: WordLemmaInsertRow[]): Promise<void> {
  if (batch.length === 0) return;

  const placeholders = batch
    .map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`)
    .join(', ');
  const values = batch.flatMap((row) => [row.wordId, row.lemmaId, row.count]);

  await client.query(
    `INSERT INTO word_lemmas (word_id, lemma_id, count) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
    values,
  );
}

/**
 * Resolves each row's word and lemma to their ids and loads matched
 * rows into word_lemmas in batches. Rows whose word has no match in
 * `words` are skipped, not errored - same rationale as load-pos.ts
 * (spaCy tokenizes some multi-word Leipzig entries differently).
 */
async function processRows(
  client: Client,
  wordIdByText: Map<string, number>,
  lemmaIdByText: Map<string, number>,
  rows: WordLemmaRow[],
): Promise<{ matched: number; skipped: number }> {
  let batch: WordLemmaInsertRow[] = [];
  let matched = 0;
  let skipped = 0;

  for (const row of rows) {
    const wordId = wordIdByText.get(row.word);
    const lemmaId = lemmaIdByText.get(row.lemma);

    if (wordId === undefined || lemmaId === undefined) {
      skipped += 1;
      continue;
    }

    batch.push({ wordId, lemmaId, count: row.count });
    matched += 1;

    if (batch.length >= BATCH_SIZE) {
      await insertBatch(client, batch);
      batch = [];
    }
  }

  if (batch.length > 0) {
    await insertBatch(client, batch);
  }

  return { matched, skipped };
}

/**
 * word_dominant_lemma is a table, not a view (see migration
 * 007_add_lemmas.sql for why - a live DISTINCT ON view here made a
 * per-word collocation query time out, measured directly). Computed
 * fresh from word_lemmas every run: TRUNCATE first so a re-run doesn't
 * leave stale rows behind if word_lemmas ever changes shape.
 */
async function populateWordDominantLemma(client: Client): Promise<void> {
  console.log('computing word_dominant_lemma...');
  await client.query('TRUNCATE word_dominant_lemma');
  await client.query(`
    INSERT INTO word_dominant_lemma (word_id, lemma_id, count, share)
    SELECT DISTINCT ON (word_id)
      word_id,
      lemma_id,
      count,
      count::real / SUM(count) OVER (PARTITION BY word_id) AS share
    FROM word_lemmas
    ORDER BY word_id, count DESC
  `);
  const result = await client.query<{ count: string }>('SELECT count(*) FROM word_dominant_lemma');
  console.log(`word_dominant_lemma populated: ${Number(result.rows[0].count).toLocaleString()} rows`);
}

/**
 * Both tables, not views - see migration 008_add_lemma_collocations.sql
 * for why (measured: re-aggregating word_dominant_lemma by lemma_id
 * live was unreliable even with an index present). Must run after
 * populateWordDominantLemma.
 */
async function populateLemmaDominantPos(client: Client): Promise<void> {
  console.log('computing lemma_dominant_pos...');
  await client.query('TRUNCATE lemma_dominant_pos');
  await client.query(`
    INSERT INTO lemma_dominant_pos (lemma_id, pos, count, share)
    SELECT DISTINCT ON (lemma_id)
      lemma_id,
      pos,
      count,
      count::real / SUM(count) OVER (PARTITION BY lemma_id) AS share
    FROM (
      SELECT wdl.lemma_id, wp.pos, SUM(wp.count) AS count
      FROM word_pos wp
      JOIN word_dominant_lemma wdl ON wdl.word_id = wp.word_id
      GROUP BY wdl.lemma_id, wp.pos
    ) lemma_pos
    ORDER BY lemma_id, count DESC
  `);
  const result = await client.query<{ count: string }>('SELECT count(*) FROM lemma_dominant_pos');
  console.log(`lemma_dominant_pos populated: ${Number(result.rows[0].count).toLocaleString()} rows`);
}

async function populateLemmaFrequency(client: Client): Promise<void> {
  console.log('computing lemma_frequency...');
  await client.query('TRUNCATE lemma_frequency');
  await client.query(`
    INSERT INTO lemma_frequency (lemma_id, frequency)
    SELECT wdl.lemma_id, SUM(w.frequency)
    FROM word_dominant_lemma wdl
    JOIN words w ON w.id = wdl.word_id
    GROUP BY wdl.lemma_id
  `);
  const result = await client.query<{ count: string }>('SELECT count(*) FROM lemma_frequency');
  console.log(`lemma_frequency populated: ${Number(result.rows[0].count).toLocaleString()} rows`);
}

async function run(): Promise<void> {
  const client = new Client({ connectionString: getDatabaseUrl() });
  await client.connect();

  try {
    const filePath = path.join(getDataDir(), 'word_lemma.tsv');
    console.log(`loading word/lemma data from ${filePath}`);
    const rows = await readWordLemmaRows(filePath);
    console.log(`read ${rows.length.toLocaleString()} rows`);

    const lemmaIdByText = await upsertLemmasAndBuildMap(client, rows);
    const wordIdByText = await loadWordIdMap(client);

    const { matched, skipped } = await processRows(client, wordIdByText, lemmaIdByText, rows);

    const total = matched + skipped;
    const skipRate = total > 0 ? ((skipped / total) * 100).toFixed(1) : '0.0';

    console.log(
      `done: ${matched.toLocaleString()} rows matched and loaded, ` +
        `${skipped.toLocaleString()} rows skipped (no matching word) ` +
        `(${skipRate}% skip rate)`,
    );

    await populateWordDominantLemma(client);
    await populateLemmaDominantPos(client);
    await populateLemmaFrequency(client);
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error('load-lemmas failed:', err);
  process.exitCode = 1;
});
