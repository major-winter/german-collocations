### 53. Verb subject/object arguments replace the noun/verb sections (first grammar-based section)

Follow-up to decision #52: the user chose to move from linear-adjacency
collocations (decision #44) toward grammar-based ones, one relation at a
time, replacing the corresponding section as each relation is validated
(chosen over an additive-layer or single-big-migration alternative).
First relation: verb subject/object - the "who does what to whom"
relation, and the natural next step after Rektion's dependency-parsing
groundwork.

#### First: decision #52 was never actually wired in

Before starting this work, found that decision #52's governed-preposition
feature - despite that decision's own "Verification" section claiming
`Word.tsx wires GovernedPrepositions correctly` - had no working path at
all: no `governedPrepositions` field on `CollocationResponse`, no
repository query, no service wiring, no compose service for
`load-verb-prepositions` in either compose file, and `Word.tsx` never
imported `GovernedPrepositions`. The migration, loader script, Python
extraction script, and frontend component existed as orphaned files with
nothing connecting them. Completed that wiring as part of this session
(see "Backend/frontend wiring" below) rather than leaving it broken.

#### Empirical validation: subjects/objects need a dependency parse, and passive voice needs real disambiguation

Hand-verified spaCy's dependency labels against 14 real corpus sentences
(same precedent as #52's 12) before writing `extract_verb_arguments.py`,
covering active SVO, a fronted subject before a verb-second main clause,
a subordinate verb-final clause, a reflexive-object construction, perfect
tense, three-level modal+passive stacking, simple passive, agentive
passive, subjectless dative passive, and future tense.

Confirmed `sb`/`oa`/`da`/`og` attach directly to the verb token
regardless of linear distance - German subjects/objects routinely sit far
from their verb (subordinate clauses are verb-final, main clauses front
arbitrary constituents, passive/perfect/modal constructions stack an
auxiliary between the verb and its arguments), so plain adjacency
(`lemma_collocations`) can't identify them reliably the same way it
couldn't identify governed prepositions in #52.

Passive voice needed real disambiguation, not an assumption:

- A participle (`VerbForm=Part`) never carries its own `sb` child, in
  either perfect ("hat ... gekauft") or passive ("wurde ... gekauft") -
  the subject always attaches to the finite verb/aux/modal instead.
  Finding it means walking up through however many `dep_ == "oc"`
  aux/modal links stack - confirmed necessary by a genuine 3-level case,
  "Neuwagen ... verkauft werden dürfen": the `sb` sits on "dürfen", two
  hops above the participle.
- Distinguishing passive ("werden" + Partizip II) from perfect ("haben" +
  Partizip II) or future/modal ("werden"/modal + Infinitiv) matters
  because German passive promotes only the accusative object to
  nominative subject position - confirmed with "Allen wird geholfen" /
  "Uns wurde geholfen": the dative object stays put on the participle and
  the clause is subjectless, no promoted `sb` at all. The `VerbForm`
  feature (Part vs. Inf) on the embedded verb is what disambiguates
  "werden" as a passive auxiliary from "werden" as the future auxiliary -
  confirmed with "werden Sie ... Brillen verkaufen": "verkaufen" stays a
  plain Infinitiv with its own local `oa` child ("Brillen") and an
  unpromoted subject on "werden" - ordinary active future tense.
- "sein" + Partizip II is genuinely ambiguous from the parse alone
  (Perfekt for a small class of intransitive motion/change verbs vs.
  Zustandspassiv for transitive ones - "ist gegangen" vs. "ist verkauft"
  are structurally identical). Skipped entirely rather than guessed -
  precision over recall, same call as #52's threshold tuning. Also
  observed a related spaCy lemmatizer gap for some of these motion-verb
  participles ("zusammengestoßen" instead of "zusammenstoßen"): the
  participle surface form is returned as the lemma, so the argument's
  *relation* is still correctly identified but the *verb text* shown is
  occasionally the inflected form, not the infinitive. Known limitation,
  not fixed - rare enough in the top-ranked results checked (see
  Verification) not to special-case, same spirit as #52's
  "Handvoll"-instead-of-"Leute" measure-noun limitation.
- A passive's expressed agent (the "von + Dativ" phrase) is recovered via
  the participle's own `sbp` child and that child's `nk` grandchild,
  attributed as the participle's Subjekt. Same known limitation as #52's
  agent-phrase handling: a measure-noun phrase ("eine Handvoll Leute")
  attaches "Handvoll" as the `nk` head, not "Leute".

Arguments are restricted to `NOUN`/`PROPN` children: an early sample run
without this filter let interrogative/indefinite pronouns through
("wer", "was", "nichts", "viele" - all tagged `PRON`) and a nominalized-
infinitive complement ("fordern" + "handeln" as an `oa` child) - these
are grammatically valid dependents but not nouns a learner wants to
memorize as a collocate.

#### New offline tool

`tools/pos-tagging/extract_verb_arguments.py` - same one-shot, laptop-
only, never-containerized contract as the repo's other pos-tagging
scripts. Parser enabled (same speed class as `extract_verb_prepositions
.py`, ~920 sentences/sec measured on the full 1M-sentence corpus, ~18 min
elapsed). Applies the same `filters.ts`-mirroring stopword/non-
alphabetic filter as the other scan tools. Output: `verb_argument.tsv`
(`verb_lemma\trelation\targument_lemma\tcount`) - 814,714 distinct
triples, 0% loader skip rate.

Example sentences are captured in the *same* parse pass, not a second
corpus scan: `collocation_examples` (decision #41) only covers linearly-
adjacent surface-form pairs, and a subject/object pair is frequently not
adjacent - the entire reason this feature exists - so it can't serve
these entries, and `CollocationList.tsx` filters out any entry with zero
examples. Word/clause-count simplicity scoring is computed inline
(identical logic to `score_sentence_simplicity.py`'s `score_sentence`,
reused rather than re-derived) and the best 3 per (verb, relation,
argument) triple are kept via the same bounded-insertion-sort approach as
`extract-examples.ts`. Output: `verb_argument_examples.tsv`
(`verb_lemma\trelation\targument_lemma\tsentence\tverb_surface\t
argument_surface`) - 994,020 rows, 0% loader skip rate.

#### Schema (additive)

`database/migrations/010_add_verb_arguments.sql`: `verb_arguments
(verb_lemma_id, argument_lemma_id, grammatical_relation, count)`, both
lemma sides FK'd to `lemmas` like `verb_prepositions`. `grammatical_relation`
is part of the primary key, same reasoning as `verb_prepositions.
grammatical_case`: the same (verb, argument) pair can legitimately be
both a Subjekt in one sentence and an Akkusativobjekt in another (e.g.
"die Regierung unterstützt" vs. "man unterstützt die Regierung"). No
`significance`/logDice column, same reasoning as `verb_prepositions`:
ranked by share of the verb's own total argument count, a different,
smaller population than `lemma_collocations`' raw adjacency. Indexed on
both `verb_lemma_id` and `argument_lemma_id` - unlike `verb_prepositions`
(only ever queried by `verb_lemma_id`, for the Rektion callout), this
table is queried in both directions: a verb headword's noun section and
a noun headword's verb section.

`database/migrations/011_add_verb_argument_examples.sql`:
`verb_argument_examples (verb_lemma_id, argument_lemma_id,
grammatical_relation, sentence, verb_surface, argument_surface)` with a
serial `id` primary key, not a natural composite key - unlike
`collocation_examples`, there's no shared `sentences` dedup table here
(sentence text is stored directly); this table's own extraction pass
already bounds it to at most 3 rows per triple, and it's always
TRUNCATE + fully reloaded together with `verb_arguments` (same
convention as decision #37/#44), never incrementally upserted.

Loaded via `database/scripts/load-verb-arguments.ts` and
`load-verb-argument-examples.ts`, mirroring `load-verb-prepositions.ts`'s
resolve-via-in-memory-map-then-batch-insert pattern. New
`load-verb-arguments` / `load-verb-argument-examples` compose services
added to **both** `compose.yml` and `compose.prod.yml` individually
(checked both files by hand - CLAUDE.md's own failure class #2, and
exactly the gap decision #52 fell into for `load-verb-prepositions`,
fixed alongside this work).

#### Ranking

Ranked by `count / SUM(count) OVER (verb, relation)` - "what share of
this verb's own Subjekt (or Akkusativobjekt, etc.) mentions point to
this specific noun" - the same share-of-the-verb's-own-total metric
decision #52 used for governed prepositions, computed per relation so a
verb's subject-argument mass and object-argument mass don't dilute each
other. Unlike #52's pill (a single grammatical fact, precision-gated at
a 0.20 dominance floor), this is a ranked top-10 list like the other
`CollocationList` sections, so it uses only a light noise floor
(`MIN_ARGUMENT_COUNT = 3`, provisional) rather than a dominance
threshold - checked against the real loaded data: 693,234 of 814,714
triples (85%) occur only once, a classic long tail, and a floor of 3
excludes the bulk of that tail while keeping every triple inspected for
`kaufen`/`verkaufen`/`unterstützen`/`warten`/`brauchen`/`Auto`/
`Regierung` (see Verification) fully intact.

**Bug found and fixed empirically**: the noun-side query (a noun
headword's verb section, filtering by `argument_lemma_id`) initially
computed share via `SUM(count) OVER (PARTITION BY verb_lemma_id,
grammatical_relation)` inside the same `WHERE argument_lemma_id = $1`-
filtered CTE as `verb_side`'s window function - but a window function
only sees rows that already survived the `WHERE` filter, and filtering
to one fixed argument leaves at most one row per (verb, relation) - that
combination is the table's own primary key. Every partition was a
singleton, so every share came out as exactly 1.0. This wasn't caught by
type-checking or by the SQL running without error - it was caught by
testing the actual endpoint end-to-end: "Auto"'s and "Regierung"'s verb
sections came back in plain alphabetical order (an artifact of
Map-insertion order once every row ties at share=1), not ranked by any
real signal, while the verb-side query (immune to the bug, since
filtering to one verb still leaves many rows to partition across its
many different arguments) looked correct. Fixed with a `LATERAL` join
computing each row's total from the full, unfiltered set of that verb's
own rows (`WHERE verb_lemma_id = va.verb_lemma_id AND grammatical_relation
= va.grammatical_relation`) - cheap via `idx_verb_arguments_verb`
(bounded by one verb's own argument count, not a full-table scan), the
same quantity `verb_side` gets for free by filtering to one verb first.
`EXPLAIN (ANALYZE, BUFFERS)` after the fix: 29.8ms for "Auto" (150
qualifying rows after the count-floor, near worst-case for a common
noun) - the `LATERAL`'s aggregate is the dominant cost (150 index scans
of ~40-1000 rows each via `verb_arguments_pkey`), acceptable for a live
request alongside the two other parallel queries, though a precomputed
totals table (like `lemma_frequency`) would be the next optimization if
this measures as a bottleneck under real traffic - not done now, no
evidence yet that it's needed.

Same (verb, argument, section) pair qualifying under more than one
relation (e.g. "Regierung" as both Subjekt and Akkusativobjekt of
"unterstützen") is collapsed to one row via `DISTINCT ON (verb_lemma_id,
argument_lemma_id, section)`, keeping the higher-share relation -
`CollocationEntry` has no field to show two relations for the same word
as visually distinct facts, so showing both would just look like a
duplicate.

#### Backend/frontend wiring

`governedPrepositions: GovernedPreposition[]` (`{ preposition, case }`)
added to `CollocationResponse` (completing #52): new
`GOVERNED_PREPOSITIONS_QUERY` in `CollocationRepository.ts`
(`MIN_GOVERNED_PREPOSITION_COUNT = 5` - checked against the real
`verb_preposition.tsv`: 81,310 of its 99,547 rows, over 80%, have a count
under 5, mostly rare/misparsed verb lemmas where a single co-occurrence
trivially reaches high share; `MIN_GOVERNED_PREPOSITION_SHARE = 0.2`,
`MAX_GOVERNED_PREPOSITIONS = 2`, both already tuned in #52), wired
through `CollocationService`/`CollocationResult`, and `Word.tsx` now
actually imports and renders `GovernedPrepositions` above
`CollocationList` (it never did before this session).

`VERB_ARGUMENTS_QUERY` runs alongside the existing adjacency query and
the governed-prepositions query via `Promise.all`. Sections
`verb_arguments` produced entries for (in practice: "noun" for a verb
headword, "verb" for a noun headword - a lemma only ever qualifies on
one side) replace the corresponding `lemma_collocations`-sourced
section's entries entirely, per decision #53's "replace section-by-
section" scope - done in JS (filter the adjacency entries down to the
non-superseded sections, then concatenate the verb_arguments entries),
not woven into the SQL's `combined`/`ranked` CTEs, to keep the two very
different ranking metrics (logDice vs. share) and two very different
example-sourcing tables (`collocation_examples` vs.
`verb_argument_examples`) from having to share one query.

#### Verification

Full corpus run: 1,000,000 sentences, 814,714 distinct (verb, relation,
argument) triples, 922 sentences/sec, 1,084s (~18 min) elapsed, 0%
loader skip rate for both `verb_argument.tsv` and
`verb_argument_examples.tsv` (`verb_preposition.tsv`, completing #52's
load, also 0%). Migrations 010/011 applied via the `migrate` compose
service against the local dev DB.

Queried the loaded data directly for `kaufen`/`verkaufen`/`unterstützen`/
`warten`/`brauchen` (noun section) and `Auto`/`Regierung` (verb section,
after the bug fix above) - every top-10 result inspected was a real,
sensible collocate (`brauchen`→`Zeit`/`Hilfe`/`Unterstützung`/`Geld`/
`Geduld`; `unterstützen`→`Projekt`/`Ukraine`/`Mensch`/`Regierung`/`USA`;
`Auto`→`überschlagen`/`zusammengestoßen`/`erfasst`/`parken`, all genuine
car-accident-context verbs from a news corpus; `Regierung`→`stürzen`/
`reformieren`/`abschieben`/`kürzen`, genuine political-context verbs),
including a legitimate low-count ditransitive case (`verkaufen` +
Dativobjekt + `Kunde`, count 3, "jemandem etwas verkaufen").

End-to-end via the running dev containers (`docker compose build backend
frontend && docker compose up -d backend frontend`, then the four
loader services): `curl`'d `/api/collocations/:word` for all of the
above and confirmed `governedPrepositions` and the replaced noun/verb
sections both come back correctly shaped with 3 examples each, and that
an empty-table baseline (checked before loading) degrades to the old
adjacency-only behavior with `governedPrepositions: []` - fully
backward compatible. Confirmed via `docker compose logs frontend` that
the Vite dev server compiles the `Word.tsx`/`GovernedPrepositions.tsx`
wiring with no errors; `tsc --noEmit` clean on both `backend` and
`frontend`.

**Not yet done**: an actual in-browser visual check - no headless-
browser tooling is available in this environment (same gap noted in
decisions #51/#52). Not yet deployed to production (`compose.prod.yml`)
- this session's work is local/dev-verified only; production deploy
(migrate, rebuild+restart `backend`/`frontend`, run all four loaders
there) is a follow-up step. `MIN_ARGUMENT_COUNT`'s value is provisional,
same status as decision #52's threshold tuning before it was finalized -
revisit if real usage surfaces noise or over-filtering. The next
grammar-based relation (adjective-noun attributive, or noun-noun
genitive - both raised as options alongside subject/object, deferred)
remains unbuilt.

#### Follow-up: display turned off

After this was verified working end-to-end (including the case-color
badges added in the same session, mapping `grammatical_relation` onto
the same palette as decision #52's `grammatical_case`), the user asked
to stop showing the noun/verb section replacement "for now" - useful,
but not something that should ship in the moment. Scope confirmed
explicitly: the noun/verb sections only, not `GovernedPrepositions`
(decision #52), which the user kept on.

Disabled via a single flag, `VERB_ARGUMENTS_ENABLED = false` in
`CollocationRepository.ts`, rather than reverting any of the above -
schema, loaders, the query, and the frontend relation-badge rendering
are all left in place and functional. The flag skips running
`VERB_ARGUMENTS_QUERY` entirely (not just ignoring its results), so
`findByWord` degrades to exactly its pre-#53 behavior: noun/verb
sections come from `lemma_collocations` adjacency only, and
`CollocationEntry.relation` is always absent. Confirmed via the live
endpoint: `unterstützen` (which had no adjacency-strength noun
collocates - part of the original motivation for this decision) now
correctly shows no noun-section entries at all, and `Auto`'s verb
section reverted to its old adjacency-sourced list. Re-enabling later is
this one flag flip plus a rebuild.

#### Follow-up: re-enabled (2026-09-10)

`VERB_ARGUMENTS_ENABLED` flipped back to `true`. Data was already fully
loaded locally (814,710 rows in `verb_arguments`, 99,547 in
`verb_prepositions`, 994,016 in `verb_argument_examples` - matching this
decision's original full-corpus numbers), so this was purely the flag
flip plus a `backend` rebuild/restart - no loader re-run needed.

Re-verified via the live endpoint: `kaufen`'s `noun` section now returns
`Kunde`/`Mensch`/`Stadt`/`Land` as `Subjekt` and `Aktie` as
`Akkusativobjekt`; `Auto`'s `verb` section returns
`überschlagen`/`zusammengestoßen` as `Akkusativobjekt` and
`stießen`/`kollidiert`/`mitgeschleifen` as `Subjekt` - consistent with
this decision's original verification data.

Also closed a gap both this decision and #52 explicitly left open: an
actual in-browser check (not just `curl`/transformed-source reading).
Loaded `/wort/kaufen` and `/wort/Auto` in the running dev frontend and
confirmed the relation badges render correctly above their example
sentences.

`GovernedPrepositions` (#52) was unaffected by this toggle the whole
time and was independently re-confirmed working before this session
(`warten` → `auf`, Akkusativ, 46.6% share) - the toggle only ever gated
the noun/verb section replacement.
