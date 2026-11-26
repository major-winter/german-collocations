# "Passt das zusammen?": checking a verb–noun combination

Status: design, not built. This app only (no lab change, no new data
export). To be logged as decision #70 when built.

## Why

The app answers "what goes with *Entscheidung*?" but not the question a
learner actually has mid-sentence: "can I say *eine Entscheidung
machen*?" The classic interference errors (English *make a decision*,
*take a photo*, *pay attention*) are exactly the pairs the lab data
lacks. Today a learner has to scan the noun's verb chips and infer
from the absence of *machen* that it's wrong. This feature says it
directly and points to what Germans say instead.

Data from `news-wiki-web-3M` on 2026-11-26:

| Typed | In `lab_verb_pairs` (obj)? | Top object verbs for the noun |
|---|---|---|
| eine Entscheidung machen | no | treffen, fällen, begründen |
| ein Foto nehmen | no | machen, … |
| eine Frage machen | no | stellen, … |
| Aufmerksamkeit bezahlen | no | schenken, erregen, … |
| Sport machen | yes, rank 2 | treiben |
| Sinn machen | yes, rank 1 | — |
| eine Dusche nehmen | — (*Dusche* has no pairs) | — |

## What the learner sees

The mockup the user chose (`.superpowers/brainstorm/…/check-mockup.html`,
first version, **not** v2) has these states:

1. **Search box (A).** Typing a phrase such as *eine Entscheidung
   machen* and pressing Enter opens the **Entscheidung** page with the
   check filled in. A single word searches as today.
2. **Ungewöhnlich.** A card above the verb section: label
   "Ungewöhnlich", the typed phrase struck through, "In unseren Texten
   kommt *Entscheidung* fast nie mit *machen* vor. Üblich sind:", and up
   to three suggestions written as the corpus writes them (#69):
   *Entscheidungen treffen*, *eine Entscheidung fällen*, *die
   Entscheidung begründen*.
3. **Üblich ✓.** The phrase not struck, "Eine gängige Verbindung.", and,
   only if verbs rank higher, "Noch häufiger:" with up to two of them
   (*Sport machen* → *Sport treiben*).
4. **Keine Daten.** The noun has no object pairs: "Zu *Dusche* haben wir
   in unseren Texten keine Verben gefunden. Das heißt nicht, dass die
   Verbindung falsch ist – wir können sie nur nicht prüfen."
5. **"Verb prüfen" field (B, the fallback).** At the bottom of the card,
   and on its own (card without a verdict) on every noun page that has
   object pairs: a text input for **one verb** and a "Prüfen" button. It
   is pre-filled with the verb from the current check.

The verdict label has no red or green (#63: colour only where it
teaches); noun and verb keep their word-class colours.

## Approaches considered

- **A. The search box parses a phrase** — chosen, with B as fallback.
  It catches the learner where they already type, and a phrase is what
  they have in mind.
- **B. A "Verb prüfen" field on the noun page.** Unambiguous (the noun
  is known), always available, and covers phrases A can't parse.
- **C. A separate check page.** Rejected: it duplicates the noun page,
  which already holds the suggestions' context.

A mockup v2 explored a phrase field and several verdicts per phrase
(for future adjective and prepositional pairs). **The user preferred the
first version**: one verb, one verdict. See Non-goals.

## Goals

- A learner typing *[Artikel] Nomen Verb* in the search box gets a
  verdict on the noun page in one step.
- Every noun page with object pairs offers the "Verb prüfen" field.
- Suggestions are the noun's top object pairs, minus known parser errors.
- No new data, export or loader change.

## Non-goals

- Prepositional (*in Frage stellen*), subject, adjective–noun or
  adverb–verb checks. The API response carries `relation: "obj"` so a
  later relation can be added without breaking the shape, but the UI
  shows one verdict.
- Checking whole sentences, word order, case or article.
- Spelling correction of the noun or verb.
- A live dropdown in the search box (see "Calls made" below).

## Anti-goals (a failure even if it "works")

- **"Ungewöhnlich" for a pair Germans do say.** Worse than no answer.
  Hence "Keine Daten" when the noun has no object pairs, and the
  reflexive and surface-form handling below.
- **Suggesting a parser error.** E.g. *Entscheidung fallen* exists as an
  object pair (score 627) only because HDT mis-parses "die Entscheidung
  fällt" (subject pair 1987). Such pairs must not be suggested and must
  not make a typed pair "Üblich".
- **Hijacking normal search.** A single word, or anything the parser
  isn't sure of, must behave exactly as today.
- Measurable cost on the 1 GB VM: at most a few indexed queries per
  check.

## Design

### Backend

**Endpoint.** `GET /api/check?q=<phrase>`

- `q` blank → 400 (same shape and `return` as `collocationsHandler`).
- `q` not parseable as noun + verb → 200 `{ "parsed": false }`.
- Otherwise 200:

```ts
type CollocationCheck = {
  parsed: true;
  phrase: string;          // q, whitespace-normalised, as typed
  noun: string;            // noun lemma, the page to open
  verbTyped: string;       // the verb token as typed ("machen", "macht")
  verb: string | null;     // lab verb lemma, null if unknown
  relation: "obj";
  verdict: "usual" | "unusual" | "noData";
  suggestions: { phrase: string; verb: string }[]; // phraseOf(...), written form (#69)
};
```

Types go in `@collocations/types`. German labels live in the frontend.

**Ports.** A new inbound port `CheckCollocation` (`check(q)`) with a
`CheckCollocationService`, wired in `app.ts` by manual DI like the other
two. Its data comes through a new, narrow outbound port (not a widening
of `CollocationStore`, #68), e.g. `CollocationCheckStore`, with a
Postgres adapter and `*.dbtest.ts` tests (#67).

**Parsing (pure domain function, unit-tested).**

1. Split on whitespace; 2–5 tokens, else not parsed.
2. Drop determiners, possessives and negation (*der, die, das, den, dem,
   des, ein-, kein-, mein-, dein-, sein-, ihr-, unser-, euer-*) and
   *sich*.
3. What remains must be exactly one capitalised token (noun) and one
   lowercase token (verb), in either order (*eine Entscheidung machen*,
   *macht eine Entscheidung*). Anything else → not parsed.
4. Noun → lemma with the same `lookupCandidates` order as the noun page.
   If the word has no page in the app (the collocations lookup would
   404) → not parsed, so the search falls back to today's behaviour. A
   noun with a page but no object pairs (*Dusche*) parses and gets
   `noData`.

**Verb lemma.** A lab verb lemma typed directly is used as is. Otherwise
map the surface via `lab_verb_pair_examples.verb_surface` (9,433
surfaces → 3,540 lemmas; 1,461 surfaces are ambiguous, e.g. *nimmt*):
prefer the lemma that has an object pair with this noun, else the most
frequent. No match → `verb: null`.

**Reflexives.** `X` and `sich X` count as the same verb for the verdict:
*Mühe geben* is usual because *sich geben* is. The suggestion then shows
the lab phrase, *sich Mühe geben*.

**Subject-error filter.** An object pair is ignored (for verdict and
suggestions) when the same verb + noun has a subject pair with a higher
score. On 2026-11-26 this affects 1,198 pairs (*Entscheidung fallen*,
*Foto zeigen*, *Frage sich stellen*).

**Verdict.** Over the noun's object pairs after the filter:

| Condition | Verdict | Suggestions |
|---|---|---|
| noun has no object pairs | `noData` | none |
| verb (or `sich` + verb) is among them | `usual` | up to 2 pairs ranked above it |
| otherwise, including `verb: null` | `unusual` | top 3 pairs |

Membership in `lab_verb_pairs` is the whole rule: it already requires
frequency ≥ 5 and positive LL. No extra score threshold.

### Frontend

- `SearchBox`: on submit, a query with 2+ words calls `/api/check`. If
  `parsed`, navigate to `/wort/<noun>?pruefen=<phrase>`; otherwise
  navigate to `/wort/<query>` as today. One-word queries skip the call.
- `Word.tsx` on a noun page: with `?pruefen=`, fetch the check and show
  the card above the verb section, but only if the check's `noun`
  matches the page's lemma. Without it, show just the "Verb prüfen"
  field if the noun has object pairs.
- "Verb prüfen" submit sets `?pruefen=<headword> <verb>`, so a check is
  a shareable URL and the back button works.
- Copy as in the mockup. The struck phrase uses `<s>`; the verdict
  label is text, not colour.

## Verification

1. Unit tests for parsing (determiners, either order, *sich*, 1 or 6
   tokens, two capitalised tokens) and for the verdict table, including
   reflexive match and the subject-error filter. Handler test: blank `q`
   → one 400. `*.dbtest.ts` for the store queries. `npm test`,
   `npm run test:db -w backend`, `npm run typecheck`, frontend build.
2. **Linguistic spot-check** (CLAUDE.md) on at least 20 phrases,
   recorded in the decision entry: the table under Why, plus *Mühe
   geben*, *eine Rolle spielen*, *Kritik üben*, *Entscheidung fallen*,
   *macht eine Entscheidung*, *nimmt Rücksicht*, *Hilfe leisten*,
   *Druck machen*, *Angst haben*, *Zeit verbringen*, *Zeit ausgeben*,
   *einen Fehler machen*, *Platz nehmen*. Every "Ungewöhnlich" must be
   one a German speaker would agree with; anything doubtful changes the
   rule, not the test.
3. `EXPLAIN (ANALYZE, BUFFERS)` of the surface lookup against the 3M
   data.

## Rollout

Local first, then prod as with #69 but simpler: no data files. `git
pull`, build backend and frontend (plus `migrate` if an index is added),
run migrate, `up -d`, check container start times. Log as #70.

## Calls made (not discussed with the user, open to correction)

- **No live dropdown in the search box.** The mockup's screen 1 showed
  "Prüfen: Entscheidung + machen" while typing. `SearchBox` has no
  dropdown today; adding one means a debounced request per keystroke.
  v1 goes straight to the page on Enter; the card's phrase line shows
  how it was understood.
- **The check lives in the URL** (`?pruefen=`), for back-button and
  sharing.
- **Unknown verb → "Ungewöhnlich"**, not "Keine Daten", because the noun
  is known and its usual verbs are still the right advice.
- **A pair that is not the noun's top verb is still "Üblich"**, with
  "Noch häufiger" carrying the nuance (*Sport machen*).

## Left to the builder

- Whether the surface lookup needs an index. Unindexed it takes ~55 ms
  over 314k example rows; an index on `verb_surface` in a new migration
  is the expected fix if `EXPLAIN` confirms it.
- One query or several for the verdict; measure.
- Exact determiner list and the store method names.
