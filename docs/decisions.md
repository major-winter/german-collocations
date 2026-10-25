# Decision log

Every non-trivial choice, with its reasoning, numbered in the order it was
made. Never silently reversed: a change of mind is a new entry that names
the one it supersedes. Add a new decision at the end with the next number
(next: #60), and add it to the index.

Decisions #1-32 predate this file and are not in this repository.

## Index

- [#33](#33) POS tagging granularity: type-level, not token-level
- [#34](#34) Python isolation for the POS tagging tool
- [#35](#35) Dominant-tag lookup: view, not a second materialized table
- [#36](#36) POS-based collocation grouping: dominance threshold and per-section cap
- [#37](#37) Corpus package upgrades are a full reload, not additive
- [#38](#38) Batched, resumable inserts in extract-examples.ts
- [#39](#39) Example-sentence matching requires true left-right adjacency
- [#40](#40) Dropped before/after direction from the collocations API
- [#41](#41) Simple-sentence filtering for collocation examples, via spaCy clause scoring
- [#42](#42) Per-section significance floor to stop weak backfill in collocation lists
- [#43](#43) Replaced significance-based ranking with logDice (supersedes #42)
- [#44](#44) Lemma-based collocation grouping
- [#45](#45) Highlight the literal surface words in each example, not the lemma
- [#46](#46) Enable response compression in both Caddy configs
- [#47](#47) Fix a query regression introduced by decision #45
- [#48](#48) Word-page header redesign, German-language empty states
- [#49](#49) Enable HTTP/3 (QUIC); confirm the header/POS query isn't the source of "slow"
- [#50](#50) Rank-based example selection instead of a threshold gate
- [#51](#51) Frontend color/layout polish: token-based POS palette, responsive container
- [#52](#52) Governed verb-preposition (Rektion) callout
- [#53](#53) Verb subject/object arguments replace the noun/verb sections (first grammar-based section)
- [#54](#54) Adjective-noun attributive relations (second grammar-based section)
- [#55](#55) Verb-argument noise floor: fall back to unfiltered pairs when a verb/noun has none above it
- [#56](#56) Verb arguments: drop proper nouns, decided per lemma rather than per token
- [#57](#57) Collocations: drop proper-noun partners, decided per lemma
- [#58](#58) Search box stays at 16px on every screen width, so iOS doesn't zoom on focus
- [#59](#59) iOS only: `maximum-scale=1` stops the focus zoom #58 didn't (amends #58)

---

<a id="33"></a>
## 33. POS tagging granularity: type-level, not token-level

Considered token-level POS tagging (a tag per individual corpus
occurrence, correctly resolving context-dependent ambiguity like
"sein" as AUX in "er will sein" vs. DET in "sein Auto") against
type-level tagging (one tag per distinct word form, derived from an
aggregated distribution across all its occurrences).

**Chosen: type-level.** Leipzig's `co_n.txt` ships pre-aggregated
co-occurrence counts with the underlying token occurrences already
discarded before the file was written — the specific sentence contexts
that produced each pair no longer exist in the data available to this
project. Building token-level POS would require re-deriving Leipzig's
entire near-neighbor computation from `sentences.txt` from scratch,
including reimplementing significance scoring — a substantially larger
project that would also mean this project's collocation statistics are
no longer Leipzig's validated output (undermining decision #2's
original rationale for using Leipzig at all), but a self-computed
approximation of it.

Accepted cost: genuinely ambiguous word forms ("sein", and confirmed
empirically also "seiner", "schwieriger") receive a `share` value
meaningfully below 1.0 rather than a single confident tag. A dominance
threshold (see #35) determines whether a word's tag is trusted for
POS-based features or excluded. This is a coverage loss on a small set
of high-frequency function words, not a correctness bug — ambiguity is
made visible in the data rather than silently resolved incorrectly.

<a id="34"></a>
## 34. Python isolation for the POS tagging tool

Considered running spaCy as a containerized sidecar service vs. a
precomputed lexicon dump (Wiktionary/Morphy) vs. an isolated,
non-containerized Python script.

**Chosen: isolated Python script**, in `tools/pos-tagging/`, using a
standard venv (mirroring what `node_modules` provides for JS —
dependencies scoped to one project, not global). Deliberately outside
the npm workspaces system: not listed in the root `package.json`
workspaces array, never referenced by any Dockerfile, never run in
Docker or on the VM. It runs once, on a laptop, and produces a TSV file
that is shipped to the VM the same way the raw Leipzig corpus files
are (`gcloud compute scp`).

A lexicon dump was rejected because it would reopen the Leipzig-style
licensing review that has already blocked prior work twice, and would
likely give worse coverage on German compounds. A containerized
sidecar was rejected as unnecessary complexity — this is a one-shot
offline preprocessing step, not a runtime dependency of the deployed
application, so it doesn't need to exist as a service at all.

Accepted cost: Python now exists in an otherwise all-Node/TypeScript
monorepo. Mitigated by strict isolation and a `README.md` in
`tools/pos-tagging/` stating plainly that this tool is never part of
the deploy path.

**Python version constraint discovered during setup**: spaCy 3.8.x
does not support Python 3.14. Must use Python 3.9–3.13 (3.12 used in
practice, via Homebrew) — `python3.12 -m venv .venv`, not bare
`python3`, which may resolve to an unsupported version depending on
the machine.

<a id="35"></a>
## 35. Dominant-tag lookup: view, not a second materialized table

Considered exposing "the dominant POS tag per word" (derived from the
raw per-word POS counts in `word_pos`) via a Postgres `VIEW` (computed
fresh on every query) vs. a second table populated by a script
(precomputed once, read cheaply, but a second copy of a derived fact
that could drift out of sync with `word_pos` if not carefully kept in
lockstep).

Per the project's established pattern of measuring before deciding
(see decision #4; fuzzy-search session's forced-seqscan `EXPLAIN`
checks), ran `EXPLAIN (ANALYZE, BUFFERS)` against the candidate view
query on real loaded data (100K-corpus `word_pos`, ~157K rows) before
choosing:

- Query plan used an `Index Scan` on `word_pos_pkey` (the existing
  `(word_id, pos)` composite primary key), not a sequential scan.
- `Incremental Sort` rather than a full sort, since rows already
  arrive ordered by `word_id` from the index.
- Execution time: 78.219 ms for the full table.
- `Buffers: shared hit=17465`, zero disk reads — fully served from
  cache.

**Chosen: a view** (`word_dominant_pos`, migration
`006_add_word_dominant_pos_view.sql`). At this measured cost, there is
no performance justification for accepting a second table's drift
risk — the same failure shape (two copies of one fact, allowed to
disagree) that caused the production outage (`name:` present in
`compose.yml` but not `compose.prod.yml`). A view also has the
structural property that it can never go stale, since it always
reflects the current contents of `word_pos` with no separate write
path to keep in sync.

Not yet re-measured at 1M-corpus scale (the 1M Leipzig upgrade is
still pending as of this entry) — an index-scan-based plan is expected
to scale considerably better than a sequential scan would, so this
isn't expected to overturn the decision, but the actual numbers at
that scale haven't been confirmed.

<a id="36"></a>
## 36. POS-based collocation grouping: dominance threshold and per-section cap

Considered showing collocations as one flat, significance-ranked list
(simple, but mixes nouns/verbs/prepositions together with no way to
scan for a specific grammatical relationship) against grouping by the
partner word's POS category before ranking.

**Chosen: group into sections** (`noun`, `verb`, `adjective`,
`preposition`, `other`), derived from `word_dominant_pos.pos` via a
fixed `CASE` mapping (`NOUN`→noun, `VERB`/`AUX`→verb, `ADJ`→adjective,
`ADP`→preposition, everything else→other). Two sub-decisions inside
this:

- **Dominance threshold of 0.8.** A word's POS tag is only trusted for
  grouping if `word_dominant_pos.share >= 0.8`; below that, the word
  falls through to `other` rather than being confidently mislabeled.
  This directly reuses the ambiguity the type-level tagging (decision
  #33) already makes visible — a word like "sein" with a share well
  below 1.0 is exactly the case this threshold is protecting against.
- **Cap per section (10), not on the flat result set.** Ranking and
  the `LIMIT`-equivalent (`ROW_NUMBER() OVER (PARTITION BY section ...)`)
  happen before any cross-section cut, so one section dominating the
  raw significance ranking (nouns are usually the most frequent
  partner category) can't starve the others down to zero results.

Implemented in `backend/src/repositories/CollocationRepository.ts`.
This decision was live in the code (with an explicit code comment
citing "Decision #36") for some time before actually being logged
here — recorded now for consistency with the project's own rule that
every non-trivial choice gets a numbered entry.

### Measuring the threshold: 0.8

(Logged earlier as a separate entry, also numbered 36.)

Ran the previously-planned decile-distribution query against
`word_dominant_pos` (100K-corpus dry-run data, 147,928 distinct words):

```sql
SELECT width_bucket(share, 0, 1, 10) AS decile, count(*) AS words
FROM word_dominant_pos
GROUP BY decile
ORDER BY decile;
```

Result showed a clear gap rather than a smooth curve: 94.2% of words
(139,355) have `share` exactly 1.0 (only one POS ever observed).
Genuinely ambiguous words cluster in the 0.5–0.7 range (4,390 words,
~3.0%) — consistent with the earlier `sein` spot-check (AUX 167 / DET
84, share ≈ 0.665). The 0.8–1.0 range is comparatively sparse (2,936
words, ~2.0%): words tend to resolve almost fully to one tag or not
resolve much at all, rather than landing near a chosen cutoff.

**Chosen: `share >= 0.8`** as the dominance threshold gating POS-based
grouping/filtering (below it, a word's partner-tag falls through to an
"Other" bucket rather than being trusted). Sits just above the
ambiguous 0.5–0.7 cluster, trusts 96.95% of words, and correctly
excludes known-ambiguous cases like `sein`. Not re-measured at
1M-corpus scale — expected to hold given the underlying mechanism
(dominance driven by grammatical role, not corpus size), but not yet
confirmed.

### UPOS-to-section mapping: AUX grouped with VERB

(Logged earlier as a separate entry, numbered 37.)

Building the repository grouping query surfaced a mapping gap: spaCy's
UPOS tagset splits verbs into `VERB` (lexical) and `AUX` (auxiliary/
modal — `haben`, `sein`, `werden`, `können`, etc.). The initial section
`CASE` mapped only `VERB → 'verb'`, so high-frequency auxiliaries like
`hat`/`haben` fell through to `'other'` despite being unambiguously
verbs to anyone using the tool (caught via user spot-check, not the
automated verification pass — `hat` and `haben` are dominant-tag `AUX`
at share 0.88 / 0.77 respectively, both above the #36 threshold, so
they were never near "Other" for ambiguity reasons).

**Chosen**: `SECTION_CASE` maps `pos IN ('VERB', 'AUX')` to `'verb'`.
UPOS is a linguistic distinction (lexical vs. auxiliary), not a useful
one for this tool's grouping — a user searching collocations for "hat"
expects a "Verbs" section, not "Other". No other UPOS tag is folded in
this way (`DET`, `PRON`, `ADV`, `NUM`, `PROPN`, `SCONJ`, `CCONJ`,
`INTJ` remain in `'other'`).

**Known remaining edge case, left as-is**: `haben` still sections as
`'other'` post-fix — its dominant tag is `AUX` but at `share` ≈ 0.77
(AUX 2775 / VERB 826 in the 100K sample), below the #36 threshold of
0.8. This is the threshold working as designed on a word that
genuinely straddles it, not a mapping bug (unlike `hat`, share ≈ 0.88,
which now correctly sections as `'verb'`). Considered and rejected:
lowering the global threshold (would weaken the ambiguity filter
project-wide for one word) and unconditionally trusting AUX regardless
of share (AUX/VERB is a real competing-category split for some forms,
same shape as AUX/DET for `sein`, just with a less even split for
`haben`). Worth re-checking after the 1M-corpus re-tag, which may move
`haben`'s share either direction.

<a id="37"></a>
## 37. Corpus package upgrades are a full reload, not additive

Considered whether upgrading from the `100K` Leipzig package to `1M`
could be done incrementally (run the loader again against the bigger
files, on top of the existing database) versus requiring a full
`TRUNCATE` and reload.

Checked empirically before assuming either way (per the project's
established pattern — see decision #4): compared `words.txt` between
the two packages directly. "Deutschland" is word id `240` in the 100K
package and id `234` in the 1M package. Leipzig reassigns numeric IDs
per package build; they are not stable across package sizes for the
same corpus family.

**Chosen: full reload, never incremental.** Running the loader against
a bigger package's files on top of an existing differently-sized
package's data would corrupt collocations silently: `ON CONFLICT DO
NOTHING` skips any ID already present, so old rows keep pointing at
whatever word the previous package assigned that number, while new
collocation rows from the bigger package reference the same numeric
IDs meaning different words. No error surfaces; the data is just
wrong. The safe sequence is `TRUNCATE TABLE words, collocations,
sentences, collocation_examples, word_pos RESTART IDENTITY CASCADE;`
followed by a full reload from the new package's files.

To make switching between package sizes (and any future re-tagging
after a package change) a one-line operation rather than a code edit,
`database/scripts/load-data.ts` and `database/scripts/extract-examples.ts`
now read a `CORPUS_PREFIX` env var (default `deu_news_2025_100K`,
matching prior behavior) instead of hardcoding the filename prefix.
Follows the same convention `DATA_DIR` already established — defaulted
in the script, overridden per-run via `-e CORPUS_PREFIX=...`, no
compose file changes needed. See `docs/1M-corpus-upgrade-session-notes.md`
for the full incident history from applying this.

<a id="38"></a>
## 38. Batched, resumable inserts in extract-examples.ts

`extract-examples.ts` originally did one unbatched `INSERT` per
sentence and one per matched example, awaited sequentially — fine at
100K-corpus scale, but at 1M scale on the production VM's disk (see
session notes: `pd-standard`, HDD-class, not SSD) this pattern
saturated I/O badly enough to repeatedly crash Postgres mid-run.

**Chosen: batch both inserts** (1000 rows per multi-value `INSERT`,
`ON CONFLICT DO NOTHING`), mirroring the pattern `load-data.ts`
already used successfully. Sentences are always flushed before
examples within a batch cycle, since an example can reference a
sentence added in the same cycle that hasn't been committed yet.

Also made the pair-tracking **resumable**: `pairCounts` is now seeded
from `SELECT ... GROUP BY left_word_id, right_word_id` against the
existing `collocation_examples` table, rather than starting every pair
at zero on every run. Without this, a second run after a partial
first run would both re-scan pairs that already had their 3 examples
(wasted work) and risk inserting more than the intended 3-per-pair cap
(a correctness bug, not just an efficiency one).

**Known open cost, not yet addressed**: batching trades away the old
version's per-row durability. A crash before a batch reaches 1000 rows
(or before the final end-of-loop flush) now loses all progress made
since the last flush — observed directly in production, where a
batched run crashed after 1h44m of active, correct work but had
committed zero new rows, because it never reached a flush threshold in
that stretch (the remaining unsatisfied pairs were sparse enough that
1000 fresh matches took longer than the process survived). The old
per-row version was slow but monotonic — every crash preserved
whatever had already been committed. A periodic flush independent of
batch size (e.g. every N lines scanned, regardless of how full the
batch is) would bound the amount of at-risk work without giving up the
throughput win from batching, and is the natural next step if this
script needs to run against production again.

**Update**: superseded in practice by decision #39, which replaced
`buildWordIndex` entirely — the double-counting side effect described
above no longer occurs, since a pair can no longer be discovered twice
from the same sentence.

<a id="39"></a>
## 39. Example-sentence matching requires true left-right adjacency

Found after this feature had already shipped to production once:
`extract-examples.ts`'s original matching only checked that both words
of a pair appeared *anywhere* in a candidate sentence, in either
order, with no requirement that they be adjacent. This produced
"example sentences" for a `(left, right)` collocation pair where the
two words were nowhere near each other — e.g. an example for
`schrieb → auf` pulled from "schrieb Milei auf dem
Kurznachrichtendienst..." (both words present, not adjacent, not the
actual collocation). Leipzig's `co_n.txt` records directional
*neighbor* pairs, not "co-occurs somewhere in the same sentence" —
the matching logic didn't reflect that.

**Chosen: require `tokens[i] === leftWord && tokens[i+1] === rightWord`**
in the tokenized sentence. `buildWordIndex` (indexed both words, into
a shared bidirectional map) was replaced with `buildLeftIndex`
(indexed by `leftWord` only), and matching walks token pairs directly
rather than checking set membership. A `matchedKeys` set per sentence
prevents the same pair being queued twice.

Two side benefits, neither the primary motivation but both worth
recording: the stricter match is far more selective, so the full 1M
corpus scan dropped from ~40 minutes to under a minute locally; and it
incidentally fixed the "examples inserted" log-counter
double-counting described in decision #38's update, since a pair can
no longer be matched twice from the same sentence via two different
trigger words.

Required a full regenerate of `sentences`/`collocation_examples` in
both local and production databases — the previously-loaded data
reflected the old, looser matching and needed to be thrown away, not
patched. See `docs/1M-corpus-upgrade-session-notes.md` for the
redeploy.

<a id="40"></a>
## 40. Dropped before/after direction from the collocations API

With POS-section grouping in place (decision #36), considered whether
the `followedBy`/`precededBy` split was still pulling its weight
against the added surface area of maintaining two parallel result
sets. Explicitly confirmed with the user before implementing, since
direction is real information (the app's own description is "what
words most commonly appear immediately before/after" the queried
word) — this was a deliberate scope cut, not an oversight.

**Chosen: drop direction entirely.** `CollocationResponse` (and the
matching backend contracts) now expose a single flat `collocations:
CollocationEntry[]`, still POS-sectioned and significance-ranked, with
no indication of which side of the queried word a partner appeared
on. `CollocationRepository.findByWord` combines what were two
separate directional queries into one, via `UNION ALL` over both
branches before ranking, rather than running two queries and merging
in JS — ranking (`ROW_NUMBER() OVER (PARTITION BY section ...)`) needs
to see both directions together to produce a correct top-10-per-section
across the combined set, not two top-10s concatenated.

One correctness trap surfaced and fixed while implementing this: the
same partner word can legitimately appear via two distinct
`(left_word_id, right_word_id)` pairs now that both directions feed
the same list (confirmed empirically against real data — not just a
theoretical case). `groupRows` was deduping by word text, which would
have silently merged example sentences from two unrelated pairs under
one entry with only one of the two pairs' cooccurrence/significance
numbers. Fixed by deduping on pair identity instead. The frontend's
list-rendering key had the same latent bug (`entry.word` as a React
key, which collides when the same word legitimately appears twice in
one section) — fixed alongside it.

<a id="41"></a>
## 41. Simple-sentence filtering for collocation examples, via spaCy clause scoring

Example sentences were being picked by `database/scripts/extract-examples.ts`
as the first 3 sentences in the corpus file (in file order) containing the
exact adjacency for a pair — no complexity screening. Since the source is a
news corpus, that meant long, clause-heavy sentences by default: the
sentences previously stored averaged 17 words, and manual sampling showed
relative clauses, reported speech, and embedded subordinate clauses even in
short ones.

Considered a naive word-count/comma heuristic first (comma presence as a
proxy for "has a subordinate clause"). Rejected once actual spaCy parses
were checked against real sentences: two more "obvious" complexity signals
were tried and also rejected before settling on the one used.

- **Word count alone** misses embedded clauses in short sentences.
- **Counting finite verbs via spaCy morphology** (`VerbForm=Fin`) is
  unreliable in `de_core_news_sm` — it silently missed a finite verb in a
  real test sentence.
- **Counting the `oc` dependency label directly** is overloaded: it fires
  both for genuine subordinate/complement clauses *and* for ordinary
  periphrastic aux+participle constructions (passive `wurden evakuiert`,
  perfect `habe angerufen`), producing false positives.

**Chosen signal: count VERB/AUX tokens that have their own subject child
(dependency label `sb`).** Periphrastic constructions share the aux's
subject (the participle has no `sb` child of its own), so they correctly
collapse to one clause; compound predicates ("ging ... und aß", shared
subject) also collapse to one clause; relative clauses, reported speech, and
genuine subordinate clauses each introduce their own subject and are
correctly counted. Verified by hand against 10 real corpus-style sentences
before committing to it.

**Two-stage pipeline**, following the existing `tag_words.py` → `load-pos.ts`
split (Python does the spaCy-heavy work offline on a laptop, Node does
deterministic streaming/matching/DB work):

- `tools/pos-tagging/score_sentence_simplicity.py` (new): runs the full
  spaCy pipeline (tagger + parser, `ner` disabled) over every sentence in
  `sentences.txt` and writes `sentence_id\tword_count\tclause_count` — raw
  counts, not a baked-in boolean, so the threshold can be retuned without
  repaying the ~17-minute parse (1M sentences at ~950/sec). Same
  one-shot-offline-tool contract as `tag_words.py`: never containerized,
  never part of the deploy path, output TSV shipped to the VM like any
  other corpus file.
- `database/scripts/extract-examples.ts` (modified): loads
  `sentence_simplicity.tsv` into memory and gates candidate sentences on
  `word_count <= MAX_EXAMPLE_WORDS AND clause_count <= MAX_EXAMPLE_CLAUSES`
  before the existing adjacency-matching logic runs. No schema change, no
  new table for the scores — they're a one-time selection input, not
  something queried at request time (unlike `word_pos`, which backs the
  live `word_dominant_pos` view).

**Thresholds: `MAX_EXAMPLE_WORDS = 15`, `MAX_EXAMPLE_CLAUSES = 1`.** 12
words was tried first and rejected empirically: against the real 1M-corpus
run it left 36.7% of collocation pairs with zero examples (14.6% even in
the top significance decile — the pairs actually shown in the UI, since
results are ranked by significance and capped per section). 15 words
brought that down to 24.4% overall (10.6% in the top decile) with no
visible quality loss on manual sampling of the resulting sentences.
Zero-example pairs skew heavily toward low-cooccurrence, low-significance
pairs (median cooccurrence 4 vs. 6, average significance 39.8 vs. 88.5 for
pairs that do have examples) — the ones least likely to be surfaced in the
UI's top-10-per-section ranking.

Required a full `TRUNCATE collocation_examples, sentences` + re-extraction
(local DB only so far) — same as the corpus-upgrade case in decision #37,
this is a re-selection of which sentences qualify, not an additive change,
and the script's "resume" logic (trusts pairs that already have 3 examples)
would otherwise have left the old long sentences in place untouched.
Re-run with `CORPUS_PREFIX=deu_news_2025_1M` explicitly passed, since the
script's default at the time (`deu_news_2025_100K`) was stale — the live DB
has reflected the 1M package since the decision #37 upgrade, and Leipzig
sentence IDs aren't stable across package sizes (decision #37). Fixed the
default itself to `deu_news_2025_1M` alongside this change, so a future
invocation without an explicit override doesn't silently produce IDs that
don't match what's loaded.

Deployed the same day: rather than shipping `sentence_simplicity.tsv` and
rerunning `extract-examples` on the VM (the matching script has crashed
there repeatedly before, per decision #38's disk-I/O findings), followed
the pattern established in the 1M-corpus-upgrade session — `pg_dump`'d
`sentences`/`collocation_examples` from local (already regenerated),
`scp`'d the dump to the VM, `TRUNCATE`'d production's stale versions, and
restored via `psql` in FK-safe order (`sentences` before
`collocation_examples`). No backend/frontend rebuild needed since the API
response shape is unchanged, only which sentences get selected. Verified:
all four row counts (`words`, `collocations`, `sentences`,
`collocation_examples`) match local exactly, and the live site serves the
new short, single-clause examples.

<a id="42"></a>
## 42. Per-section significance floor to stop weak backfill in collocation lists

> **Superseded by decision #43.** The per-section floors here were
> replaced entirely by a single logDice-based threshold once a second,
> structurally similar bug ("Einsatz war") showed that patching
> `significance` per-symptom didn't scale. `SECTION_MIN_SIGNIFICANCE`
> and `sectionMinSignificanceCase` no longer exist in the codebase — see
> `docs/decisions-43.md` for why and what replaced them. Left here as
> history, per this project's rule that decisions are logged, not
> silently reversed.

Spotted a real quality bug: `Einsatz` listed `am` as one of its top-10
prepositions, but "am" isn't a collocate of "Einsatz" — it's a common
preposition that rides along with almost any noun. Root cause: decision
#36's `PER_SECTION_LIMIT = 10` always tries to fill 10 slots per section
regardless of whether there are 10 genuinely strong partners, so a thin
section gets backfilled with whatever's left, however weak.

Considered one global significance floor across all sections first —
rejected once checked empirically: sections sit on very different natural
scales. Preposition significance has a median of 14.4 across the whole
`collocations` table, versus 22–37 for noun/verb/adjective/other, because
there are only a few dozen distinct prepositions, so they co-occur with
almost everything by volume even when "significant" in the chi-square
sense (the table's own minimum, 3.84, is exactly the p<0.05 critical
value — Leipzig's own extraction already filters to "statistically
significant," which isn't the same thing as "a meaningful fixed
collocation"). A single floor high enough to cut preposition noise would
gut the noun/verb/adjective sections; one low enough for those would do
nothing for prepositions.

**Chosen: a floor per section, set at that section's own 75th-percentile
significance** (computed once across the whole table: noun 67.95, verb
42.99, adjective 46.36, preposition 29.8, other 69.84), applied in
`backend/src/repositories/CollocationRepository.ts`'s `COLLOCATIONS_QUERY`
alongside the existing `rn <= PER_SECTION_LIMIT` cut, via a `CASE`
expression (`sectionMinSignificanceCase`) parametrized on the section
column, mirroring the existing `buildBranchQuery` pattern in the same
file for reusing SQL text with a different column reference.

Verified against 10 real query words before committing: this floor cuts
"Einsatz am" (28.98, just under the preposition floor of 29.8) while
correctly keeping "Polizei am" (709.48 — the strongest preposition for
that word; "am" isn't inherently bad, it's the specific pair's weakness
that matters). Same word, opposite outcome, decided per-pair not
per-word — confirms the mechanism targets the right thing.

**Trade-off, same shape as decision #41's `MAX_EXAMPLE_WORDS` tuning**:
no threshold is free. This one also cuts some real-but-modest pairs —
e.g. "Interesse für" (15.24), a legitimate alternative to "Interesse an,"
falls below the preposition floor. Considered 50th and 90th percentile
as alternatives: 50th wouldn't have caught
"Einsatz am" at all (28.98 sits above the preposition median); 90th would
leave many words with far fewer than 10 results per section, some
sections empty. Went with 75th as the balance.

A section can now legitimately show fewer than 10 entries (or be entirely
absent) when a word doesn't have that many partners clearing the bar —
this replaces "always try to fill 10" with "only show what's actually
strong," which is the intended behavior change, not a bug.

<a id="43"></a>
## 43. Replaced significance-based ranking with logDice (supersedes #42)

A second spurious "collocation" surfaced shortly after #42 shipped:
"Einsatz war" — "war" is a form of the copula "sein," not a real
collocate of "Einsatz," any more than "am" was. Same failure mode. A
POS-based exclusion list for auxiliary/modal verb forms (on top of #42's
per-section floors) would have patched this specific case, but every fix
so far had been a reaction to one symptom at a time rather than a fix to
the underlying metric — the right move was to address the metric itself.

Root-caused: the `significance` column (loaded verbatim from Leipzig's
`co_n.txt`) is a chi-square-style statistical-significance measure — its
minimum value across the whole table is exactly 3.84, the textbook
p<0.05 critical value at 1 degree of freedom, confirming Leipzig already
filters to "unlikely to occur by chance." But statistical significance
is not the same thing as "meaningful fixed collocation": it scales with
raw frequency, so common function words (prepositions, copula/auxiliary
verb forms) look "significant" with almost any content word purely by
volume, even when the actual lexical association is weak. This is *why*
#42 needed five different hand-tuned per-section floors in the first
place — prepositions and verbs (inflated by AUX forms) sit on
structurally different significance scales, and no single number could
span both.

**Chosen: logDice** (Rychlý 2008, "A Lexicographer-Friendly Association
Score" — the default association measure in Sketch Engine, the
professional word-sketch/collocation-dictionary tool this project is
conceptually closest to). `logDice = 14 + log2(2×cooccurrence /
(freq_left + freq_right))`, using `words.frequency` (already loaded from
the Leipzig word-frequency file) and `collocations.cooccurrence` (already
loaded) — no new data, no corpus reprocessing, purely a query-logic
change in `backend/src/repositories/CollocationRepository.ts`.

PMI was tried first and rejected: it's the more commonly cited
association measure, but it overweights rare pairs — "Angst vorm" (only
9 cooccurrences) scored a *higher* PMI (9.06) than the canonical "Angst
vor" (6.24, 393 cooccurrences), which is backwards. logDice's Dice-style
normalization (frequency sum in the denominator, not the product) doesn't
have this blowup.

Validated empirically before committing:
- **Clean separation on the flagged cases** — a real gap raw
  significance never showed. Good: Polizei am 7.19, Angst vor 8.20,
  Interesse an 7.46, Einsatz kommen 8.91. Bad: Einsatz war 5.08, Einsatz
  am 4.46. (For comparison, Einsatz war's raw significance, 60.68, looked
  entirely unremarkable next to legitimate pairs — no threshold on
  `significance` alone could have separated it cleanly without also
  cutting good pairs.)
- **Naturally suppresses AUX/copula noise with no stopword list**: at a
  global logDice floor of 6.3, only 2.4% of AUX-tagged partners survive
  (635/25,993) versus 29.0% of true VERB partners (11,052/38,070). The
  metric itself tells grammatical scaffolding from real lexical
  collocations apart — the POS-exclusion-list approach that was
  considered and explicitly rejected in favor of this would have been
  redundant.
- **Normalizes across POS sections far better than raw significance**:
  logDice section medians land at 3.95–4.78, versus 14.4–37.3 for raw
  significance. This is *why* one global threshold works now where #42
  needed five.
- 6.3 = the whole `collocations` table's own 75th-percentile logDice —
  same percentile methodology #42 already used and had accepted, now
  applied to a metric that doesn't need per-section calibration.
- No division-by-zero risk: `words.frequency` minimum across the table
  is 1, never 0.

**This supersedes decision #42**, not just supplements it — the
per-section `SECTION_MIN_SIGNIFICANCE` floors and the
`sectionMinSignificanceCase` helper are removed from
`CollocationRepository.ts` entirely, replaced by a single `MIN_LOG_DICE
= 6.3` constant applied uniformly across sections. `PER_SECTION_LIMIT`
(the top-10-per-section cap from decision #36) is unrelated to this
change and is untouched. `significance` and `cooccurrence` are still
returned in the API response (still real, correct statistics worth
showing), they're just no longer the ranking/filtering key — neither
field is read anywhere in the frontend, so no contract change was
needed.

Also updated the footer copy ("Ranked by statistical significance" →
"Ranked by collocation strength" in `frontend/src/components/Layout.tsx`)
since it was describing the now-replaced mechanism.

Deployed the same day — pure code change, no `TRUNCATE`, no data
dump/restore, just rebuild + recreate the `backend` container in
production (same deploy shape as decision #42).

<a id="44"></a>
## 44. Lemma-based collocation grouping

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

### Schema

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

### Bug found and fixed: numerator/denominator asymmetry for filtered words

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

### Performance: two views had to become tables

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

### Query and examples

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

### Verification

Confirmed across 11 query words (not just the ones already used as test
cases through this session): "Einsatz"'s `kommen` family merges into one
entry with cooccurrence 338 (matching the sum of what were five separate
entries); "der"/"und"/"das" are gone everywhere; "Einsatz war" (decision
#43's fix) still holds at lemma granularity; response times are ~55-65ms
end-to-end.

<a id="45"></a>
## 45. Highlight the literal surface words in each example, not the lemma

Decision #44 made `CollocationEntry.word` a lemma (e.g. "Gedanken") while
widening `examples` to any surface-form pair mapping to that lemma pair
(e.g. an example sentence drawn from the "Gedanke"/"Gedankens" surface
pair). `frontend/src/components/CollocationList.tsx`'s
`highlightCollocates` was never updated to match: it still highlighted
by exact lowercase string match against `queryWord`/`entry.word`, which
worked when written (before #44) but stopped being reliable once the
displayed word and the sentence's actual tokens could diverge -
observed directly as "Gedanken machen": "Gedanken" not highlighted
(sentence's actual token was a different inflected surface form) while
"machen" was highlighted seemingly correctly but only by coincidence.

Fixed at the source rather than in the frontend: `CollocationRepository
.ts`'s example-sentence `LATERAL` join already knows the literal
`left_word_id`/`right_word_id` behind each returned sentence - it just
wasn't selecting their text. Added a `words` join in that subquery and
return `leftWord`/`rightWord` alongside `sentence`. `CollocationEntry
.examples` changed from `string[]` to `{ sentence, leftWord, rightWord
}[]` (new `CollocationExample` type in `@collocations/types`), and
`highlightCollocates` now matches against each example's own
`leftWord`/`rightWord` instead of the entry's lemma or the page's query
word. `CollocationList`'s `queryWord` prop was removed as a result -
nothing in the component needed it anymore, and `Word.tsx` no longer
passes it.

Considered a frontend-only fix (fuzzy/prefix matching to tolerate
inflection) and rejected it: it's a heuristic that would still misfire
on short words or unrelated tokens sharing a prefix, whereas the
backend already has the exact literal words on hand from the same row
as the sentence - no reason to guess when the correct data is one join
away.

<a id="46"></a>
## 46. Enable response compression in both Caddy configs

Investigated a report of slow production responses. Backend query time
wasn't the obvious suspect: decision #44 already measured the
collocations endpoint end-to-end at ~55-65ms wall time after the
lemma-table rework, and this session's static review of
`CollocationRepository.ts`/`WordSearchRepository.ts` found the query
and index shape unchanged since — precomputed `lemma_frequency`/
`lemma_dominant_pos` tables, `pg_trgm` GIN indexes for fuzzy search,
nothing that looked like a new slow path.

Wanted to confirm with a real timing breakdown (`curl -w` against
`german-collocations.chickenkiller.com`, splitting TTFB from total
transfer time) before touching anything, per this project's
empirical-before-deciding convention. Couldn't: this session's sandbox
egress proxy rejects connections to arbitrary domains by policy, and
there's no SSH access to the VM from here either. So this fix is
based on static review, not a confirmed measurement — flagged as a
known gap, not silently treated as proven.

What static review did find: neither Caddy config compressed
responses. The reverse-proxy `Caddyfile` (root) and the static-file
`frontend/Caddyfile` (served from inside the `frontend` container)
both lacked an `encode` directive, so JSON API responses and the built
JS/CSS bundle were all served uncompressed. This is a plausible
contributor to "slow" specifically *because* the app is US-hosted for
users elsewhere: more bytes over a high-RTT path means more TCP round
trips to complete the transfer, so uncompressed payloads compound with
geography rather than being an independent cost.

Added `encode gzip zstd` to both files — one line each, no
architectural change, reversible by deleting the line. Didn't add
per-route tuning (e.g. excluding already-compressed asset types) since
Caddy's `encode` already skips content it judges not worth compressing.

**Not done as part of this decision**: no production redeploy, no
before/after timing comparison. This needs verifying against real
numbers once deployed (`curl -w` timing, or a browser network-tab
comparison) rather than assumed fixed — if TTFB itself (not just
transfer time) turns out to be the dominant cost, this change won't
move it, and query-level profiling on the live DB would be the next
step instead.

<a id="47"></a>
## 47. Fix a query regression introduced by decision #45

Investigating "further improve production performance," measured the
live prod API from an external client for the first time (previous
sessions couldn't reach the prod domain at all): `/api/collocations/
Einsatz` took 1-2.2s round-trip, far more than network RTT explains.
Timing from inside the `backend` container directly (no network at
all) still showed ~214-526ms - a real backend regression, not a
geography problem.

`EXPLAIN (ANALYZE, BUFFERS)` on the live prod DB isolated it to decision
#45's fix: joining `words` (for `leftWord`/`rightWord`) inline in the
same `FROM` list as `collocation_examples`/`word_dominant_lemma`/
`sentences`, ahead of the `LIMIT 3`. That extra join changed the
planner's chosen join order - it started fetching `words` against an
unfiltered ~27k-row fan-out (all `collocation_examples` rows matching
just the left side) before applying the `word_dominant_lemma`
right-side filter, instead of after. Measured: 213ms / 235,814 buffer
hits with the inline join, versus 135ms / ~13,223 buffer hits for the
exact pre-#45 query run side-by-side on the same prod data - confirming
the regression was introduced by #45, not pre-existing.

Fixed by restructuring the LATERAL subquery so `words` joins against
an inner subquery that already computed the proven-fast `ORDER BY s.id
LIMIT 3`, rather than sharing its `FROM` list. This forces Postgres to
run the original, already-fast example-selection query first, then do
only 2 cheap `words_pkey` lookups against the 3 already-picked rows.
Re-measured after the fix: 135.374ms, matching the pre-#45 baseline -
the `searchWord`/`collocateWord` correctness fix from #45 is preserved,
the performance regression is not.

**Known, not investigated further here**: even the restored 135ms
baseline is ~2-3x decision #44's originally-cited ~55-65ms for this
same "Einsatz" case. Not chased down in this session - could be data
growth since #44's measurement, or a pre-existing inefficiency in the
LATERAL example-join itself (its `word_dominant_lemma` right-side
condition is evaluated as a post-join filter rather than pushed into
an index scan, per the same `EXPLAIN` output). Worth a dedicated
`EXPLAIN` pass if example-sentence latency matters enough to chase
further.

<a id="48"></a>
## 48. Word-page header redesign, German-language empty states

Three small, independent frontend changes made together in one session:

**Compact header on word pages.** The header was a large centered hero
(`text-4xl` title + subtitle) on every route, including `/wort/:word`
pages. Since most traffic to an SEO-indexable per-word page lands
directly on that page rather than the home route, the full hero pushed
actual collocation results below the fold on every lookup. `Layout.tsx`
now branches on whether the current route matches `/wort/:word`: the
home route keeps the large centered hero; word pages get a compact,
single-row header (small "DK" badge + neutral-weight title + search
box inline) instead.

Went through two visual iterations before landing here. First attempt
colored just the word "Kollokationen" in indigo, both to give the
brand a first accent color and to signal the smaller word-page header
was intentional, not a broken layout. Reviewed live and rejected:
coloring one word in the title read as arbitrary, and indigo had no
connection to anything else in the app - `CollocationList.tsx`
(decision #45) already uses blue/orange/green/purple to distinguish
POS sections, so an unrelated indigo on the page title risked reading
as another, undocumented category. Replaced with a small colored "DK"
badge preceding the (fully neutral-color) title text instead - reads
as a logomark rather than a semantic color, and collapses cleanly to
just badge + inline search on the word-page layout.

**German-language empty states.** `CollocationList.tsx`'s "No results."
and `Word.tsx`'s `No results for "{word}".` were left in English from
earlier milestones despite the rest of the UI (header, subtitle) being
German. Changed to "Keine Ergebnisse." and `Keine Ergebnisse für
„{word}“.` respectively. Not done in this pass: `Word.tsx`'s "Loading…"
and "Did you mean:" strings are still English - out of scope for what
was asked, noted here so a future pass doesn't assume the page was
fully localized.

**Centered empty states.** Both of the above empty-state blocks
(`Word.tsx`'s not-found message + suggestion chips, and
`CollocationList.tsx`'s zero-entries message) were left-aligned by
inheriting the page's default alignment, which reads oddly for a
message with no accompanying list or card grid to align against.
Both now center (`text-center`, plus `justify-center` on the
suggestion-chip flex row).

**Deploy-mechanism correction to #46**: this session reached the
production VM directly via `gcloud compute ssh` (instance
`german-collocations-instance`, zone `us-central1-a`) - both raw TCP
to port 22 and the gcloud-brokered SSH session worked from this
sandbox, contradicting #46's "there's no SSH access to the VM from
here either." Whatever blocked #46 was likely specific to that
session's egress policy for arbitrary-domain HTTP (the `curl` case
#46 actually needed), not a blanket restriction on this sandbox
reaching the VM at all. `gcloud compute ssh` also sidesteps needing a
stored username/key: it provisions a short-lived keypair via instance
metadata itself. One wrinkle worth recording for future sessions: the
account `gcloud compute ssh` logs in as (`tuanchu`, an OS Login
identity) does not own the live checkout - that's
`/home/tuanchuhoang/german-collocations`, per decision-log convention
#5 - so commands need `sudo -u tuanchuhoang` to operate on it.

Deployed same session: `git push` → `gcloud compute ssh` → `sudo -u
tuanchuhoang git pull` → `docker compose -f compose.prod.yml build
frontend` → `docker compose -f compose.prod.yml up -d frontend`.
Verified via `docker inspect`'s `StartedAt` matching the fresh image's
build time, and by grepping the live container's built CSS bundle for
the new indigo class name.

<a id="49"></a>
## 49. Enable HTTP/3 (QUIC); confirm the header/POS query isn't the source of "slow"

Investigated a report that searches feel slow. Measured, rather than
assumed, where the time actually goes (this project's established
convention): from an external client, `/api/collocations/<word>`
showed 0.9-5.8s total time with 4.3KB responses - but hitting the
`backend` container directly over the internal Docker network
(bypassing Caddy and the public network entirely) measured 130-235ms
consistently, matching decision #47's baseline, for both rare and
common words. A plain static-asset request (no backend, no DB
involved at all) showed the *same* ~0.8-1.3s total time as the API
route. Conclusion: the wait is connection setup / RTT between the
client and `us-central1`, not the collocations query - ruled out
restructuring the endpoint into a stream, since streaming only helps
once the server can push bytes sooner or the client wants partial
data before a large payload finishes; here the delay is entirely
before the first byte can leave the server, and the payload is
already tiny and gzipped (decision #46).

Also checked whether Caddy's defaults were silently hurting this -
no aggressive `idle_timeout` or forced `Connection: close` in either
`Caddyfile`, and a second request reusing an already-open connection
measured a real drop (~1s to ~0.37s) - keep-alive itself needed no
fix.

**Enabled HTTP/3 (QUIC)**, which was not reachable despite Caddy
2.11.4 supporting it by default with automatic HTTPS (no directive
needed): the GCP firewall only allowed `tcp:443` (`default-allow-https`),
with no `udp:443` rule at any scope, and `compose.prod.yml`'s `caddy`
service only published `443:443` (TCP-only shorthand). Fixed both:
added `allow-https-quic` firewall rule (INGRESS, `udp:443`,
`0.0.0.0/0`, target tag `https-server` - deliberately mirrors
`default-allow-https`'s exact scope rather than inventing a new one),
and added `'443:443/udp'` to `compose.prod.yml`'s `caddy` ports list.
`compose.yml` (dev) has no Caddy service at all - frontend/backend are
exposed directly there - so this is a prod-only file, not a
both-files case.

QUIC collapses transport + TLS negotiation into fewer round trips than
TCP + TLS 1.3, which should reduce (not eliminate) the handshake
portion of the RTT-dominated cost measured above. **Not verified
end-to-end**: this session's `curl` (8.7.1, SecureTransport-linked) has
no HTTP/3 support, so there's no external confirmation that a client
actually negotiates h3 against the live site - only that the firewall
rule and port mapping exist and Caddy is listening. A follow-up with
an HTTP/3-capable client (e.g. `curl --http3` built against a QUIC TLS
backend, or a browser's network panel showing protocol `h3`) is the
next step to confirm this measurably changes anything, per the same
empirical-before-assumed pattern used above.

**Not pursued**: CDN and geographic relocation, both of which would
address the RTT floor itself rather than just handshake overhead on
top of it - out of scope for this pass, noted as the next lever if
HTTP/3 alone doesn't move the number enough to matter.

<a id="50"></a>
## 50. Rank-based example selection instead of a threshold gate

Step 1 of the example-sentence coverage roadmap (agreed in an earlier
session, not previously logged as a numbered decision - see the
"example sentence quality roadmap" background this builds on).
Considered building a standalone web crawler to find sentences for
collocation pairs with zero examples, but rejected that direction
before starting: it would need new scraping infrastructure, licensing/
copyright handling for a public learning tool, and the same
simplicity/adjacency filtering all over again on unvalidated text -
all to solve a gap the existing corpus data could likely close on its
own, since the actual cause was decision #41's hard threshold, not a
lack of source material.

`extract-examples.ts` gated every candidate sentence on `word_count <=
15 AND clause_count <= 1` (decision #41), rejecting anything over that
bar outright - so a pair whose only corpus matches were slightly long
or multi-clause got zero examples instead of its least-bad option.

**Changed to rank-and-keep-best-3 per pair**: every sentence matching a
pair's exact left-right adjacency is now scored (clause count primary,
word count as tiebreaker - same priority order the old AND'd threshold
implied) and compared against that pair's current best 3, evicting the
worst only when a strictly better candidate appears. No sentence is
rejected outright anymore; a pair with only awkward matches gets its
least-awkward 3 instead of nothing.

**Consequence: no early exit, no resumable pair-count state.** The old
version could stop scanning once every pair hit 3 examples and resume
a partial run via `SELECT ... GROUP BY` against existing
`collocation_examples` rows (decision #38). Ranking requires comparing
every matching sentence in the file against a pair's current best 3, so
a better candidate can appear anywhere, including after a pair already
has 3 weaker ones - the whole file is scanned every run regardless.
Removed the resume logic entirely rather than adapting it: decision #41
already established that resuming across a selection-logic change is
actively wrong (it would leave old, worse-selected sentences in place
untouched), and the same full-file matching pass measured under a
minute locally at 1M-sentence scale in decision #39, so the lost
early-exit isn't a real cost. `main()` now runs `TRUNCATE
collocation_examples, sentences` unconditionally at the start of every
run, same pattern as decision #41's own threshold change.

**Measured locally** (1M corpus, local dev DB): 249,755 / 268,945
surface-word pairs now have at least one example (92.9%), up from the
~75.6% baseline the 15-word/1-clause threshold left in decision #41 -
matching that session's own estimate that rank-based selection "should
recover most of the pre-filter 92.7% coverage baseline." Spot-checked
example sentences by hand (random sample via SQL, plus the full
`/api/collocations/Zeit` response) - literal adjacency and per-pair
example count both look correct, no regression in the runtime query
shape (`CollocationRepository.ts`'s LATERAL join and lemma-widening
from decisions #44/#47 are unaffected - this only changes which
sentences get written to `collocation_examples`, not its schema or how
it's read).

**Deployed same day**, following decision #41's established pattern
rather than re-running the script on the VM (decision #38's disk-I/O
findings - `pd-standard` HDD-class disk, repeated crashes on a direct
on-VM run previously): `pg_dump -Fc --data-only --table=sentences
--table=collocation_examples` from the local `db` container, `gcloud
compute scp` to the VM, `docker cp` into the production `db`
container, `TRUNCATE collocation_examples, sentences`, then
`pg_restore --data-only --disable-triggers` (disabling triggers
sidesteps needing the dump to be in FK-safe order, since a data-only
dump of two independently-listed tables isn't guaranteed to restore
`sentences` before `collocation_examples` otherwise). Verified: local
and production `sentences`/`collocation_examples` row counts match
exactly (507,981 / 748,707), and the live
`/api/collocations/Zeit` response returns examples for all 24 entries.
No backend/frontend rebuild needed - API response shape is unchanged,
only which sentences got selected, same as decision #41's own deploy.

**Still open, unrelated to this change**: the lemma-fragmentation
finding from the coverage roadmap background (spaCy mis-lemmatizing
irregular noun plurals like Motorrad -> Motorräder) inflates the
zero-coverage count independently of the threshold-vs-ranking question
addressed here - worth re-measuring against the lemma-pair universe
specifically before deciding whether steps 2 (rotation) or 3 (bounded
offline LLM fill-in) are still needed at the same scope originally
estimated.

<a id="51"></a>
## 51. Frontend color/layout polish: token-based POS palette, responsive container

A frontend audit this session found the UI's color choices had
accreted across separate sessions rather than following one system:
the four part-of-speech section colors (`CollocationList.tsx`,
decision #45) and the header logo badge (decision #48) were raw
Tailwind default swatches (`blue-600`/`orange-600`/`green-600`/
`purple-600`/`indigo-600`), each with its own hand-written `dark:`
variant, bypassing the CSS-variable token system `index.css` uses for
everything else.

Considered three bigger "give the app a visual identity" directions
(a data-precision/concordance-line theme, a dictionary-headword theme,
a "Wortschatz" ledger theme) grounded in the app's actual subject
matter, per the project's front-end-design guidance. **Rejected all
three** (by the user) in favor of a narrower fix — this decision covers
only color-system and layout cleanup, not new typography, a hero
section, or any rebrand.

**Color**: added four new tokens to `index.css` (`--pos-noun`,
`--pos-verb`, `--pos-adjective`, `--pos-preposition`), following the
same `oklch(L C H)` light/dark pattern already used by
`--destructive` (same hue, higher lightness in `.dark`). Hues chosen
evenly spread around the wheel (250/65/145/300) at matched
lightness/chroma so they read as one deliberate categorical set rather
than four independently-eyeballed swatches, and clear of
`--destructive`'s hue (~25). Registered in `@theme inline` so Tailwind
generates real utility classes (`text-pos-noun`, etc.) - these need no
`dark:` variant in component code, since the underlying CSS variable
already flips under `.dark`, matching how `text-foreground` already
works elsewhere in this codebase. `CollocationList.tsx`'s
`PAINT_COLORS` map now references these instead of hardcoded Tailwind
classes; the header logo badge (`Layout.tsx`) switched from indigo to
a neutral, token-derived tone - the POS colors are the page's actual
functional use of color, so the logo doesn't need an unrelated fifth
hue competing with them.

Initial values (L=0.55 light / L=0.72-0.75 dark for the POS tokens,
solid `bg-foreground`/`text-background` for the badge) read as too
dark on user review - raised to L=0.62 light / L=0.78-0.80 dark for
the POS tokens (same hues, same chroma-matching rule, just globally
brighter), and the badge switched to `bg-primary/70 text-primary-foreground`
(alpha-blended against the page background rather than solid) so it
lightens in both color modes without introducing a non-token color.

**Section labels translated to German**: `SECTION_LABELS` (`Nouns`/
`Verbs`/`Adjectives`/`Prepositions`/`Other`) were left in English from
earlier milestones despite the rest of the UI being German (the
"Loading…" strings noted as an open gap in decision #48 remain
English, unaddressed here too - out of scope for what was asked).
Changed to `Substantive`/`Verben`/`Adjektive`/`Präpositionen`/
`Sonstige`.

**Layout**: `Layout.tsx`'s header duplicated its badge+title JSX
between the home-page and word-page branches (introduced across
decisions #48 and #48's word-page-header follow-up) - extracted into
one `Logomark` component taking a `compact` prop, so sizing is tuned
once instead of twice independently drifting. The single fixed
`max-w-xl` container (used at every viewport width, no responsive
breakpoints existing anywhere in the live app) became
`max-w-xl md:max-w-2xl` on both the header and `<main>` wrappers, so
wider viewports use more of the available width instead of a narrow
column with large dead margins. On the word-page's compact header, the
`SearchBox` was originally inline beside the logomark in a single row
(`flex items-center`) - moved to its own row below it (`flex flex-col`)
per user review.

**Rough edges fixed**: `Word.tsx`'s bare `<p>Loading…</p>` and
`<p role="alert">` now carry the same `text-center`/muted-foreground
treatment the `notFound` state already had, so all four lookup states
feel like one design. `Home.tsx` returned an empty, redundant nested
`<main>` (invalid-ish - `Layout.tsx` already renders its own `<main>`
around `children`, and the home route's actual content is the hero
Layout renders unconditionally) - changed to return `null`, since it
has no content of its own to add. `CollocationList.tsx`'s collocation
rows had `cursor-pointer` with no click handler behind them - removed,
since making rows genuinely clickable (e.g. linking to the collocate's
own word page) is a feature decision out of scope for this pass, not a
color/layout fix.

Verified: `tsc -b --noEmit` clean; confirmed via the running dev
container (bind-mounted source, Vite HMR) that the compiled CSS
contains the new `.text-pos-noun { color: var(--pos-noun) }`-style
rules with both light/dark values, and that `Layout.tsx`'s served
source no longer references `indigo`. Visual check left to the user in
a browser (opened locally) rather than an automated screenshot - no
headless-browser tooling available in this environment (same gap noted
earlier this session).

**Deployed same day**, after the brightness/layout/label revisions
above landed from user review: `git push`, `gcloud compute ssh` into
`german-collocations-instance`, `docker compose -f compose.prod.yml
build frontend`, `docker compose -f compose.prod.yml up -d frontend`.
No database changes in this decision - frontend-only rebuild/restart,
same deploy shape as decisions #48/#51's predecessor sessions.

<a id="52"></a>
## 52. Governed verb-preposition (Rektion) callout

Research into learner-oriented collocation tools (SKELL/Sketch Engine's
word-sketch grammatical-relation grouping, DWDS Wortprofil, BBI's
"grammatical vs. lexical collocation" distinction) surfaced "which
preposition + case does this verb require" (Rektion, e.g. `warten auf` +
Akkusativ) as a common, high-value, narrowly-scoped first step toward
making the app more useful for learners — chosen by the user over a wider
menu of options (full word-sketch-style relation grouping, a lighter
UX-only pass on existing data, translation glosses).

### Empirical validation: plain adjacency isn't enough

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

### Dependency-label ground truth (hand-verified first, per this project's
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

### New offline tool

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

### Schema (additive)

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

### Ranking: share of a verb's own attached-PP count, tuned three times

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

### API / frontend

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

### Verification

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

<a id="53"></a>
## 53. Verb subject/object arguments replace the noun/verb sections (first grammar-based section)

Follow-up to decision #52: the user chose to move from linear-adjacency
collocations (decision #44) toward grammar-based ones, one relation at a
time, replacing the corresponding section as each relation is validated
(chosen over an additive-layer or single-big-migration alternative).
First relation: verb subject/object - the "who does what to whom"
relation, and the natural next step after Rektion's dependency-parsing
groundwork.

### First: decision #52 was never actually wired in

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

### Empirical validation: subjects/objects need a dependency parse, and passive voice needs real disambiguation

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

### New offline tool

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

### Schema (additive)

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

### Ranking

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

### Backend/frontend wiring

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

### Verification

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

### Follow-up: display turned off

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

### Follow-up: re-enabled (2026-09-10)

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

<a id="54"></a>
## 54. Adjective-noun attributive relations (second grammar-based section)

Follow-up to decision #53: the second grammar-based relation, chosen
from the two options that decision explicitly left deferred (adjective-
noun attributive vs. noun-noun genitive). Adjective-noun was picked
first per `docs/collocation-fluency-gap-report-2026-09-08.md`'s ranked
recommendation #2 - it's earlier-acquired than verb-based relations in
the L2-acquisition literature that report cites, but still error-prone
through B1/B2, and it's a direct continuation of #52/#53's pattern
rather than new architecture.

### Empirical validation: distinguishing attributive from predicative needs no extra check, coordination does

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

### New offline tool

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

### Schema (additive)

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

### Ranking

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

### Backend/frontend wiring

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

### Verification

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
errors, and the feature itself needed no frontend source changes at all
since `CollocationList.tsx` already handles arbitrary sections
generically). Noun-noun genitive attributes - the other relation
decision #53 raised alongside adjective-noun and explicitly deferred -
remains unbuilt.

### Follow-up: unrelated relation-badge change discovered mid-session, and a build break it caused

Before committing, found `frontend/src/components/CollocationList.tsx`
already had a staged, uncommitted edit neither made nor explained in
this session: the `entry.relation` badge block (Subjekt/Akkusativobjekt/
etc. labels, decision #53) was commented out rather than removed. Since
this predated and was unrelated to the adjective-attributes work, and
its origin was unclear, it was flagged to the user before committing
anything rather than silently included or discarded - confirmed as
intentional and kept as-is.

That edit left `caseColorClass`/`relationAbbreviation` imported but
unused. `tsc --noEmit` (this repo's local `typecheck` script) didn't
catch it, but `tsc -b` - the strict project-reference build mode
`Dockerfile.prod` actually runs (`npm run build` → `tsc -b && vite
build`) - treats an import whose bindings are *all* unused as a hard
error (`TS6192`), which only surfaced once the production Docker build
ran it. Fixed by removing the now-unused import line; no behavior
change beyond what the original edit already did (relation badges
stay hidden). Worth remembering for future sessions: local `typecheck`
and the prod build's `tsc -b` are not equivalent checks - a change that
passes one can still break the other.

### Follow-up: deployed to production (2026-09-10)

Deployed same day, following the established mechanism (decisions
#48/#51): `git push` → `gcloud compute ssh` into
`german-collocations-instance` (`us-central1-a`) → operations as
`tuanchuhoang` (the live checkout's owner, confirmed via `docker
inspect`'s compose-project-config-files label per CLAUDE.md failure
class #5, not assumed from path).

`adjective_attribute.tsv`/`adjective_attribute_examples.tsv` don't
exist on the production host by default (gitignored, not part of the
repo) - `gcloud compute scp`'d both to the `tuanchu` OS-login user's
home directory, then `sudo mv`+`chown`'d into
`tuanchuhoang`'s bind-mounted `./data/` (the `tuanchu` login has no
read access to `tuanchuhoang`'s home directory or the Docker socket
directly - every command needed either `sudo -u tuanchuhoang` or plain
`sudo`, depending on whether it needed the target user's file
ownership or just root).

`docker compose -f compose.prod.yml build migrate` →
`run --rm migrate` (migrations 012/013 applied) → `--profile manual
build load-adjective-attributes load-adjective-attribute-examples` →
`run --rm` each. Both matched production's already-loaded `lemmas`
table at exactly the same rate as the local load: 444,344/126 skipped
and 569,207/150 skipped - identical counts to the local dev load
recorded in the Verification section above, confirming the production
`lemmas` table (loaded independently, in an earlier session) resolves
adjective-attribute lemma text exactly like the local one does. The
examples loader (569K rows, ~100MB) exceeded a 120s foreground timeout
and had to be tracked as a background job to completion - consistent
with this VM's previously-documented slow `pd-standard` (HDD-class)
disk under bulk-insert I/O (`docs/1M-corpus-upgrade-session-notes.md`).

`docker compose -f compose.prod.yml build backend frontend` → `up -d
backend frontend` (not `build` alone - CLAUDE.md failure class #1).
Verified via `docker inspect --format '{{.State.StartedAt}}'` that both
containers actually restarted (StartedAt matched the deploy time, not a
stale earlier start).

Verified against the live public site
(`german-collocations.chickenkiller.com`, not just the VM's internal
`localhost:3000` - which turned out not to be published to the host at
all in `compose.prod.yml`, only reachable through the `caddy` reverse
proxy): `/api/collocations/Regierung`'s adjective section and
`/api/collocations/groß`'s noun section returned results identical to
the local-dev spot-check above. Confirmed no regression to decision
#53's data: `/api/collocations/warten`'s `noun` section still returns
`relation`-tagged entries (`Jahr`→`Akkusativobjekt` etc.) - the
API-level data is unaffected by the frontend badge-rendering change
above, which only hides the badge client-side.

<a id="55"></a>
## 55. Verb-argument noise floor: fall back to unfiltered pairs when a verb/noun has none above it

Follow-up to decision #53. Investigated why `/api/collocations/weiterfahren`
showed no "noun" section (subject/object collocates) at all, despite real,
hand-readable example sentences existing for it in
`verb_argument_examples.tsv`/the `verb_argument_examples` table (e.g.
"Auto"/"Fahrer"/"Fahrzeug" as Subjekt, "Richtung" as Akkusativobjekt).

Root cause: every one of `weiterfahren`'s 22 `verb_arguments` rows has
`count` 1 or 2 - none reach `MIN_ARGUMENT_COUNT = 3` (decision #53's noise
floor). `VERB_ARGUMENTS_QUERY`'s `verb_side`/`argument_side` CTEs filtered
with a flat `AND va.count >= MIN_ARGUMENT_COUNT`, so a verb with *no*
qualifying pair produced zero rows for that section - not just a
shorter list, an empty one - and the example-sentence `LEFT JOIN LATERAL`
never got anything to join against, even though the examples themselves
were correctly loaded.

This is a real gap in the decision #53 threshold, not a data or loader
bug: the floor was tuned as "hide the long tail of one-off noise among a
verb's otherwise-plentiful pairs" (85% of all triples are count 1), not
"hide a verb entirely because it happens to have no pair above 3". A
verb like `weiterfahren` - genuinely used, just without a single
recurring subject/object across the corpus sample - was being treated
identically to pure parser noise.

### Fix: per-fixed-lemma fallback, not a lowered floor

Rejected lowering `MIN_ARGUMENT_COUNT` globally (would re-admit the 85%
one-off tail decision #53 measured and explicitly excluded). Instead,
each of `verb_side`/`argument_side` now computes, via
`bool_or(va.count >= MIN_ARGUMENT_COUNT) OVER ()` over the same
already-`WHERE`-filtered-to-one-fixed-lemma row set the query already
relied on for share calculations (see #53's `verb_side`/`argument_side`
comments on window functions running after `WHERE`), whether *any* of
that lemma's own pairs clears the floor. The floor then only applies
when the answer is yes:

```sql
WHERE cooccurrence >= MIN_ARGUMENT_COUNT OR NOT any_meets_floor
```

A verb/noun with at least one well-attested pair keeps the exact
pre-#55 behavior (only threshold-passing pairs shown, verified against
`warten`: still exactly its 87 count>=3 rows, cooccurrence range 4-28,
5.8ms via `EXPLAIN (ANALYZE, BUFFERS)` - no measurable regression from
the added window function). A verb/noun with nothing above the floor
(`weiterfahren`, max count 2) now shows all of its pairs, ranked by
share same as always, capped by the existing `PER_SECTION_LIMIT = 10`.

Applied to both `verb_side` (a verb headword's noun section) and
`argument_side` (a noun headword's verb section) - the same gap exists
on either fixed side, and a noun whose only governing verbs are all
low-count would hit the identical empty-section problem.

Not applied to `adjective_attributes`/`ADJECTIVE_ATTRIBUTES_QUERY`
(decision #54, same `MIN_ADJECTIVE_ATTRIBUTE_COUNT = 3` shape, an even
steeper 90.4%-under-3 tail) - left as a known open question for a
follow-up session rather than assumed to need the identical fix; the
user's request was scoped to the verb-argument case surfaced by
`weiterfahren`.

### Verification

Queried the live DB directly (`weiterfahren`, lemma id 2910356) before
and after: `verb_side` alone went from 0 rows to 13 (all 22 raw pairs
minus the `DISTINCT ON`/relation collapsing and one deduped case), and
the full `VERB_ARGUMENTS_QUERY` end-to-end now returns a "noun" section
with attached example sentences for "Richtung", "Fahrer", "Fahrzeug",
"Auto", "Duo", "Ehefrau", etc. - each checked against the real sentence
text, all genuine.

`tsc --noEmit` clean on `backend`. Rebuilt and restarted the backend
container (`docker compose build backend && docker compose up -d
backend`), confirmed via `docker inspect --format
'{{.State.StartedAt}}'` against the build time (CLAUDE.md failure class
#1). Hit the live local endpoint directly:
`/api/collocations/weiterfahren` now returns the noun section with
examples as above; `/api/collocations/warten` unchanged (10 noun
entries, cooccurrence 4-28, same as pre-#55).

**Not yet done**: production deploy (this session was local-dev only).
No frontend changes needed - `CollocationList.tsx` already renders
whatever entries the API returns, and a fallback-sourced entry has the
exact same shape (`word`, `cooccurrence`, `significance`, `section`,
`relation`, `examples`) as a threshold-passing one, with no flag
distinguishing "this cleared the floor" from "this is the best
available despite not clearing it" - revisit if that distinction turns
out to matter to a learner (e.g. a low-confidence indicator), but not
requested here. Whether `adjective_attributes` needs the same fallback
is open, not decided either way.

### Follow-up: deployed to production (2026-09-12)

Deployed same day, following the established mechanism (decisions
#48/#51/#54): `git push` → `gcloud compute ssh` into
`german-collocations-instance` (`us-central1-a`) → confirmed the live
checkout via `docker inspect`'s compose-project-config-files label
(`/home/tuanchuhoang/german-collocations`, CLAUDE.md failure class #5)
→ operations as `tuanchuhoang`.

`git pull` picked up two commits behind: this fix plus an unrelated
layout change already bundled in by the user (`b4256a6`, also touched
`Layout.tsx`/`SearchBox.tsx`/`Word.tsx` and a whitespace-only fix to
migration 001 - no re-migration needed, content-only formatting).

`docker compose -f compose.prod.yml build backend frontend` failed on
the frontend: `tsc -b` (the prod build's strict project-reference
check, same one decision #54's follow-up flagged as distinct from local
`tsc --noEmit`) hit `TS6133` on `Word.tsx` - a `GovernedPrepositions`
import left behind when its JSX usage got commented out in the same
bundled layout change. Exact repeat of decision #54's own follow-up bug,
same root cause (commented-out JSX, forgotten import), same fix
(removed the import, committed as `dbcdd99`, left the commented-out
JSX alone since it's someone else's in-progress change, not mine to
resolve). Reproduced locally first via `npx tsc -b` before touching
anything, confirmed clean after the fix, then pushed and re-pulled on
prod before rebuilding again - this time both `backend` and `frontend`
built clean.

`docker compose -f compose.prod.yml up -d backend frontend` (not
`build` alone - CLAUDE.md failure class #1). Verified via `docker
inspect --format '{{.State.StartedAt}}'` that both containers actually
restarted (StartedAt matched the deploy time).

Verified against the live public site
(`german-collocations.chickenkiller.com`): `/api/collocations/weiterfahren`
now returns a 10-entry "noun" section with attached examples (Richtung,
Fahrer, Fahrzeug, Auto, Duo, ...), matching the local-dev verification
above. Confirmed no regression: `/api/collocations/warten`'s noun
section is unchanged (10 entries, cooccurrence 4-28). Site itself
responds `200`.

Worth noting for next time: this is the second time in two consecutive
feature sessions (#54, #55) that a layout/UI change left a stray unused
import that only the prod build's `tsc -b` catches. Since this keeps
recurring, running `npx tsc -b` (not just `tsc --noEmit`) before pushing
any frontend change - not just before a deploy - would catch it earlier;
raised here as an observation, not yet adopted as a standing rule.

<a id="56"></a>
## 56. Verb arguments: drop proper nouns, decided per lemma rather than per token

Follow-up to decision #53, and a partial reversal of it: #53 restricted
verb arguments to `NOUN`/`PROPN` children, which let names through as
collocates - `sagen` → `Trump` (305), `erklären` → `Trump` (104), 1,155
distinct `Trump` triples in `verb_argument.tsv` alone. A name is a real
grammatical subject/object, but it is not a collocation: it reflects who
was in the news in the corpus year, not which nouns a verb combines with.
#53's own Verification section already shows the symptom
(`unterstützen` → `Ukraine`/`USA` listed among the "sensible" results).

### Why not just delete `PROPN` from the three `pos_` checks

Measured on a 40,000-sentence sample before deciding (13% of all argument
tokens are `PROPN`: 6,364 of 47,326). `de_core_news_sm` tags the same
word inconsistently from one sentence to the next:

- `Trump` as an argument: 123 tokens `PROPN`, 8 tokens `NOUN`. A
  per-token filter leaves those 8 behind - every name survives as a thin
  low-count residue, which decision #55's fallback then surfaces for any
  verb with nothing above the noise floor.
- `Mann` 2 `PROPN` / 359 `NOUN`, `Kind` 1 / 166, `Sachschaden` 4 / 56: a
  per-token filter shaves counts off genuine nouns.

So the filter is per lemma: every `NOUN`/`PROPN` token in the corpus (not
only those in argument position - more evidence, no extra cost, same
parse) is tallied by lemma, and a lemma tagged `PROPN` in a strict
majority of its occurrences (`PROPER_NOUN_MIN_SHARE = 0.5`) has all of
its triples and example sentences dropped at write time.
`find_verb_arguments` still yields `PROPN` tokens, because the verdict
isn't known until the whole corpus has been read.

### Rejected: spaCy NER as a second signal

The lemma-level `PROPN` rule has a known leak: names the model tags
`NOUN` most of the time. `word_pos.tsv` shows it corpus-wide - `Putin`
1,514 `NOUN` / 693 `PROPN`, `Russland` 3,464 / 248, `Alcaraz` 118 / 26,
`Airbus` 137 / 23. Enabling the `ner` pipe and also counting
`NOUN` tokens carrying a `PER`/`LOC`/`ORG` entity label does catch those,
but on a 60,000-sentence sample it also pushed `Haus` (0.52), `Staat`
(0.61), `Straße` (0.68), `Armee`, `Kurs`, `Gegner`, `Sohn`, `Anleger`,
`Bewohner` and `Kirche` over the 0.5 line - 15,840 argument tokens
dropped instead of 9,708, with most of the difference being exactly the
common nouns this feature exists to show. Including `MISC` was worse
again (`Krieg`, `Frieden`, `Niederlage`). It also cost speed (597 vs.
~990 sentences/sec). Precision over recall, same call as #52/#53: the
leak stays, documented, rather than trading it for lost real collocates.

Also rejected: lowering the threshold below 0.5 to catch `Putin` (0.32).
The same band holds `Deal` (0.32), `Tipp` (0.45), `Coach` (0.45),
`Startschuss` (0.38), `Bewusstsein` (0.38).

### Known limitations, not fixed

- Names tagged mostly `NOUN` still appear (`Putin`, `Russland`, `FC`,
  `AfD`, `Union`). A larger spaCy model would likely tag these better,
  but switching models changes the dependency parse under every
  hand-verified rule in #52/#53/#54 - out of scope here.
- A few genuine common nouns the model tags mostly `PROPN` are lost:
  seen in the sample were `Beschluss`, `Anschluss`, `PKW`, `KI`, `Apps`,
  and surname/noun homographs (`Wolf`, `Koch`, `Wagner`).
- Not applied to `extract_adjective_attributes.py` (decision #54), whose
  head-noun check accepts `NOUN`/`PROPN` the same way. Left as an open
  question rather than assumed to need the identical rule - the request
  was scoped to `verb_argument.tsv`.

### Rollout

No schema or query change. Neither loader truncates:
`load-verb-arguments.ts` is `INSERT ... ON CONFLICT DO NOTHING`, so
loading the regenerated TSV on top of the existing rows would remove
nothing, and `load-verb-argument-examples.ts` has no conflict handling
at all, so it would duplicate every example. Both tables need
`TRUNCATE verb_arguments, verb_argument_examples` first, then both
loaders re-run - same operator-run-TRUNCATE convention as #37/#44.

### Verification

Full corpus run: 1,000,000 sentences, 683,835 distinct (verb, relation,
argument) triples (down from #53's 814,714 - 130,879 proper-noun triples
dropped, 16%), 847,789 example rows (down from 994,020).

Spot checks against the regenerated `verb_argument.tsv`:

- `Trump`, `Merz`, `Deutschland`, `Amazon`: 0 triples each (`Trump` had
  1,155).
- `sagen` top 10 before: `Sprecher`, `Trump`, `Sprecherin`, `Merz`,
  `Präsident`, ... After: `Sprecher`, `Sprecherin`, `Präsident`,
  `Polizeisprecher`, `Trainer`, `Bürgermeister`, `Zeitung`, `Experte`,
  `Sender`, `vorsitzend` - counts of the surviving nouns unchanged.
- `unterstützen` top 10 lost `Ukraine` and `Deutschland`, nothing else.
- Common nouns intact: `Mann` 1,725 triples, `Polizei` 832, `Zeit` 712.
- The documented leak is real at full scale: `Russland` 631 triples,
  `AfD` 460, `Putin` 450, `FC` 414 still present.
- The documented loss is real too: `Beschluss` and `KI` have 0 triples.

### Follow-up: deployed to production (2026-10-07)

Production is no longer the GCP VM that decisions #48/#51/#54/#55
describe (`german-collocations-instance`, `gcloud compute ssh`): it now
runs on a Linode VM, reached with plain `ssh root@139.162.13.171`. The
live checkout is `/root/german-collocations` (confirmed via `docker
inspect`'s compose-project-config-files label, CLAUDE.md failure class
#5), owned by root - no `sudo -u` needed.

`npx tsc -b` locally first (the lesson from #54/#55, clean) → `git push`
→ `scp` both regenerated TSVs into the live `data/` (md5 matched the
local files; the previous ones kept beside them as `*.pre56.tsv`) →
`git pull` → `docker compose -f compose.prod.yml --profile manual build
backend frontend load-verb-arguments load-verb-argument-examples` →
`up -d backend frontend` (StartedAt matched the deploy time; this also
shipped the unrelated `CollocationList` font-size commit `c9ee586`) →
`TRUNCATE verb_arguments, verb_argument_examples` → both loaders.

Loaded 683,834 `verb_arguments` rows and 847,788
`verb_argument_examples` rows, 1 row skipped by each loader (no matching
lemma); the whole truncate-and-reload took 83 seconds on this host.
Production previously held 814,710 / 994,016.

Verified against the live site: 0 `verb_arguments` rows for `Trump`,
`Merz` or `Deutschland`; `/api/collocations/unterstützen`,
`/brauchen`, `/sagen` and `/Regierung` return full 10-entry sections
with examples; `/weiterfahren` (decision #55's fallback case) still
returns its 10 low-count entries.

Not done: the local dev database has not been reloaded (local `data/`
does hold the new TSVs, with the old ones as `*.pre56.tsv`).

<a id="57"></a>
## 57. Collocations: drop proper-noun partners, decided per lemma

#56 removed proper nouns from verb arguments; the left/right collocation
lists still showed them. `SECTION_CASE` has no proper-noun section, so
every `PROPN` partner fell through to `'other'`, which for a noun like
`Präsident` was nothing but names (`Wolodymyr`, `Donald`, `Trump`).

**Chosen:** `buildBranchQuery` in
`backend/src/repositories/CollocationRepository.ts` adds
`AND ldp.pos IS DISTINCT FROM 'PROPN'`. Same per-lemma rule as #56: the
lemma's dominant POS decides, not the tag of each token.

- `IS DISTINCT FROM`, not `<>`: `ldp` is a `LEFT JOIN` restricted to
  `share >= 0.8` (#36), so it is NULL for a partner with no trusted
  dominant POS. `<>` would drop those rows too; they must stay.
- Consequence of the same join: a lemma that is mostly but not
  dominantly `PROPN` (share below 0.8) is kept, and still lands in
  `'other'`. Same known-limitation shape as #56.

No schema change, no reload: a query-only change.

### Verification

`npx tsc -b` in `backend/` is clean. Local database (2026-10-25):
`Präsident` has 1,391 partner pairs across both directions, 459 of them
(33%) with a dominant `PROPN` partner, which this filter removes. Of the
495,260 lemmas with a trusted dominant POS, 109,134 are `PROPN`.

### Follow-up: deployed to production (2026-10-25)

Same procedure as #56, without a reload: `git push` → `ssh
root@139.162.13.171` → `git pull` in `/root/german-collocations` (the
live checkout per `docker inspect`) → `docker compose -f
compose.prod.yml build backend` → `up -d backend` (StartedAt
03:59:04 UTC, matching the deploy).

Verified against the live site: `/api/collocations/Präsident`'s `other`
section lost `Wolodymyr`, `Wladimir`, `Donald`, `Emmanuel`, `Selenskyj`,
`Frankreich`, `Trump`, `Recep` and `Alexander`; the noun, verb,
adjective and preposition sections are unchanged. `/Kanzler`,
`/Regierung` and `/sagen` return 200.

The known limitation is visible at once. `other` refills with names the
filter cannot see: `Putin`, `Erdoğan` and `Russland` have a dominant
`NOUN` tag (shares 0.61, 0.53, 0.78), and `Biden`, `Merz` and `Maduro`
are `PROPN` below the 0.8 threshold (0.73, 0.68, 0.54), so `ldp` is NULL
for them. `Nicolás` (dominant `NOUN`, share 1.0) stays in the noun
section. Fixing these needs a different signal than spaCy's POS tag (the
same open question as #56's `Russland`/`Putin` leak); not attempted here.

<a id="58"></a>
## 58. Search box stays at 16px on every screen width, so iOS doesn't zoom on focus

iOS Safari zooms into any focused text field whose font is smaller than
16px. The shared `Input` component (`components/ui/input.tsx`) is
`text-base` (16px) but `md:text-sm` (14px) from 768px up, so tapping the
search box zoomed the page on iPads and on iPhones in landscape.

**Chosen:** `SearchBox` adds `md:text-base`; `cn()`'s `twMerge` drops the
component's `md:text-sm`, so the field is 16px at every width. Only the
search box changes; `Input` itself is left as shadcn ships it.

Rejected: `maximum-scale=1` in the viewport meta tag. It stops the focus
zoom too, but Android browsers honour it and block pinch-zoom entirely,
which hurts anyone who needs to zoom.

<a id="59"></a>
## 59. iOS only: `maximum-scale=1` stops the focus zoom #58 didn't (amends #58)

#58 did not fix the report it was made for: Safari on an iPhone 15 Pro
Max, portrait, still zoomed when the search box was tapped. Measured in
Playwright WebKit with the `iPhone 15 Pro Max` profile (430px wide):
the input's computed `font-size` is 16px, `scrollWidth` equals the
viewport width (nothing overflows), and `visualViewport.scale` is 1. So
the 16px rule was already met at that width, and #58 only mattered from
768px up (iPad, iPhone landscape); it stays. The zoom on the phone
itself is most likely a Safari page zoom below 100% (the aA menu or
Settings), which shrinks a 16px field below the threshold; not
confirmed on the device.

**Chosen:** an inline script in `frontend/index.html`, right after the
viewport meta tag, adds `maximum-scale=1` on iPhone/iPad only (iPadOS
reports itself as `MacIntel` with touch points). iOS Safari ignores
`maximum-scale` for pinch-zoom since iOS 10 but honours it for the
focus zoom, so it removes the zoom whatever its cause, and users can
still pinch. Android and desktop keep the plain tag, which avoids
#58's rejected trade-off (Android blocking pinch-zoom).

Verified with `vite preview` + Playwright: the tag gains
`maximum-scale=1` for `iPhone 15 Pro Max` and `iPad Pro 11`, and stays
`width=device-width, initial-scale=1.0` for `Desktop Safari` and
`Pixel 7`. The focus zoom itself cannot be reproduced in emulation; it
needs checking on the phone.
