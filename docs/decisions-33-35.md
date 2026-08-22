### 33. POS tagging granularity: type-level, not token-level

Considered token-level POS tagging (a tag per individual corpus
occurrence, correctly resolving context-dependent ambiguity like
"sein" as AUX in "er will sein" vs. DET in "sein Auto") against
type-level tagging (one tag per distinct word form, derived from an
aggregated distribution across all its occurrences).

**Chosen: type-level.** Leipzig's `co_n.txt` ships pre-aggregated
co-occurrence counts with the underlying token occurrences already
discarded before the file was written — the specific sentence contexts
that produced each pair no longer exist in the data available to this
project. Building token-level POS would require re-deriving Leipzig's
entire near-neighbor computation from `sentences.txt` from scratch,
including reimplementing significance scoring — a substantially larger
project that would also mean this project's collocation statistics are
no longer Leipzig's validated output (undermining decision #2's
original rationale for using Leipzig at all), but a self-computed
approximation of it.

Accepted cost: genuinely ambiguous word forms ("sein", and confirmed
empirically also "seiner", "schwieriger") receive a `share` value
meaningfully below 1.0 rather than a single confident tag. A dominance
threshold (see #35) determines whether a word's tag is trusted for
POS-based features or excluded. This is a coverage loss on a small set
of high-frequency function words, not a correctness bug — ambiguity is
made visible in the data rather than silently resolved incorrectly.

### 34. Python isolation for the POS tagging tool

Considered running spaCy as a containerized sidecar service vs. a
precomputed lexicon dump (Wiktionary/Morphy) vs. an isolated,
non-containerized Python script.

**Chosen: isolated Python script**, in `tools/pos-tagging/`, using a
standard venv (mirroring what `node_modules` provides for JS —
dependencies scoped to one project, not global). Deliberately outside
the npm workspaces system: not listed in the root `package.json`
workspaces array, never referenced by any Dockerfile, never run in
Docker or on the VM. It runs once, on a laptop, and produces a TSV file
that is shipped to the VM the same way the raw Leipzig corpus files
are (`gcloud compute scp`).

A lexicon dump was rejected because it would reopen the Leipzig-style
licensing review that has already blocked prior work twice, and would
likely give worse coverage on German compounds. A containerized
sidecar was rejected as unnecessary complexity — this is a one-shot
offline preprocessing step, not a runtime dependency of the deployed
application, so it doesn't need to exist as a service at all.

Accepted cost: Python now exists in an otherwise all-Node/TypeScript
monorepo. Mitigated by strict isolation and a `README.md` in
`tools/pos-tagging/` stating plainly that this tool is never part of
the deploy path.

**Python version constraint discovered during setup**: spaCy 3.8.x
does not support Python 3.14. Must use Python 3.9–3.13 (3.12 used in
practice, via Homebrew) — `python3.12 -m venv .venv`, not bare
`python3`, which may resolve to an unsupported version depending on
the machine.

### 35. Dominant-tag lookup: view, not a second materialized table

Considered exposing "the dominant POS tag per word" (derived from the
raw per-word POS counts in `word_pos`) via a Postgres `VIEW` (computed
fresh on every query) vs. a second table populated by a script
(precomputed once, read cheaply, but a second copy of a derived fact
that could drift out of sync with `word_pos` if not carefully kept in
lockstep).

Per the project's established pattern of measuring before deciding
(see decision #4; fuzzy-search session's forced-seqscan `EXPLAIN`
checks), ran `EXPLAIN (ANALYZE, BUFFERS)` against the candidate view
query on real loaded data (100K-corpus `word_pos`, ~157K rows) before
choosing:

- Query plan used an `Index Scan` on `word_pos_pkey` (the existing
  `(word_id, pos)` composite primary key), not a sequential scan.
- `Incremental Sort` rather than a full sort, since rows already
  arrive ordered by `word_id` from the index.
- Execution time: 78.219 ms for the full table.
- `Buffers: shared hit=17465`, zero disk reads — fully served from
  cache.

**Chosen: a view** (`word_dominant_pos`, migration
`006_add_word_dominant_pos_view.sql`). At this measured cost, there is
no performance justification for accepting a second table's drift
risk — the same failure shape (two copies of one fact, allowed to
disagree) that caused the production outage (`name:` present in
`compose.yml` but not `compose.prod.yml`). A view also has the
structural property that it can never go stale, since it always
reflects the current contents of `word_pos` with no separate write
path to keep in sync.

Not yet re-measured at 1M-corpus scale (the 1M Leipzig upgrade is
still pending as of this entry) — an index-scan-based plan is expected
to scale considerably better than a sequential scan would, so this
isn't expected to overturn the decision, but the actual numbers at
that scale haven't been confirmed.

### 36. Dominant-tag threshold: 0.8

Ran the previously-planned decile-distribution query against
`word_dominant_pos` (100K-corpus dry-run data, 147,928 distinct words):

```sql
SELECT width_bucket(share, 0, 1, 10) AS decile, count(*) AS words
FROM word_dominant_pos
GROUP BY decile
ORDER BY decile;
```

Result showed a clear gap rather than a smooth curve: 94.2% of words
(139,355) have `share` exactly 1.0 (only one POS ever observed).
Genuinely ambiguous words cluster in the 0.5–0.7 range (4,390 words,
~3.0%) — consistent with the earlier `sein` spot-check (AUX 167 / DET
84, share ≈ 0.665). The 0.8–1.0 range is comparatively sparse (2,936
words, ~2.0%): words tend to resolve almost fully to one tag or not
resolve much at all, rather than landing near a chosen cutoff.

**Chosen: `share >= 0.8`** as the dominance threshold gating POS-based
grouping/filtering (below it, a word's partner-tag falls through to an
"Other" bucket rather than being trusted). Sits just above the
ambiguous 0.5–0.7 cluster, trusts 96.95% of words, and correctly
excludes known-ambiguous cases like `sein`. Not re-measured at
1M-corpus scale — expected to hold given the underlying mechanism
(dominance driven by grammatical role, not corpus size), but not yet
confirmed.

### 37. UPOS-to-section mapping: AUX grouped with VERB

Building the repository grouping query surfaced a mapping gap: spaCy's
UPOS tagset splits verbs into `VERB` (lexical) and `AUX` (auxiliary/
modal — `haben`, `sein`, `werden`, `können`, etc.). The initial section
`CASE` mapped only `VERB → 'verb'`, so high-frequency auxiliaries like
`hat`/`haben` fell through to `'other'` despite being unambiguously
verbs to anyone using the tool (caught via user spot-check, not the
automated verification pass — `hat` and `haben` are dominant-tag `AUX`
at share 0.88 / 0.77 respectively, both above the #36 threshold, so
they were never near "Other" for ambiguity reasons).

**Chosen**: `SECTION_CASE` maps `pos IN ('VERB', 'AUX')` to `'verb'`.
UPOS is a linguistic distinction (lexical vs. auxiliary), not a useful
one for this tool's grouping — a user searching collocations for "hat"
expects a "Verbs" section, not "Other". No other UPOS tag is folded in
this way (`DET`, `PRON`, `ADV`, `NUM`, `PROPN`, `SCONJ`, `CCONJ`,
`INTJ` remain in `'other'`).

**Known remaining edge case, left as-is**: `haben` still sections as
`'other'` post-fix — its dominant tag is `AUX` but at `share` ≈ 0.77
(AUX 2775 / VERB 826 in the 100K sample), below the #36 threshold of
0.8. This is the threshold working as designed on a word that
genuinely straddles it, not a mapping bug (unlike `hat`, share ≈ 0.88,
which now correctly sections as `'verb'`). Considered and rejected:
lowering the global threshold (would weaken the ambiguity filter
project-wide for one word) and unconditionally trusting AUX regardless
of share (AUX/VERB is a real competing-category split for some forms,
same shape as AUX/DET for `sein`, just with a less even split for
`haben`). Worth re-checking after the 1M-corpus re-tag, which may move
`haben`'s share either direction.
