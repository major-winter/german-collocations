# Database and loader pitfalls

Loaded when working under `database/`. Moved out of the root CLAUDE.md so
it only costs context when relevant.

1. **`ON CONFLICT DO NOTHING` only suppresses duplicate-key conflicts**,
   not FK violations — the `validIds`/lookup-map pattern is required
   to skip orphaned or unresolvable rows safely.
2. **Leipzig word IDs are not stable across package sizes.** The same
   numeric ID means a different word in the `100K` vs `1M` packages.
   A corpus package upgrade is always `TRUNCATE ... CASCADE` + full
   reload, never incremental — see decision #37.
3. **A view that re-aggregates another `DISTINCT ON` view by a
   *different* key isn't push-down-able**, even with an index on that
   key present — Postgres has to materialize the whole underlying view
   before it can group by the new key. `word_dominant_pos` (decision
   #36) is cheap because every caller filters it by the same key it's
   `DISTINCT ON`'d by (`word_id`); `word_dominant_lemma`'s downstream
   views (decision #44) needed to re-aggregate by `lemma_id` instead,
   and that measured as a >2 minute timeout on a single query — even
   after adding an index on `lemma_id`, `EXPLAIN (ANALYZE, BUFFERS)`
   showed the *same* view use the index in one join and fully
   re-materialize in another, in the same query. Fix was to
   materialize as a table, not to trust the index existing. Any new
   derived-from-a-derived-view pattern needs the same `EXPLAIN` check
   before assuming a view is fine just because an earlier,
   differently-keyed view was.
4. **A new pipeline that scans the raw corpus directly must apply the
   same word/pair filters as `database/src/filters.ts`'s
   `isStopword`/`isNonAlphabetic`** (used by `load-data.ts` to exclude
   stopwords and non-alphabetic tokens from `words`/`collocations`), or
   a numerator/denominator mismatch appears: a filtered word's
   cooccurrence gets tallied from the full unfiltered scan while its
   frequency (sourced from the already-filtered `words` table
   downstream) stays near zero — making the excluded word score
   *artificially higher* than genuine results, not just present when it
   shouldn't be. Bit `tools/pos-tagging/extract_lemmas.py` in decision
   #44 — "der"/"und" outscored real collocations by logDice until the
   same filter was ported in.
