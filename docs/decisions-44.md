### 44. Lemma-based collocation grouping

Collocations were keyed by exact surface form: "Einsatz" and
"Einsätze"/"Einsatzes"/"Einsätzen" (four separate `words` rows) had
completely separate, siloed collocation data, and the display list
routinely showed near-duplicate entries that were really the same
underlying collocation — "Einsatz"'s verb section showed
`kommen`/`kommt`/`kam`/`gekommen`/`kamen` as five separate entries, all
really "zum Einsatz kommen", splitting a 10-slot section five ways.

Considered two fixes: (A) merge surface-form rows at query time via a
lemma map, layering extra grouping logic onto the existing
surface-form-keyed `collocations` table; (B) re-derive cooccurrence at
lemma-pair granularity from the raw corpus. Chose B: the loaded
`sentences.txt` is the exact same corpus Leipzig's `co_n.txt` was
computed from (`words.frequency` sums to the same 11.6M tokens), so this
isn't a smaller/worse sample — it's the identical source data, tallied a
different way. Confirmed spaCy's German lemmatizer needs sentence
context to be reliable (isolated "Einsatzes" mistags as ADJ with lemma
"einsatz"; in a real sentence it correctly resolves to NOUN/"Einsatz"),
and doesn't need the dependency parser (identical results with it
disabled), so the new tool reuses `tag_words.py`'s fast tagger-only
speed class rather than `score_sentence_simplicity.py`'s slower one.

Lemma-grouped collocations **replace** the surface-form list entirely,
not an additional view.

#### Schema

New tables (all additive, `words`/`collocations` untouched):

- `lemmas` (`id` invented via `IDENTITY` — lemmas aren't a Leipzig
  concept, unlike `words.id`) and `word_lemmas` (raw `(word_id,
  lemma_id, count)` counts, mirroring `word_pos`'s shape and reasoning —
  keep ambiguity visible rather than baking in one mapping).
- `lemma_collocations` (`left_lemma_id, right_lemma_id, cooccurrence`) —
  no `significance` column; decision #43 already moved ranking to
  logDice, so there's no need to reinvent Leipzig's significance formula
  at lemma granularity.
- `word_dominant_lemma`, `lemma_dominant_pos`, `lemma_frequency` — see
  Performance below for why these ended up as tables, not views.

New offline tool: `tools/pos-tagging/extract_lemmas.py`, one pass over
`sentences.txt` (tagger + lemmatizer, parser disabled), producing
`word_lemma.tsv` (`word\tlemma\tcount`) and `lemma_collocations.tsv`
(`left_lemma\tright_lemma\tcount`). New loaders `load-lemmas.ts` /
`load-lemma-collocations.ts` mirror `load-pos.ts`'s resolve-and-batch
pattern. New compose services `load-lemmas` / `load-lemma-collocations`
in both `compose.yml` and `compose.prod.yml`.

#### Bug found and fixed: numerator/denominator asymmetry for filtered words

This project already excludes stopwords (`der`, `die`, `und`, ...) and
non-alphabetic tokens from `words`/`collocations` (`database/src/
filters.ts`, used by `load-data.ts`). `extract_lemmas.py`'s first version
didn't apply this filter — it tallied cooccurrence from the full,
unfiltered corpus scan. Since `lemma_frequency` is built from the
already-filtered `words` table, a stopword lemma like "der" (which
aggregates der/die/das/den/dem/des — collectively over a million token
occurrences) got almost none of its true frequency into the denominator,
while its numerator (cooccurrence with any noun) was the true, massive
count. Result: `logDice > 11` for "Einsatz der"/"Regierung der" —
higher than genuine collocations, and duplicated per direction since
`der` legitimately appears as both left and right partner.

Fixed by porting `filters.ts`'s exact check (`isNonAlphabetic(word) ||
isStopword(word)`, literal copy in Python, not a shared file — matches
this tool's already-standalone relationship to the rest of the repo) into
`extract_lemmas.py`: an excluded token is dropped from both counters but
stays in the per-sentence position sequence, so it still correctly
breaks adjacency between its neighbors (unlike `PUNCT`/`SYM`, which are
removed from the sequence entirely and can be "skipped over"). This
matches Leipzig's own `co_n.txt` semantics as already used by this
project — a stopword-adjacent pair is dropped, not bridged.
`isNonAlphabetic` was caught by re-checking `load-data.ts`'s full filter
rather than assuming `isStopword` was the whole story — a token like a
plain number is tagged `NUM` by spaCy, not `PUNCT`/`SYM`, so
`EXCLUDED_POS` alone wouldn't have caught it, and it would have hit the
same asymmetry bug for a different reason. Required two full re-runs of
the corpus scan (~15 min each) to catch both cases before the data was
clean; verified with `EXPLAIN`-adjacent direct output inspection, not
just spot-checking the words already used as test cases throughout this
session.

**Known, accepted limitation, not fixed**: inflected possessive-pronoun
forms (`ihre`, `meine`, `unsere`, ...) aren't in `filters.ts`'s
`STOPWORDS` (only base forms `ihr`/`mein`/`unser` are), so they were
never filtered even in the original surface-form pipeline. Lemma-merging
makes their combined signal strong enough to surface now (e.g. "ihr"
appearing for "Kinder"), where before each inflected form individually
was too weak to break into a top-10 list. Confirmed this is not the same
bug — the data is consistent, not asymmetric. Explicitly decided to leave
this as-is rather than expand `filters.ts` as part of this change, since
that list is shared with the original surface-form pipeline and touching
it is a broader, separate decision.

#### Performance: two views had to become tables

`word_dominant_lemma` was first built as a view mirroring
`word_dominant_pos` (`006_add_word_dominant_pos_view.sql`) exactly —
same reasoning, same `DISTINCT ON (word_id)` shape, and #006 had
measured negligible cost for this shape. That measurement doesn't
transfer here: `word_dominant_pos` is always filtered by the same key
it's `DISTINCT ON`'d by (`word_id`), which Postgres pushes into an
index scan. `lemma_frequency` and `lemma_dominant_pos` both need to
re-aggregate `word_dominant_lemma` by a *different* key (`lemma_id`),
which is not push-down-able through a live `DISTINCT ON` — Postgres has
to compute every word's dominant lemma before it can group by lemma_id.
Measured directly: a per-word collocation query timed out (>2 minutes).

Fixed by materializing `word_dominant_lemma` as a table with an index on
`lemma_id`, populated once by `load-lemmas.ts` right after
`word_lemmas` loads. That alone wasn't enough — `EXPLAIN (ANALYZE,
BUFFERS)` on the fixed query showed the *same* `lemma_frequency` view
used two different plans in one query: one join used the new index
(fast), the other chose to fully re-materialize the aggregate anyway
(~1s just for that join), because the query planner's cost-based choice
isn't guaranteed to pick the index just because it exists. Rather than
depend on that choice going the right way, `lemma_dominant_pos` and
`lemma_frequency` were also converted to tables, populated by the same
loader step. No drift risk in practice: like every other table in this
schema, these only change via a full corpus reload (decision #37), never
incrementally. Final measured query time: ~54ms (`EXPLAIN ANALYZE` on
the "Einsatz" case, previously representative of the slowest queries),
confirmed end-to-end via the API (~55-65ms wall time per request).

#### Query and examples

`backend/src/repositories/CollocationRepository.ts`: `findByWord`
resolves the surface form to `words.id` (unchanged), then to its
`word_dominant_lemma`-assigned `lemma_id`, then queries
`lemma_collocations` by that id. `buildBranchQuery`'s two-direction
union, `SECTION_CASE`, `PER_SECTION_LIMIT`, and `MIN_LOG_DICE` carry over
structurally unchanged, just re-pointed at the lemma tables. Displayed
`word` is the lemma's text (spaCy's German lemmas are properly cased —
confirmed "Einsatz", not "einsatz" — matching the dictionary/word-sketch
convention of showing the lemma as headword).

`collocation_examples` (decision #41) stays keyed by surface-form
`(left_word_id, right_word_id)` pairs — no re-run of that extraction was
needed. The query widens the match via a `LATERAL` join through
`word_dominant_lemma` on both sides, so a merged "Einsatz"+"kommen" entry
can surface an example originally captured under the "Einsatz"/"kam"
surface pair — verified directly: its three examples now span "Einsätzen
kommen", "Einsatz kommen", and "Einsatz kommen" from different original
surface pairs. `LATERAL` (not a precomputed CTE) so each lookup is
scoped to one specific lemma pair via an indexed equality rather than
joining the full `collocation_examples` table before filtering.

One incidental fix while rewriting the query: `log()` returns Postgres
`numeric`, which `node-postgres` parses as a string by default (to avoid
float precision loss). The old surface-form query never hit this because
it displayed the *original* `real`-typed `significance` column and used
`log_dice` only for ordering; this query has no other significance
source, so it displays `log_dice` directly and needed an explicit
`::real` cast to come back as a JSON number instead of a string.

#### Verification

Confirmed across 11 query words (not just the ones already used as test
cases through this session): "Einsatz"'s `kommen` family merges into one
entry with cooccurrence 338 (matching the sum of what were five separate
entries); "der"/"und"/"das" are gone everywhere; "Einsatz war" (decision
#43's fix) still holds at lemma granularity; response times are ~55-65ms
end-to-end.
