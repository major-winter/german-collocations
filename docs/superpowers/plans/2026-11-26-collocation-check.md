# "Passt das zusammen?" Collocation Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A learner types *eine Entscheidung machen* (search box) or a verb on a noun page and gets "Üblich ✓ / Nicht typisch / Keine Daten" with suggestions from `lab_verb_pairs`.

**Architecture:** Pure domain rules (phrase splitting, verb-lemma choice, verdict) in `backend/src/domain/collocationCheck.ts`; a new inbound port `CheckCollocation` + service; a new narrow outbound port `CollocationCheckStore` with a Postgres adapter; `GET /api/check?q=`. Frontend: SearchBox routes parsed phrases to `/wort/<noun>?pruefen=<phrase>`, a `CollocationCheckCard` on noun pages.

**Tech Stack:** Node 24 TS (type stripping), Express 5, pg, Postgres 18, React/Vite, node:test.

**Spec:** `docs/superpowers/specs/2026-11-26-collocation-check-design.md`

## Global Constraints

- Object relation only (`relation: "obj"`); no lab/export/loader change.
- Copy (German, exact): labels "Üblich ✓", "Nicht typisch", "Keine Daten"; field label "Verb prüfen", button "Prüfen";
  usual note "Eine gängige Verbindung." + " Noch häufiger:" when suggestions exist;
  unusual note "In unseren Texten (Nachrichten, Wikipedia, Web) ist *{verb}* kein typisches Verb zu *{noun}*. Typisch sind:" and muted footnote "Alltägliche Verbindungen wie *Kaffee bestellen* fehlen in unseren Texten manchmal.";
  noData note "Zu *{noun}* haben wir in unseren Texten keine Verben gefunden. Das heißt nicht, dass die Verbindung falsch ist – wir können sie nur nicht prüfen."
- No red/green on the verdict (#63). Struck phrase uses `<s>`.
- Constants (named, commented with the spec): `REFLEXIVE_TOP_N = 10`, `SUBJECT_FILTER_MAX_OBJECT_SHARE = 0.4`, `USUAL_SUGGESTIONS = 2`, `UNUSUAL_SUGGESTIONS = 3`, phrase length 2–5 tokens.
- Separable particles: `ab an auf aus bei ein fest mit nach vor weg zu zurück`.
- Determiners dropped (case-insensitive): `der die das den dem des`, `ein-/kein-/mein-/dein-/sein-/ihr-/unser-/euer-/eur-` with endings `'' e en em er es`.
- `import type` for interface-only imports; manual DI in `backend/src/index.ts`.
- Commits imperative, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Input with extra words (adjective, pronoun, 6+ tokens) must fall back to today's search, never a wrong verdict — Task 1 tests `splitPhrase` rejects 3 remaining tokens and 6 tokens.
2. A sentence-initial capital (*Macht eine Entscheidung*) must still parse — Task 3 dbtest "both capitalised".
3. `?pruefen=` for a different noun than the page (hand-edited URL) shows no card verdict — Task 6 `checkMatchesPage` test.
4. The check endpoint failing (500/network) must not break search: SearchBox falls back to `/wort/<query>` — Task 6 `checkTarget` test with `{ parsed: false }` and thrown fetch handled in component (review by reading).
5. A noun whose object pairs are all filtered out returns `noData`, not `unusual` with empty suggestions — Task 2 test.

---

### Task 1: Phrase splitting and verb-lemma choice (pure)

**Files:**
- Create: `backend/src/domain/collocationCheck.ts`
- Test: `backend/src/domain/collocationCheck.test.ts`

**Interfaces:**
- Produces:
  - `interface SplitPhrase { words: [string, string]; sich: boolean; particle: string | null }`
  - `splitPhrase(q: string): SplitPhrase | null`
  - `interface VerbCandidate { verb: string; uses: number }` (lab lemma, may start with "sich ")
  - `pickVerbLemma(typed: string, particle: string | null, candidates: VerbCandidate[]): string | null` — returns a base lemma without "sich".

- [ ] **Step 1: Write failing tests**

```ts
test('splitPhrase drops determiners and keeps noun and verb in order', () => {
  assert.deepEqual(splitPhrase('eine Entscheidung machen'), { words: ['Entscheidung', 'machen'], sich: false, particle: null });
  assert.deepEqual(splitPhrase('  macht   keine Entscheidung '), { words: ['macht', 'Entscheidung'], sich: false, particle: null });
  assert.deepEqual(splitPhrase('Eine Entscheidung machen'), { words: ['Entscheidung', 'machen'], sich: false, particle: null });
});
test('splitPhrase remembers sich and a trailing separable particle', () => {
  assert.deepEqual(splitPhrase('sich Mühe geben'), { words: ['Mühe', 'geben'], sich: true, particle: null });
  assert.deepEqual(splitPhrase('legt eine Pause ein'), { words: ['legt', 'Pause'], sich: false, particle: 'ein' });
});
test('splitPhrase rejects anything that is not exactly noun + verb', () => {
  assert.equal(splitPhrase('Entscheidung'), null);
  assert.equal(splitPhrase('eine wichtige Entscheidung treffen'), null);
  assert.equal(splitPhrase('a b c d e f'), null);
  assert.equal(splitPhrase('die das'), null);
});
test('pickVerbLemma never lets a particle verb stand for the bare verb', () => {
  const nimmt = [{ verb: 'nehmen', uses: 231 }, { verb: 'aufnehmen', uses: 59 }, { verb: 'abnehmen', uses: 14 }, { verb: 'sich nehmen', uses: 8 }];
  assert.equal(pickVerbLemma('nimmt', null, nimmt), 'nehmen');
  assert.equal(pickVerbLemma('nimmt', null, [{ verb: 'aufnehmen', uses: 300 }, { verb: 'nehmen', uses: 10 }]), 'nehmen');
});
test('pickVerbLemma uses a typed particle, attached or trailing', () => {
  const legt = [{ verb: 'legen', uses: 71 }, { verb: 'festlegen', uses: 39 }, { verb: 'einlegen', uses: 5 }];
  assert.equal(pickVerbLemma('legt', 'ein', legt), 'einlegen');
  assert.equal(pickVerbLemma('legt', 'ein', [{ verb: 'legen', uses: 71 }]), null);
  assert.equal(pickVerbLemma('aufnimmt', null, [{ verb: 'nehmen', uses: 10 }, { verb: 'aufnehmen', uses: 3 }]), 'aufnehmen');
  assert.equal(pickVerbLemma('aufgenommen', null, [{ verb: 'aufnehmen', uses: 427 }]), 'aufnehmen');
});
test('pickVerbLemma strips sich, prefers a typed lemma, and gives up on nothing', () => {
  assert.equal(pickVerbLemma('macht', null, [{ verb: 'machen', uses: 742 }, { verb: 'sich machen', uses: 41 }]), 'machen');
  assert.equal(pickVerbLemma('fällen', null, [{ verb: 'fällen', uses: 0 }]), 'fällen');
  assert.equal(pickVerbLemma('trefen', null, []), null);
});
```

- [ ] **Step 2: Run** `node --test backend/src/domain/collocationCheck.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Implement both functions.**
  - `splitPhrase`: whitespace split; 2–5 tokens else null; if ≥3 tokens and the last (lowercased) is a particle, pop it into `particle`; drop determiners; drop `sich` (case-insensitive) setting `sich`; exactly 2 left else null.
  - `pickVerbLemma`: sum `uses` per base (strip "sich "). Typed (lowercased) equal to a base → that base. A base B is *prefixed* with prefix P when another base D ≠ B has `B.endsWith(D)`, P = `B.slice(0, -D.length)`. With `particle`: only bases with P === particle (or B starting with particle when no D exists); none → null. Without: bases whose P the typed word starts with win if any; else only unprefixed bases. Most uses, ties alphabetical; empty → null.

- [ ] **Step 4: Run** the test file — Expected: PASS.

- [ ] **Step 5: Commit** `Add phrase splitting and verb lemma choice for the collocation check`.

### Task 2: Verdict rules (pure)

**Files:** Modify `backend/src/domain/collocationCheck.ts`, test file from Task 1. Modify `types/src/index.ts`.

**Interfaces:**
- Consumes: `phraseOf`, `phraseNounWord` from `verbNounPhrases.ts`.
- Produces in `@collocations/types`:
  ```ts
  export interface CheckPhrase { phrase: string; nounWord: string; verbWord: string }
  export type CheckVerdict = 'usual' | 'unusual' | 'noData';
  export type CollocationCheck =
    | { parsed: false }
    | { parsed: true; phrase: string; noun: string; verbTyped: string; verb: string | null;
        relation: 'obj'; verdict: CheckVerdict; matched: CheckPhrase | null; suggestions: CheckPhrase[] };
  ```
  (`matched` is structured, not the spec's plain string, so the card can colour noun and verb — ruling.)
- Produces in domain: `interface CheckPair { verb: string; noun: string; phraseNoun: string; score: number; subjectScore: number | null; verbObjectShare: number | null }`; `judge(verb: string | null, sich: boolean, pairs: CheckPair[]): { verdict: CheckVerdict; matched: CheckPhrase | null; suggestions: CheckPhrase[] }` with `pairs` best-first. `checkPhraseOf(pair: CheckPair): CheckPhrase` (`phraseOf('obj', …)`, `nounWord = phraseNounWord(phraseNoun)`, `verbWord` = verb without "sich ").

- [ ] **Step 1: Failing tests** (helper `pair(verb, score, extra?)` with `noun 'Entscheidung'`, `phraseNoun` default = noun):
  - unusual: `judge('machen', false, [treffen 900, fällen 500, begründen 300, revidieren 100])` → `verdict 'unusual'`, suggestion phrases `['Entscheidung treffen','Entscheidung fällen','Entscheidung begründen']`, `matched null`.
  - usual with higher-ranked: `judge('machen', false, [treiben, machen, betreiben])` (noun Sport) → `usual`, matched phrase `'Sport machen'`, suggestions `['Sport treiben']`.
  - usual rank 1 → `suggestions []`.
  - reflexive top-N: `judge('geben', false, [sich geben 897, haben 177])` (noun Mühe) → usual, matched `'sich Mühe geben'`, verbWord `'geben'`; and `judge('machen', false, [11 other pairs…, 'sich machen' at index 11])` → unusual.
  - sich typed: `judge('machen', true, [machen 50, sich machen 40])` → matched `'sich Sorge machen'` (noun Sorge); `judge('geben', true, [geben 50])` → unusual.
  - subject filter: pair `fallen 627` with `subjectScore 1987, verbObjectShare 0.15` is ignored (typed `fallen` → unusual, not in suggestions); `fahren 117` with `subjectScore 987, verbObjectShare 0.41` (noun Bus) is kept → usual.
  - `judge('treffen', false, [])` → `noData`; all pairs filtered → `noData`; `judge(null, false, [treffen])` → unusual.
- [ ] **Step 2: Run** — FAIL (`judge` not exported).
- [ ] **Step 3: Implement** `judge`, `checkPhraseOf`, the four constants (Global Constraints), and the types.
- [ ] **Step 4: Run** test file and `npm run typecheck` — PASS.
- [ ] **Step 5: Commit** `Add collocation check verdict rules`.

### Task 3: Store port, Postgres adapter, service

**Files:**
- Create: `backend/src/application/ports/in/CheckCollocation.ts`, `backend/src/application/ports/out/CollocationCheckStore.ts`, `backend/src/application/CheckCollocationService.ts`, `backend/src/adapters/postgres/PgCollocationCheckStore.ts`, `backend/src/adapters/postgres/headword.ts`, `backend/src/adapters/postgres/collocationCheck.dbtest.ts`, `database/migrations/017_add_lab_verb_surface_index.sql`
- Modify: `backend/src/adapters/postgres/PgCollocationStore.ts` (use `headword.ts`)

**Interfaces:**
- Consumes: Task 1–2 functions; `Headword`, `lookupCandidates`, `pageSide`.
- Produces:
  - `interface CheckCollocation { check(q: string): Promise<CollocationCheck> }`
  - `interface CollocationCheckStore { resolveHeadword(word: string): Promise<Headword | null>; findVerbCandidates(surface: string): Promise<VerbCandidate[]>; findObjectPairs(noun: string): Promise<CheckPair[]> }`
  - `class CheckCollocationService implements CheckCollocation { constructor(store: CollocationCheckStore) }`
  - `class PgCollocationCheckStore implements CollocationCheckStore { constructor(pool: Pool) }`
  - `resolveHeadword(pool: Pool, word: string): Promise<Headword | null>` in `headword.ts` (moved `HEADWORD_QUERY`, used by both adapters).

- [ ] **Step 1: Migration** `017_add_lab_verb_surface_index.sql`: `CREATE INDEX idx_lab_verb_pair_examples_verb_surface ON lab_verb_pair_examples (verb_surface);` (unindexed lookup measured 55 ms over 314k rows).
- [ ] **Step 2: Failing dbtests** through `CheckCollocationService` + `PgCollocationCheckStore` (pattern of `lookupCollocations.dbtest.ts`; seed words with `pos: 'NOUN'`/`'VERB'`):
  - "eine Entscheidung machen" → `parsed true, noun 'Entscheidung', verb 'machen', verdict 'unusual'`, suggestions best-first. (`machen` known through `labPairExample(..., { verb: 'machen', noun: 'Sport' })`.)
  - "Sport machen" with treiben > machen → usual, suggestions `['Sport treiben']`.
  - "nimmt ein Foto": examples give `nimmt` → nehmen 3 rows, aufnehmen 1 row; Foto has obj pair `aufnehmen` only → unusual, `verb 'nehmen'`.
  - "Macht eine Entscheidung" (both capitalised) and "eine entscheidung machen" (none) → noun `Entscheidung`.
  - "eine Dusche nehmen" with Dusche a NOUN word, no pairs → `noData`, `noun 'Dusche'`.
  - "Bus fahren": obj 117, nsubj 987, fahren's other pairs give object share > 0.4 → usual; "Entscheidung fallen" with fallen mostly nsubj → unusual.
  - "Hallo Welt" (no NOUN/verb) and "Entscheidung" → `{ parsed: false }`.
- [ ] **Step 3: Run** `npm run test:db -w backend` — FAIL (modules missing).
- [ ] **Step 4: Implement.**
  - Service: `splitPhrase`; noun/verb roles — exactly one token capitalised → it is the noun; otherwise the token whose lowercase form has no verb candidates is the noun (both/neither → not parsed). Noun form = first letter upper-cased. `resolveHeadword(form)` must give `pageSide(pos) === 'noun'`, else not parsed. Verb: `pickVerbLemma(verbToken.toLowerCase(), particle, await findVerbCandidates(verbToken.toLowerCase()))`. Pairs: first of `lookupCandidates(form, lemma?.text)` with object pairs; `noun` = that candidate, else `form`. `phrase` = whitespace-normalised `q`.
  - `findVerbCandidates`: `SELECT verb, count(*)::int AS uses FROM lab_verb_pair_examples WHERE verb_surface = $1 GROUP BY verb UNION ALL SELECT DISTINCT verb, 0 FROM lab_verb_pairs WHERE verb = $1 OR verb = 'sich ' || $1`.
  - `findObjectPairs`: all `relation='obj'` pairs for `noun = $1`, best-first (`score DESC, verb`), with `subjectScore` (correlated subquery on the nsubj row, same verb/noun, `prep=''`), and `verbObjectShare` computed **only when** `subjectScore > score` (else null): obj pair_freq / (obj + nsubj) pair_freq over all of that verb's rows.
- [ ] **Step 5: Run** dbtests and `npm test` — PASS. Then `EXPLAIN (ANALYZE, BUFFERS)` both queries on the dev DB for *Frage* and *nimmt*; record timings for the decision entry.
- [ ] **Step 6: Commit** `Add collocation check service and Postgres store`.

### Task 4: HTTP endpoint and wiring

**Files:** Create `backend/src/adapters/http/checkHandler.ts`, `checkHandler.test.ts`; modify `app.ts`, `backend/src/index.ts`.

**Interfaces:** `createCheckHandler(useCase: CheckCollocation)`; `createHttpApp({ lookupCollocations, searchWords, checkCollocation })`; route `GET /api/check`.

- [ ] **Step 1: Failing tests** (fake res as in `collocationsHandler.test.ts`): blank `q` (`' '`) and missing `q` → statuses `[400]`, use case never called; `q='Sport machen'` → `[200]` and the use case's result passed to `json`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**; 500 with `console.error` on throw, like `collocationsHandler`.
- [ ] **Step 4: Run** `npm test`, `npm run typecheck` — PASS.
- [ ] **Step 5: Commit** `Expose the collocation check at /api/check`.

### Task 5: Frontend data helpers

**Files:** Create `frontend/src/api/check.ts`, `frontend/src/lib/collocationCheck.ts`, `frontend/src/lib/collocationCheck.test.ts`.

**Interfaces:**
- `fetchCheck(baseUrl: string, q: string, signal?: AbortSignal): Promise<CollocationCheck>` — non-OK → `{ parsed: false }`.
- `isPhraseQuery(q: string): boolean` — two or more whitespace-separated words.
- `checkTarget(check: CollocationCheck): string | null` — `/wort/<enc noun>?pruefen=<enc phrase>` or null.
- `checkMatchesPage(check: CollocationCheck, word: string, lemma: string): boolean` — parsed and `noun` is `word` or `lemma`.
- `verdictLabel(v: CheckVerdict): string` — the three labels.
- `phraseParts(p: CheckPhrase): { text: string; kind: 'noun' | 'verb' | 'plain' }[]` — whole-token match of `nounWord` / `verbWord`, whitespace preserved.

- [ ] **Step 1: Failing tests:** `isPhraseQuery('Entscheidung') === false`, `isPhraseQuery(' eine Entscheidung machen ') === true`; `checkTarget({parsed:false}) === null`, `checkTarget(<Entscheidung check, phrase 'eine Entscheidung machen'>) === '/wort/Entscheidung?pruefen=eine%20Entscheidung%20machen'`; `checkMatchesPage` true for `('Entscheidungen','Entscheidung')`, false for noun `Frage` on page `Entscheidung`; labels; `phraseParts({phrase:'sich Mühe geben', nounWord:'Mühe', verbWord:'geben'})` → `[plain 'sich ', noun 'Mühe', plain ' ', verb 'geben']`.
- [ ] **Step 2: Run** `node --test frontend/src/lib/collocationCheck.test.ts` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `Add frontend helpers for the collocation check`.

### Task 6: Search box and check card

**Files:** Create `frontend/src/components/CollocationCheckCard.tsx`; modify `frontend/src/components/SearchBox.tsx`, `frontend/src/routes/Word.tsx`.

**Interfaces:** `<CollocationCheckCard word={string} lemma={string} showField={boolean} />` reads/writes `?pruefen=` with `useSearchParams`.

- [ ] **Step 1: SearchBox.** On submit: `isPhraseQuery` → `fetchCheck`; `checkTarget` non-null → navigate there; else (incl. a thrown fetch) navigate `/wort/<query>` as today.
- [ ] **Step 2: Card.** Mockup v1 layout (`check-mockup.html` screens 2–4) with Global Constraints copy: label pill, phrase (`<s>` when unusual; `matched` when usual; typed phrase otherwise) via `phraseParts` with noun/verb word-class colours, note, suggestions list (`→ ` prefix, serif, coloured via `phraseParts`), unusual footnote muted, field "Verb prüfen" pre-filled with `verbTyped`. Submit → `setSearchParams({ pruefen: \`${word} ${verb}\` })`. Fetch when `pruefen` changes, abort on change; show nothing on error or when `!checkMatchesPage`. Without `pruefen`: field only, when `showField`.
- [ ] **Step 3: Word.tsx.** On noun pages render the card between `PosLegend` and `VerbNounPairs`, `showField = pairs.some(p => p.relation === 'obj')`; also render it when `?pruefen=` is set even if `showField` is false (Keine Daten).
- [ ] **Step 4: Verify** `npm run build -w frontend`, `npm test`, `npm run typecheck` — PASS. Run locally: `docker-compose up -d --build`, then in a browser: *eine Entscheidung machen*, *Sport machen*, *eine Dusche nehmen*, the field on *Frage*, back button, a single-word search. Phone width 360 px.
- [ ] **Step 5: Commit** `Show the collocation check on noun pages and from the search box`.

### Task 7: Linguistic spot-check, tuning, decision #70

**Files:** Modify `docs/decisions.md` (entry #70 + index, "next: #71"); possibly the constants in `collocationCheck.ts`.

- [ ] **Step 1:** Run every spec spot-check phrase (spec "Verification" 2, plus the Why table) against `http://localhost:3000/api/check?q=…` with `docker-compose up -d --build` running `migrate`; record verdict + suggestions in a table.
- [ ] **Step 2:** Check the two spec bars: no typical learner error is "Üblich"; no "Nicht typisch" comes from our own filter (*Bus fahren*, *Tochter heiraten*). If a bar fails, change the rule/constant with a new unit test first (RED→GREEN), re-run.
- [ ] **Step 3:** Write #70: what, why, rules and constants, spot-check table, EXPLAIN timings from Task 3, known limitations (spec list). Amend nothing else.
- [ ] **Step 4:** `npm test`, `npm run test:db -w backend`, `npm run typecheck`, `npm run build -w frontend` — all PASS.
- [ ] **Step 5: Commit** `Log decision #70: verb-noun collocation check`.
