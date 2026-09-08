### 52. Governed verb-preposition (Rektion) callout

Research into learner-oriented collocation tools (SKELL/Sketch Engine's
word-sketch grammatical-relation grouping, DWDS Wortprofil, BBI's
"grammatical vs. lexical collocation" distinction) surfaced "which
preposition + case does this verb require" (Rektion, e.g. `warten auf` +
Akkusativ) as a common, high-value, narrowly-scoped first step toward
making the app more useful for learners — chosen by the user over a wider
menu of options (full word-sketch-style relation grouping, a lighter
UX-only pass on existing data, translation glosses).

#### Empirical validation: plain adjacency isn't enough

Before touching the schema, checked whether `lemma_collocations` (linear
adjacency, decision #44) already identifies governed prepositions well
enough via its ADP-dominant partners, ranked by logDice, for 8 known
Rektion verbs (warten, freuen, denken, erinnern, träumen, interessieren,
achten, bestehen). It works for some (`warten`→`auf` clearly top at 5.72
logDice; `erinnern`→`an` at 6.08; `träumen`→`von` at 3.22) but fails
outright for reflexive verbs: `freuen`'s true government (`über`/`auf`)
scored 0.59/0.53, buried under noise like `hinaus` at 4.20;
`interessieren`'s true government (`für`) scored **negative** (-0.37).
Cause: the reflexive pronoun `sich` sits between verb and preposition and
is filtered as a stopword, breaking literal adjacency. `bestehen`'s two
genuine senses (`aus`/`auf`) were also both outranked by free temporal/
attributive adjuncts (`laut`, `seit`).

**Conclusion**: needed real dependency-based extraction (the PP's syntactic
attachment to its verb, independent of literal word distance), not a
relabeling of existing adjacency data.

#### Dependency-label ground truth (hand-verified first, per this project's
own convention — `score_sentence_simplicity.py`'s "verified by hand
against 10 real corpus-style sentences" precedent, since guessing a label
name was exactly what went wrong twice when that script was written)

Ran `de_core_news_sm` against 12 hand-picked sentences covering the 8 test
verbs, including the reflexive-verb failure cases. Findings: a governed
preposition is an `ADP` token whose dependency head **is the verb token**,
labelled `mo` or `op` (both occur for genuine PP complements — the label
alone doesn't distinguish them, word order/distance seems to drive which
one spaCy picks, not government-vs-adjunct status). A separable verb
prefix picked up the same way (e.g. `nach` in `denkt ... nach`,
"nachdenken") is labelled `svp` instead, so it's excluded without a
special case — confirmed it also has no children at all, unlike a real
preposition. The grammatical case lives on the preposition's own `nk`
("noun kernel") child — the NP's head noun/pronoun/determiner — not on the
preposition token itself, which always has empty morphology.

Crucially, this attachment is **head-based, not adjacency-based**: `auf`
in "Wir freuen **uns** auf den Urlaub" attaches directly to `freuen`
(`head=freuen`) regardless of the reflexive pronoun sitting in between.

#### New offline tool

`tools/pos-tagging/extract_verb_prepositions.py` — same one-shot,
laptop-only, never-containerized contract as the repo's other pos-tagging
scripts. Parser enabled (same speed class as `score_sentence_simplicity.py`,
~968 sentences/sec measured on the full 1M-sentence corpus, ~17 min
elapsed). Applies the same `filters.ts`-mirroring stopword/non-alphabetic
filter as the other scan tools (verb side only matters in practice — e.g.
"sein" the verb collides with the possessive-pronoun stopword "sein").
Output: `verb_preposition.tsv` (`verb_lemma\tpreposition\tcase\tcount`) —
99,547 distinct triples from the full corpus, 0% loader skip rate (every
row's verb and preposition lemma resolved against the existing `lemmas`
table).

#### Schema (additive)

`database/migrations/009_add_verb_prepositions.sql`: `verb_prepositions
(verb_lemma_id, preposition_lemma_id, grammatical_case, count)`, both
lemma sides FK'd to `lemmas` like `lemma_collocations`. `grammatical_case`
is part of the primary key (two-way prepositions legitimately govern
different cases for different verbs, and even different senses of the
same verb), and is `NOT NULL` with `''` meaning "unresolved" rather than
nullable, since a `PRIMARY KEY` column can't hold `NULL` in Postgres and
`NULLS NOT DISTINCT` felt like unneeded novelty for a case this simple. No
logDice/significance column — see ranking, below.

Loaded via `database/scripts/load-verb-prepositions.ts`, mirroring
`load-lemma-collocations.ts`'s resolve-via-in-memory-map-then-batch-insert
pattern exactly. New `load-verb-prepositions` compose service added to
**both** `compose.yml` and `compose.prod.yml` individually (checked both
files by hand — CLAUDE.md's own failure class #2 is exactly a decision
applied to one compose file and not the other).

#### Ranking: share of a verb's own attached-PP count, tuned three times

Ranked by `count / SUM(count) OVER (verb)` — a different, smaller
population (syntactically-attached PPs only) than `lemma_collocations`'
raw corpus-wide adjacency, so logDice's frequency-normalization doesn't
apply the same way here; share directly answers "how canonical is this
preposition for this verb."

Threshold tuning against the full-corpus load, for the same 8 test verbs
(`backend/src/repositories/CollocationRepository.ts`,
`MIN_GOVERNED_PREPOSITION_COUNT`/`MIN_GOVERNED_PREPOSITION_SHARE`/
`MAX_GOVERNED_PREPOSITIONS`):

- **0.10** share floor: correctly kept everything, but also let through
  `warten`→`in` (13.9%) and `denken`→`in` (12.6%) — neither is real
  government. `in` turned out to sit at a similar ~10-14% share across
  *several* unrelated verbs (a generic locative adjunct's base rate —
  "in der Schlange warten" isn't something "warten" requires), which
  overlaps the exact range genuine secondary senses (e.g. `freuen`'s
  second sense) also occupy — a flat share threshold can't separate those
  at the margin.
- **0.15**: fixed the `in` problem, but let through `achten`→`bei`
  (16.7%) — almost certainly a journalistic-template artifact ("Achten
  Sie bei X auf Y") rather than real government; dictionaries list only
  `achten auf`.
- **0.20** (final): excludes both false positives, costs nothing among
  the 8 verbs' genuine senses — `bestehen`/`aus` (32.2%), `denken`/`an`
  (30.8%), `freuen`/`auf`+`über` (39.1%/34.2%, its two real senses),
  `interessieren`/`für` (67.6%), `erinnern`/`an` (61.5%), `träumen`/`von`
  (65.2%), `achten`/`auf` (66.3%, alone), `warten`/`auf` (46.6%, alone)
  all still qualify comfortably above it.

Chose precision over recall here deliberately: this is presented to the
user as a grammatical fact to memorize, not a ranked collocate list, so
showing a wrong preposition is worse than omitting a real-but-marginal
secondary sense. `MAX_GOVERNED_PREPOSITIONS = 2` (not a top-10 list like
`PER_SECTION_LIMIT`) for the same reason — `freuen`'s genuine two senses
are the ceiling this was sized for, not a general "show more" list.

#### API / frontend

Added `governedPrepositions: GovernedPreposition[]` to the existing
`GET /api/collocations/:word` response (`types/src/index.ts`,
`CollocationRepository`/`CollocationService` contracts and impls) rather
than a new endpoint — the lemma_id is already resolved for the main query,
fetched in parallel via `Promise.all`. New `GovernedPrepositions.tsx`
component renders a small pill-style callout (e.g. "warten **auf**
(Akkusativ)") above `CollocationList`, deliberately separate from the flat
"Präpositionen" section — this is a grammatical fact, not another ranked
collocate row, per the BBI grammatical-vs-lexical-collocation distinction
from the research. Renders nothing for non-verbs or verbs with no
qualifying entry.

#### Verification

Hand-verified dependency labels/morphology against 12 real sentences
before writing the script (above). Ran the script against a 20K-sentence
sample first, spot-checked the 8 test verbs' output before committing to
the full 1M-sentence run (stats above). Queried `verb_prepositions`
directly for the 8 test verbs at each threshold candidate (numbers
above). End-to-end via the running dev
containers (`docker compose build backend && docker compose up -d
backend`, then rebuilt frontend the same way): `curl`'d
`/api/collocations/:word` for all 8 verbs plus a plain noun (`Tisch`) and
confirmed each verb's `governedPrepositions` matches its known dictionary
Rektion exactly, and the noun returns `[]`. Confirmed via the frontend
dev server's served (Vite-transformed) source that `Word.tsx` wires
`GovernedPrepositions` correctly and the component's conditional-render/
JSX structure is as written.

**Not yet done**: an actual in-browser visual check — no headless-browser
tooling is available in this environment (same gap noted in decision
#51), so the pill styling itself (not just the data/wiring) is unverified
beyond reading the transformed source. Not yet deployed to production
(`compose.prod.yml`) — this session's work is local/dev-verified only;
production deploy (migrate, rebuild+restart `backend`/`frontend`, run
`load-verb-prepositions` there) is a follow-up step.
