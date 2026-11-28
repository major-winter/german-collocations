# Search suggestions by lemma (design)

Status: approved by the user in the dispatch (small increment, backend
only). To be logged as decision #85. Backs change #3 "Vorschläge" of the
2026-11-28 UI proposals; the frontend combobox is a separate branch.

## Why

`/api/search` answers a typed prefix with fuzzy surface *words*. For
"Entsch" 5 of 6 rows are forms of *entscheiden* (entschied, entschieden,
entscheidet, ...), and the rows carry no word class or article. As-you-type
suggestions must show lemmas (CLAUDE.md: chips and suggestions show lemmas),
once each, with what a learner needs to pick: word class and, for nouns,
the article.

## Goals

- A new endpoint `GET /api/suggest?q=<prefix>` returning at most 6 lemmas,
  each once, with word class and article.
- Prefix matches first; frequency decides within a tier.
- `Cache-Control` so repeated prefixes cost nothing.
- Latency stays within today's 33-70 ms on the 1 GB VM; no new table, no
  migration, no dependency.

## Non-goals

- No fuzzy (trigram) matching and no typo repair: that stays `/api/search`
  (not-found page). Suggestions are for completing, not repairing.
- `/api/search` is not changed (its only consumer is the not-found page in
  `frontend/src/routes/Word.tsx`, which wants surface words and scores).
- No frontend change.

## Anti-goals

- An article or word class the data does not support. Article exists only
  for the 7,194 nouns in `lab_noun_genders` (#69); every other noun gets
  `article: null`, never a guess from capitalisation or suffix.
- Suggesting a lemma the word page cannot open (the lemma text must exist
  as a `words.word`).
- A heavier query than the VM carries: short prefixes ("ve" matches 12k
  words) must not scan the lemma tables.

## Data (checked against the dev database, 2026-11-28)

| Need | Where | Coverage |
|---|---|---|
| lemma per word | `word_dominant_lemma` -> `lemmas` | 623k of 716k words |
| word class | `lemma_dominant_pos.pos` (spaCy: NOUN 347k, PROPN 117k, ADJ 31k, VERB 21k, ADV 10k, ...) | 528k of 570k lemmas; lemmas without a row are skipped |
| lemma frequency | `lemma_frequency` | same 528k |
| article | `lab_noun_genders.article`, keyed by lemma text | 7,194 nouns; rest `null` |
| prefix index | `idx_words_normalized_trgm` (GIN) serves `LIKE 'prefix%'`; the btree does not (collation en_US) | all words |

`word_normalized = normalize_de(word)` (lowercase, ä->ae, ß->ss), so a
learner typing "grö" or "groe" matches *Größe*, and case never matters.

## Approaches

1. **Group all prefix-matching words by lemma** (first draft). Correct, but
   for "ve"/"ge"/"a" it scans `word_dominant_lemma` and `lemma_frequency`
   (parallel seq scans): 260-410 ms. Rejected.
2. **Top 300 prefix-matching words by word frequency, then group by lemma**
   (recommended). The trigram bitmap scan finds the matches, a top-N sort
   keeps 300, and the lemma joins are 300 index lookups. 5-47 ms measured.
   Cost: a lemma whose forms are all rarer than the 300th form of the same
   prefix is not suggested; for a 6-row list that is the right trade.
3. **Add a `lemma_normalized` column or table with a prefix btree.** Fastest
   and exact, but a migration and a reload for a 6-row list. Not now.

## Design

Endpoint `GET /api/suggest?q=Entsch`, 400 on a missing `q`, as `/api/search`.
A trimmed query shorter than 2 characters returns `[]` (200). Headers:
`Cache-Control: public, max-age=3600` on 200 (corpus data changes only with
a reload, #37); none on 400/500.

Response, an array, best first, at most 6:

```json
[
  { "lemma": "Entscheidung", "wordClass": "noun", "article": "die" },
  { "lemma": "entscheiden", "wordClass": "verb", "article": null },
  { "lemma": "entscheidend", "wordClass": "adjective", "article": null }
]
```

`wordClass` is one of `noun`, `verb`, `adjective`, `adverb`, `name`
(spaCy PROPN), `other`. Mapping: NOUN -> noun; VERB, AUX -> verb; ADJ ->
adjective; ADV -> adverb; PROPN -> name; the rest -> other. The frontend
opens `/wort/<lemma>`; the lemma is a real word, so the page resolves it.

Ranking (SQL `ORDER BY`): (1) the lemma itself starts with the typed prefix,
before lemmas reached only through an inflected form (typing "Fraue" still
offers *Frau*, after any lemma that starts with "Fraue"); (2) names last;
(3) `lemma_frequency` descending; (4) lemma text, for a stable order.

Hexagonal split: inbound port `SuggestLemmas`, outbound `LemmaIndex`,
`SuggestLemmasService` (trim, minimum length, limit 6), `PgLemmaIndex`
(query), `suggestHandler` (HTTP, cache header), pure
`domain/wordClass.ts` (POS -> wordClass). The `%`, `_` and `\` in the typed
text are escaped before they go into `LIKE`.

## Risks

- The 300-form cap hides rare lemmas for 2-letter prefixes (accepted above).
- Noisy short prefixes still return common function words (*der*, *die*)
  because that is what is frequent; nothing filters stop words (no data for
  it; the frontend can wait for 3 characters if it wants).
- A cached response up to an hour old after a corpus reload: acceptable;
  reloads are announced deploys.
- A lemma without a `lemma_dominant_pos` row (42k, mostly rare) is never
  suggested.

## Tests

- Domain (`wordClass.test.ts`): every POS maps; unknown -> other.
- Service (`SuggestLemmasService.test.ts`): trims, under 2 characters never
  reaches the index, limit 6 passed.
- Handler (`suggestHandler.test.ts`): 400 without `q`; 200 sets
  `Cache-Control` and returns the array; 500 sets none.
- Database (`suggestLemmas.dbtest.ts`): forms collapse to one lemma; own
  prefix before form-only match; names after others; frequency order; article
  only from `lab_noun_genders`, `null` otherwise and for non-nouns; umlaut
  and case-insensitive prefix; `%` in the query matches nothing special; the
  lemma not present as a word is not suggested.

## Spot-check

About 20 prefixes against `/api/search` (before) and `/api/suggest`
(after) in decision #85.

## Deploy notes

Backend only: build and restart `backend` (`up -d --no-deps`). No
migration, no data load. Check the live endpoint with
`curl -i '/api/suggest?q=Entsch'` for the header.

## Left to the builder / frontend

- Debounce and abort stay in the frontend; a response is cacheable by URL.
- The frontend decides whether to show `wordClass` as a dot or a word and
  how to print "die Entscheidung" (article before lemma, muted).
