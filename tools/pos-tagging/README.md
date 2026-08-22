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
