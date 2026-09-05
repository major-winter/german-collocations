### 50. Rank-based example selection instead of a threshold gate

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

**Not done in this pass**: production deploy. Decision #41's own
extraction run crashed repeatedly when executed directly on the
production VM (decision #38's disk-I/O findings, `pd-standard` HDD-
class disk) - the established mitigation is running extraction locally
and shipping a `pg_dump` of `sentences`/`collocation_examples` to the
VM rather than re-running the script there. Follow that same pattern
next, not a direct on-VM run.

**Still open, unrelated to this change**: the lemma-fragmentation
finding from the coverage roadmap background (spaCy mis-lemmatizing
irregular noun plurals like Motorrad -> Motorräder) inflates the
zero-coverage count independently of the threshold-vs-ranking question
addressed here - worth re-measuring against the lemma-pair universe
specifically before deciding whether steps 2 (rotation) or 3 (bounded
offline LLM fill-in) are still needed at the same scope originally
estimated.
