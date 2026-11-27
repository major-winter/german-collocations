# Learner-style phrases in "Passt das zusammen?" (decision #78)

Approved in the dispatch of 2026-11-27 (two features, no spec file).
Branch `backend-feature-learner-phrases`, from `485b040` (#77).

## Task 1: readings of a phrase (`backend/src/domain/collocationCheck.ts`)

- `MAX_TOKENS` 5 → 8.
- `SEPARABLE_PARTICLES` gains every particle the lab examples write split
  from its verb at least 50 times (query in #78), except `statt`.
- New, exported: `dropSubjectPronouns(tokens)`,
  `dropAttributiveAdjectives(tokens, isFunctionWord?)`,
  `readingsOf(q, isFunctionWord?) : Reading[]`, `isDeterminer(token)`.
- `splitPhrase(q)` returns the first reading whose `contentWords` parse:
  the #70 reading first, then without popping the trailing particle, then
  the learner readings (pronouns, agreeing reflexives, demonstratives and
  quantifiers dropped; with, then without, the adjectives dropped).
  Existential *es gibt* gets no learner reading.

Tests (`collocationCheck.test.ts`): pronouns, agreeing reflexives (and a
non-agreeing *mir* left unparsed), *es gibt*, adjective runs, the #70/#74
readings first (*ein starker Regen*, *das macht Sinn*, *nimmt ein Foto
auf*), new particles, *bekommt einen Teil* / *feiert ein Fest*, the
8-token bound, demonstratives and quantifiers.

## Task 2: the prepositional split (`backend/src/domain/prepositionCheck.ts`)

`splitPrepositionalPhrase(q)` loops over `readingsOf(q, isPreposition)`,
so an adjective may follow the preposition (*an wichtigen Sitzungen*) and
a contraction is never dropped (*bis zum Ende*).

Tests (`prepositionCheck.test.ts`): *Ich nehme an der Sitzung teil*,
adjectives after determiner and preposition, an agreeing reflexive,
*bis zum Ende warten* still null.

## Task 3: verb lemma with a particle (`backend/src/application/CheckCollocationService.ts`)

- `#verbLemma(verbToken, particle, candidates)`: #70's `pickVerbLemma`;
  when it finds no particle verb, particle + the form's own lemma, if the
  lab has that verb (one `findVerbCandidates` call, existing index).
- A popped particle with no particle verb: not parsed (both branches).

Tests (`CheckCollocationService.test.ts`): the sentence forms give the
dictionary form's verdict and matched phrase; *Wir stellen eine wichtige
Frage* stays an object check; *Ich nehme ein Foto auf* → *aufnehmen*;
*Die Frage ist offen* not parsed.

## Task 4: the hint in the header (`frontend/src/lib/collocationCheck.ts`, `SearchBox.tsx`)

- `searchRoute(q, check): {kind:'check'|'search', to} | {kind:'hint'}`.
- `SearchBox` shows `UnparsedCheckHint` under the field while the field
  still holds the unparsed phrase; `CollocationCheckCard` uses the same
  component.

Tests (`frontend/src/lib/collocationCheck.test.ts`): parsed → check;
three or more words unparsed → hint; one word, two-word fallback or a
failed request → search.

## Task 5: checks, spot-check, decision

`npm test`, `npm run test:db -w backend`, `npm run typecheck`,
`npm run lint -w frontend`, `npm run build -w frontend`; the spot-check
before/after through `CheckCollocationService` against the dev database;
decision #78.
