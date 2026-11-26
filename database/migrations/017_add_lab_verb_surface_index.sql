-- Decision #70: the collocation check maps a typed verb form ("nimmt") to
-- lab verb lemmas through lab_verb_pair_examples.verb_surface. Unindexed
-- that lookup measured 55 ms over 314k example rows.
CREATE INDEX idx_lab_verb_pair_examples_verb_surface ON lab_verb_pair_examples (verb_surface);
