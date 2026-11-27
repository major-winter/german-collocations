# "Passt das zusammen?" for adjective + noun (design)

Status: approved (2026-11-27), with the user's changes: the verdict rule
is logDice within the attributive relation instead of count + share
(rule B), the #54 data is used as loaded, and adjective checks are
counted under their own kind `check_adj`. See "Approved changes" below;
where they disagree with the rest of this text, they win.

This app only: no lab change, no new data export, no migration
expected. Extends decision #70 and reads the #54 data. To be logged as
decision #74 when built; it amends #70.

## Approved changes (2026-11-27)

1. **Verdict rule: logDice within `adjective_attributes`.** A pair is
   "Üblich" when `logDice = 14 + log2(2·c / (f_noun + f_adj)) ≥ 6`
   (`MIN_ADJECTIVE_CHECK_LOGDICE = 6`), where c is the pair's count in
   `adjective_attributes`, f_noun the noun's attributive total over all
   its adjectives (no floor), f_adj the adjective's attributive total
   over all nouns. The thin-noun gate stays: fewer than 5 adjectives
   with count ≥ 5 → "Keine Daten". "Typisch sind" / "Noch häufiger" are
   ranked by the same logDice.

   This logDice is computed only within the attributive relation. It is
   not the window logDice of `lemma_collocations` (#43, #44); the two
   are never merged or ranked together.

   Evidence (main session, the 64 labelled pairs of the probe below,
   same thin-noun gate):

   | Rule | Errors caught (of 23) | Correct passed (of 34) |
   |---|---|---|
   | B: count ≥ 5 and share ≥ 1% | 20 | 32 |
   | logDice ≥ 6 | 21 | 32 |

   logDice ≥ 6 misclassifies only *schwere Arbeit* (correct, "Nicht
   typisch") and *warme Temperatur* (error, "Üblich").

   The cost of f_adj for very common adjectives (*groß*, *neu*, *hoch*)
   is measured with `EXPLAIN (ANALYZE, BUFFERS)` before choosing how to
   compute it; totals are precomputed in a new table (with a migration
   and a loader step) only if the plain query is slow.
2. **Data:** the existing #54 data. Moving adjective extraction into
   `collocation-lab` is a later increment, triggered by a broken
   adjective lemma in the 20-headword spot-check or by too many
   "Keine Daten" verdicts.
3. **Usage counting:** a parsed adjective check counts under a new kind
   `check_adj` in `usage_counts`, not `check`, so the verb-check
   baseline (#71/#72) stays comparable. The Datenschutz page changes
   only if what is stored changes in substance.

## Why

The check (#70) is the one thing this app does that a dictionary or
DWDS does not: a learner types the phrase they are about to use and
gets a verdict plus what Germans write instead. Today it answers only
verb + noun. The other classic interference error is adjective + noun:
English *heavy rain*, *high chance*, *big costs*, *strong smoker*,
*fast speed* map to *schwerer Regen*, *hohe Chance*, *große Kosten*,
*schwerer Raucher*, *schnelle Geschwindigkeit*, none of which is what
German writes. The gap report (2026-09-08) ranks adjective + noun as
acquired early but still error-prone through B1/B2, and names
near-synonym choice (*großes* vs. *starkes Interesse*) as the B1/B2
need. A learner writing a text asks this several times a day; it is the
most direct way to make the app worth opening tomorrow without touching
the gated saved-list work (#71).

Typing *starker Regen* today falls back to a plain search for the two
words (since the #70 final review: "no verb, so a plain search"), so the
search box already receives these queries and does nothing useful with
them.

## What the learner sees

Search box: *schwerer Regen* → the *Regen* page opens with the check
card on top:

> **Nicht typisch**
> ~~schwerer Regen~~
> In unseren Texten (Nachrichten, Wikipedia, Web) ist *schwer* kein
> typisches Adjektiv zu *Regen*. Typisch sind:
> → starker Regen
> → leichter Regen
> → strömender Regen
> *Alltägliche Verbindungen fehlen in unseren Texten manchmal.*

*hohe Kosten* → **Üblich ✓**, *hohe Kosten*, "Eine gängige
Verbindung." *große Entscheidung* → **Üblich ✓**, "Noch häufiger:
politische Entscheidung, richtige Entscheidung" (as #70 does for verbs).
*starker Kaffee* → **Keine Daten**: "Zu *Kaffee* haben wir in unseren
Texten zu wenige Adjektive gefunden …" (the corpus is news-heavy; it
has four adjectives for *Kaffee* above the floor).

On a noun page the field below the card, today "Verb prüfen", becomes
"Wort prüfen" with the placeholder "Verb oder Adjektiv". Typing *stark*
on the *Regen* page checks *Regen stark*. The adjective is coloured
with the adjective word-class colour (#63, `lib/wordClass.ts`), the
verb keeps the verb colour.

The home page sentence about phrase checking gains a second example
link, *schwerer Regen*.

## Goals

- A typed adjective + noun (in either order, with or without an
  article, any ending) gets one of the three #70 verdicts.
- No typical learner error comes out "Üblich" (the #70 bar), checked on
  the probe set below.
- Suggestions and the matched phrase read as the corpus writes them
  (*starker Regen*, not *stark Regen*; *erste Hilfe*, not *erster
  Hilfe*), as #69 does for verbs.
- Verb + noun checks behave exactly as before.

## Non-goals

- Grading the adjective ending (*starke Regen*): the check is about the
  word choice, not the inflection. The matched phrase shows the right
  form, which teaches it in passing.
- More than one adjective, or adjective + noun + verb (*eine wichtige
  Entscheidung treffen*): still a plain search, as today.
- Predicative use (*der Regen ist stark*), adverbs (*stark regnen*).
- New extraction or a lab adjective export. The #54 data (1M corpus,
  spaCy) is used as loaded; a better source is a separate question.
- ~~Usage counting changes~~ (superseded by approved change 3: a parsed
  adjective check counts as `check_adj`).

## Anti-goals (a failure even if it "works")

- An error like *hohe Chance* or *große Kosten* reported "Üblich"
  because it occurs three times in the corpus. A bare count floor does
  exactly this (see the probe below), so the rule needs a share floor.
- "Nicht typisch" for a phrase only because the noun has thin data
  (*starker Kaffee*, 2 uses). Thin nouns get "Keine Daten".
- A broken lemma shown to the learner (*angepas Geschwindigkeit*,
  *letzter Chance*): suggestions come from example surfaces.
- A slower verb check: the adjective path runs only when the partner
  has no verb forms.

## Approaches

**A. Count floor only** (the #54 page rule, `count >= 3`). Simplest,
same number the noun page uses. Rejected: in the probe *hohe Chance*,
*große Kosten* and *schnelle Geschwindigkeit* each have exactly 3 uses
and would be "Üblich".

**B. Count floor plus share of the noun's adjective total, plus a
thin-noun guard.** Recommended in the draft; replaced by C at approval. A pair is usual when it has at least 5
uses **and** at least 1% of the noun's attributive-adjective uses. A
noun with fewer than 5 such adjectives gets "Keine Daten". Share is
already the #54 ranking metric, so the check and the noun page agree on
what is typical.

**C. logDice over `adjective_attributes`** with the noun's and the
adjective's totals. Comparable with the window sections, but it rewards
rare adjectives (*strömend*) over the general ones a learner types
(*stark*, *groß*), it needs a per-adjective total per request, and the
probe does not show a case B gets wrong that C would get right. Not
chosen in the draft. **Chosen at approval** (see "Approved changes"):
on the same probe it catches one more error than B and passes as many
correct pairs.

### Probe for B (local DB, 2026-11-27)

64 hand-labelled noun + adjective pairs, run against the loaded
`adjective_attributes` with rule B (count ≥ 5, share ≥ 1%, noun needs
≥ 5 adjectives with count ≥ 5):

| Expected | Pairs | Result |
|---|---|---|
| learner error (23) | *schwerer Regen* 1 / 0.54%, *hohe Chance* 3 / 0.28%, *große Kosten* 3 / 0.37%, *teurer Preis* 2 / 0.14%, *schnelle Geschwindigkeit* 3 / 0.76%, *starke Meinung*, *hohe Mehrheit*, *schwerer Verkehr*, *große Temperatur*, *hoher Erfolg*, *hohe Rolle*, *naher Freund*, *starkes Risiko*, *hohe Frage*, … | 20 Nicht typisch, 1 Keine Daten (*schwerer Raucher*), 2 Üblich: *warme Temperaturen* (7 / 1.02%) and *hohe Gefahr* (8 / 1.81%), both written in German news and weather texts; not clear errors |
| correct (34) | *starker Regen* 31 / 16.9%, *hohe Kosten* 227 / 28.1%, *große Chance*, *hohe Geschwindigkeit*, *dichter Verkehr* 14 / 5.0%, *enger Freund*, *breite Mehrheit*, *scharfe Kritik*, *harte Kritik* 13 / 1.96%, *starkes Interesse* 13 / 1.47%, *schwere Entscheidung* 20 / 1.59%, … | 32 Üblich, 1 Keine Daten (*starker Raucher*: *Raucher* has 1 adjective above 5), 1 Nicht typisch (*schwere Arbeit*, 6 / 0.49%) |
| unsure (7) | *große / harte Entscheidung* (Üblich), *hohes Interesse* 5 / 0.56%, *starke Kritik*, *große Zeit*, *feste Meinung*, *starker Wunsch* (Nicht typisch) | |

The builder reruns this probe through the API (the 20-headword
spot-check) and may move the two constants only with the table in the
decision.

## Design

### Parsing (domain, pure)

`splitPhrase` is unchanged: it already yields two content words for
*ein starker Regen*, *starken Regen*, *Regen stark*. The service's role
assignment gains a second branch **after** the verb branch, so every
phrase that parses as verb + noun today still does:

1. As today: one word has verb forms (`findVerbCandidates`), the other
   does not → verb check.
2. New: no word has verb forms, and exactly one is a noun headword
   (capitalised one, or the one whose capitalised form resolves to a
   noun page, as #70 does) and the other resolves to an adjective lemma
   that has rows in `adjective_attributes` → adjective check.
3. Otherwise not parsed (plain search), as today.

A trailing separable particle (`split.particle`) or a typed *sich*
rules out the adjective branch.

Adjective form → lemma: the lowercase typed word through
`words` → `word_dominant_lemma` → `lemmas` (*starker*, *hohe*,
*höhere* → *stark*, *hoch*; measured 9 ms for 14 forms on the local
data, `words_word_key` index). The adjective lemma must have
`adjective_attributes` rows, which also keeps nouns and verbs out.

New pure function in `backend/src/domain/adjectiveCheck.ts`:

```ts
export const MIN_ADJECTIVE_CHECK_COUNT = 5;
export const MIN_ADJECTIVE_CHECK_SHARE = 0.01;
export const MIN_NOUN_ADJECTIVES = 5;

export interface AdjectivePair {
  adjective: string;   // lemma
  count: number;
  share: number;       // count / the noun's attributive total
  phrase: string;      // most common written "adjective noun" from the examples
  adjectiveWord: string;
  nounWord: string;
}

export function judgeAdjective(adjective: string | null, pairs: AdjectivePair[]): Judgement;
```

Same `Judgement` shape and suggestion counts as `judge` (#70: up to 2
"noch häufiger", 3 "typisch sind"), pairs best-first by share.

### Store (outbound port)

`CollocationCheckStore` gains two methods (narrow port, #68):

- `findAdjectiveLemma(surface: string): Promise<string | null>`
- `findAdjectivePairs(noun: string): Promise<AdjectivePair[]>`: the
  noun's pairs with `count >= MIN_ADJECTIVE_CHECK_COUNT`, share against
  the noun's full total (a scalar CTE, the #54 lesson: no LATERAL), and
  the written phrase from `adjective_attribute_examples` (most common
  `adjective_surface || ' ' || noun_surface`, falling back to the
  lemmas). Measure with `EXPLAIN (ANALYZE, BUFFERS)` on *Zeit*
  (largest probe noun, 4,389 uses) and *Problem*; if the example
  subquery per pair is slow, compute it only for the pairs returned.

The noun lemma comes from the same headword resolution #70 uses
(`resolveHeadword`), mapped to `lemmas.id`.

### Contract (`types/src/index.ts`)

`CollocationCheck` becomes a union on `relation`: the existing `obj`
variant unchanged, plus

```ts
{ parsed: true; relation: 'amod'; phrase; noun;
  adjectiveTyped: string; adjective: string | null;
  verdict; matched; suggestions }
```

`CheckPhrase` gets `partnerWord` in place of `verbWord` (the frontend
picks the colour from `relation`). Backend and frontend ship in one
deploy.

### Frontend

- `CollocationCheckCard.tsx`: verdict copy per relation ("kein
  typisches Adjektiv zu", and the noData line "zu wenige Adjektive");
  field label "Wort prüfen", placeholder "Verb oder Adjektiv"; the card
  shows its field when the noun has object pairs **or** adjective data
  (`Word.tsx` passes both).
- `lib/collocationCheck.ts`: `phraseParts` colours the partner as verb
  or adjective.
- `Home.tsx`: second example link *schwerer Regen*.
- `SearchBox.tsx`: unchanged; it already sends two-word queries to
  `/api/check`.

## Tests

- Domain unit tests (`adjectiveCheck.test.ts`): share floor rejects a
  3-use pair, count floor rejects a 4-use pair at 30% share, thin noun →
  `noData`, usual with up to 2 stronger suggestions, unusual with 3.
- Service unit tests with a fake store: *starker Regen*, *Regen stark*,
  *ein starker Regen* → `amod`; *Sport machen* still `obj`; *legt eine
  Pause ein* still `obj`; *gute Nacht* with no adjective data → not
  parsed; two adjectives → not parsed.
- `collocationCheck.dbtest.ts`: seeded noun with adjectives and
  examples; written phrase chosen from examples; share uses the full
  total, not only pairs above the floor.
- Frontend unit tests for `phraseParts` with an adjective partner.
- Spot-check through the API (the ~20 headwords rule): the probe table
  above, before (all plain search today) and after, in the decision.

## Deploy notes

Backend and frontend rebuild; no migration, no loader. The frontend
build needs the Impressum variables (#72); if `IMPRESSUM_EMAIL` is
still unset on the server, the frontend build stops, as on the #73
deploy, and this increment cannot ship until it is set. Check after
deploy: `/api/check?q=schwerer Regen` → `amod`, `unusual`;
`/api/check?q=Sport machen` unchanged.

## Left to the builder

- Whether `findAdjectivePairs` caps the rows it returns (the judge only
  needs the matched pair and the top 3).
- Exact German copy of the noData line, in the tone of the #70 card.
- Whether a lowercase-only phrase (*starker regen*) needs the #70
  "word that is no verb form" fallback or the capitalised-headword test
  is enough; test both on a phone keyboard input.
- Whether the probe's two borderline "Üblich" (*warme Temperaturen*,
  *hohe Gefahr*) stay; the constants move only with a new probe table.

## Open questions for the user (answered 2026-11-27)

Answered by the approval: 1. logDice ≥ 6 instead of rule B; 2. the #54
data for v1; 3. a separate kind `check_adj`. Question 4 is a deploy
question for the user.

1. Approve rule B and its constants (5 uses, 1% share, 5 adjectives per
   noun) as the starting point.
2. The #54 data comes from the 1M corpus with spaCy's small model, not
   the lab's 3M parse. Accept it for v1, or first ask for a lab
   adjective export (a separate, larger increment)?
3. Count adjective checks under the existing `check` kind (keeps the
   A0 baseline continuous, recommended) or add a separate kind to see
   how often it is used?
4. Is `IMPRESSUM_EMAIL` now set on the server, so the frontend can be
   rebuilt?
