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

// Indexed by leftWord only: collocation pairs are directional neighbor
// pairs (Leipzig's co_n.txt), so an example sentence must show leftWord
// immediately followed by rightWord, not just both words anywhere in it.
function buildLeftIndex(pairs: CollocationPair[]): WordIndex {
  const index: WordIndex = new Map();
  for (const pair of pairs) {
    const entries = index.get(pair.leftWord) ?? [];
    entries.push(pair);
    index.set(pair.leftWord, entries);
  }

  return index;
}

function tokenizeSentence(sentence: string): string[] {
  return sentence
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((token) => token.length > 0);
}

const MAX_EXAMPLES = 3;
const BATCH_SIZE = 1000;

interface Candidate {
  sentenceId: number;
  sentence: string;
  wordCount: number;
  clauseCount: number;
}

type SimplicityMap = Map<number, { wordCount: number; clauseCount: number }>;

// Read from disk, not the database - these are a one-time selection
// input produced offline by score_sentence_simplicity.py, not something
// queried at request time, so there's no reason to load them into a
// table (unlike word_pos, which backs the live word_dominant_pos view).
async function loadSentenceSimplicity(dataDir: string): Promise<SimplicityMap> {
  const filePath = path.join(dataDir, 'sentence_simplicity.tsv');
  const map: SimplicityMap = new Map();

  const rl = createInterface({
    input: createReadStream(filePath, 'utf8'),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    const parts = line.split('\t');
    if (parts.length !== 3) continue;

    const [idStr, wordCountStr, clauseCountStr] = parts;
    const sentenceId = parseInt(idStr, 10);
    const wordCount = parseInt(wordCountStr, 10);
    const clauseCount = parseInt(clauseCountStr, 10);
    if (Number.isNaN(sentenceId) || Number.isNaN(wordCount) || Number.isNaN(clauseCount)) {
      continue;
    }

    map.set(sentenceId, { wordCount, clauseCount });
  }

  console.log(`loaded simplicity scores for ${map.size.toLocaleString()} sentences`);
  return map;
}

// Decision #48 (docs/decisions-48.md... see the step-1 entry): ranks
// candidates instead of gating them against a fixed threshold, so a pair
// with only awkward matches still gets its least-awkward ones instead of
// nothing. Clause count is the primary signal (a single-clause sentence
// beats a multi-clause one regardless of length) with word count as the
// tiebreaker - same priority order decision #41 gave the two signals when
// they were a hard AND'd threshold.
function compareCandidates(a: Candidate, b: Candidate): number {
  if (a.clauseCount !== b.clauseCount) return a.clauseCount - b.clauseCount;
  return a.wordCount - b.wordCount;
}

// Keeps at most MAX_EXAMPLES per pair, sorted best-first, evicting the
// current worst only when a strictly better candidate shows up - a plain
// bounded insertion sort, not a heap, since MAX_EXAMPLES is 3.
function considerCandidate(
  bestByPair: Map<string, Candidate[]>,
  key: string,
  candidate: Candidate,
): void {
  const list = bestByPair.get(key) ?? [];

  if (list.length < MAX_EXAMPLES) {
    list.push(candidate);
    list.sort(compareCandidates);
    bestByPair.set(key, list);
    return;
  }

  if (compareCandidates(candidate, list[list.length - 1]) < 0) {
    list[list.length - 1] = candidate;
    list.sort(compareCandidates);
  }
}

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

// No early exit and no resumable pair-count state (contrast with the
// pre-decision-48 version): ranking requires comparing every matching
// sentence in the corpus against a pair's current best 3, so a sentence
// that would improve a pair's examples can appear anywhere in the file,
// including after that pair already has 3 weaker candidates. Same
// full-file-scan tradeoff decision #39 already found cheap (~under a
// minute locally at 1M-sentence scale).
async function findBestExamples(
  leftIndex: WordIndex,
  filePath: string,
  simplicityMap: SimplicityMap,
): Promise<Map<string, Candidate[]>> {
  const bestByPair = new Map<string, Candidate[]>();
  let sentencesScanned = 0;

  const rl = createInterface({
    input: createReadStream(filePath, "utf8"),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    sentencesScanned++;

    const tabIndex = line.indexOf("\t");
    if (tabIndex === -1) continue;

    const sentenceId = parseInt(line.substring(0, tabIndex), 10);

    // A sentence with no simplicity score can't be ranked, so it's
    // excluded rather than treated as infinitely simple or complex.
    const simplicity = simplicityMap.get(sentenceId);
    if (!simplicity) continue;

    const sentence = line.substring(tabIndex + 1);
    const tokens = tokenizeSentence(sentence);

    const matchedKeys = new Set<string>();

    for (let i = 0; i < tokens.length - 1; i++) {
      const candidates = leftIndex.get(tokens[i]);
      if (!candidates) continue;

      for (const pair of candidates) {
        if (pair.rightWord !== tokens[i + 1]) continue;

        const key = `${pair.leftWordId}-${pair.rightWordId}`;
        if (matchedKeys.has(key)) continue;
        matchedKeys.add(key);

        considerCandidate(bestByPair, key, {
          sentenceId,
          sentence,
          wordCount: simplicity.wordCount,
          clauseCount: simplicity.clauseCount,
        });
      }
    }
  }

  console.log(`Sentences scanned: ${sentencesScanned}`);
  return bestByPair;
}

async function writeResults(
  client: Client,
  pairs: CollocationPair[],
  bestByPair: Map<string, Candidate[]>,
): Promise<void> {
  let sentenceBatch: SentenceRow[] = [];
  let exampleBatch: ExampleRow[] = [];
  const queuedSentenceIds = new Set<number>();

  let sentencesInserted = 0;
  let examplesInserted = 0;
  let pairsWithExamples = 0;

  const flush = async () => {
    await insertSentencesBatch(client, sentenceBatch);
    await insertExamplesBatch(client, exampleBatch);
    sentenceBatch = [];
    exampleBatch = [];
  };

  for (const pair of pairs) {
    const key = `${pair.leftWordId}-${pair.rightWordId}`;
    const candidates = bestByPair.get(key);
    if (!candidates || candidates.length === 0) continue;
    pairsWithExamples++;

    for (const candidate of candidates) {
      // A sentence can be the best example for more than one pair - only
      // queue its insert once regardless of how many pairs reference it.
      if (!queuedSentenceIds.has(candidate.sentenceId)) {
        queuedSentenceIds.add(candidate.sentenceId);
        sentenceBatch.push([candidate.sentenceId, candidate.sentence]);
        sentencesInserted++;
      }

      exampleBatch.push([pair.leftWordId, pair.rightWordId, candidate.sentenceId]);
      examplesInserted++;

      if (sentenceBatch.length >= BATCH_SIZE || exampleBatch.length >= BATCH_SIZE) {
        await flush();
      }
    }
  }

  await flush();

  console.log(`Sentences inserted: ${sentencesInserted}`);
  console.log(`Examples inserted: ${examplesInserted}`);
  console.log(`Pairs with at least one example: ${pairsWithExamples} / ${pairs.length}`);
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const dataDir = process.env.DATA_DIR ?? '/data';
  // Decision #37: the live DB has been on the 1M package since the corpus
  // upgrade, and Leipzig sentence/word IDs aren't stable across package
  // sizes - defaulting to 100K here would silently produce IDs that don't
  // match what's already loaded.
  const corpusPrefix = process.env.CORPUS_PREFIX ?? 'deu_news_2025_1M';

  const client = new Client({ connectionString: url });

  try {
    await client.connect();
    console.log('Connected to database');

    // Full re-selection, not additive: ranking needs every matching
    // sentence in the corpus compared against a pair's current best 3, so
    // there's no way to "resume" from a partial previous run without
    // re-scanning anyway. Same TRUNCATE + full re-extract pattern decision
    // #41 used for its own threshold change.
    await client.query('TRUNCATE collocation_examples, sentences');
    console.log('Truncated collocation_examples and sentences');

    const pairs = await loadCollocationPairs(client);
    console.log(`Loaded ${pairs.length} collocation pairs`);

    const leftIndex = buildLeftIndex(pairs);
    console.log(`Left-word index built: ${leftIndex.size} unique words`);

    const simplicityMap = await loadSentenceSimplicity(dataDir);

    const sentencesFile = path.join(dataDir, `${corpusPrefix}-sentences.txt`);
    const bestByPair = await findBestExamples(leftIndex, sentencesFile, simplicityMap);

    await writeResults(client, pairs, bestByPair);
  } finally {
    await client.end();
    console.log('Disconnected');
  }
}

main().catch(err => {
  console.error('Extract examples failed:', err);
  process.exitCode = 1;
});
