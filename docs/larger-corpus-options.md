# Larger German corpus options

The current data source is the Leipzig Corpora Collection 1M-sentence
package. This note lists candidate sources for a bigger corpus, written
from memory (not re-verified online) — check sizes and licences on each
source's site before committing to one.

## Candidates

Ordered roughly by how little they'd disrupt the existing pipeline.

| Source | Size | Fit for this project |
|---|---|---|
| **Leipzig — larger or multiple packages** (`wortschatz.uni-leipzig.de/en/download/German`) | Some German corpora may go beyond 1M; separate 1M packages exist per year and genre (news, web, Wikipedia) | Same format, zero new parsing, CC BY. Unverified which German sets offer 3M/10M downloads. |
| **WMT News Crawl (de)** (`data.statmt.org/news-crawl/de/`) | Hundreds of millions of sentences, 2007 onwards | One deduplicated, shuffled sentence per line — the same shape as Leipzig's sentences file. Licence is research-oriented; check it before publishing example sentences on a public site. |
| **German Wikipedia dump** (`dumps.wikimedia.org/dewiki/`) | ~60M+ sentences | CC BY-SA, safe to publish. Needs markup stripping (e.g. WikiExtractor). Encyclopedic register skews the collocations. |
| **OpenSubtitles (de) via OPUS** | Tens of millions of sentences | Colloquial, spoken register that news and Wikipedia lack. Noisy. |
| **SdeWaC / deWaC** | ~0.9B / ~1.7B tokens | Web corpus, already POS-tagged and lemmatized. Access on request for research; dates from around 2008. |
| **Google Books Ngrams (German 2-grams)** | Huge | Gives adjacent-pair counts directly, but no sentences for examples, and OCR noise. |

Not usable for bulk download: **DeReKo** (IDS Mannheim) and the **DWDS**
corpora are the largest German corpora but are query-only.
**deTenTen** (Sketch Engine) is paid.

## Recommendation

Start with **WMT News Crawl**, taking a 10–20M-sentence slice rather than
all of it. It stays in the news genre the project already uses, so
results remain comparable to the current Leipzig data.

## Caveats for this codebase

- **Leipzig IDs aren't stable across packages** (CLAUDE.md failure
  class #4, decision #37). Combining several 1M packages means merging by
  word form and re-aggregating counts, not concatenating by ID.
- **Non-Leipzig sources have no precomputed co-occurrence files.**
  Bigram counts have to be computed from the raw sentences. The scan in
  `tools/pos-tagging/extract_lemmas.py` is a precedent, and the stopword
  and non-alphabetic filters from `database/src/filters.ts` must be
  applied in the same pass (CLAUDE.md failure class #7), or filtered
  words get artificially high scores.
- **Database size.** At 10x the sentences, the pairs table grows a lot on
  a small VM unless a minimum pair frequency (e.g. ≥ 3–5) is applied at
  load time. The cut-off also removes most of the noise.
- **Licensing matters** because per-word pages are meant to be public and
  SEO-indexed. Example sentences shown on the site inherit the source
  corpus's licence terms.
