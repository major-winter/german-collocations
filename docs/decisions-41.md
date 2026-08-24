### 41. Simple-sentence filtering for collocation examples, via spaCy clause scoring

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
