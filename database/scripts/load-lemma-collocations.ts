import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { Client } from 'pg';

const BATCH_SIZE = 1000;

interface LemmaCollocationRow {
  leftLemmaId: number;
  rightLemmaId: number;
  cooccurrence: number;
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
 * Must run after load-lemmas.ts: this resolves lemma_collocations.tsv's
 * lemma text against `lemmas`, which load-lemmas.ts is what populates.
 */
async function loadLemmaIdMap(client: Client): Promise<Map<string, number>> {
  const result = await client.query<{ id: number; lemma: string }>('SELECT id, lemma FROM lemmas');

  const map = new Map<string, number>();
  for (const row of result.rows) {
    map.set(row.lemma, row.id);
  }

  console.log(`loaded ${map.size.toLocaleString()} lemmas for lookup`);
  return map;
}

async function insertBatch(client: Client, batch: LemmaCollocationRow[]): Promise<void> {
  if (batch.length === 0) return;

  const placeholders = batch
    .map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`)
    .join(', ');
  const values = batch.flatMap((row) => [row.leftLemmaId, row.rightLemmaId, row.cooccurrence]);

  await client.query(
    `INSERT INTO lemma_collocations (left_lemma_id, right_lemma_id, cooccurrence)
     VALUES ${placeholders} ON CONFLICT DO NOTHING`,
    values,
  );
}

/**
 * Streams lemma_collocations.tsv, resolves both sides via the in-memory
 * lemma map, and loads matched rows in batches. A row whose lemma text
 * has no match would mean extract_lemmas.py produced a lemma pair that
 * load-lemmas.ts never inserted - shouldn't happen (both TSVs come from
 * the same script run over the same corpus), so this is a consistency
 * check as much as a resolve step. Skipped, not errored, same pattern
 * as load-pos.ts / load-lemmas.ts.
 */
async function processFile(
  client: Client,
  lemmaIdByText: Map<string, number>,
  filePath: string,
): Promise<{ matched: number; skipped: number }> {
  const rl = createInterface({
    input: createReadStream(filePath, 'utf8'),
    crlfDelay: Infinity,
  });

  let batch: LemmaCollocationRow[] = [];
  let matched = 0;
  let skipped = 0;
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

    const [leftLemma, rightLemma, countStr] = parts;
    const leftLemmaId = lemmaIdByText.get(leftLemma);
    const rightLemmaId = lemmaIdByText.get(rightLemma);

    if (leftLemmaId === undefined || rightLemmaId === undefined) {
      skipped += 1;
      continue;
    }

    const cooccurrence = Number.parseInt(countStr, 10);
    if (Number.isNaN(cooccurrence)) {
      console.warn(`warning: skipping line ${lineNumber}, unparseable count "${countStr}"`);
      continue;
    }

    batch.push({ leftLemmaId, rightLemmaId, cooccurrence });
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

async function run(): Promise<void> {
  const client = new Client({ connectionString: getDatabaseUrl() });
  await client.connect();

  try {
    const lemmaIdByText = await loadLemmaIdMap(client);

    const filePath = path.join(getDataDir(), 'lemma_collocations.tsv');
    console.log(`loading lemma collocations from ${filePath}`);

    const { matched, skipped } = await processFile(client, lemmaIdByText, filePath);

    const total = matched + skipped;
    const skipRate = total > 0 ? ((skipped / total) * 100).toFixed(1) : '0.0';

    console.log(
      `done: ${matched.toLocaleString()} rows matched and loaded, ` +
        `${skipped.toLocaleString()} rows skipped (no matching lemma) ` +
        `(${skipRate}% skip rate)`,
    );
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error('load-lemma-collocations failed:', err);
  process.exitCode = 1;
});
