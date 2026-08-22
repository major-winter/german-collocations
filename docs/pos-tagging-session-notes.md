# POS Tagging (Pipeline) — Session Notes

Knowledge captured while planning and building the type-level POS
tagging feature, through the tagging script, migration, loader, and
dominant-tag view. Companion to earlier milestone session notes — same
"why is it built this way" / "hit this error before" framing. Feature
not yet complete: repository/service grouping logic and frontend
sections are not yet built (see Status at end).

---

## Scope and framing decisions

**Goal**: use part-of-speech tags to (a) filter out grammatically
uninteresting collocation pairs (e.g. `DET+NOUN`) that a plain
stopword list can't distinguish from valuable ones (e.g. `VERB+ADP`
pairs like `warten auf`), and (b) group a word's results into labelled
sections ("Verbs", "Adjectives", "Prepositions") rather than one flat
ranked list.

**Filtering vs. grouping**: chose **grouping**, with filtering as a
free side effect (a section that's grammatically uninteresting is
simply not shown). Reasoning: grouping gives per-word pages real
structure, directly addressing the thin-programmatic-content SEO risk
already flagged in the Milestone 3 session notes; filtering alone
would only make the existing lists shorter. Not yet logged as a
numbered decision in the main file — see `decisions-33-35.md`.

**Type-level vs. token-level tagging**: chose **type-level** (one
dominant tag per word form, derived from an aggregated distribution)
over token-level (a tag per individual occurrence, correctly resolving
context-dependent ambiguity like `sein` as AUX vs. DET).

Token-level was rejected specifically because Leipzig's `co_n.txt`
ships pre-aggregated counts with the underlying tokens already
discarded — building token-level POS would mean re-deriving Leipzig's
entire near-neighbor computation from `sentences.txt` from scratch,
including reimplementing significance scoring. That's a different,
much larger project, not an extension of this one, and it would stop
Leipzig being the trusted source of truth for collocation statistics
(decision #2's whole rationale).

Accepted cost of type-level: genuinely ambiguous words (`sein`, and
per live data also `seiner`/`schwieriger`) get a `share` well below
1.0 in the dominant-tag view and are excluded from strict POS rules by
the dominance threshold, rather than mis-tagged. This is a coverage
loss on a small set of high-frequency function words, not a
correctness bug.

**Tagger**: chose **spaCy** (`de_core_news_sm`) over a licensed lexicon
dump (Wiktionary/Morphy). Reasoning: avoids reopening the Leipzig-style
licensing review that has blocked prior work twice; the tradeoff is
introducing Python into an otherwise all-Node/TypeScript monorepo.
Mitigated by strict isolation (see below) rather than avoided.

**Sequencing**: POS tagging happens **after** the 1M-sentence Leipzig
upgrade, to avoid tagging the corpus twice. The pipeline was built and
validated against the *current* 100K package as a deliberate dry run
(see Verification below) — this was a conscious choice to validate the
mechanism cheaply before committing to a long run against 1M, not a
sequencing mistake. **The 100K-derived `word_pos` data currently
loaded is temporary and must be reloaded from a fresh 1M-corpus tagging
run before this feature is considered production data.**

---

## Python isolation (`tools/pos-tagging/`)

Deliberately outside the npm workspace system entirely:
- Not listed in the root `package.json` workspaces array.
- Never referenced by any Dockerfile.
- Never runs in Docker, on the VM, or in any deploy sequence.

Self-contained via a standard venv, mirroring what `node_modules` does
for JS — dependencies scoped to this one project, not global:

```bash
cd tools/pos-tagging
python3.12 -m venv .venv       # NOT bare python3 -- see version note below
source .venv/bin/activate
pip install -r requirements.txt
python -m spacy download de_core_news_sm
```

`.venv/` is gitignored (added to root `.gitignore`), same principle as
`node_modules/`.

### Python version constraint hit live

spaCy 3.8.x does not yet support Python 3.14. `pip install -r
requirements.txt` on a 3.14 interpreter appeared to partially succeed
but silently left the dependency tree incomplete, surfacing later as
`ModuleNotFoundError: No module named 'click'` deep inside
`spacy/cli/_util.py` — a confusing failure far from the real cause
(same *shape* of problem as the TypeScript 7 / `ts-node` incompatibility
from Milestone 1, different ecosystem). Fixed by installing Python 3.12
via Homebrew and recreating the venv with `python3.12 -m venv .venv`
explicitly, not bare `python3`.

### `click` had to be pinned explicitly

Even on 3.12, one install resolved `typer==0.27.1` without pulling in
`click` as a transitive dependency, despite spaCy's own code importing
`click` directly (`from click import NoSuchOption` in
`spacy/cli/_util.py`). Root cause not fully diagnosed (a `typer`
release-specific dependency declaration change is suspected, not
confirmed). Fixed pragmatically by adding `click>=8.0.0` directly to
`requirements.txt` as an explicit dependency, rather than relying on it
arriving transitively.

**`requirements.txt`** (pinned, per the same reproducibility reasoning
as this project's other exact-pin decisions):
```
spacy==3.8.13
click>=8.0.0
```
(3.8.13 used, not 3.8.14 — no prebuilt wheel was available for this
environment at the time of install; functionally equivalent for this
script's purposes, which only use the tagger component.)

---

## `tag_words.py`

Streams `sentences.txt` (same `readline`-over-`createReadStream`-style
pattern as the TS loaders, adapted to Python), runs spaCy with
`disable=["parser", "ner"]` (only the tagger component is needed — a
well-documented significant speedup since the disabled components
would otherwise do real work this script discards), and aggregates via
`nlp.pipe()` (batched) rather than calling `nlp()` per sentence in a
loop (avoids repeated per-call overhead at up to 1M sentences).

**Case preserved exactly** on the surface form — deliberate, since
Leipzig's `words.txt` also preserves case exactly (`Stark` vs. `stark`
are separate entries, per Milestone 1 notes), and the loader needs to
join against that exact string.

**Excluded POS tags**: `PUNCT`, `SYM`, `SPACE`, `X` — dropped at
aggregation time since they can never correspond to a real `words` row.

**Output**: `word_pos.tsv`, tab-separated `word\tpos\tcount`, sorted by
word. Ships to the VM the same way as the raw Leipzig files
(`gcloud compute scp`, then the `/tmp` → `cp` workaround from
Milestone 4 for the permission issue).

---

## Verification of tagger output (10K-sentence sample)

Spot-checked against words with known-expected answers, using `awk
-F'\t'` (not `grep -P`, which isn't available on macOS's BSD grep):

```bash
awk -F'\t' '$1 == "warten"' sample_word_pos.tsv     # VERB, as expected
awk -F'\t' '$1 == "Aufgabe"' sample_word_pos.tsv    # NOUN, as expected
awk -F'\t' '$1 == "auf"' sample_word_pos.tsv        # ADP, as expected
```

**Ambiguous-word check, the actual point of the design**: `sein`
correctly produced two rows (AUX 167, DET 84 in the sample — roughly a
66/34 split), confirming the tagger and aggregation correctly preserve
genuine ambiguity rather than collapsing it. This is the concrete data
point behind the eventual dominance-threshold decision.

**Unexpected result, investigated and resolved as correct, not a
bug**: `schwierig` (bare form) tagged only ADV in the sample, not ADJ
as naively expected. Traced to the actual source sentences: both
occurrences of the *exact* bare form `schwierig` in the sample were
predicate constructions ("die Haushaltslage ist schwierig"), which
German predicate adjectives can legitimately tag as ADV (no
inflectional agreement marker present, unlike attributive use).
Confirmed by checking inflected sibling forms in the same sample:
`schwierige`/`schwierigen` → ADJ only (attributive endings give clear
signal); `schwieriger` → ADJ 1 / ADV 3 (genuinely ambiguous —
comparative adverb vs. attributive-with-`-er`-ending), a second
real-data confirmation of the ambiguity-preservation design working as
intended. Concretely demonstrates the type-level vs. lemma-level
distinction in practice: `schwierig`-the-lemma's full picture is split
across several separately-tracked surface forms.

**Distribution sanity check** (`cut -f2 | sort | uniq -c | sort -rn` on
distinct (word,pos) rows, not token counts): dominated by `NOUN`
(16,467 distinct forms), `PROPN` (5,773), `VERB` (4,434), `ADJ`
(3,911) — expected shape for open word classes, which have large
vocabularies. Closed classes (`DET` 184, `PRON` 163, `ADP` 162, `AUX`
81) have small vocabularies but (per the `auf` check) very high
per-word token frequency — also expected. No unexpected categories
(`PUNCT` etc. correctly absent, confirming the exclusion list worked).

---

## Migration `005_add_word_pos.sql`

```sql
CREATE TABLE word_pos (
  word_id  int  NOT NULL REFERENCES words(id),
  pos      text NOT NULL,
  count    int  NOT NULL,
  PRIMARY KEY (word_id, pos)
);
```

Deliberately additive — a new table, not a column on `words` (which
already carries two `STORED GENERATED` columns per decision #30;
altering it would trigger a full rewrite for a feature that doesn't
need to live there).

Stores **raw counts**, not a precomputed dominant tag or share — the
dominance threshold wasn't chosen yet at this point (needed real data
first, see decile query, still outstanding), and counts allow the
threshold to be retuned later via a query with no re-tag or schema
change needed.

`PRIMARY KEY (word_id, pos)`, not `word_id` alone — a word can and
does legitimately have multiple POS rows (this is the whole point).
No separate index needed on `word_id` alone — the composite PK's
leading column already covers that access pattern (confirmed later by
the `EXPLAIN` results, see below).

---

## Loader: `database/scripts/load-pos.ts`

Same shape as `load-data.ts`/`extract-examples.ts`: streaming
`readline`, batched inserts (1000/batch), `ON CONFLICT DO NOTHING` for
safe re-runs, `DATA_DIR` env var convention.

**New piece specific to this loader**: the tagging script's output has
no Leipzig word ID — spaCy only ever saw sentence text, not Leipzig's
ID scheme — so word strings must be resolved to `word_id` via a lookup.
Solved by loading the entire `words` table into an in-memory
`Map<string, number>` once up front (small even at 1M+ rows), rather
than a per-row database query. Unmatched words are skipped (not
errored) and counted — this skip count is the actual join-coverage
signal, and doubles as the mechanism that would surface a
case-folding/encoding bug if one existed (would show as an
unexpectedly high skip rate).

**Known/accepted source of skips**: Leipzig's multi-word entries
(`"unter Druck"`) are tokenized by spaCy as separate tokens and will
never match a single surface-form row.

**Ordering constraint**: needs `005_add_word_pos.sql` applied (schema)
and `loader` already run (words populated) — narrower prerequisite
than `extract-examples`, which additionally needs `collocations`
populated. Not enforced by Compose for profiled manual services;
sequenced by run order only (`migrate` → `loader` → `load-pos`).

**Caveat for future re-runs**: `ON CONFLICT DO NOTHING` means a second
`load-pos` run (e.g. after the 1M re-tag) will **not** update existing
rows — old counts silently persist alongside any genuinely new ones.
`TRUNCATE word_pos` before reloading with new tagging output, or the
table ends up a confusing mix of two tagging runs.

---

## Compose service: `load-pos`

Same pattern as `loader`/`extract-examples`: `context: .` +
`dockerfile: database/Dockerfile` (workspace lockfile-visibility
constraint, decision #14), `profile: manual`, `depends_on: db,
condition: service_healthy` (long form), `./data:/data:ro` bind mount,
same `DATABASE_URL`.

Added to **both** `compose.yml` and `compose.prod.yml` — deliberately
verified in both, given decision #19's `name:` key was the direct
cause of the production outage precisely because it landed in only
one file.

```bash
docker-compose --profile manual run --rm load-pos
```

---

## Pipeline validation run (100K corpus, deliberate dry run)

Ran the full pipeline against the *current* 100K-sentence package
specifically to validate the mechanism end-to-end before committing to
a long run against the not-yet-upgraded 1M package (a conscious
time-tradeoff, not a sequencing error — see Scope section above).

**Migration required a rebuild**: `docker-compose run --rm migrate`
alone did not pick up the new `005_add_word_pos.sql` file — required
explicit `--build`, consistent with the stale-image trap already
documented as recurring across nearly every prior milestone/session in
this project (this is at least the seventh documented occurrence).

**Load result**: 157,193 rows matched and loaded, 5,953 skipped
(3.6% skip rate). Consistent with the expected/accepted skip sources
(multi-word Leipzig entries, minor tokenization mismatches) — no
evidence of a case-folding or encoding bug, which would be expected to
produce a much higher skip rate (30–50%+).

**False alarm during spot-check, worth recording**: querying
`word_pos`/`words` joined for `word = 'sein'` (bare infinitive)
returned zero rows. Root-caused, not a bug: bare `sein` simply does not
exist as its own entry in this Leipzig package's `words` table — only
inflected forms (`seine`, `seiner`, `seinem`, `seinen`, `seines`, plus
several multi-word/compound entries) are present. Confirmed via `word
ILIKE 'sein%'`. This is a real, pre-existing gap in Leipzig's word
list, unrelated to anything built this session — re-verified instead
against `warten`, which was already confirmed present and correct.

---

## `EXPLAIN` measurement and the view-vs-table decision

Per the project's established "measure before deciding" pattern
(decision #4, fuzzy-search session's forced-seqscan checks), ran
`EXPLAIN (ANALYZE, BUFFERS)` against the candidate "dominant POS per
word" query before committing to either a view or a second
materialized table:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT DISTINCT ON (word_id)
  word_id, pos, count,
  count::real / SUM(count) OVER (PARTITION BY word_id) AS share
FROM word_pos
ORDER BY word_id, count DESC;
```

**Result** (100K-corpus data, ~157K rows in `word_pos`):
- `Index Scan using word_pos_pkey` — no sequential scan; the
  `(word_id, pos)` composite PK's leading column serves the
  `ORDER BY word_id` directly.
- `Incremental Sort` (not a full sort) — rows already arrive ordered
  by `word_id` from the index scan, so only small per-word groups
  (`count DESC`) need sorting (4,903 tiny quicksorts, 26kB peak memory
  each), not the whole 157K-row set at once.
- `WindowAgg` for the per-word total: `Storage: Memory, Maximum
  Storage: 17kB` — trivial, no spilling.
- **Execution Time: 78.219 ms** for the entire table.
- **Buffers: shared hit=17465, zero disk reads** — fully served from
  cache. This is the number that mattered most given the e2-micro's
  1GB RAM constraint.

**Chosen: a view**, not a second table. At this cost, there's no
performance justification for accepting a second table's drift risk
(the same failure shape — two copies of one fact allowed to
disagree — that caused the production outage). Not yet re-verified at
1M-corpus scale, but an index-scan-based plan is expected to scale
much better than a sequential-scan-based one would have, so this
isn't expected to flip the decision, only shift the absolute number.

---

## Migration `006_add_word_dominant_pos_view.sql`

```sql
CREATE VIEW word_dominant_pos AS
SELECT DISTINCT ON (word_id)
  word_id,
  pos,
  count,
  count::real / SUM(count) OVER (PARTITION BY word_id) AS share
FROM word_pos
ORDER BY word_id, count DESC;
```

Verified after migrating:
- `\d word_dominant_pos` shows the expected columns.
- `warten` → `pos = VERB`, `share` ≈ 1.0 (matches known-unambiguous
  expectation).
- `seiner` → `share` meaningfully below 1.0 (confirms the view
  correctly surfaces genuine ambiguity rather than always returning
  1.0 regardless of input — the specific failure mode that would
  indicate the `DISTINCT ON`/window-function logic was broken).
- Row count sanity-checked against `count(DISTINCT word_id) FROM
  word_pos` — confirmed one row per word, not one row per (word, pos)
  pair.

---

## Status at end of session

Complete and verified:
- [x] Scope decisions made: grouping (not filtering-only), type-level
      (not token-level), spaCy (not lexicon), sequenced after 1M
      upgrade
- [x] `tools/pos-tagging/` — isolated Python venv, `tag_words.py`,
      `requirements.txt` (pinned), `README.md`
- [x] Tagger output verified against known words, ambiguous words, and
      distribution shape (10K-sentence sample)
- [x] Migration `005_add_word_pos.sql` — additive `word_pos` table
- [x] Loader `database/scripts/load-pos.ts` — word-to-id resolution,
      streaming, batched, skip-count logging
- [x] Compose service `load-pos`, profiled `manual`, added to **both**
      compose files
- [x] Full pipeline dry-run against the current 100K corpus: migrate →
      loader → load-pos, 3.6% skip rate, spot-checked correct
- [x] `EXPLAIN (ANALYZE, BUFFERS)` run against real data; view chosen
      over materialized table with measured justification
- [x] Migration `006_add_word_dominant_pos_view.sql` — verified

**Not yet done, flagged for later:**
- **Dominance threshold not yet chosen.** The decile-distribution query
  (`width_bucket(share, 0, 1, 10)` grouped count) was planned but not
  yet run/reviewed as of end of session. No numeric threshold (0.8 or
  otherwise) has been committed to a query or config value anywhere.
- **1M-corpus re-tag not yet done.** All `word_pos` data currently
  loaded is from the 100K package, treated explicitly as a disposable
  pipeline validation run. Before this feature is considered
  production-ready: upgrade to the 1M Leipzig package, re-run
  `tag_words.py` against it, `TRUNCATE word_pos`, reload via
  `load-pos` (remember: `ON CONFLICT DO NOTHING` will not overwrite
  stale 100K-derived rows on its own).
- **Repository/service grouping logic not yet built.** `CollocationRow`/
  `CollocationEntry` need a `pos` field; both directional queries need
  a `LEFT JOIN` onto `word_dominant_pos`, keyed on the **partner**
  word (`right_word_id` for followed-by, `left_word_id` for
  preceded-by) — not the queried word, since the partner's tag is what
  varies per result row and what a section groups on. `WHERE share >=
  <threshold>` gates whether a tag is trusted or falls through to
  "Other."
- **`LIMIT`/pagination interaction not yet worked out.** Grouping
  fragments a flat top-N list across several sections; the existing
  `LIMIT 60` / `.slice(0, 20)` pattern (from the example-sentences
  feature) will likely need retuning once sections exist, to avoid
  visibly thin sections.
- **Frontend sections not yet built.** `CollocationList` needs
  POS-labelled subsections (Nouns/Verbs/Adjectives/Prepositions/
  Other). Deliberately deferred: query-word-POS-conditional labelling
  (e.g. "Adjectives describing this noun" vs. a plain "Adjectives"
  heading) is out of scope for v1 — the bucket set does not yet depend
  on the queried word's own POS.
- **Not yet logged as numbered entries in the main `decisions.md`** —
  see `decisions-33-35.md` for the pending entries (Python isolation
  approach, type-level-vs-token-level, view-vs-table with EXPLAIN
  justification).
- **`typer`/`click` transitive dependency gap not root-caused.** Pinning
  `click` directly worked, but *why* `typer==0.27.1` didn't already
  pull it in was not investigated further. Worth revisiting if the
  same class of surprise recurs with a different spaCy dependency.
