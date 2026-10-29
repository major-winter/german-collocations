-- Decision #60 (docs/decisions.md): the noun and verb pages read
-- collocation-lab's pairs (lab_verb_pairs, migration 014) instead of
-- spaCy's verb_arguments, and a word without lab pairs shows nothing in
-- that section rather than falling back to these. Nothing reads them
-- any more; their loaders are deleted with this migration.
-- tools/pos-tagging/extract_verb_arguments.py, which produced them,
-- stays in the repo but is no longer loaded.
DROP TABLE verb_argument_examples;
DROP TABLE verb_arguments;
