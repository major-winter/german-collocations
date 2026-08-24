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
