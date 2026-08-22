-- Adds word_dominant_pos: a view exposing the single dominant POS tag
-- per word, derived live from word_pos.
--
-- Chosen as a VIEW rather than a second materialized table after
-- measuring the underlying query with EXPLAIN (ANALYZE, BUFFERS)
-- against real loaded data (100K-corpus word_pos, ~157K rows):
--   - Index Scan on word_pos_pkey (no sequential scan)
--   - Incremental Sort exploiting the (word_id, pos) key's existing
--     order, not a full re-sort
--   - 78ms execution time, zero disk reads (Buffers: shared hit
--     only, no "read") — fully served from cache
--
-- A view carries no drift risk: it always reflects the current
-- contents of word_pos, with no separate copy that could fall out of
-- sync (the exact failure shape behind the production outage, where
-- two things recorded the same fact and were allowed to disagree).
-- Given the measured cost is already negligible, there is no
-- performance justification for taking on that risk instead.
--
-- `share` is the fraction of a word's total tagged occurrences that
-- went to its top POS tag. This is what the repository will compare
-- against a dominance threshold (not yet finalized — see the
-- forthcoming decile-distribution query) to decide whether a word's
-- tag is reliable enough to drive POS-based grouping/filtering, or
-- whether the word is genuinely ambiguous (e.g. "sein" as AUX vs.
-- DET) and should fall through to an "Other" bucket instead.

CREATE VIEW word_dominant_pos AS
SELECT DISTINCT ON (word_id)
  word_id,
  pos,
  count,
  count::real / SUM(count) OVER (PARTITION BY word_id) AS share
FROM word_pos
ORDER BY word_id, count DESC;
