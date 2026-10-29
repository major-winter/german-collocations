import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { Client } from 'pg';

const BATCH_SIZE = 1000;

interface AdjectiveAttributeRow {
  nounLemmaId: number;
  adjectiveLemmaId: number;
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
 * Must run after load-lemmas.ts: this resolves adjective_attribute.tsv's
 * noun/adjective text against `lemmas`, which load-lemmas.ts is what
 * populates. Mirrors load-verb-prepositions.ts's loadLemmaIdMap exactly.
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

async function insertBatch(client: Client, batch: AdjectiveAttributeRow[]): Promise<void> {
  if (batch.length === 0) return;

  const placeholders = batch
    .map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`)
    .join(', ');
  const values = batch.flatMap((row) => [row.nounLemmaId, row.adjectiveLemmaId, row.count]);

  await client.query(
    `INSERT INTO adjective_attributes (noun_lemma_id, adjective_lemma_id, count)
     VALUES ${placeholders} ON CONFLICT DO NOTHING`,
    values,
  );
}

/**
 * Streams adjective_attribute.tsv (noun_lemma\tadjective_lemma\tcount -
 * see extract_adjective_attributes.py), resolves the noun and adjective
 * sides via the in-memory lemma map, and loads matched rows in batches.
 * A row whose lemma text has no match in `lemmas` is skipped, not
 * errored - same tolerant-of-gaps pattern as load-verb-prepositions.ts.
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

  let batch: AdjectiveAttributeRow[] = [];
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

    const [nounLemma, adjectiveLemma, countStr] = parts;
    const nounLemmaId = lemmaIdByText.get(nounLemma);
    const adjectiveLemmaId = lemmaIdByText.get(adjectiveLemma);

    if (nounLemmaId === undefined || adjectiveLemmaId === undefined) {
      skipped += 1;
      continue;
    }

    const count = Number.parseInt(countStr, 10);
    if (Number.isNaN(count)) {
      console.warn(`warning: skipping line ${lineNumber}, unparseable count "${countStr}"`);
      continue;
    }

    batch.push({ nounLemmaId, adjectiveLemmaId, count });
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

    const filePath = path.join(getDataDir(), 'adjective_attribute.tsv');
    console.log(`loading adjective attributes from ${filePath}`);

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
  console.error('load-adjective-attributes failed:', err);
  process.exitCode = 1;
});
