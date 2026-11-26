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
2. **Nicht typisch.** A card above the verb section: label
   "Nicht typisch", the typed phrase struck through, "In unseren Texten
   (Nachrichten, Wikipedia, Web) ist *machen* kein typisches Verb zu
   *Entscheidung*. Typisch sind:", up to three suggestions written as
   the corpus writes them (#69): *Entscheidungen treffen*, *eine
   Entscheidung fällen*, *die Entscheidung begründen*; and a muted last
   line: "Alltägliche Verbindungen wie *Kaffee bestellen* fehlen in
   unseren Texten manchmal." The label changed from the mockup's
   "Ungewöhnlich" after the learner review: the data says "not typical
   in our texts", not "wrong".
3. **Üblich ✓.** The phrase not struck, **written as matched** (typed
   *Mühe geben* → "*sich Mühe geben*"), "Eine gängige Verbindung.", and,
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

- **"Üblich" for a typical learner error.** The worst outcome: it
  confirms the mistake. A learner review of the first draft found
  *eine Entscheidung machen*, *nimmt ein Foto* and *nimmt eine
  Entscheidung* all coming out "Üblich", through a loose reflexive rule
  and a verb-form lookup that peeked at the noun. The rules below close
  both.
- **"Nicht typisch" for a pair Germans do say.** Unavoidable for free
  everyday combinations the news-heavy corpus lacks (*Kaffee bestellen*),
  so the copy says "in unseren Texten" and never "falsch". It must not
  happen through our own filters (*Bus fahren*, see the subject-error
  filter).
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
  matched: string | null;  // the matched pair as written, e.g. "sich Mühe geben"; null unless usual
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
2. **Separable particle.** If the last token is a separable particle
   (*ab, an, auf, aus, bei, ein, fest, mit, nach, vor, weg, zu,
   zurück*) and another token precedes it, remove it and remember it
   (*legt eine Pause ein*). This runs before step 3, so *ein* at the
   end is never taken for an article.
3. Drop determiners, possessives and negation (*der, die, das, den, dem,
   des, ein-, kein-, mein-, dein-, sein-, ihr-, unser-, euer-*). Drop
   *sich* too, but remember that it was typed.
4. Exactly two tokens must remain, a noun and a verb, in either order
   (*eine Entscheidung machen*, *macht eine Entscheidung*). Anything
   else → not parsed. Which is which: a capitalised token is the noun.
   If neither or both are capitalised (*eine entscheidung machen*, common
   on phones), the noun is the token that resolves to a noun page
   case-insensitively; if both or neither do → not parsed.
5. Noun → lemma with the same `lookupCandidates` order as the noun page.
   If the word has no page in the app (the collocations lookup would
   404) → not parsed, so the search falls back to today's behaviour. A
   noun with a page but no object pairs (*Dusche*) parses and gets
   `noData`.

**Verb lemma, resolved without looking at the noun.** The draft
preferred "the lemma that pairs with this noun"; the review showed that
turns errors into matches (*nimmt* + *Foto* → *aufnehmen*, "Üblich").
Now:

1. A lab verb lemma typed directly (after `sich` is stripped from
   reflexive lemmas for comparison) is used as is.
2. Otherwise map the surface via `lab_verb_pair_examples.verb_surface`
   (9,433 surfaces → 3,540 lemmas; 1,461 are ambiguous, e.g. *nimmt*).
   Compare lemmas without their `sich`.
3. **A particle verb only stands for a typed particle.** Keep only
   candidates whose separable prefix was typed, attached (*aufnimmt*)
   or as the remembered trailing particle (*legt … ein* → *einlegen*).
   With no particle typed, *nimmt* can be *nehmen* but never *aufnehmen*
   or *abnehmen*.
4. Of the remaining candidates, take the one with the most example rows
   across all nouns. None → `verb: null`.

**Reflexives.** The draft counted `X` and `sich X` as one verb; that
made *eine Entscheidung machen* "Üblich" through *sich machen* (score 7,
10 uses, from "sich die Entscheidung nicht leicht machen"; rank 44 of
Entscheidung's object verbs). Now:

- *sich* typed: match only the `sich X` pair.
- *sich* not typed: match the plain `X` pair. If there is none, match
  `sich X` only when it is among the noun's **top 10** object pairs
  (after the filter below). *Mühe geben* → *sich geben*, rank 1, usual;
  *Sorgen machen* → *sich machen*, rank 1, usual; *Entscheidung machen*
  → rank 44, not typical.
- On any match, `matched` carries the pair as written (`phraseOf`), so
  the card always shows the real form, *sich Mühe geben*.

**Subject-error filter.** An object pair is ignored (for verdict and
suggestions) when **both**:

- the same verb + noun has a subject pair with a higher score, and
- the verb is mostly intransitive in the data: its object pairs make up
  **less than 40%** of its object + subject pair frequency.

The draft used the first condition alone and dropped real objects:
*Bus fahren* (object 117 vs subject "Busse fahren" 987), *Tochter
heiraten*, *Besucher erwarten*. A per-pair score margin can't separate
these (*Bus fahren* is 8× apart, *Entscheidung fallen* only 3×); the
verb's overall object share can. Measured 2026-11-26: *stattfinden*
0.01, *kommen* 0.07, *fallen* 0.15, *steigen* 0.22, *beginnen* 0.26,
*ausbrechen* 0.36 are filtered; *fahren* 0.41, *zeigen* 0.49,
*heiraten* 0.66, *erwarten* 0.67, *sichern* 0.92 are not. 0.4 is a
starting value; *fahren* sits close to it, so the spot-check decides
the final constant, which lives next to the rule with a comment citing
this spec.

**Verdict.** Over the noun's object pairs after the filter:

| Condition | Verdict | Suggestions |
|---|---|---|
| noun has no object pairs | `noData` | none |
| the verb matches one of them (reflexive rules above) | `usual` | up to 2 pairs ranked above it |
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

1. Unit tests for parsing (determiners, either order, *sich* typed,
   trailing particle, all-lowercase input, 1 or 6 tokens, two
   capitalised tokens) and for the verdict rules: reflexive top-10 rule
   (*Entscheidung machen* not typical, *Mühe geben* usual with
   `matched` "sich Mühe geben"), particle-verb exclusion (*nimmt* never
   *aufnehmen*), and the subject-error filter's two conditions. Handler
   test: blank `q` → one 400. `*.dbtest.ts` for the store queries.
   `npm test`, `npm run test:db -w backend`, `npm run typecheck`,
   frontend build.
2. **Linguistic spot-check** (CLAUDE.md) on at least 25 phrases,
   recorded in the decision entry with verdict and suggestions: the
   table under Why, plus *Mühe geben*, *eine Rolle spielen*, *Kritik
   üben*, *Entscheidung fallen*, *macht eine Entscheidung*, *nimmt eine
   Entscheidung*, *nimmt ein Foto*, *nimmt Rücksicht*, *legt eine Pause
   ein*, *eine entscheidung machen* (lowercase), *Bus fahren*, *Tochter
   heiraten*, *Kaffee bestellen*, *Hilfe leisten*, *Druck machen*,
   *Angst haben*, *Zeit verbringen*, *Zeit ausgeben*, *einen Fehler
   machen*, *Platz nehmen*, *Frage fragen*. No typical learner error may
   come out "Üblich"; no "Nicht typisch" may come from our own filter.
   Anything doubtful changes the rule, not the test. *Kaffee bestellen*
   is expected to stay "Nicht typisch" (missing data, covered by the
   copy).
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
- **Unknown verb → "Nicht typisch"**, not "Keine Daten", because the
  noun is known and its usual verbs are still the right advice.
- **A pair that is not the noun's top verb is still "Üblich"**, with
  "Noch häufiger" carrying the nuance (*Sport machen*).
- **Reflexive cut-off at the top 10** object pairs, and the
  subject-filter verb share at **0.4**: both chosen from the
  2026-11-26 numbers above, both tuned by the spot-check.

## Known limitations (from the learner review, deferred)

- "Noch häufiger" can name a verb with another meaning (*Platz nehmen*
  → *belegen*, a ranking; *Bescheid geben* → *Bescheid wissen*).
  Possible later fix: label it "Andere häufige Verben", or show an
  example sentence under each suggestion.
- A mistyped verb (*trefen*) gets "Nicht typisch" rather than "Verb
  nicht erkannt".
- An adjective or pronoun in the phrase (*eine wichtige Entscheidung
  treffen*, *ich mache…*) is not parsed; the search falls back to today.
- A few lab verb lemmas are broken forms (*machten*, *innehatten*) and
  can appear as suggestions.

## Left to the builder

- Whether the surface lookup needs an index. Unindexed it takes ~55 ms
  over 314k example rows; an index on `verb_surface` in a new migration
  is the expected fix if `EXPLAIN` confirms it.
- One query or several for the verdict; measure.
- Exact determiner list and the store method names.
