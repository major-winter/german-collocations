### 54. Adjective-noun attributive relations (second grammar-based section)

Follow-up to decision #53: the second grammar-based relation, chosen
from the two options that decision explicitly left deferred (adjective-
noun attributive vs. noun-noun genitive). Adjective-noun was picked
first per `docs/collocation-fluency-gap-report-2026-09-08.md`'s ranked
recommendation #2 - it's earlier-acquired than verb-based relations in
the L2-acquisition literature that report cites, but still error-prone
through B1/B2, and it's a direct continuation of #52/#53's pattern
rather than new architecture.

#### Empirical validation: distinguishing attributive from predicative needs no extra check, coordination does

Hand-verified spaCy's dependency labels against 12 real corpus sentences
(same precedent as #52's 12 and #53's 14) via
`tools/pos-tagging/verify_adjective_attribute.py` before writing
`extract_adjective_attributes.py`, covering plain attributive,
predicative, stacked attributives, genitive/accusative case,
comparative/superlative, an attributive participle, a nominalized
adjective, and 2-way and 3-way coordination.

- A direct attributive adjective is an `ADJ` token with `dep_ == "nk"`
  whose head is `NOUN`/`PROPN` (TIGER/Negra scheme, same `nk` label
  decision #52 found on a preposition's case-bearing child). Holds
  regardless of case or comparison degree.
- Predicative use is excluded for free, with no `dep_`-based check
  needed: German predicative adjectives never carry an agreement ending
  ("groß", not "großes"/"große"), and spaCy's `de_core_news_sm` tags the
  uninflected predicate form as `ADV`, not `ADJ` - confirmed empirically
  ("Das Auto ist sehr groß." produces no `ADJ` token at all for "groß").
- Nominalized adjectives ("Die Alten saßen...") are excluded the same
  way - tagged `NOUN`, not `ADJ`, so they never enter this extraction at
  all.
- Attributive participles ("das gekaufte Auto") need no special-casing,
  unlike #53's passive-voice handling: spaCy already tags an
  attributively-used participle as `ADJ` with `dep_ == "nk"` (identical
  shape to a plain adjective), while a periphrastic passive/perfect
  participle ("wurde verkauft", "hat gekauft") stays `VERB` with
  `dep_ == "oc"`. The inflected/uninflected distinction that separates
  predicative from attributive adjectives does the same job here for
  free.
- Coordinated adjectives need real handling: in "großes und teures
  Auto", only "großes" attaches directly to "Auto" via `nk` - "teures"
  attaches to "und" (`dep_ == "cj"`), and "und" attaches to "großes"
  (`dep_ == "cd"`). For a 3-way coordination the chain is longer still -
  the number of hops isn't fixed, so `find_attributive_noun` walks up
  through however many `cj`/`cd` links stack until a token with
  `dep_ == "nk"` is found, the same shape of technique #53 used for
  walking up `aux`/modal chains to find a passive's subject.

Unlike #53, there's no passive-voice-style disambiguation problem here
at all - attributive vs. predicative is a clean structural test with no
ambiguous middle case (no equivalent of #53's "sein" + Partizip II
genuine ambiguity).

#### New offline tool

`tools/pos-tagging/extract_adjective_attributes.py` - same one-shot,
laptop-only, never-containerized contract as the repo's other
pos-tagging scripts, parser enabled. Applies the same `filters.ts`-
mirroring stopword/non-alphabetic filter as the other scan tools.
Output: `adjective_attribute.tsv` (`noun_lemma\tadjective_lemma\tcount`)
- 444,470 distinct pairs. Example sentences captured in the same parse
pass as `extract_verb_arguments.py` does, for the same reason: a
predicative sentence with no attributive relation at all wouldn't be a
valid example even if it happened to be linearly adjacent, so
`collocation_examples` (decision #41) can't serve these entries.
Word/clause-count simplicity scoring and the bounded-insertion-sort
best-3-per-pair selection are identical logic to
`extract_verb_arguments.py`'s, reused inline. Output:
`adjective_attribute_examples.tsv`
(`noun_lemma\tadjective_lemma\tsentence\tnoun_surface\tadjective_surface`).

Unlike `verb_argument.tsv`, there's no `grammatical_relation` column: a
(noun, adjective) pair can't legitimately mean two different things the
way (verb, argument) can (Subjekt vs. Akkusativobjekt) - attributive
modification is the only relation this extraction captures.

#### Schema (additive)

`database/migrations/012_add_adjective_attributes.sql`:
`adjective_attributes (noun_lemma_id, adjective_lemma_id, count)`, both
sides FK'd to `lemmas`. Primary key is exactly the (noun, adjective)
pair - no third key column, unlike `verb_arguments`/`verb_prepositions`,
since there's no second relation to disambiguate. Indexed on both
`noun_lemma_id` and `adjective_lemma_id` - queried in both directions,
same reasoning as `verb_arguments`.

`database/migrations/013_add_adjective_attribute_examples.sql`:
`adjective_attribute_examples (noun_lemma_id, adjective_lemma_id,
sentence, noun_surface, adjective_surface)` with a serial `id` primary
key, same reasoning as `verb_argument_examples` (migration 011): no
shared `sentences` dedup table, bounded to 3 rows per pair by the
extraction pass itself, always TRUNCATE + fully reloaded (decision
#37/#44 convention).

Loaded via `database/scripts/load-adjective-attributes.ts` and
`load-adjective-attribute-examples.ts`, mirroring
`load-verb-arguments.ts`/`load-verb-argument-examples.ts`'s
resolve-via-in-memory-map-then-batch-insert pattern exactly. New
`load-adjective-attributes`/`load-adjective-attribute-examples` compose
services added to **both** `compose.yml` and `compose.prod.yml`
individually (checked both files by hand - CLAUDE.md's own failure
class #2).

#### Ranking

Ranked by `count / SUM(count)` over the fixed side's own total - same
share-of-own-total metric as #52/#53. `MIN_ADJECTIVE_ATTRIBUTE_COUNT = 3`
(same value as `MIN_ARGUMENT_COUNT`), checked against the real loaded
data before picking it, not assumed equal just because the query shape
matches: 401,883 of 444,470 rows (90.4%) have a count under 3 - an even
steeper long tail than `verb_argument.tsv`'s 85% - so the same threshold
excludes at least as much noise here.

**Bug found and fixed empirically, distinct from decision #53's**: the
noun-side query (`noun_side`, an attributive-adjective section for a
noun headword) computes share via `SUM(aa.count) OVER ()` with no
`PARTITION BY`, safe because `noun_side`'s `WHERE` already fixes
`noun_lemma_id`, so every row in scope shares the same noun and the
unpartitioned sum is exactly that noun's own total. The adjective-side
query (`adjective_side`, a noun section for an adjective headword)
needs a genuinely different total per query - but *not* a genuinely
different total per *row*, since `adjective_lemma_id` is fixed to `$1`
for the entire branch. First attempt mirrored decision #53's LATERAL-
join fix verbatim (`JOIN LATERAL (SELECT SUM(...) WHERE
adjective_lemma_id = aa.adjective_lemma_id) totals ON true`) on the
assumption that the same fix would apply the same way. `EXPLAIN
(ANALYZE, BUFFERS)` caught that this was the wrong fix: for "groß"
(1,043 qualifying rows), 983ms and 2.2M buffer hits - Postgres
re-evaluated the identical correlated subquery once per outer row
instead of recognizing it doesn't actually depend on the row, an O(n²)
blowup ("Auto", whose adjective-side branch has 0 rows, measured 4.6ms
by contrast, which is what made the discrepancy obvious enough to
investigate rather than accept). Fixed by replacing the `LATERAL` with a
plain scalar subquery in its own CTE (`adjective_totals`), computed
once, `CROSS JOIN`'d into `adjective_side`: 8.2ms and 390 buffer hits
for "groß" after the fix - both queries verified via live `EXPLAIN
(ANALYZE, BUFFERS)` against the loaded 1M-corpus data, not assumed from
the query shape. The general lesson (kept for the next relation this
pattern gets extended to): a LATERAL/correlated-subquery fix that's
correct for one query isn't automatically correct for a structurally
similar one just because both hit "share can't be a plain window
function" - whether the correlated value actually varies per outer row
determines whether the correlation is needed at all.

No `DISTINCT ON` needed for `adjective_attributes` (unlike
`VERB_ARGUMENTS_QUERY`): with no `grammatical_relation` column, the
primary key is already exactly `(noun_lemma_id, adjective_lemma_id)`, so
`noun_side` and `adjective_side` can never surface the same pair twice.

#### Backend/frontend wiring

`AdjectiveAttributeRow` added to `backend/src/contracts/
CollocationRepository.ts` - same fixed-side shape as `VerbArgumentRow`,
no `relation` field. `ADJECTIVE_ATTRIBUTES_QUERY` runs alongside the
existing three queries via `Promise.all` in `PgCollocationRepository
.findByWord`. Sections `adjective_attributes` produced entries for
("adjective" for a noun headword, "noun" for an adjective headword)
replace the corresponding `lemma_collocations`-sourced section's entries
entirely, unioned into the same `supersededSections` set already used
for `verb_arguments` - a lemma can now be superseded on up to two
independent axes (verb/noun via `verb_arguments`, noun/adjective via
`adjective_attributes`), handled correctly since the set union already
generalizes to any number of contributing tables.

`groupAdjectiveAttributeRows` mirrors `groupVerbArgumentRows`, keyed by
`(nounLemmaId, adjectiveLemmaId)` with no section suffix needed (unlike
`groupVerbArgumentRows`, which needs one because the same verb/argument
pair can genuinely qualify under two different relations - this table
has no second relation to disambiguate). Resulting `CollocationEntry`s
have `relation` left `undefined`, same as any `lemma_collocations`-
sourced entry.

No frontend changes needed at all: `CollocationList.tsx` already groups
generically by `CollocationSection` and `relation` is an optional field
(decision #53) - the existing "adjective"/"noun" section rendering,
color tokens, and example-sentence highlighting all apply unchanged.
Confirmed via `docker compose logs frontend`: Vite dev server compiles
clean with no source changes required; `tsc --noEmit` clean on both
`backend` and `frontend`.

Shipped live immediately, not flag-gated - unlike decision #53's initial
landing (which shipped behind `VERB_ARGUMENTS_ENABLED = false` before a
separate review pass), the user explicitly chose "live immediately" for
this feature once verified, given #53 already went through that
cautious-first-pass/re-enable cycle once and the pattern is now
established.

#### Verification

Full corpus run (already completed before this session started):
1,000,000 sentences, 444,470 distinct (noun, adjective) pairs.
`adjective_attribute.tsv`/`adjective_attribute_examples.tsv` copied into
the bind-mounted `./data/` (gitignored, not committed - same as the
other corpus-derived TSVs). Migrations 012/013 applied via the
`migrate` compose service against the local dev DB (required an
explicit `docker compose build migrate` first - the image was stale
from before these migration files existed, CLAUDE.md failure class #1).
Loaders run via `docker compose --profile manual run --rm
load-adjective-attributes` / `load-adjective-attribute-examples`: 0%
skip rate for both (444,344/444,470 and 569,207/569,357 rows matched -
skips are non-alphabetic/stopword-filtered leftovers already excluded by
`is_excluded_word`, same tolerant-of-gaps pattern as the other loaders).

Backend rebuilt and restarted (`docker compose build backend &&
docker compose up -d backend`) - verified via `docker inspect
german_collocations-backend-1 --format '{{.State.StartedAt}}'` against
the build time, not assumed.

Queried the live endpoint for "Auto"/"Regierung"/"Interesse" (noun
headwords, adjective section) and "groß"/"neu" (adjective headwords,
noun section) - every top-10 result inspected was a real, sensible
collocate: "Auto"→"geparkt"/"entgegenkommend"/"fahrend"/"alt" (genuine
car-context adjectives, including two attributive participles
confirming that path works end-to-end); "Regierung"→"neu"/"israelisch"/
"chinesisch"/"deutsch"/"ukrainisch" (plausible news-corpus political
adjectives); "Interesse"→"groß"/"öffentlich"/"eigen"/"wirtschaftlich"
("großes Interesse", exactly the near-synonym-discrimination example the
gap report's own B1/B2 section used); "groß"→"Teil"/"Herausforderung"/
"Erfolg"/"Problem"/"Rolle" (all natural "großer/großes/große X"
collocations); "neu"→"Jahr"/"Saison"/"Regierung"/"Trainer" (plausible
"neues/neue X"). Confirmed no collision with decision #53's
`verb_arguments`-sourced sections: "warten"'s noun section still shows
`relation`-tagged entries (`Jahr`→Akkusativobjekt etc.) untouched, and
"verkauft" (a word that could plausibly be tagged both `VERB` and `ADJ`
across different corpus sentences, per this decision's own attributive-
participle handling) showed only the `verb_arguments`-sourced `noun`
section in practice, no duplicate/competing `adjective_attributes`
entries for this particular word - the `supersededSections` union
handles the general case regardless, so this wasn't required to hold,
just confirmed as one real data point.

**Not yet done**: an actual in-browser visual check (same gap noted in
decisions #51/#52/#53 - no headless-browser tooling available in this
environment; the frontend dev server was confirmed to compile with no
errors, and the feature needed no frontend source changes at all since
`CollocationList.tsx` already handles arbitrary sections generically).
Not yet deployed to production (`compose.prod.yml`) - this session's
work is local/dev-verified only; production deploy (migrate, copy the
two new TSVs to the production host's data directory, rebuild+restart
`backend`, run both new loaders there) is a follow-up step.
Noun-noun genitive attributes - the other relation decision #53 raised
alongside adjective-noun and explicitly deferred - remains unbuilt.
