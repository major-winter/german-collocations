### 36. POS-based collocation grouping: dominance threshold and per-section cap

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

### 37. Corpus package upgrades are a full reload, not additive

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

### 38. Batched, resumable inserts in extract-examples.ts

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

### 39. Example-sentence matching requires true left-right adjacency

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
