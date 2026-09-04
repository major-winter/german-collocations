### 47. Fix a query regression introduced by decision #45

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
