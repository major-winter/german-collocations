import { createReadStream } from "fs";
import path from "path";
import { Client } from "pg";
import { createInterface } from "readline";

interface CollocationPair {
  leftWordId: number;
  rightWordId: number;
  leftWord: string;
  rightWord: string;
}

type WordIndex = Map<string, CollocationPair[]>;

type PairCounts = Map<string, number>;

async function loadCollocationPairs(
  client: Client,
): Promise<CollocationPair[]> {
  const result = await client.query(`
SELECT
    c.left_word_id,
    c.right_word_id,
w1.word AS left_word,
w2.word AS right_word
FROM collocations c
JOIN words w1 ON w1.id = c.left_word_id
JOIN words w2 ON w2.id = c.right_word_id
`);

  return result.rows.map((row) => ({
    leftWordId: row.left_word_id,
    rightWordId: row.right_word_id,
    leftWord: row.left_word,
    rightWord: row.right_word,
  }));
}

function buildWordIndex(pairs: CollocationPair[]): WordIndex {
  const index: WordIndex = new Map();
  for (const pair of pairs) {
    const leftEntries = index.get(pair.leftWord) ?? [];
    leftEntries.push(pair);
    index.set(pair.leftWord, leftEntries);

    const rightEntries = index.get(pair.rightWord) ?? [];
    rightEntries.push(pair);
    index.set(pair.rightWord, rightEntries);
  }

  return index;
}

function tokenizeSentence(sentence: string) {
  return new Set(
    sentence
      .split(/\s+/)
      .map((token) => token.replace(/[^\p{L}\p{N}]/gu, ""))
      .filter((token) => token.length > 0),
  );
}

// Existing counts, not zero, so a resumed run doesn't re-scan pairs that
// already have their 3 examples, and doesn't insert past the cap.
async function loadExistingExampleCounts(
  client: Client,
): Promise<Map<string, number>> {
  const result = await client.query(`
    SELECT left_word_id, right_word_id, count(*) AS count
    FROM collocation_examples
    GROUP BY left_word_id, right_word_id
  `);

  const counts = new Map<string, number>();
  for (const row of result.rows) {
    counts.set(`${row.left_word_id}-${row.right_word_id}`, Number(row.count));
  }
  return counts;
}

const MAX_EXAMPLES = 3;
const BATCH_SIZE = 1000;

type SentenceRow = [id: number, sentence: string];
type ExampleRow = [leftWordId: number, rightWordId: number, sentenceId: number];

async function insertSentencesBatch(
  client: Client,
  batch: SentenceRow[],
): Promise<void> {
  if (batch.length === 0) return;

  const placeholders = batch
    .map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`)
    .join(", ");

  await client.query(
    `INSERT INTO sentences (id, sentence) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
    batch.flat(),
  );
}

async function insertExamplesBatch(
  client: Client,
  batch: ExampleRow[],
): Promise<void> {
  if (batch.length === 0) return;

  const placeholders = batch
    .map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`)
    .join(", ");

  await client.query(
    `INSERT INTO collocation_examples (left_word_id, right_word_id, sentence_id)
     VALUES ${placeholders} ON CONFLICT DO NOTHING`,
    batch.flat(),
  );
}

async function processFile(
  client: Client,
  wordIndex: WordIndex,
  pairCounts: PairCounts,
  filePath: string,
) {
  let remainingPairs = 0;
  for (const count of pairCounts.values()) {
    if (count < MAX_EXAMPLES) remainingPairs++;
  }

  let sentencesInserted = 0;
  let examplesInserted = 0;

  let sentenceBatch: SentenceRow[] = [];
  let exampleBatch: ExampleRow[] = [];

  // Sentences before examples, always - an example batch can reference a
  // sentence added in the same cycle that hasn't been committed yet.
  const flush = async () => {
    await insertSentencesBatch(client, sentenceBatch);
    await insertExamplesBatch(client, exampleBatch);
    sentenceBatch = [];
    exampleBatch = [];
  };

  const rl = createInterface({
    input: createReadStream(filePath, "utf8"),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (remainingPairs === 0) break;

    const tabIndex = line.indexOf("\t");
    if (tabIndex === -1) continue;

    const sentenceId = parseInt(line.substring(0, tabIndex), 10);
    const sentence = line.substring(tabIndex + 1);
    const words = tokenizeSentence(sentence);

    let sentenceNeeded = false;
    const matchedPairs: CollocationPair[] = [];

    for (const word of words) {
      const candidates = wordIndex.get(word);
      if (!candidates) continue;

      for (const pair of candidates) {
        const key = `${pair.leftWordId}-${pair.rightWordId}`;
        const count = pairCounts.get(key)!;
        if (count >= MAX_EXAMPLES) continue;

        // Determine the other word in the pair
        const otherWord =
          word === pair.leftWord ? pair.rightWord : pair.leftWord;
        if (!words.has(otherWord)) continue;

        matchedPairs.push(pair);
        sentenceNeeded = true;
      }
    }

    if (!sentenceNeeded) continue;

    sentenceBatch.push([sentenceId, sentence]);
    sentencesInserted++;

    // Queue each matched pair's example
    for (const pair of matchedPairs) {
      const key = `${pair.leftWordId}-${pair.rightWordId}`;
      const count = pairCounts.get(key)!;
      if (count >= MAX_EXAMPLES) continue; // re-check — another match in this sentence may have incremented

      exampleBatch.push([pair.leftWordId, pair.rightWordId, sentenceId]);

      pairCounts.set(key, count + 1);
      examplesInserted++;

      if (count + 1 >= MAX_EXAMPLES) {
        remainingPairs--;
      }
    }

    if (exampleBatch.length >= BATCH_SIZE || sentenceBatch.length >= BATCH_SIZE) {
      await flush();
    }
  }

  await flush();

  console.log(`Sentences inserted: ${sentencesInserted}`);
  console.log(`Examples inserted: ${examplesInserted}`);
  console.log(`Pairs still without max examples: ${remainingPairs}`);
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const dataDir = process.env.DATA_DIR ?? '/data';
  const corpusPrefix = process.env.CORPUS_PREFIX ?? 'deu_news_2025_100K';

  const client = new Client({ connectionString: url });

  try {
    await client.connect();
    console.log('Connected to database');

    const pairs = await loadCollocationPairs(client);
    console.log(`Loaded ${pairs.length} collocation pairs`);

    const wordIndex = buildWordIndex(pairs);
    console.log(`Word index built: ${wordIndex.size} unique words`);

    const pairCounts: PairCounts = await loadExistingExampleCounts(client);
    for (const pair of pairs) {
      const key = `${pair.leftWordId}-${pair.rightWordId}`;
      if (!pairCounts.has(key)) pairCounts.set(key, 0);
    }
    console.log(`Resuming from ${pairCounts.size} tracked pairs (existing example counts loaded)`);

    const sentencesFile = path.join(dataDir, `${corpusPrefix}-sentences.txt`);
    await processFile(client, wordIndex, pairCounts, sentencesFile);
  } finally {
    await client.end();
    console.log('Disconnected');
  }
}

main().catch(err => {
  console.error('Extract examples failed:', err);
  process.exitCode = 1;
});
