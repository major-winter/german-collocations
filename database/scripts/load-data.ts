import { Client } from 'pg';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR ?? '/data';
const BATCH_SIZE = 1000;

type WordRow = [id: number, word: string, frequency: number];
type CollocationRow = [
  leftWordId: number,
  rightWordId: number,
  cooccurrence: number,
  significance: number
];

async function insertWordsBatch(client: Client, batch: WordRow[]): Promise<void> {
  const placeholders = batch
    .map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`)
    .join(', ');
  const values = batch.flat();

  await client.query(
    `INSERT INTO words (id, word, frequency)
     VALUES ${placeholders}
     ON CONFLICT DO NOTHING`,
    values
  );
}

async function insertCollocationsBatch(client: Client, batch: CollocationRow[]): Promise<void> {
  const placeholders = batch
    .map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`)
    .join(', ');
  const values = batch.flat();

  await client.query(
    `INSERT INTO collocations (left_word_id, right_word_id, cooccurrence, significance)
     VALUES ${placeholders}
     ON CONFLICT DO NOTHING`,
    values
  );
}

async function loadWords(client: Client, filePath: string): Promise<number> {
  const rl = createInterface({
    input: createReadStream(filePath, 'utf8'),
    crlfDelay: Infinity,
  });

  const batch: WordRow[] = [];
  let total = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    const [id, word, frequency] = line.split('\t');
    batch.push([Number(id), word, Number(frequency)]);

    if (batch.length >= BATCH_SIZE) {
      await insertWordsBatch(client, batch);
      total += batch.length;
      batch.length = 0;
      if (total % 50000 === 0) console.log(`  ${total} words loaded...`);
    }
  }

  if (batch.length > 0) {
    await insertWordsBatch(client, batch);
    total += batch.length;
  }

  return total;
}

async function loadCollocations(client: Client, filePath: string): Promise<number> {
  const rl = createInterface({
    input: createReadStream(filePath, 'utf8'),
    crlfDelay: Infinity,
  });

  const batch: CollocationRow[] = [];
  let total = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    const [leftId, rightId, cooc, sig] = line.split('\t');
    batch.push([Number(leftId), Number(rightId), Number(cooc), Number(sig)]);

    if (batch.length >= BATCH_SIZE) {
      await insertCollocationsBatch(client, batch);
      total += batch.length;
      batch.length = 0;
      if (total % 50000 === 0) console.log(`  ${total} collocations loaded...`);
    }
  }

  if (batch.length > 0) {
    await insertCollocationsBatch(client, batch);
    total += batch.length;
  }

  return total;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const wordsFile = path.join(DATA_DIR, 'deu_news_2025_100K-words.txt');
  const coFile = path.join(DATA_DIR, 'deu_news_2025_100K-co_n.txt');

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    console.log('Loading words...');
    const wordCount = await loadWords(client, wordsFile);
    console.log(`Loaded ${wordCount} words.`);

    console.log('Loading collocations...');
    const coCount = await loadCollocations(client, coFile);
    console.log(`Loaded ${coCount} collocations.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
