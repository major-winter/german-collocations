# Verb–noun pairs as learners say them: written noun phrase plus gender

Status: design, not built. Spans two repos: `collocation-lab` (export)
and this app (migration, loader, backend, frontend). To be logged as
decision #69 when built.

## Why

A chip pair like *Entscheidung + treffen* tells a learner which words go
together, not how to say them. The mistakes this app can't help with today
are the article and the case: *eine Entscheidung treffen*, *keine Ahnung
haben*, *seine Meinung ändern*, and knowing that it's *die*
Entscheidung. Decision #60 shows lemmas only because "the app has no gender
or conjugation data". The lab has that data and doesn't export it.

## What the learner sees (chosen: option C)

1. **The phrase is the pair as the corpus most often writes it.** Object
   and subject pairs get the same treatment prepositional pairs already
   get (`phrase_noun`, "in der Kritik stehen"):

   | Today | After |
   |---|---|
   | Entscheidung treffen | Entscheidungen treffen |
   | Ahnung haben | keine Ahnung haben |
   | Meinung ändern | seine Meinung ändern |
   | Rolle spielen | eine Rolle spielen |
   | Kritik … sich richten | die Kritik … sich richten *(if that is the majority form)* |

2. **The noun's gender is shown wherever the noun stands alone**, as a
   muted article in front of it:

   ```
   Noun page header:      die Entscheidung
   Verb page noun chips:  [die Frage] [der Antrag] [sich die Frage] [in Geduld]
   Open phrase:           Fragen stellen
   ```

   Concretely, on a verb page (*stellen*), the chips read
   `die Frage`, `der Antrag`, `sich die Frage`, `die Information (sich)`.
   Prepositional chips (`in Geduld`) already are phrases and stay as they
   are. A noun with no known gender shows as today, with no article.

   The article is muted (`text-muted-foreground`), the noun keeps its
   word-class colour (#63: colour only where it teaches).

Data from `news-wiki-web-3M` on 2026-11-26 that led to C over the
alternatives:

| Pair | Most common written form | Next |
|---|---|---|
| Entscheidung treffen | Entscheidungen 35% | die 22%, eine 18% |
| Frage stellen | Fragen 48% | die Frage 19% |
| Tor erzielen | Tore 70% | ein Tor 11% |
| Ahnung haben | keine Ahnung 76% | Ahnung 13% |
| Meinung ändern | seine Meinung 55% | ihre Meinung 25% |
| Rolle spielen | eine Rolle 77% | keine Rolle 12% |

Gender from nominative singular definite articles is near-unambiguous:
*die Entscheidung* 1156 : 0, *der Antrag* 684 : 0, *die Frage* 1598 : 3,
*das Problem* 461 : 0.

## Approaches considered

- **A. Most common written form only.** Authentic, but for plural-heavy
  pairs (*Entscheidungen*, *Tore*, *Fragen*) shows no gender — the very
  thing the learner is missing.
- **B. Prefer the singular with an article** (*eine Entscheidung
  treffen*). Teaches gender, but often isn't what Germans usually say,
  and needs a hand-tuned preference rule.
- **C. A, plus a per-noun gender label** — **chosen by the user.** The
  phrase stays honest, the gender is always there when it's known, and
  the extra data is one short row per noun.

## Goals

- Object and subject phrases use the most common written noun phrase.
- Every noun on a noun page header or verb-page chip shows *der/die/das*
  when the corpus makes it clear.
- No change to ranking, which pairs are shown, or the example sentences.

## Non-goals

- Verb conjugation, case labels ("+Akk"), plural forms as separate info.
- Gender for nouns outside the lab block (logDice collocations,
  adjective–noun section). The table makes that possible later.
- Rewriting possessives to a canonical form (*seine*/*ihre*): the
  majority form is kept as written.

## Anti-goals (a failure even if it "works")

- **A wrong-case phrase.** Passive subjects and modal-passive subjects
  count as objects in the lab (#64, `extract.py`), so an unfiltered
  majority could be nominative: *der Antrag stellen* (18% of that pair).
  Object phrases must never be built from nominative occurrences.
- **A wrong article.** Showing no article is fine; showing the wrong one
  teaches a mistake. Nouns with two genders (*der/das Teil*, *der/die
  See*) or too little evidence get no label.
- Any measurable cost on the 1 GB VM: this adds one small table and one
  indexed lookup per page.

## Design

### 1. `collocation-lab`: `colloc export`

**Phrase.** Generalise `PHRASE_NOUNS_SQL` from `relation = 'obl'` to all
three relations, keyed by `(relation, verb, prep, noun)`:

- `obl`: unchanged.
- `obj`: only occurrences with `noun_case <> 'Nom'`. (HDT leaves `Case`
  empty on bare nouns; empty counts as not nominative, which is what we
  want for *Kritik üben*.)
- `nsubj`: all occurrences (they are nominative by definition).
- `noun_upos = 'NOUN'` for all, ties broken by surface as today.
- Falls back to the (respelled) noun lemma when no occurrence qualifies,
  as `obl` does now.

`phrase_noun`'s meaning becomes "how the noun phrase is most often
written", for every relation. Update the module docstring.

**Gender.** A third file, `lab_noun_genders.tsv`: `noun \t article`, no
header, sorted, one row per noun that appears in the exported pairs
(after respelling). Rule:

- Count occurrences across all relations with `noun_case = 'Nom'`,
  `noun_number = 'Sing'`, `det = 'def'`, `prep = ''`, `noun_upos = 'NOUN'`,
  grouped by the first word of `np_surface`, keeping only `der`, `die`,
  `das`.
- Emit the top article if it has **≥ 5 uses and ≥ 90% share**; otherwise
  emit nothing for that noun.
- Thresholds are constants next to `FREE_PHRASE_*`, with a comment
  citing this spec.

**Manifest.** `lab_verb_pairs.manifest` gains a third line
`genders\t<n>`. Written last, after the `.tmp` renames, as today.

Tests in `tests/test_export.py`: obj phrase skips nominative rows;
nsubj phrase uses the majority form; gender emitted at ≥ 90% / ≥ 5,
omitted below either, omitted for a 50/50 noun; respelled nouns are
keyed by their respelling; manifest has three lines.

### 2. This app: database

New migration `016_add_lab_noun_genders.sql` (additive, no change to
`lab_verb_pairs`):

```sql
CREATE TABLE lab_noun_genders (
  noun text PRIMARY KEY,
  article text NOT NULL CHECK (article IN ('der', 'die', 'das'))
);
```

`load-lab-verb-pairs.ts` loads the third file in the **same transaction**
(DELETE + INSERT), and `assertMatchesManifest` checks all three counts.
A manifest without a `genders` line is rejected with a message saying to
re-export with a lab version that writes it — the two repos ship
together, there is no compatibility mode. Empty genders file is allowed
(a dataset could in theory yield none); malformed lines count toward the
existing 1% rule.

### 3. This app: backend

- `PgCollocationStore`: left-join `lab_noun_genders` on the noun side of
  each pair, and look up the headword's article on noun pages (same
  `lookupCandidates` order as the pair lookup).
- `LabVerbPair` gains `nounArticle: string | null`; the data returned
  for a noun page gains `article: string | null` for the headword.
- `verbNounPhrases.ts`:
  - `phraseOf` for `nsubj` uses `phraseNoun` instead of `noun`.
  - `chipOf` on the verb side puts the article before the noun for
    `obj`/`nsubj` chips (`die Frage`, `sich die Frage`,
    `die Information (sich)`); `obl` chips unchanged.
  - Update the header comment, which says "Lemmas only".
- API types in `@collocations/types` gain the two fields. The article is
  sent as its own field, not baked into strings, so the frontend can
  mute it.

Tests: unit tests in `verbNounPhrases.test.ts` for the new chip and
phrase shapes; a `*.dbtest.ts` case for the join (article present,
absent).

### 4. This app: frontend

- `VerbNounPairs.tsx`: render the chip's article muted, noun in its
  colour.
- `Word.tsx` header on a noun page: muted article before the word when
  known.
- **Highlighting the phrase:** `highlightCollocates` matches whole tokens,
  so *Entscheidungen treffen* would no longer highlight a searched
  *Entscheidung*. Highlight the noun by the last word of the phrase's
  noun part (the written form), not the lemma — the backend should send
  that word with the pair so the frontend doesn't parse phrases.

## Verification

1. Lab and app test suites, `npm run test:db -w backend`, typecheck,
   frontend lint/build.
2. **Linguistic spot-check** (CLAUDE.md): before/after for at least 20
   headwords, including *Entscheidung, Frage, Antrag, Ahnung, Meinung,
   Rolle, Kritik, Tor, Problem, Mühe* (reflexive), *Teil* and *See*
   (two genders → no label), *Leute* (plural only → no label), *stellen,
   treffen, haben*. Check: no nominative object phrases, every shown
   article correct.
3. Coverage numbers in the decision entry: share of exported nouns that
   got an article, and how many phrases changed per relation.
4. `EXPLAIN (ANALYZE, BUFFERS)` on the pair query with the join, against
   the 3M data.

## Rollout

Lab: export on the laptop. App: migration + loader locally, then prod
(Linode, `ssh root@139.162.13.171`): copy the three TSVs and the manifest,
`docker compose -f compose.prod.yml --profile manual build` the loader
and backend, run migrate and the loader, `up -d`, and confirm container
start times. Log as decision #69; amend #60's "lemmas on chips" note by
reference, not by editing it.

## Left to the builder

- Exact SQL shape for the per-relation phrase and the gender query (one
  pass over `occurrences` vs. two); measure, the gender query took ~5 s
  for 8 nouns unindexed on noun.
- Whether the noun's written form for highlighting is a new field or
  derived in the backend from `phrase_noun`.
- Muted-article styling details within #63's palette.
