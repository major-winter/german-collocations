import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { Client } from 'pg';

const BATCH_SIZE = 1000;

interface PosRow {
  wordId: number;
  pos: string;
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
 * Loads every (word, id) pair from the words table into memory.
 *
 * The whole table fits comfortably in memory even at 1M+ rows (a
 * string and an int per row), and doing this once up front avoids a
 * per-line database round-trip while streaming the (potentially
 * large) POS tagging output.
 */
async function loadWordIdMap(client: Client): Promise<Map<string, number>> {
  const result = await client.query<{ id: number; word: string }>(
    'SELECT id, word FROM words',
  );

  const map = new Map<string, number>();
  for (const row of result.rows) {
    map.set(row.word, row.id);
  }

  console.log(`loaded ${map.size.toLocaleString()} words for lookup`);
  return map;
}

/**
 * Inserts a batch of resolved (word_id, pos, count) rows.
 *
 * ON CONFLICT DO NOTHING makes re-running the loader safe, matching
 * the pattern already used in load-data.ts. Note this means a
 * re-run with corrected counts will NOT update existing rows - if
 * counts ever need correcting, the table should be truncated first,
 * same caveat that already applies to the other loaders.
 */
async function insertBatch(client: Client, batch: PosRow[]): Promise<void> {
  if (batch.length === 0) {
    return;
  }

  const placeholders = batch
    .map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`)
    .join(', ');

  const values = batch.flatMap((row) => [row.wordId, row.pos, row.count]);

  await client.query(
    `INSERT INTO word_pos (word_id, pos, count) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
    values,
  );
}

/**
 * Streams the tagging script's output TSV, resolves each surface
 * form to a word_id via the in-memory map, and loads matched rows
 * into word_pos in batches.
 *
 * Rows whose word string has no match in `words` are skipped, not
 * errored - expected for Leipzig's multi-word entries ("unter
 * Druck") which spaCy tokenizes differently, and this is also the
 * mechanism that would surface a case-folding bug (an unexpectedly
 * high skip rate) if one existed.
 */
async function processFile(
  client: Client,
  wordIdByText: Map<string, number>,
  filePath: string,
): Promise<{ matched: number; skipped: number }> {
  const rl = createInterface({
    input: createReadStream(filePath, 'utf8'),
    crlfDelay: Infinity,
  });

  let batch: PosRow[] = [];
  let matched = 0;
  let skipped = 0;
  let lineNumber = 0;

  for await (const line of rl) {
    lineNumber += 1;
    if (!line.trim()) {
      continue;
    }

    const parts = line.split('\t');
    if (parts.length !== 3) {
      console.warn(
        `warning: skipping malformed line ${lineNumber} (expected 3 tab-separated fields)`,
      );
      continue;
    }

    const [word, pos, countStr] = parts;
    const wordId = wordIdByText.get(word);

    if (wordId === undefined) {
      skipped += 1;
      continue;
    }

    const count = Number.parseInt(countStr, 10);
    if (Number.isNaN(count)) {
      console.warn(
        `warning: skipping line ${lineNumber}, unparseable count "${countStr}"`,
      );
      continue;
    }

    batch.push({ wordId, pos, count });
    matched += 1;

    if (batch.length >= BATCH_SIZE) {
      await insertBatch(client, batch);
      batch = [];
    }
  }

  // Easy to forget: flush whatever remains under a full batch.
  if (batch.length > 0) {
    await insertBatch(client, batch);
  }

  return { matched, skipped };
}

async function run(): Promise<void> {
  const client = new Client({ connectionString: getDatabaseUrl() });
  await client.connect();

  try {
    const wordIdByText = await loadWordIdMap(client);

    const filePath = path.join(getDataDir(), 'word_pos.tsv');
    console.log(`loading POS data from ${filePath}`);

    const { matched, skipped } = await processFile(
      client,
      wordIdByText,
      filePath,
    );

    const total = matched + skipped;
    const skipRate = total > 0 ? ((skipped / total) * 100).toFixed(1) : '0.0';

    console.log(
      `done: ${matched.toLocaleString()} rows matched and loaded, ` +
        `${skipped.toLocaleString()} rows skipped (no matching word) ` +
        `(${skipRate}% skip rate)`,
    );
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error('load-pos failed:', err);
  process.exitCode = 1;
});
