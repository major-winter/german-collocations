import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { Client } from 'pg';

const BATCH_SIZE = 1000;

interface VerbArgumentExampleRow {
  verbLemmaId: number;
  argumentLemmaId: number;
  grammaticalRelation: string;
  sentence: string;
  verbSurface: string;
  argumentSurface: string;
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
 * Must run after load-lemmas.ts, same as load-verb-arguments.ts.
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

async function insertBatch(client: Client, batch: VerbArgumentExampleRow[]): Promise<void> {
  if (batch.length === 0) return;

  const placeholders = batch
    .map(
      (_, i) =>
        `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`,
    )
    .join(', ');
  const values = batch.flatMap((row) => [
    row.verbLemmaId,
    row.argumentLemmaId,
    row.grammaticalRelation,
    row.sentence,
    row.verbSurface,
    row.argumentSurface,
  ]);

  await client.query(
    `INSERT INTO verb_argument_examples
       (verb_lemma_id, argument_lemma_id, grammatical_relation, sentence, verb_surface, argument_surface)
     VALUES ${placeholders}`,
    values,
  );
}

/**
 * Streams verb_argument_examples.tsv (verb_lemma\trelation\targument_lemma\t
 * sentence\tverb_surface\targument_surface - see extract_verb_arguments.py),
 * resolves the verb and argument sides via the in-memory lemma map, and
 * loads matched rows in batches. A row whose lemma text has no match in
 * `lemmas` is skipped, not errored - same tolerant-of-gaps pattern as
 * load-verb-arguments.ts.
 *
 * No ON CONFLICT handling: unlike verb_arguments/verb_prepositions, this
 * table has no natural composite key to dedupe against (see migration
 * 011) - a fresh load always starts from an operator-run TRUNCATE, same
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

  let batch: VerbArgumentExampleRow[] = [];
  let matched = 0;
  let skipped = 0;
  let lineNumber = 0;

  for await (const line of rl) {
    lineNumber += 1;
    if (!line.trim()) continue;

    const parts = line.split('\t');
    if (parts.length !== 6) {
      console.warn(
        `warning: skipping malformed line ${lineNumber} (expected 6 tab-separated fields)`,
      );
      continue;
    }

    const [verbLemma, grammaticalRelation, argumentLemma, sentence, verbSurface, argumentSurface] =
      parts;
    const verbLemmaId = lemmaIdByText.get(verbLemma);
    const argumentLemmaId = lemmaIdByText.get(argumentLemma);

    if (verbLemmaId === undefined || argumentLemmaId === undefined) {
      skipped += 1;
      continue;
    }

    batch.push({
      verbLemmaId,
      argumentLemmaId,
      grammaticalRelation,
      sentence,
      verbSurface,
      argumentSurface,
    });
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

    const filePath = path.join(getDataDir(), 'verb_argument_examples.tsv');
    console.log(`loading verb argument examples from ${filePath}`);

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
  console.error('load-verb-argument-examples failed:', err);
  process.exitCode = 1;
});
