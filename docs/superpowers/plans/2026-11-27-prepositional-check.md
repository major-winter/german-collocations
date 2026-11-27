# Prepositional Verb–Noun Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Passt das zusammen?" also judges a verb with a prepositional noun
(*an einer Sitzung teilnehmen*, *zur Verfügung stellen*). It says whether
the preposition is the usual one for that verb and noun, and names the
usual phrase when it isn't.

**Architecture:** A third branch in `CheckCollocationService`, next to
the object check (#70) and the adjective check (#74). It handles only phrases
`splitPhrase` rejects, so no existing verdict changes. The pure parsing and
judging rules go in a new domain file `prepositionCheck.ts`. The store gets one
query over the lab's `obl` pairs (`lab_verb_pairs`, migration 014), with no
migration. The API returns a new `relation: 'obl'` variant of
`CollocationCheck`. The card reuses the verb rendering, with new copy for
"a different preposition".

**Tech Stack:** TypeScript (Node type stripping), Express, `pg`, React,
Node's built-in test runner.

**Spec:** `docs/improvement-ideas.md` item 4, plus the "Design" section below.
The design was measured on the local database (2026-11-27), so it serves as
the spec. Background: `docs/superpowers/specs/2026-11-26-collocation-check-design.md` (#70).

**Branch:** `backend-feature-prepositional-check`

## Design (measured on the local DB, 2026-11-27)

- **The data.** There are 33,268 `obl` pairs over 6,260 nouns. `prep` is the
  lemma (`zu` for *zur*, `in` for *im*), and `phrase_noun` is the written form
  (*zur Verfügung*, *an den Sitzungen*). The largest noun (*Zeit*, 155 pairs)
  is read in 0.6 ms through `idx_lab_verb_pairs_noun`.
- **Noise.** Wrong prepositions do exist as weak pairs: *in Einsatz kommen*
  (LL 1, freq 16), *bei Einsatz kommen* (LL 1), next to *zum Einsatz kommen*
  (LL 18,761). That is why both rules below exist:
  - `MIN_OBL_SCORE = 10.83`: the LL critical value at p < 0.001 (1 df). Pairs
    below it are ignored. This drops 4,045 of 33,268 locally.
  - `PREPOSITION_SHARE_OF_BEST = 0.1`: the typed preposition counts only if
    its score is at least 10 % of the best preposition for the same verb +
    noun. It keeps *sich freuen über Besuch* (421 vs 472), and it drops
    *auf Einsatz kommen* (3 %) and *vor die Frage stellen* (3 %). The spot-check
    in Task 4 may tune the value; record the final value in #76.
- **Parsing.** One token is a preposition, or a contraction mapped to one, if
  it is **followed by another token**. A trailing one stays a separable
  particle, as in #70. Exactly one such token, then the existing rules apply:
  determiners and *sich* are dropped, and the rest must be noun + verb.
  Phrases with two prepositions (*bis zum Ende*) are not parsed.
- **Verdicts** (verb = the picked lab lemma, from `pickVerbLemma`, as in #70):
  - `noData`: the noun has no `obl` pair above `MIN_OBL_SCORE`.
  - `usual`: the verb has a pair with this noun and the typed preposition, at or
    above the share rule. `matched` is that pair. `suggestions` are at most 2
    stronger pairs of the **same verb** with another preposition.
  - `unusual` with `otherPreposition: true`: the verb pairs with this noun, but
    not with the typed preposition (or only below the share rule). The
    suggestions are the top 3 pairs of the same verb, at or above the share
    rule.
  - `unusual` with `otherPreposition: false`: the verb doesn't pair with this
    noun at all (or is unknown). The suggestions are the top 3 pairs with the
    typed preposition, or the top 3 overall if there are none.
- **Verb variants.** Typed *sich*: only `sich X`. Otherwise `X`, and if `X`
  has no pairs with this noun, `sich X`. Learners drop *sich* (*an der
  Diskussion beteiligen*); the matched phrase then shows it.
- **Counting.** The kind is `check_obl`, so the `check` baseline from #72
  stays comparable, the way `check_adj` did for #74. No migration is needed,
  because `usage_counts.kind` has no CHECK constraint.

## Global Constraints

- No migration, no new table, no change to `lab_verb_pairs`.
- No existing #70/#74/#75 test may change its expectation. The new branch runs
  only when `splitPhrase(q)` returns `null`.
- All user-facing copy is in German (#62).
- `import type` for anything from `@collocations/types` and ports.
- Contractions: `am ans→an`, `im ins→in`, `beim→bei`, `vom→von`,
  `zum zur→zu`, `aufs→auf`, `fürs→für`, `ums→um`, `übers→über`,
  `durchs→durch`, `unters unterm→unter`, `vors vorm→vor`,
  `hinters hinterm→hinter`.
- Prepositions: `in zu auf mit an für von bei nach aus über um durch unter vor
  seit bis ab gegen wegen per ohne während innerhalb hinter zwischen neben
  laut aufgrund pro trotz außer anhand gemäß außerhalb binnen dank`. This
  leaves out the postpositions in the data (`lang`, `zufolge`, `gegenüber`),
  because the rule expects the preposition before the noun.

## Review Focus

1. **A capitalised contraction at the start** (*Zur Verfügung stellen*, *Im
   Mittelpunkt stehen*): it maps to `zu`/`in`, and *Verfügung* is still read as
   the noun. Test in Task 1.
2. **A trailing particle that is also a preposition** (*legt eine Pause ein*,
   *nimmt ein Foto auf*): it is still a particle, and these phrases still take
   the #70 path. Test in Task 1 (`splitPrepositionalPhrase` returns null) and
   in Task 3 (the db test still returns `relation: 'obj'`).
3. **A weak wrong preposition that exists in the data** (*in Einsatz kommen*)
   is `unusual` and suggests *zum Einsatz kommen*. Test in Tasks 1 and 3.
4. **A dropped *sich*** (*an der Diskussion beteiligen*) is `usual`, and the
   matched phrase includes *sich*. Test in Task 1.
5. **A verb the lab knows only with objects** (*an der Sitzung machen*):
   `unusual`, `otherPreposition: false`, with suggestions that use *an*. Never
   `noData` while the noun has pairs. Test in Task 1.

---

### Task 1: Domain rules, `backend/src/domain/prepositionCheck.ts`

**Files:**
- Create: `backend/src/domain/prepositionCheck.ts`
- Create: `backend/src/domain/prepositionCheck.test.ts`
- Modify: `backend/src/domain/collocationCheck.ts`: export `tokensOf`,
  `DETERMINER`, `SEPARABLE_PARTICLES`, `baseOf`. No behaviour change.

**Interfaces:**
- Produces:
  ```ts
  export const MIN_OBL_SCORE = 10.83;
  export const PREPOSITION_SHARE_OF_BEST = 0.1;
  export interface PrepositionalSplit extends SplitPhrase {
    preposition: string;   // the lemma: "zu" for "zur"
    prepositionTyped: string; // as typed: "zur"
  }
  export function splitPrepositionalPhrase(q: string): PrepositionalSplit | null;
  export interface OblPair { verb: string; prep: string; noun: string; phraseNoun: string; score: number }
  export interface PrepositionJudgement extends Judgement { otherPreposition: boolean }
  export function judgePreposition(verb: string | null, sich: boolean, preposition: string, pairs: OblPair[]): PrepositionJudgement;
  export function oblCheckPhraseOf(pair: OblPair): CheckPhrase; // phraseOf("obl", …), phraseNounWord, baseOf(verb)
  ```
  `pairs` arrive best-first (score DESC). `judgePreposition` applies
  `MIN_OBL_SCORE` itself.

- [ ] **Step 1: Write the failing tests** in `prepositionCheck.test.ts`

  `splitPrepositionalPhrase`:
  ```ts
  deepEqual(splitPrepositionalPhrase("an einer Sitzung teilnehmen"),
    { words: ["Sitzung", "teilnehmen"], sich: false, particle: null, preposition: "an", prepositionTyped: "an" });
  equal(splitPrepositionalPhrase("Zur Verfügung stellen")?.preposition, "zu");
  deepEqual(splitPrepositionalPhrase("Zur Verfügung stellen")?.words, ["Verfügung", "stellen"]);
  equal(splitPrepositionalPhrase("im Mittelpunkt stehen")?.preposition, "in");
  equal(splitPrepositionalPhrase("sich an der Diskussion beteiligen")?.sich, true);
  equal(splitPrepositionalPhrase("kommt zum Einsatz")?.preposition, "zu");
  equal(splitPrepositionalPhrase("legt eine Pause ein"), null);   // trailing "ein": particle
  equal(splitPrepositionalPhrase("nimmt ein Foto auf"), null);    // trailing "auf": particle, no preposition
  equal(splitPrepositionalPhrase("bis zum Ende warten"), null);   // two prepositions
  equal(splitPrepositionalPhrase("Entscheidung treffen"), null);  // no preposition
  equal(splitPrepositionalPhrase("an der Sitzung"), null);        // no verb: one word left
  ```

  `judgePreposition`. Fixture: *Sitzung* pairs `teilnehmen/an/1201`,
  `beschließen/in/683`, `einladen/zu/241`, `teilnehmen/bei/12`,
  `teilnehmen/mit/5` (below the floor). *Einsatz* pairs `kommen/zu/18761`,
  `kommen/auf/569`, `kommen/in/1`. *Diskussion* pair `sich beteiligen/an/354`.
  ```ts
  // usual
  const ok = judgePreposition("teilnehmen", false, "an", sitzung);
  equal(ok.verdict, "usual"); equal(ok.matched?.phrase, "an den Sitzungen teilnehmen"); deepEqual(ok.suggestions, []);
  // wrong preposition, same verb pairs with the noun
  const bei = judgePreposition("teilnehmen", false, "bei", sitzung);  // 12 < 10 % of 1201
  equal(bei.verdict, "unusual"); equal(bei.otherPreposition, true);
  deepEqual(bei.suggestions.map((s) => s.phrase), ["an den Sitzungen teilnehmen"]);
  // weak pair in the data (Review Focus 3)
  const ein = judgePreposition("kommen", false, "in", einsatz);
  equal(ein.verdict, "unusual"); equal(ein.otherPreposition, true);
  equal(ein.suggestions[0].phrase, "zum Einsatz kommen");
  // a verb with no pair for this noun (Review Focus 5)
  const machen = judgePreposition("machen", false, "an", sitzung);
  equal(machen.verdict, "unusual"); equal(machen.otherPreposition, false);
  deepEqual(machen.suggestions.map((s) => s.partnerWord), ["teilnehmen"]); // only "an" pairs above the floor
  // dropped "sich" (Review Focus 4)
  const disk = judgePreposition("beteiligen", false, "an", diskussion);
  equal(disk.verdict, "usual"); equal(disk.matched?.phrase, "sich an der Diskussion beteiligen");
  // no pairs above the floor
  equal(judgePreposition("teilnehmen", false, "mit", [pair("teilnehmen", "mit", "Sitzung", 5)]).verdict, "noData");
  // usual, with a stronger preposition for the same verb
  const ueber = judgePreposition("freuen", true, "über", besuch); // sich freuen: auf 472, über 421
  equal(ueber.verdict, "usual"); deepEqual(ueber.suggestions.map((s) => s.phrase), ["sich auf ihren Besuch freuen"]);
  ```

- [ ] **Step 2: Run them and watch them fail**

  Run: `node --test backend/src/domain/prepositionCheck.test.ts`
  Expected: FAIL, module not found.

- [ ] **Step 3: Implement `prepositionCheck.ts`** with the interfaces above
  and the constants from Global Constraints.

  `splitPrepositionalPhrase` takes the tokens (`tokensOf`), pops a trailing
  particle exactly as `splitPhrase` does, then needs exactly one token at
  index < last that is (lowercased) a preposition or a contraction. It
  removes that token and filters `sich` and determiners as `splitPhrase`
  does. It needs exactly 2 words left, and keeps the same 2–5 token bounds.
  Share the particle/determiner/`sich` filtering with `splitPhrase` by
  extracting a helper in `collocationCheck.ts` rather than copying it.
  `collocationCheck.test.ts` must stay green unchanged.

- [ ] **Step 4: Run the tests and watch them pass**

  Run: `node --test backend/src/domain/prepositionCheck.test.ts backend/src/domain/collocationCheck.test.ts`
  Expected: PASS, with no change to `collocationCheck.test.ts`.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/src/domain/prepositionCheck.ts backend/src/domain/prepositionCheck.test.ts backend/src/domain/collocationCheck.ts
  git commit -m "Add the rules for checking a verb with a prepositional noun"
  ```

### Task 2: Contract, port, service and counting

**Files:**
- Modify: `types/src/index.ts`: a third `parsed: true` variant of `CollocationCheck`
- Modify: `backend/src/application/ports/out/CollocationCheckStore.ts`
- Modify: `backend/src/application/CheckCollocationService.ts`
- Modify: `backend/src/application/CheckCollocationService.test.ts` (the fake store gets `findOblPairs`)
- Modify: `backend/src/application/ports/out/UsageCounter.ts`, `backend/src/application/CountingUseCases.ts`, `backend/src/application/CountingUseCases.test.ts`

**Interfaces:**
- Consumes: Task 1's `splitPrepositionalPhrase`, `judgePreposition`, `OblPair`.
- Produces:
  ```ts
  // types/src/index.ts, Decision #76
  | {
      parsed: true;
      phrase: string;
      noun: string;
      verbTyped: string;
      verb: string | null;
      prepositionTyped: string; // "zur"
      preposition: string;      // "zu"
      relation: 'obl';
      verdict: CheckVerdict;
      otherPreposition: boolean; // unusual because the verb wants another preposition with this noun
      matched: CheckPhrase | null;
      suggestions: CheckPhrase[];
    }
  // CollocationCheckStore
  /** All of a noun's lab prepositional (obl) pairs, best-first (#76). */
  findOblPairs(noun: string): Promise<OblPair[]>;
  // UsageCounter
  export type UsageKind = "word_page" | "check" | "check_adj" | "check_obl";
  ```

- [ ] **Step 1: Write the failing service tests** in `CheckCollocationService.test.ts`,
  using the fake store's `obl` pairs:
  ```ts
  test("an der Sitzung teilnehmen is usual through the obl branch (#76)", …
    equal(check.relation, "obl"); equal(check.preposition, "an"); equal(check.verdict, "usual"));
  test("zur Verfügung stellen maps the contraction and opens the Verfügung page", …
    equal(check.noun, "Verfügung"); equal(check.prepositionTyped, "zur"));
  test("a phrase splitPhrase accepts never reaches the obl branch", …
    // "Entscheidung treffen": findOblPairs is never called (the fake records calls)
  );
  test("an obl phrase whose noun has no page is not parsed", … deepEqual(check, { parsed: false }));
  ```
  In `CountingUseCases.test.ts`: an `obl` check is counted as `check_obl`.

- [ ] **Step 2: Run them and watch them fail**

  Run: `node --test backend/src/application/CheckCollocationService.test.ts backend/src/application/CountingUseCases.test.ts`
  Expected: FAIL, `relation` undefined and no `check_obl`.

- [ ] **Step 3: Implement the changes.** In `check()`: when `splitPhrase(q)`
  is null, try `splitPrepositionalPhrase(q)`. If that's non-null, return
  `#oblCheck(q, split) ?? NOT_PARSED`. `#oblCheck` mirrors `#verbCheck`:
  `#roles(split.words)`, the noun must resolve with `pageSide === "noun"`,
  `pickVerbLemma`, and the noun's pairs come through `lookupCandidates` (the
  typed form, then its lemma), first non-empty. Then `judgePreposition`.
  `CountingUseCases` maps `relation` to a kind: `amod` → `check_adj`, `obl` →
  `check_obl`, else `check`.

- [ ] **Step 4: Run the backend tests and the typecheck**

  Run: `npm test && npm run typecheck`
  Expected: all pass. The frontend typecheck may fail until Task 4 only if a
  `switch` on `relation` is exhaustive. Fix it there, not here.

- [ ] **Step 5: Commit**

  ```bash
  git add types/src/index.ts backend/src/application
  git commit -m "Check prepositional verb-noun phrases in the check service"
  ```

### Task 3: Postgres adapter and database test

**Files:**
- Modify: `backend/src/adapters/postgres/PgCollocationCheckStore.ts`
- Modify: `backend/src/adapters/postgres/collocationCheck.dbtest.ts`

**Interfaces:**
- Consumes: `OblPair` (Task 1), `findOblPairs` (Task 2).

- [ ] **Step 1: Write the failing db tests.** Seed with
  `seed.labPair(verb, noun, { relation: "obl", prep, phraseNoun, score })`:
  ```ts
  test("an einer Sitzung teilnehmen is usual (#76)", …
    equal(check.relation, "obl"); equal(check.verdict, "usual");
    equal(check.matched?.phrase, "an den Sitzungen teilnehmen"));
  test("in Einsatz kommen is not typical and suggests zum Einsatz kommen", …
    // seeds kommen/zu/18761 "zum Einsatz", kommen/in/1 "in Einsatz"
    equal(check.verdict, "unusual"); equal(check.otherPreposition, true);
    deepEqual(phrases(check), ["zum Einsatz kommen"]));
  test("obj pairs do not answer an obl check", …
    // Sitzung has only an obj pair "leiten": "an der Sitzung leiten" -> noData
  );
  test("legt eine Pause ein still takes the object check", … equal(check.relation, "obj"));
  ```

- [ ] **Step 2: Run and watch them fail**

  Run: `npm run test:db -w backend`
  Expected: FAIL, `findOblPairs` is not a function.

- [ ] **Step 3: Implement `findOblPairs`** with one query:
  `SELECT verb, prep, noun, phrase_noun AS "phraseNoun", score FROM lab_verb_pairs WHERE relation = 'obl' AND noun = $1 ORDER BY score DESC, verb, prep`.
  Add a comment like the others (decision #76, the measured cost).

- [ ] **Step 4: Run the db tests and the whole suite**

  Run: `npm run test:db -w backend && npm test`
  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/src/adapters/postgres
  git commit -m "Read a noun's prepositional lab pairs for the check"
  ```

### Task 4: Frontend card

**Files:**
- Modify: `frontend/src/lib/collocationCheck.ts`, `frontend/src/lib/collocationCheck.test.ts`
- Modify: `frontend/src/components/CollocationCheckCard.tsx`
- Modify: `frontend/src/routes/Word.tsx:152-155` (`showField`)

**Interfaces:**
- Consumes: the `relation: 'obl'` variant (Task 2).
- Produces: `export function unusualReason(check: Parsed): 'preposition' | 'verb' | 'adjective'` in `lib/collocationCheck.ts`.

- [ ] **Step 1: Write the failing tests** in `collocationCheck.test.ts`:
  ```ts
  equal(partnerKind(obl), "verb");
  equal(partnerTyped(obl), "teilnehmen");
  equal(unusualReason({ ...obl, otherPreposition: true }), "preposition");
  equal(unusualReason({ ...obl, otherPreposition: false }), "verb");
  equal(unusualReason(amod), "adjective");
  equal(checkTarget(obl), "/wort/Sitzung?pruefen=an%20einer%20Sitzung%20teilnehmen");
  ```

- [ ] **Step 2: Run and watch them fail**

  Run: `node --test frontend/src/lib/collocationCheck.test.ts`
  Expected: FAIL, `unusualReason` is not exported.

- [ ] **Step 3: Implement.** The card's unusual copy, by `unusualReason`:
  - `preposition`: `Mit <i>{verb}</i> steht bei <i>{noun}</i> meist eine andere Präposition. Typisch sind:`
  - `verb` on an `obl` check: `In unseren Texten ist <i>{verb}</i> mit <i>{prepositionTyped} … {noun}</i> keine typische Verbindung. Typisch sind:`
  - `verb` on an `obj` check, and `adjective`: the existing copy, unchanged.
  - `noData` on `obl`: `Zu <i>{noun}</i> haben wir in unseren Texten keine Verben mit Präposition gefunden.` plus the existing second sentence.

  Change the unparsed hint to: `…z. B. <i>Entscheidung treffen</i>, <i>starker Regen</i> oder <i>an einer Sitzung teilnehmen</i>.`
  In `Word.tsx`, `showField` also becomes true for `p.relation === "obl"`, and
  the comment names #76.

- [ ] **Step 4: Check it**

  Run: `node --test frontend/src/lib/collocationCheck.test.ts && npm run lint -w frontend && npm run build -w frontend`
  Expected: PASS, no lint errors, and the build succeeds.
  Then `docker-compose up -d --build` and open these in the browser at phone
  and desktop width: `/wort/Sitzung?pruefen=bei%20der%20Sitzung%20teilnehmen`
  (*an den Sitzungen teilnehmen* suggested),
  `/wort/Verf%C3%BCgung?pruefen=zur%20Verf%C3%BCgung%20stellen` (*Üblich ✓*),
  and the search box with *in Einsatz kommen* (lands on *Einsatz* with the card).

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src
  git commit -m "Show prepositional checks on the noun page"
  ```

### Task 5: Spot-check, decision and docs

**Files:**
- Modify: `docs/decisions.md` (new entry #76 and its index line)
- Modify: `docs/roadmap.md` (item 4 → `built (#76)`), `docs/improvement-ideas.md` (item 4 points to #76)
- Create: `docs/superpowers/plans/2026-11-27-prepositional-check-spotcheck.md` (the table)

- [ ] **Step 1: Run the linguistic spot-check** on the local stack with
  `curl 'localhost:3000/api/check?q=…'` for these 20 phrases. Record the
  verdict and the first suggestion for each:
  right: *an einer Sitzung teilnehmen, zur Verfügung stellen, in Frage stellen,
  auf eine Antwort warten, sich für Musik interessieren, sich auf den Besuch
  freuen, sich über den Besuch freuen, von der Situation abhängen, zum Einsatz
  kommen, ums Leben kommen, im Mittelpunkt stehen, an die Zukunft denken*;
  wrong: *bei einer Sitzung teilnehmen, in Einsatz kommen, für eine Antwort warten,
  an Musik interessieren, auf der Situation abhängen, über die Zukunft denken,
  in Verfügung stellen, mit der Diskussion beteiligen*.
  Expected: every right phrase `usual` and every wrong one `unusual`. Tune
  `PREPOSITION_SHARE_OF_BEST` or `MIN_OBL_SCORE` (with its unit test) only if
  a row is wrong, and record why. *über die Zukunft denken* exists in German
  (*nachdenken über*). Whatever it gets, note it in the decision rather than
  forcing it.

- [ ] **Step 2: Measure the query** with `EXPLAIN (ANALYZE, BUFFERS)` of
  `findOblPairs` for *Zeit* on the local DB. Expected: an index scan on
  `idx_lab_verb_pairs_noun`, under 5 ms. Re-run it on prod after the deploy and
  put both numbers in #76.

- [ ] **Step 3: Write decision #76** at the end of `docs/decisions.md`, titled
  "'Passt das zusammen?' for a verb with a prepositional noun (amends #70)".
  Cover the two constants and their reasoning, parsing (contractions, a
  trailing token is a particle), the verdict rules, `check_obl`, the
  spot-check table's link, and what is left out (two prepositions, a finite
  verb with a separable particle that isn't in the list, *teil*). Update the
  index, `docs/roadmap.md` and `docs/improvement-ideas.md`.

- [ ] **Step 4: Run everything once more**

  Run: `npm test && npm run test:db -w backend && npm run typecheck && npm run lint -w frontend`
  Expected: all pass.

- [ ] **Step 5: Commit**

  ```bash
  git add docs
  git commit -m "Record decision #76: prepositional verb-noun check"
  ```

Merging and deploying go to the `deploy` agent after review. Neither is part
of this plan.
