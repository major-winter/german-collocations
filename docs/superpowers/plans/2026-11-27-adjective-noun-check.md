# Plan: "Passt das zusammen?" for adjective + noun

Spec: `docs/superpowers/specs/2026-11-27-adjective-noun-check-design.md`
(approved 2026-11-27, with the logDice rule, the #54 data and the
`check_adj` usage kind). Branch: `backend-feature-adjective-noun-check`.
Decision: #74, amends #70.

## Measured before planning (local DB, warm cache)

f_adj, one adjective, `EXPLAIN (ANALYZE, BUFFERS)`:
*neu* 10,016 rows 6.0 ms, *groß* 6,505 rows 4.6 ms, *hoch* 2,655 rows
2.8 ms (bitmap heap scan on `idx_adjective_attributes_adjective`, ~1.4–2.3k
buffers).

One noun's candidate pairs (count ≥ 5 or the typed adjective), each with
its f_adj as a correlated subquery: *Mann* (118 candidates, the largest)
18–24 ms, *Zeit* (96) 23–31 ms (47 ms on the first run), *Problem* (79)
31 ms first run, *Regen* (9) 3.9 ms. The table is 19 MB and stays
cached. Decision: the plain query, no precomputed totals table, no
migration. Trigger to revisit: the check's p95 over ~150 ms on the VM.

## Builder choices (spec "left to the builder")

- Suggestions (both lists) are pairs with count ≥ 5 **and** logDice ≥ 6.
  The count floor keeps hapax adjectives (high logDice from a total of
  1–2) and broken lemmas out; the logDice floor keeps "Typisch sind" from
  naming a pair the check itself would call "Nicht typisch".
- The matched pair needs only logDice ≥ 6 (the user's rule), any count.
- The written phrase comes from `adjective_attribute_examples`, only for
  the pairs shown (≤ 4), preferring examples whose noun surface is the
  noun lemma. A suggestion without an example is dropped (none exist
  locally: 0 of 20,946 pairs with count ≥ 5 lack one); a matched pair
  without one shows the typed phrase.
- Role assignment: the verb branch runs first and is unchanged for every
  phrase it parses today. Where it used to return "not parsed", the
  adjective branch runs (no particle, no *sich*): with exactly one
  capitalised word, that word is the noun; otherwise both orders are
  tried, typed order (adjective first, as German writes it) first.
  This also covers *Starker Regen* (sentence-initial capital, and
  *regen* is a verb form) and *hohe kosten* (*kosten* is a verb form).
- `noun` in the response is the noun's lemma text (the page to open).

## Tasks

### 1. Domain: `backend/src/domain/adjectiveCheck.ts`

```ts
export const MIN_ADJECTIVE_CHECK_LOGDICE = 6;
export const MIN_ADJECTIVE_PAIR_COUNT = 5;
export const MIN_NOUN_ADJECTIVES = 5;
export interface AdjectiveCount { adjectiveId: number; adjective: string; count: number; adjectiveTotal: number }
export interface AdjectiveCounts { nounTotal: number; pairs: AdjectiveCount[] }
export interface WrittenPair { adjectiveId: number; adjectiveWord: string; nounWord: string }
export interface AdjectiveJudgement { verdict: CheckVerdict; matched: AdjectiveCount | null; suggestions: AdjectiveCount[] }
export function attributiveLogDice(count: number, nounTotal: number, adjectiveTotal: number): number;
export function judgeAdjective(adjectiveId: number, counts: AdjectiveCounts): AdjectiveJudgement;
export function adjectiveCheckPhrase(written: WrittenPair): CheckPhrase;
```

Tests `adjectiveCheck.test.ts`: logDice formula (known values); thin
noun → noData; typed adjective absent → unusual with the top 3 by
logDice; a count-1 hapax with high logDice never suggested; a pair below
logDice 6 → unusual even with count ≥ 5 (*große Kosten*-like); usual
with up to 2 stronger suggestions; ranking by logDice, not count.

### 2. Contract: `types/src/index.ts`

`CheckPhrase.verbWord` → `partnerWord`; `CollocationCheck` gains the
`amod` variant (`adjectiveTyped: string; adjective: string`). Backend
`checkPhraseOf` and the frontend follow.

### 3. Port + adapter

`CollocationCheckStore` gains `findAdjectiveLemma(surface)`,
`findAdjectiveCounts(nounLemmaId, adjectiveLemmaId)`,
`findWrittenPairs(nounLemmaId, adjectiveLemmaIds)`;
`PgCollocationCheckStore` implements them.

### 4. Service: `CheckCollocationService`

Verb branch as today, returning null instead of "not parsed"; then the
adjective branch. Unit tests `CheckCollocationService.test.ts` with a
fake store: *starker Regen*, *Regen stark*, *ein starker Regen*,
*Starker Regen*, *hohe kosten* → `amod`; *Sport machen* still `obj`;
*legt eine Pause ein* never `amod`; no adjective data → not parsed.

### 5. Counting: `UsageKind` gains `check_adj`

`CountingCheckCollocation` records `check_adj` for `relation: 'amod'`.
Test in `CountingUseCases.test.ts`.

### 6. Database test: `collocationCheck.dbtest.ts`

Seeded *Regen* with adjectives and examples: *schwerer Regen* unusual
with written suggestions; *starker Regen* usual; nounTotal counts pairs
below the floor; f_adj counts the adjective's other nouns.

### 7. Frontend

- `lib/collocationCheck.ts`: `partnerKind(check)`, `partnerTyped(check)`,
  `phraseParts(p, partner)`; tests.
- `CollocationCheckCard.tsx`: copy per relation, "Wort prüfen" /
  "Verb oder Adjektiv", `showField` from `Word.tsx` (object pairs or an
  adjective section).
- `Home.tsx`: second example *schwerer Regen*.

### 8. Checks, spot-check, review, decision

All green (`npm test`, typecheck, lint, build, `test:db`); the
~20-headword spot-check through `/api/check`; one reviewer; decision
#74; roadmap → `built`.
