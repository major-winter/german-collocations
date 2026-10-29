import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { Client } from 'pg';
import {
  assertLoadable,
  parseExampleLine,
  parsePairLine,
  type LabVerbPairExampleRow,
  type LabVerbPairRow,
} from '../src/labVerbPairsTsv.ts';

const BATCH_SIZE = 1000;

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

function pairKey(row: { relation: string; verb: string; prep: string; noun: string }): string {
  return `${row.relation}\t${row.verb}\t${row.prep}\t${row.noun}`;
}

/** Multi-row INSERT of rows, each turned into its column values by toValues. */
async function insertBatch<Row>(
  client: Client,
  table: string,
  columns: string[],
  rows: Row[],
  toValues: (row: Row) => unknown[],
): Promise<void> {
  if (rows.length === 0) return;

  const placeholders = rows
    .map(
      (_, rowIndex) =>
        `(${columns.map((_, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`).join(', ')})`,
    )
    .join(', ');
  await client.query(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders}`,
    rows.flatMap(toValues),
  );
}

/**
 * Streams one export file, parses each non-empty line with parseLine, and
 * hands accepted rows to insertRows in batches. Returns how many lines were
 * malformed.
 */
async function streamFile<Row>(
  filePath: string,
  parseLine: (line: string) => Row | null,
  accept: (row: Row) => boolean,
  insertRows: (rows: Row[]) => Promise<void>,
): Promise<number> {
  const lines = createInterface({
    input: createReadStream(filePath, 'utf8'),
    crlfDelay: Infinity,
  });

  let batch: Row[] = [];
  let malformed = 0;

  for await (const line of lines) {
    if (!line.trim()) continue;

    const row = parseLine(line);
    if (row === null) {
      malformed += 1;
      continue;
    }
    if (!accept(row)) continue;

    batch.push(row);
    if (batch.length >= BATCH_SIZE) {
      await insertRows(batch);
      batch = [];
    }
  }
  await insertRows(batch);

  return malformed;
}

/**
 * Replaces lab_verb_pairs and lab_verb_pair_examples (migration 014) with
 * the contents of `colloc export`'s two files - decision #60.
 *
 * Everything happens in one transaction: DELETE (not TRUNCATE, which would
 * lock readers out for the whole load) and the inserts. The site keeps
 * reading the old pairs until COMMIT, and an empty or broken export
 * (assertLoadable) rolls back with the old pairs untouched.
 */
async function run(): Promise<void> {
  const client = new Client({ connectionString: getDatabaseUrl() });
  await client.connect();

  const pairsPath = path.join(getDataDir(), 'lab_verb_pairs.tsv');
  const examplesPath = path.join(getDataDir(), 'lab_verb_pair_examples.tsv');

  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM lab_verb_pair_examples');
    await client.query('DELETE FROM lab_verb_pairs');

    console.log(`loading lab verb pairs from ${pairsPath}`);
    const loadedPairKeys = new Set<string>();
    const malformedPairs = await streamFile<LabVerbPairRow>(
      pairsPath,
      parsePairLine,
      (row) => !loadedPairKeys.has(pairKey(row)),
      async (rows) => {
        await insertBatch(
          client,
          'lab_verb_pairs',
          ['relation', 'verb', 'prep', 'noun', 'phrase_noun', 'score', 'pair_freq'],
          rows,
          (row) => [row.relation, row.verb, row.prep, row.noun, row.phraseNoun, row.score, row.pairFreq],
        );
        for (const row of rows) loadedPairKeys.add(pairKey(row));
      },
    );

    console.log(`loading their examples from ${examplesPath}`);
    let examplesLoaded = 0;
    let examplesWithoutPair = 0;
    const malformedExamples = await streamFile<LabVerbPairExampleRow>(
      examplesPath,
      parseExampleLine,
      (row) => {
        if (loadedPairKeys.has(pairKey(row))) return true;
        examplesWithoutPair += 1;
        return false;
      },
      async (rows) => {
        await insertBatch(
          client,
          'lab_verb_pair_examples',
          ['relation', 'verb', 'prep', 'noun', 'rank', 'sentence', 'verb_surface', 'noun_surface'],
          rows,
          (row) => [
            row.relation, row.verb, row.prep, row.noun,
            row.rank, row.sentence, row.verbSurface, row.nounSurface,
          ],
        );
        examplesLoaded += rows.length;
      },
    );

    assertLoadable(loadedPairKeys.size, malformedPairs + malformedExamples);
    await client.query('COMMIT');

    console.log(
      `done: ${loadedPairKeys.size.toLocaleString()} pairs and ${examplesLoaded.toLocaleString()} examples loaded, ` +
        `${examplesWithoutPair.toLocaleString()} examples skipped (pair not in the export), ` +
        `${malformedPairs.toLocaleString()} + ${malformedExamples.toLocaleString()} malformed lines`,
    );

    await client.query('VACUUM ANALYZE lab_verb_pairs');
    await client.query('VACUUM ANALYZE lab_verb_pair_examples');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error('load-lab-verb-pairs failed:', err);
  process.exitCode = 1;
});
