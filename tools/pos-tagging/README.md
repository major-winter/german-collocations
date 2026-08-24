# POS tagging tool

**This folder is Python.** Everything else in this repo is Node/TypeScript,
managed via npm workspaces. This is deliberately outside that system:

- Not listed in the root `package.json` workspaces array.
- Never referenced by any Dockerfile.
- Never runs in Docker, on the VM, or as part of any deploy sequence.

It's a one-shot offline tool: run it on your own machine against a
local copy of `sentences.txt`, get a TSV out, ship that TSV to the VM
the same way the raw Leipzig corpus files are shipped (`gcloud compute
scp`). The VM never needs Python or spaCy installed.

## Setup (once)

```bash
cd tools/pos-tagging
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m spacy download de_core_news_sm
```

`.venv/` is gitignored, same as `node_modules/` elsewhere in the repo —
only `requirements.txt` (the pinned dependency list) is committed.

## Running

```bash
cd tools/pos-tagging
source .venv/bin/activate
python tag_words.py --input ../../data/sentences.txt --output word_pos.tsv
```

Output: `word_pos.tsv`, tab-separated `word\tpos\tcount`, one row per
distinct (surface form, POS tag) pair observed in the corpus. Case is
preserved exactly as it appears in the source text, to match how
Leipzig's own `words.txt` stores forms.

For a 1M-sentence corpus, expect this to take a while — try it against
a small slice first (e.g. `head -n 10000 sentences.txt > sample.txt`)
to sanity-check output and get a rough time estimate before committing
to a full run.

## POS tag set

Tags are spaCy's Universal POS (UPOS) — coarse categories like `NOUN`,
`VERB`, `ADJ`, `ADP`, `DET` — not the finer German-specific STTS tag
set. Punctuation, symbols, whitespace, and other non-word tokens
(`PUNCT`, `SYM`, `SPACE`, `X`) are dropped, since they can never match
a row in the `words` table.

## Sentence simplicity scoring

A second, separate script: `score_sentence_simplicity.py`. Same
one-shot-offline-tool contract as `tag_words.py` above, but this one
scores each *sentence* for how simple it reads, so
`database/scripts/extract-examples.ts` can prefer simple sentences
when picking collocation example sentences instead of taking whatever
it meets first in file order.

```bash
cd tools/pos-tagging
source .venv/bin/activate
python score_sentence_simplicity.py --input ../../data/sentences.txt --output sentence_simplicity.tsv
```

Output: `sentence_simplicity.tsv`, tab-separated
`sentence_id\tword_count\tclause_count`, one row per sentence. Raw
counts, not a baked-in "is this simple" boolean — the threshold lives
in `extract-examples.ts` (`MAX_EXAMPLE_WORDS`/`MAX_EXAMPLE_CLAUSES`),
so it can be retuned without repaying the cost of a full corpus parse.

`clause_count` counts VERB/AUX tokens that have their own subject
child (dependency label `sb`) — this is the part worth explaining,
since two more obvious approaches were tried first and rejected:

- Counting finite verbs via spaCy's morphology (`VerbForm=Fin`) is
  unreliable in `de_core_news_sm` — it silently missed finite verbs in
  real test sentences.
- Counting the `oc` dependency label directly is overloaded: it fires
  both for genuine subordinate/complement clauses *and* for ordinary
  periphrastic aux+participle constructions (passive `wurden
  evakuiert`, perfect `habe angerufen`), producing false positives.

Requiring an `sb` child of its own sidesteps both problems —
periphrastic constructions share the aux's subject (the participle has
no `sb` child), and compound predicates ("ging ... und aß", shared
subject) collapse to one clause — while relative clauses, reported
speech ("... ", sagte X), and genuine subordinate clauses still count,
since each introduces its own subject. Verified by hand against 10
real corpus-style sentences before committing to it.

This script needs the dependency parser, unlike `tag_words.py` (tagger
only), so it's slower — expect roughly 1,000 sentences/sec, i.e. ~15-20
minutes for a 1M-sentence corpus.

## Lemma extraction

A third script: `extract_lemmas.py`. Same one-shot-offline-tool
contract again, but this one re-derives collocation data at *lemma*
granularity instead of exact surface form, so inflected variants of the
same word (`Einsatz`/`Einsätze`/`Einsatzes`/`Einsätzen`) share one
collocation profile instead of four siloed ones, and near-duplicate
partners (`kommen`/`kommt`/`kam`/`gekommen`/`kamen`) merge into a single
entry instead of splitting a 10-slot list section five ways.

```bash
cd tools/pos-tagging
source .venv/bin/activate
python extract_lemmas.py --input ../../data/sentences.txt \
  --word-lemma-output word_lemma.tsv \
  --lemma-collocations-output lemma_collocations.tsv
```

Only the tagger and lemmatizer are needed (`disable=['parser', 'ner']`)
— verified by hand that lemma accuracy is identical with the parser
disabled, so this reuses `tag_words.py`'s fast speed class (~1,000
sentences/sec) rather than `score_sentence_simplicity.py`'s slower one.
Lemmatization needs sentence context to be reliable, though: an isolated
word like "Einsatzes" mistags as an adjective with lemma "einsatz" out
of context, but resolves correctly to noun/"Einsatz" inside a real
sentence — this script always runs over full sentences, never isolated
words, for that reason.

Two outputs:

- `word_lemma.tsv`: `word\tlemma\tcount`, same shape as `tag_words.py`'s
  `word_pos.tsv` — raw counts per (surface form, lemma) pair.
- `lemma_collocations.tsv`: `left_lemma\tright_lemma\tcount` — adjacency
  counts between lemmas, tallied directly from the corpus rather than
  merged from Leipzig's surface-form-keyed `co_n.txt` after the fact.

**Applies the same word/collocation filter as
`database/src/filters.ts`'s `isStopword`/`isNonAlphabetic`** (a literal
copy, not a shared file — this tool is intentionally standalone from
the rest of the repo, same as `tag_words.py`). This isn't optional:
skipping it lets a stopword's cooccurrence get tallied from the full
unfiltered corpus scan while its frequency (sourced from the
already-filtered `words` table downstream) stays near zero, which
produces a nonsensical result — "der"/"und" scoring higher by logDice
than genuine collocations. Found this the hard way; see decision #44.
A filtered token stays in the per-sentence position sequence (so it
still correctly breaks adjacency between its neighbors) but is excluded
from both output counters — this matches how Leipzig's own `co_n.txt`
already behaves (a stopword-adjacent pair is dropped, not bridged over
to connect the next real word).
