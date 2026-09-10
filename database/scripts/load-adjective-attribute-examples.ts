import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { Client } from 'pg';

const BATCH_SIZE = 1000;

interface AdjectiveAttributeExampleRow {
  nounLemmaId: number;
  adjectiveLemmaId: number;
  sentence: string;
  nounSurface: string;
  adjectiveSurface: string;
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
 * Must run after load-lemmas.ts, same as load-adjective-attributes.ts.
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

async function insertBatch(client: Client, batch: AdjectiveAttributeExampleRow[]): Promise<void> {
  if (batch.length === 0) return;

  const placeholders = batch
    .map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`)
    .join(', ');
  const values = batch.flatMap((row) => [
    row.nounLemmaId,
    row.adjectiveLemmaId,
    row.sentence,
    row.nounSurface,
    row.adjectiveSurface,
  ]);

  await client.query(
    `INSERT INTO adjective_attribute_examples
       (noun_lemma_id, adjective_lemma_id, sentence, noun_surface, adjective_surface)
     VALUES ${placeholders}`,
    values,
  );
}

/**
 * Streams adjective_attribute_examples.tsv (noun_lemma\tadjective_lemma\t
 * sentence\tnoun_surface\tadjective_surface - see
 * extract_adjective_attributes.py), resolves the noun and adjective
 * sides via the in-memory lemma map, and loads matched rows in batches.
 * A row whose lemma text has no match in `lemmas` is skipped, not
 * errored - same tolerant-of-gaps pattern as
 * load-adjective-attributes.ts.
 *
 * No ON CONFLICT handling: unlike adjective_attributes, this table has
 * no natural composite key to dedupe against (see migration 013) - a
 * fresh load always starts from an operator-run TRUNCATE, same
 * convention as the rest of this pipeline (decision #37/#44).
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

  let batch: AdjectiveAttributeExampleRow[] = [];
  let matched = 0;
  let skipped = 0;
  let lineNumber = 0;

  for await (const line of rl) {
    lineNumber += 1;
    if (!line.trim()) continue;

    const parts = line.split('\t');
    if (parts.length !== 5) {
      console.warn(
        `warning: skipping malformed line ${lineNumber} (expected 5 tab-separated fields)`,
      );
      continue;
    }

    const [nounLemma, adjectiveLemma, sentence, nounSurface, adjectiveSurface] = parts;
    const nounLemmaId = lemmaIdByText.get(nounLemma);
    const adjectiveLemmaId = lemmaIdByText.get(adjectiveLemma);

    if (nounLemmaId === undefined || adjectiveLemmaId === undefined) {
      skipped += 1;
      continue;
    }

    batch.push({ nounLemmaId, adjectiveLemmaId, sentence, nounSurface, adjectiveSurface });
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

    const filePath = path.join(getDataDir(), 'adjective_attribute_examples.tsv');
    console.log(`loading adjective attribute examples from ${filePath}`);

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
  console.error('load-adjective-attribute-examples failed:', err);
  process.exitCode = 1;
});
