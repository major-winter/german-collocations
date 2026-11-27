-- Decision #79: how often each lemma is tagged ADJ and ADV, as shares of
-- all its tags. spaCy tags a German adjective ADJ when it inflects
-- ("dichter Nebel") and ADV when it doesn't ("der Nebel ist dicht",
-- "deutlich machen"), so lemma_dominant_pos alone files many common
-- adjectives (dicht, offen, richtig, endgültig) as ADV, or below the #36
-- share threshold, and the collocation list puts them under "other".
-- The section query reads both shares from here.
--
-- Additive: lemma_dominant_pos keeps its meaning. A table, not a view,
-- for the same reason as lemma_dominant_pos (008): it re-aggregates
-- word_dominant_lemma by lemma_id (database/CLAUDE.md pitfall 3).
-- Only lemmas with at least one ADJ tag get a row.
CREATE TABLE lemma_adjective_shares (
  lemma_id  int PRIMARY KEY REFERENCES lemmas(id),
  adj_share real NOT NULL,
  adv_share real NOT NULL
);

-- Fills it for a database that is already loaded. A fresh database has
-- nothing to aggregate yet, and load-lemmas.ts refills the table on every
-- reload with the same query (populateLemmaAdjectiveShares there).
INSERT INTO lemma_adjective_shares (lemma_id, adj_share, adv_share)
SELECT lemma_id,
  coalesce(sum(count) FILTER (WHERE pos = 'ADJ'), 0)::real / sum(count),
  coalesce(sum(count) FILTER (WHERE pos = 'ADV'), 0)::real / sum(count)
FROM (
  SELECT wdl.lemma_id, wp.pos, SUM(wp.count) AS count
  FROM word_pos wp
  JOIN word_dominant_lemma wdl ON wdl.word_id = wp.word_id
  GROUP BY wdl.lemma_id, wp.pos
) lemma_pos
GROUP BY lemma_id
HAVING sum(count) FILTER (WHERE pos = 'ADJ') > 0;
