# Verb–noun phrases with written form and gender — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Object and subject pairs show the corpus's most common written noun phrase (*keine Ahnung haben*), and nouns in the lab block show their article (*die Entscheidung*).

**Architecture:** `collocation-lab`'s `colloc export` fills `phrase_noun` for all three relations and writes a third file, `lab_noun_genders.tsv`. This app loads it into a new table in the same transaction as the pairs, the Postgres adapter joins it onto each pair, and the domain turns it into chip text plus a muted article for the frontend.

**Tech Stack:** Python 3 + psycopg + pytest (lab); Node/TypeScript with `node --test`, Postgres 18, React/Vite (app).

**Spec:** `docs/superpowers/specs/2026-11-26-surface-chunks-design.md`

## Global Constraints

- Two repos: `~/Projekte/collocation-lab` (branch `backend-feature-surface-chunks`, branch off its `main`) and this repo (branch `backend-feature-surface-chunks`, already exists).
- Object phrases are never built from occurrences with `noun_case = 'Nom'`.
- Gender is emitted only with **≥ 5 uses and ≥ 90% share**, from occurrences with `noun_case = 'Nom'`, `noun_number = 'Sing'`, `det = 'def'`, `prep = ''`, `noun_upos = 'NOUN'`, article ∈ {`der`, `die`, `das`}.
- Manifest format: `pairs\t<n>\nexamples\t<n>\ngenders\t<n>\n`. The loader rejects a manifest without `genders` — no compatibility mode.
- Additive schema: new table `lab_noun_genders`, no change to `lab_verb_pairs`.
- Articles render in `text-muted-foreground`; nouns keep their word-class colour (#63).
- Lab tests need its DB: `docker compose up -d --wait db && .venv/bin/pytest` (in the lab repo). App DB tests need the dev Postgres running: `docker-compose up -d --build db migrate`.
- Commit messages imperative, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Passive subjects counted as objects** (#64): an obj pair whose most common form is nominative (*der Antrag … gestellt*) must still get its accusative/bare form. → Task 1 test `test_obj_phrase_noun_skips_nominative_occurrences`.
2. **Respelled nouns** (*Beamt → Beamte*): the gender row and the phrase must be keyed by the respelling, or the app's join misses. → Task 1 test `test_genders_are_keyed_by_the_respelled_noun`.
3. **A noun with no gender row** (*Ahnung*, *Leute*): page must render exactly as today, no stray space or "null". → Task 3 test `chipOf leaves the chip alone without an article` and Task 4 db test.
4. **Phrase noun differs from the lemma** (*Entscheidungen*): phrase highlighting must still mark the noun. → Task 3 test on `phraseNounWord`.
5. **Old export copied to prod** (two-line manifest): load must stop before touching live rows. → Task 2 test `parseManifest refuses a manifest without genders`.

---

### Task 1: Lab export — phrases for every relation, gender file, three-line manifest

Repo: `collocation-lab`.

**Files:**
- Modify: `src/colloc/export.py` (`PHRASE_NOUNS_SQL`, `export_pairs`, module docstring; new `NOUN_GENDERS_SQL`, `pick_article`, `GENDERS_FILE`, `GENDER_MIN_USES`, `GENDER_MIN_SHARE`)
- Test: `tests/test_export.py`

**Interfaces:**
- Produces (file contract for Task 2):
  - `lab_verb_pairs.tsv` column 5 `phrase_noun` = most common written noun phrase for **every** relation.
  - `lab_noun_genders.tsv`: `noun\tarticle\n`, no header, sorted by noun, only nouns that occur in the exported pairs (after respelling).
  - `lab_verb_pairs.manifest`: `pairs\t<n>\nexamples\t<n>\ngenders\t<n>\n`, written last.
- `pick_article(counts: Counter[str]) -> str | None`
- `export_pairs(...)` return type becomes `tuple[int, int, int]` (pairs, examples, genders); update the `cli.py` print to include genders.

- [ ] **Step 1: Write the failing tests** in `tests/test_export.py`, using the existing `add(...)` helper and `sample` style. The helper needs to set `noun_case`, `noun_number` and `det` too: add keyword args `noun_case: str = ""`, `noun_number: str = ""`, `det: str = "none"` to `add` and include them in its `UPDATE`.

```python
def test_obj_phrase_noun_skips_nominative_occurrences(conn, tmp_path):
    # 2× "der Antrag" (passive subject, Nom) vs 1× "einen Antrag" (Acc): the Acc form wins.
    ...
    assert antrag_row[4] == "einen Antrag"

def test_obj_phrase_noun_is_the_most_frequent_written_form(conn, tmp_path):
    # 2× "keine Ahnung" (Acc), 1× "eine Ahnung" (Acc)
    assert row[4] == "keine Ahnung"

def test_nsubj_phrase_noun_is_the_most_frequent_written_form(conn, tmp_path):
    # 2× "die Veranstaltung" (Nom)
    assert row[4] == "die Veranstaltung"

def test_pick_article():
    assert pick_article(Counter({"die": 5})) == "die"
    assert pick_article(Counter({"die": 4})) is None                     # under 5 uses
    assert pick_article(Counter({"der": 9, "das": 1})) == "der"          # exactly 90%
    assert pick_article(Counter({"der": 8, "das": 2})) is None           # 80%
    assert pick_article(Counter()) is None

def test_writes_genders_for_exported_nouns_only(conn, tmp_path):
    # 5× Nom Sing def "die Kritik" across any relation; a noun not in any exported pair gets no row
    assert rows(tmp_path / "lab_noun_genders.tsv") == [["Kritik", "die"]]

def test_genders_are_keyed_by_the_respelled_noun(conn, tmp_path):
    # lemma "Beamt", written "der Beamte" 5× Nom Sing def -> row ["Beamte", "der"]

def test_writes_a_manifest_with_all_three_line_counts_last(conn, sample, tmp_path):
    # replaces test_writes_a_manifest_with_both_line_counts_last
    assert manifest == f"pairs\t{p}\nexamples\t{e}\ngenders\t{g}\n"
```

Update `test_writes_both_files_sorted_without_header` for the new 3-tuple return.

- [ ] **Step 2: Run to verify they fail**

Run: `.venv/bin/pytest tests/test_export.py -v`
Expected: the new tests FAIL (`ImportError: pick_article` / wrong `phrase_noun` / missing file).

- [ ] **Step 3: Implement**
  - `PHRASE_NOUNS_SQL`: key by `(relation, verb, prep, noun)`, drop `relation = 'obl'`, add `AND (relation <> 'obj' OR noun_case <> 'Nom')`. Keep `noun_upos = 'NOUN'` and the `uses DESC, np_surface` tie-break.
  - In `export_pairs`, look up `phrase_nouns[(pair.relation, pair.verb, pair.prep, pair.noun)]` for every relation, falling back to `exported_pair.noun`.
  - `NOUN_GENDERS_SQL`: `SELECT noun, split_part(np_surface, ' ', 1), count(*)` with the Global Constraints filter, `noun = ANY(%s)` over the raw (pre-respelling) nouns of the exported pairs, grouped by noun and article.
  - `GENDER_MIN_USES = 5`, `GENDER_MIN_SHARE = 0.9`, next to `FREE_PHRASE_*`, comment citing the spec.
  - `pick_article`: the top article if its count ≥ `GENDER_MIN_USES` and ≥ `GENDER_MIN_SHARE` × total; else `None`. Ties → `None`.
  - Merge counts of raw nouns that respell to the same noun before picking. Write `GENDERS_FILE = "lab_noun_genders.tsv"` via `.tmp` + rename like the other two, then the three-line manifest.
  - Docstring: `phrase_noun` is the most common written noun phrase for every relation (obj without nominatives); describe the third file.

- [ ] **Step 4: Run the whole lab suite**

Run: `.venv/bin/pytest`
Expected: all PASS.

- [ ] **Step 5: Export the real dataset and spot-check**

Run: `.venv/bin/colloc export --dataset news-wiki-web-3M --out ../german-collocations/data/` (the app's `./data` is bind-mounted at `/data` for `load-lab-verb-pairs`).
Expected: prints three counts; `grep -P '^(Entscheidung|Antrag|Tor|Teil|Ahnung)\t' lab_noun_genders.tsv` gives `Antrag der`, `Entscheidung die`, `Teil der`, `Tor das`, and no `Ahnung`.

- [ ] **Step 6: Commit** (lab repo)

```bash
git add src/colloc/export.py src/colloc/cli.py tests/test_export.py
git commit -m "Export written noun phrases for every relation and a noun gender file"
```

---

### Task 2: App database — `lab_noun_genders` table and loader

Repo: this one.

**Files:**
- Create: `database/migrations/016_add_lab_noun_genders.sql`
- Modify: `database/src/labVerbPairsTsv.ts` (`LabVerbPairsManifest`, `parseManifest`, `assertMatchesManifest`; new `LabNounGenderRow`, `parseGenderLine`)
- Modify: `database/scripts/load-lab-verb-pairs.ts`
- Modify: `backend/src/adapters/postgres/testDatabase.ts` (seeder `labNounGender`)
- Test: `database/src/labVerbPairsTsv.test.ts`

**Interfaces:**
- Consumes: Task 1's file contract.
- Produces:
  - Table `lab_noun_genders(noun text PRIMARY KEY, article text NOT NULL CHECK (article IN ('der','die','das')))`, header comment citing the spec and #69.
  - `interface LabVerbPairsManifest { pairs: number; examples: number; genders: number }`
  - `parseGenderLine(line: string): LabNounGenderRow | null` with `LabNounGenderRow { noun: string; article: 'der' | 'die' | 'das' }`
  - `assertMatchesManifest(manifest, pairLines: number, exampleLines: number, genderLines: number): void`
  - Seeder: `labNounGender(noun: string, article: 'der' | 'die' | 'das'): Promise<void>`

- [ ] **Step 1: Write the failing tests** in `database/src/labVerbPairsTsv.test.ts`

```ts
test('parses a gender line', () => {
  assert.deepEqual(parseGenderLine('Entscheidung\tdie'), { noun: 'Entscheidung', article: 'die' });
  assert.equal(parseGenderLine('Entscheidung\tden'), null);
  assert.equal(parseGenderLine('Entscheidung'), null);
});

test('parseManifest refuses a manifest without genders', () => {
  assert.deepEqual(parseManifest('pairs\t3\nexamples\t5\ngenders\t2\n'), { pairs: 3, examples: 5, genders: 2 });
  assert.equal(parseManifest('pairs\t122454\nexamples\t364370\n'), null);
});

// extend 'refuses files whose line counts differ from the manifest':
assert.throws(() => assertMatchesManifest(manifest, 122454, 364370, 0), /genders.*0.*/);
```

Update the existing manifest tests to the three-field shape.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test database/src/labVerbPairsTsv.test.ts`
Expected: FAIL (`parseGenderLine` not exported; manifest shape mismatch).

- [ ] **Step 3: Implement** the parser/manifest changes, the migration, and the loader:
  - Loader: `DELETE FROM lab_noun_genders` alongside the other two deletes; stream `lab_noun_genders.tsv` with `parseGenderLine` into it via `insertBatch`; pass its line count to `assertMatchesManifest`; add its malformed count to `assertLoadable`'s; `VACUUM ANALYZE lab_noun_genders`. An empty genders file is fine.
  - The "no readable manifest" error message: say the manifest needs three lines and to re-export with a lab version that writes `lab_noun_genders.tsv`.

- [ ] **Step 4: Run tests, typecheck, and a real load**

Run: `npm test && npm run typecheck`
Then: `docker-compose up -d --build db migrate && docker-compose --profile manual run --build load-lab-verb-pairs`.
Expected: tests PASS; loader prints a genders count matching Task 1 Step 5; `SELECT count(*) FROM lab_noun_genders` equals it.

- [ ] **Step 5: Commit**

```bash
git add database/ backend/src/adapters/postgres/testDatabase.ts
git commit -m "Load lab noun genders alongside the verb-noun pairs"
```

---

### Task 3: Domain — phrase, chip and article shapes

**Files:**
- Modify: `backend/src/domain/verbNounPhrases.ts` (`phraseOf`, `chipOf`, new `phraseNounWord`, header comment)
- Modify: `backend/src/domain/collocations.ts` (`LabVerbPair`, `toVerbNounPairs`)
- Modify: `types/src/index.ts`
- Test: `backend/src/domain/verbNounPhrases.test.ts`, `backend/src/application/LookupCollocationsService.test.ts`

**Interfaces:**
- `LabVerbPair` gains `nounArticle: string | null`.
- `chipOf(side, relation, verb, phraseNoun, noun, nounArticle: string | null): string` — on the verb side, obj/nsubj chips get the article before the noun: `die Frage`, `sich die Frage`, `die Information (sich)`. obl chips and noun-side chips unchanged.
- `phraseOf(relation, verb, phraseNoun, noun)`: nsubj becomes `${phraseNoun} … ${verb}`.
- `phraseNounWord(phraseNoun: string): string` — last space-separated word.
- API (`types/src/index.ts`):
  - `VerbNounPair` gains `chipArticle: string | null` (the article inside `chip`, for muting; null when none) and `phraseNoun: string` (the written noun word from `phraseNounWord`, for highlighting).
  - `VerbNounPairs` gains `article: string | null` — the headword's article on a noun page (taken from the first pair's `nounArticle`; null on verb pages or with no pairs).

- [ ] **Step 1: Write the failing tests** in `verbNounPhrases.test.ts`

```ts
test('chipOf puts the article before the noun on verb-page chips', () => {
  assert.equal(chipOf('verb', 'obj', 'stellen', 'Fragen', 'Frage', 'die'), 'die Frage');
  assert.equal(chipOf('verb', 'obj', 'sich stellen', 'Fragen', 'Frage', 'die'), 'sich die Frage');
  assert.equal(chipOf('verb', 'nsubj', 'sich richten', 'Information', 'Information', 'die'), 'die Information (sich)');
  assert.equal(chipOf('verb', 'obl', 'üben', 'in Geduld', 'Geduld', 'die'), 'in Geduld');
});

test('chipOf leaves the chip alone without an article', () => {
  assert.equal(chipOf('verb', 'obj', 'haben', 'keine Ahnung', 'Ahnung', null), 'Ahnung');
});

test('phraseOf uses the written noun phrase for subjects', () => {
  assert.equal(phraseOf('nsubj', 'stattfinden', 'die Veranstaltung', 'Veranstaltung'), 'die Veranstaltung … stattfinden');
  assert.equal(phraseOf('obj', 'haben', 'keine Ahnung', 'Ahnung'), 'keine Ahnung haben');
});

test('phraseNounWord is the written noun', () => {
  assert.equal(phraseNounWord('Entscheidungen'), 'Entscheidungen');
  assert.equal(phraseNounWord('in der Kritik'), 'Kritik');
});
```

Update existing `chipOf` calls with a trailing `null`, and the nsubj expectation in 'phraseOf writes the pair…' if it uses a bare noun as `phraseNoun` (it stays `Kritik … sich richten` when `phraseNoun = 'Kritik'`). In `LookupCollocationsService.test.ts`, add `nounArticle: 'die'` to the fixture pair and assert `result.verbNounPairs.article === 'die'` on the noun page.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test backend/src/domain/verbNounPhrases.test.ts backend/src/application/LookupCollocationsService.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** the signatures above; replace the "Lemmas only" header comment with one citing #69. `toVerbNounPairs` sets `chipArticle` = `nounArticle` on verb-side obj/nsubj pairs, else null. Set `VerbNounPairs.article` where `LookupCollocationsService` builds `verbNounPairs`.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/domain types/src/index.ts backend/src/application
git commit -m "Build verb-noun chips and phrases from written forms and noun gender"
```

---

### Task 4: Postgres adapter — join the article

**Files:**
- Modify: `backend/src/adapters/postgres/PgCollocationStore.ts` (`buildLabVerbPairsQuery`, `LabVerbPairRow`, row folding)
- Test: `backend/src/adapters/postgres/lookupCollocations.dbtest.ts`

**Interfaces:**
- Consumes: `lab_noun_genders` (Task 2), `LabVerbPair.nounArticle` (Task 3), seeder `labNounGender` (Task 2).

- [ ] **Step 1: Write the failing db tests**

```ts
test("a verb page shows each noun's article on its chip (#69)", async () => {
  await seed.word("stellen", { pos: "VERB" });
  await seed.labPair("stellen", "Frage", { phraseNoun: "Fragen", score: 20 });
  await seed.labPair("stellen", "Ahnung", { score: 10 });
  await seed.labNounGender("Frage", "die");
  const pairs = (await lookup.lookup("stellen"))!.verbNounPairs!;
  assert.deepEqual(pairs.pairs.map((p) => [p.chip, p.chipArticle, p.phrase]),
    [["die Frage", "die", "Fragen stellen"], ["Ahnung", null, "Ahnung stellen"]]);
});

test("a noun page carries the headword's article (#69)", async () => {
  await seed.word("Entscheidung", { pos: "NOUN" });
  await seed.labPair("treffen", "Entscheidung", { phraseNoun: "Entscheidungen" });
  await seed.labNounGender("Entscheidung", "die");
  const pairs = (await lookup.lookup("Entscheidung"))!.verbNounPairs!;
  assert.equal(pairs.article, "die");
  assert.equal(pairs.pairs[0].phraseNoun, "Entscheidungen");
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test:db -w backend`
Expected: the two new tests FAIL.

- [ ] **Step 3: Implement** — `LEFT JOIN lab_noun_genders g ON g.noun = r.noun` in the outer select, `g.article AS "nounArticle"`; add `nounArticle` to `LabVerbPairRow` and carry it into `LabVerbPair`.

- [ ] **Step 4: Run db tests, then measure**

Run: `npm run test:db -w backend` → PASS.
Then in the dev DB (`docker exec -it collocations-db psql ...`), `EXPLAIN (ANALYZE, BUFFERS)` the noun-side query for `Entscheidung` and the verb-side for `stellen`. Expected: an index scan on `lab_noun_genders_pkey`, total time within ~1 ms of the query without the join. Record both numbers for the decision entry.

- [ ] **Step 5: Commit**

```bash
git add backend/src/adapters/postgres
git commit -m "Join noun gender onto lab verb-noun pairs"
```

---

### Task 5: Frontend — muted article, header article, phrase highlighting

**Files:**
- Modify: `frontend/src/components/VerbNounPairs.tsx`
- Modify: `frontend/src/routes/Word.tsx` (header around line 111)
- Create: `frontend/src/lib/chipParts.ts`; Test: `frontend/src/lib/chipParts.test.ts`

**Interfaces:**
- Consumes: `VerbNounPair.chipArticle`, `VerbNounPair.phraseNoun`, `VerbNounPairs.article` (Task 3).
- `chipParts(chip: string, article: string | null): { text: string; muted: boolean }[]` — splits at the first whole-word occurrence of `article`.

- [ ] **Step 1: Write the failing test** `frontend/src/lib/chipParts.test.ts`

```ts
test('mutes the article inside the chip', () => {
  assert.deepEqual(chipParts('sich die Frage', 'die'),
    [{ text: 'sich ', muted: false }, { text: 'die', muted: true }, { text: ' Frage', muted: false }]);
  assert.deepEqual(chipParts('die Frage', 'die'), [{ text: 'die', muted: true }, { text: ' Frage', muted: false }]);
  assert.deepEqual(chipParts('Ahnung', null), [{ text: 'Ahnung', muted: false }]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test frontend/src/lib/chipParts.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**
  - `chipParts` as specified.
  - `VerbNounPairs.tsx`: render chip via `chipParts`, muted parts in `text-muted-foreground` (inside the pressed chip, use the chip's own foreground at reduced opacity so it stays readable on `bg-foreground`). In `OpenPair`, highlight with `pair.phraseNoun` instead of the lemma for the noun side of the phrase (searched word on noun pages, partner on verb pages); example sentences unchanged.
  - `Word.tsx` header: when `verbNounPairs?.side === 'noun' && verbNounPairs.article`, render the article muted before the word, at the same size.

- [ ] **Step 4: Run frontend checks and look at it**

Run: `npm test && npm run lint -w frontend && npm run build -w frontend`, then `docker-compose up -d --build` and open `http://localhost:5173` for *Entscheidung*, *stellen*, *Ahnung*.
Expected: header *die Entscheidung* with grey *die*; phrase *Entscheidungen treffen* with *Entscheidungen* highlighted; chips *die Frage*, *der Antrag*; *Ahnung* page header with no article; light and dark mode both readable.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "Show noun articles muted and highlight the written noun in phrases"
```

---

### Task 6: Linguistic spot-check and decision #69

**Files:**
- Modify: `docs/decisions.md` (new entry #69 at the end, index line, "next: #70")

- [ ] **Step 1: Spot-check 20 headwords** against the locally loaded data, before (from `main`'s data, or the spec's table) and after: *Entscheidung, Frage, Antrag, Ahnung, Meinung, Rolle, Kritik, Tor, Problem, Mühe, Teil, See, Leute, Veranstaltung, Maßnahme, Wert, Gespräch, stellen, treffen, haben*.
Expected: no nominative object phrase anywhere; every shown article correct; *Ahnung* and *Leute* show none; *Teil* and *See* show *der*.

- [ ] **Step 2: Measure coverage** in the dev DB: share of distinct nouns in `lab_verb_pairs` that have a `lab_noun_genders` row, and per relation the count of pairs whose `phrase_noun <> noun`.

- [ ] **Step 3: Write decision #69**: what changed, option C and why (link the spec), the thresholds, the homonym trade-off (*Teil*, *See*), coverage numbers, the EXPLAIN numbers from Task 4, the spot-check result, and that it amends #60's "lemmas on chips". Add the index line.

- [ ] **Step 4: Commit**

```bash
git add docs/decisions.md
git commit -m "Log decision #69: verb-noun phrases with written form and gender"
```

Production deploy (copy the four export files, build with `--profile manual`, migrate, load, `up -d`, check container start times) is a separate step the user triggers after merge; append its follow-up to #69 then.
