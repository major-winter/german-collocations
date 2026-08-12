import { createReadStream } from "fs";
import path from "path";
import { Client, Pool } from "pg";
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

const MAX_EXAMPLES = 3;
async function processFile(
  client: Client,
  wordIndex: WordIndex,
  pairCounts: PairCounts,
  dataDir: string,
) {
  const filePath = path.join(dataDir, "deu_news_2025_100K-sentences.txt");
  let remainingPairs = pairCounts.size;
  let sentencesInserted = 0;
  let examplesInserted = 0;

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

    // Insert sentence first (FK order)
    await client.query(
      "INSERT INTO sentences (id, sentence) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [sentenceId, sentence],
    );
    sentencesInserted++;

    // Insert each matched pair's example
    for (const pair of matchedPairs) {
      const key = `${pair.leftWordId}-${pair.rightWordId}`;
      const count = pairCounts.get(key)!;
      if (count >= MAX_EXAMPLES) continue; // re-check — another match in this sentence may have incremented

      await client.query(
        `INSERT INTO collocation_examples (left_word_id, right_word_id, sentence_id)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [pair.leftWordId, pair.rightWordId, sentenceId],
      );

      pairCounts.set(key, count + 1);
      examplesInserted++;

      if (count + 1 >= MAX_EXAMPLES) {
        remainingPairs--;
      }
    }
  }

  console.log(`Sentences inserted: ${sentencesInserted}`);
  console.log(`Examples inserted: ${examplesInserted}`);
  console.log(`Pairs still without max examples: ${remainingPairs}`);
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const dataDir = process.env.DATA_DIR ?? '/data';

  const client = new Client({ connectionString: url });

  try {
    await client.connect();
    console.log('Connected to database');

    const pairs = await loadCollocationPairs(client);
    console.log(`Loaded ${pairs.length} collocation pairs`);

    const wordIndex = buildWordIndex(pairs);
    console.log(`Word index built: ${wordIndex.size} unique words`);

    const pairCounts: PairCounts = new Map();
    for (const pair of pairs) {
      pairCounts.set(`${pair.leftWordId}-${pair.rightWordId}`, 0);
    }

    await processFile(client, wordIndex, pairCounts, dataDir);
  } finally {
    await client.end();
    console.log('Disconnected');
  }
}

main().catch(err => {
  console.error('Extract examples failed:', err);
  process.exitCode = 1;
});
