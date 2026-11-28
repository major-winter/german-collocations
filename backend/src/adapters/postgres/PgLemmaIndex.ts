import { Pool } from "pg";
import type { LemmaSuggestion } from "@collocations/types";
import type { LemmaIndex } from "../../application/ports/out/LemmaIndex.ts";
import { wordClassOf } from "../../domain/wordClass.ts";

// Decision #85. Step 1 takes the FORM_LIMIT most frequent words that start
// with the typed prefix (the trigram GIN index serves LIKE 'prefix%'; the
// btree does not, the database collation is en_US), step 2 maps them to
// their dominant lemmas. Grouping every matching word instead scanned the
// lemma tables for 2-letter prefixes (260-410 ms against 5-47 ms).
const FORM_LIMIT = 300;

// Decision #79's adjective rule, as in PgCollocationStore: spaCy tags an
// uninflected adjective ADV, so a lemma is an adjective when ADJ and ADV
// together reach the dominance threshold and ADJ alone this share.
const MIN_ADJECTIVE_TAG_SHARE = 0.05;
const ADJECTIVE_TAG_DOMINANCE = 0.8;

// $1 is the typed text with LIKE wildcards escaped, $2 the row limit.
// A lemma is only offered when it has a word class and is itself a word,
// so the word page can open it; a lowercase letter followed by a capital
// ("wichtigDie") is a tagger glue artefact and is dropped. Lemmas that start with the prefix come
// before those reached through an inflected form; names come last.
const QUERY = `
WITH forms AS (
  SELECT w.id, w.frequency
  FROM   words w
  WHERE  w.word_normalized LIKE normalize_de($1) || '%'
  ORDER  BY w.frequency DESC
  LIMIT  ${FORM_LIMIT}
), hit_lemmas AS (
  SELECT DISTINCT wdl.lemma_id
  FROM   forms f
  JOIN   word_dominant_lemma wdl ON wdl.word_id = f.id
)
SELECT l.lemma, g.article,
       CASE WHEN ldp.pos IN ('ADJ', 'ADV')
             AND las.adj_share >=${MIN_ADJECTIVE_TAG_SHARE}
             AND las.adj_share + las.adv_share >= ${ADJECTIVE_TAG_DOMINANCE} THEN 'ADJ'
            ELSE ldp.pos END AS pos
FROM   hit_lemmas h
JOIN   lemmas l               ON l.id = h.lemma_id
JOIN   lemma_dominant_pos ldp ON ldp.lemma_id = l.id
JOIN   lemma_frequency lf     ON lf.lemma_id = l.id
JOIN   words own              ON own.word = l.lemma
LEFT   JOIN lemma_adjective_shares las ON las.lemma_id = l.id
LEFT   JOIN lab_noun_genders g ON g.noun = l.lemma AND ldp.pos = 'NOUN'
WHERE  l.lemma !~ '[a-zäöüß][A-ZÄÖÜ]'
ORDER  BY (normalize_de(l.lemma) LIKE normalize_de($1) || '%') DESC,
          (ldp.pos = 'PROPN'),
          lf.frequency DESC,
          l.lemma
LIMIT  $2
`;

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}

// Driven adapter: lemma suggestions over words, lemmas and their word class.
export class PgLemmaIndex implements LemmaIndex {
  #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async suggest(prefix: string, limit: number): Promise<LemmaSuggestion[]> {
    const result = await this.#pool.query<{ lemma: string; pos: string; article: "der" | "die" | "das" | null }>(
      QUERY,
      [escapeLike(prefix), limit],
    );
    return result.rows.map((row) => ({
      lemma: row.lemma,
      wordClass: wordClassOf(row.pos),
      article: row.article,
    }));
  }
}
