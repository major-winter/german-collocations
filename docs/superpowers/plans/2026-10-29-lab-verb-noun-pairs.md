# Lab verb–noun pairs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve collocation-lab's LL-ranked verb–noun pairs (obj, obl, nsubj) and their example sentences on the live app's noun and verb pages, replacing the spaCy `verb_arguments` data.

**Architecture:** The lab gets a `colloc export` command. It writes two TSV files. A new app loader puts those files into two text-keyed tables. The backend reads those tables for a searched noun or verb and returns them as a new `verbNounPairs` field, and the frontend renders it as layout C: chips per group, with examples on tap. The old `verb_arguments` path is removed last, once nothing reads it.

**Tech Stack:**
- Lab: Python 3.12, psycopg 3, pytest against Postgres at `localhost:5433`.
- App: Node 22+/24 with built-in type stripping, Express 5, `pg`, React/Vite/Tailwind, Postgres 18, Docker Compose.
- App tests: `node --test`, built in, with no new dependency.

**Spec:** `docs/superpowers/specs/2026-10-29-lab-verb-noun-pairs-design.md` (german-collocations)

## Global Constraints

- Only pairs with `pair_freq >= 5` and a positive LL score (the LL is signed; negative means rarer than chance). Ranked by LL. The dataset is `news-wiki-web-3M`.
- Up to 10 pairs per group and up to 3 examples per pair. Groups are shown in the order obj, obl, nsubj, and empty groups are hidden.
- Chips and headings use lemmas. There are no conjugated forms and no articles.
- Headings, noun side (lemma L): `L + Verb`, `Präposition + L + Verb`, `L als Subjekt`.
- Headings, verb side (lemma L): `Substantiv + L`, `Präposition + Substantiv + L`, `Substantiv als Subjekt`.
- The searched word's `word_dominant_pos` decides the page:
  - NOUN: lab pairs replace the "Verben" section.
  - VERB or AUX: lab pairs replace the "Substantive" section.
  - Anything else: no change.
- On a NOUN or VERB page with no lab pairs, that section is absent. There is no fallback to `lemma_collocations` or `verb_arguments`.
- Lemma matching: the searched word is tried first, then the dominant lemma's text. Only the side the part of speech names is queried. A verb X also matches lab verb `sich X`.
- A refresh never shows half-loaded data, and an empty or broken export never empties the live tables.
- Production limits: 1 GB RAM, 1 CPU, 25 GB disk. Every compose change goes into **both** `compose.yml` and `compose.prod.yml`.
- Names are descriptive, never single letters (`index`, not `i`), in both repos. Commit messages are imperative. `import type` is used for contracts files.
- No production deploy and no SSH without the user confirming at that time. Nothing in this plan touches the Linode VM.

## Review Focus

1. **An export file is empty or truncated.** The loader must refuse to commit, and the site must keep the old pairs. Test: Task 3, `refuses an export with no pairs`.
2. **A sentence contains a tab or newline.** A broken TSV row would shift columns. The exporter replaces both with a space. Test: Task 1, `test_tabs_and_newlines_in_sentences_become_spaces`.
3. **The searched word differs from the lab lemma.** For example *Kritiken* or *übt*: the fallback to the dominant lemma must find pairs. A word whose own form *is* a lab lemma must win over a wrong app lemma. Test: Task 4, `prefers the searched word over the dominant lemma`.
4. **Reflexive and obl phrases.** "sich Mühe geben" should not read "Mühe sich geben". An obl chip on the noun page should read "in der … stehen". Test: Task 4, phrase/chip cases.
5. **Noun page that has lab pairs but no other collocations.** The page must not also print "Keine Ergebnisse.". Test: Task 5, `hasAnyResults`.

---

## Setup

- **Lab.** In `~/Projekte/collocation-lab`, branch `export-for-app` from `clean-web-and-spelling` (1099234, not yet merged). Merging either branch into main is a finish step for the user to approve.
- **App.** In `~/Projekte/german-collocations`, branch `lab-verb-noun-pairs` from `main` (e3bc03d).
- **Test commands.** Lab: `.venv/bin/pytest -q` (needs `docker compose up -d --wait db` in the lab). App: `node --test` from the repo root (Task 3 adds the root `test` script).

---

### Task 1: `colloc export` (lab)

**Files:**
- Create: `src/colloc/export.py`
- Modify: `src/colloc/examples.py` (extract `merge_choices`), `src/colloc/cli.py`, `README.md` (pipeline step)
- Test: `tests/test_export.py`, plus one case in `tests/test_examples.py`

**Interfaces:**
- Produces two tab-separated UTF-8 files with no header, one row per line, sorted by (relation, verb, prep, noun[, rank]):
  - `lab_verb_pairs.tsv`: `relation, verb, prep, noun, phrase_noun, score, pair_freq`. The score is formatted `f"{score:.3f}"`. `phrase_noun` is the pair's most frequent `np_surface` for `obl` (ties go to the alphabetically first), and the noun lemma for `obj` and `nsubj`.
  - `lab_verb_pair_examples.tsv`: `relation, verb, prep, noun, rank, sentence, verb_surface, noun_surface`. Rank is 1–3.
- `export_pairs(conn, dataset_name: str, out_dir: Path, *, min_freq: int = 5) -> tuple[int, int]` returns (pairs written, examples written).
- `merge_choices(pinned: list[str], removed: set[str], stored: list[str], limit: int) -> list[str]` contains the rule that `chosen_examples` now delegates to.

Rules the tests pin:
- The scores come from the dataset's **latest** run (highest `run_id`) with `scorer = 'll'` for each relation. If a relation has no such run, the export raises `ValueError` naming that relation.
- Only pairs with `pair_freq >= min_freq` and score > 0 are written.
- Examples are `merge_choices` over all of a pair's stored `example_sentences` (ordered by rank), with pins first and removed sentences dropped, limited to 3. Each example's surfaces come from an occurrence of that pair whose sentence text equals the example (any of the dataset's parses). An example with no matching occurrence is skipped, and the next one does **not** take its rank.
- Read in bulk: one query each for pairs+scores, stored examples, choices and surfaces. Don't make per-pair round trips, because 134k pairs would take minutes.
- Tabs, carriage returns and newlines in any text field become a single space.

- [ ] **Step 1: Write the failing tests.** In `tests/test_export.py`, use `tests.helpers.Sample`. Add sentences for `KRITIK` (obj üben/Kritik) and an obl pair `PairKey("obl", "stehen", "in", "Kritik")` with `np_surface` "in der Kritik" (extend `add_sentence` with an optional `np_surface` mapping if needed). Build, run `run_ranker(..., "ll", min_freq=1)` per relation, and `select_examples(..., min_freq=1)`. Tests:
  - `test_writes_both_files_sorted_without_header`: line 1 of `lab_verb_pairs.tsv` starts with `"obj\tüben\t\tKritik\tKritik\t"`. The return value equals the line counts.
  - `test_obl_phrase_noun_is_the_most_frequent_written_form`: two sentences "in der Kritik", one "in die Kritik". The obl row has `phrase_noun == "in der Kritik"`.
  - `test_negative_and_rare_pairs_are_left_out`: a pair below `min_freq` and a pair with score ≤ 0 (insert directly into `scores` for the latest run) don't appear.
  - `test_uses_the_latest_ll_run`: two ll runs for obj, with the later one's score set to 999.0 by UPDATE. The row has `999.000`.
  - `test_missing_ll_run_raises`: no nsubj run → `pytest.raises(ValueError, match="nsubj")`.
  - `test_examples_follow_hand_choices_with_surfaces`: pin a sentence and remove the rank-1 automatic one. Rows are rank 1 = pinned, then the next automatic one, each with `verb_surface`/`noun_surface` as stored in `occurrences`.
  - `test_tabs_and_newlines_in_sentences_become_spaces`: a sentence `"Die Kritik\tübte er.\nJa."` is exported as `"Die Kritik übte er. Ja."`.
- Also add `test_merge_choices_puts_pins_first_and_drops_removed` to `tests/test_examples.py`: `merge_choices(["P"], {"A"}, ["A", "B", "P", "C"], 3) == ["P", "B", "C"]`.
- [ ] **Step 2: Run them.** `.venv/bin/pytest tests/test_export.py tests/test_examples.py -q`. Expected: FAIL (ImportError `colloc.export`, `merge_choices`).
- [ ] **Step 3: Implement.** Write `merge_choices` and make `chosen_examples` use it. Write `export_pairs` in `src/colloc/export.py`, with a module docstring saying what the files are for and that the app's loader is their only reader. Add the CLI subcommand `export` (`--dataset` required, `--out` Path required, `--min-freq` default 5). It prints `exported {pairs:,} pairs and {examples:,} examples to {out}`.
- [ ] **Step 4: Run the full suite.** `.venv/bin/pytest -q`. Expected: all pass.
- [ ] **Step 5: Real run.** `.venv/bin/colloc export --dataset news-wiki-web-3M --out /tmp/claude-export` (use the scratchpad). Expected: roughly 110–135k pairs (fewer than 134k, since negative LL is dropped) and about 3× that in examples. Spot-check with `grep -P '^obj\tüben\t\tKritik\t' lab_verb_pairs.tsv`. Note the file sizes for decision #60.
- [ ] **Step 6: Commit.** `git commit -m "Add colloc export: LL pairs and chosen examples as TSV for the app"`.

---

### Task 2: Migration 014, the lab pair tables (app)

**Files:**
- Create: `database/migrations/014_add_lab_verb_pairs.sql`

**Interfaces:**
- Produces:
  - `lab_verb_pairs(relation text NOT NULL CHECK (relation IN ('obj','obl','nsubj')), verb text NOT NULL, prep text NOT NULL, noun text NOT NULL, phrase_noun text NOT NULL, score real NOT NULL, pair_freq integer NOT NULL, PRIMARY KEY (relation, verb, prep, noun))`
  - indexes `idx_lab_verb_pairs_noun (noun)` and `idx_lab_verb_pairs_verb (verb)`
  - `lab_verb_pair_examples(relation, verb, prep, noun, rank smallint, sentence text, verb_surface text, noun_surface text, PRIMARY KEY (relation, verb, prep, noun, rank))`, all NOT NULL, with no FK (the loader replaces both tables together)

The header comment follows the style of 010/011: what the table holds and where it comes from (`colloc export`, decision #60). It also says why it's keyed by lemma text: the app's `lemmas` has broken lemmas, and the lab's are the authority. `verb_arguments` is **not** dropped here, because the backend still reads it until Task 4.

- [ ] **Step 1:** Write the migration.
- [ ] **Step 2:** Apply it locally: `docker-compose run --build --rm migrate`. Expected: `014_add_lab_verb_pairs.sql` is applied. A re-run applies nothing.
- [ ] **Step 3: Commit.** `git commit -m "Add lab_verb_pairs tables for collocation-lab data (decision #60)"`.

---

### Task 3: Loader `load-lab-verb-pairs` (app)

**Files:**
- Create: `database/src/labVerbPairsTsv.ts` (pure parsing), `database/src/labVerbPairsTsv.test.ts`, `database/scripts/load-lab-verb-pairs.ts`
- Modify: `compose.yml`, `compose.prod.yml` (service `load-lab-verb-pairs`, a copy of the `load-verb-arguments` block with `command: ['node', 'scripts/load-lab-verb-pairs.ts']`), root `package.json` (`"test": "node --test"`)

**Interfaces:**
- Consumes: Task 1's two file formats and Task 2's tables.
- Produces:
  - `parsePairLine(line: string): LabVerbPairRow | null`
  - `parseExampleLine(line: string): LabVerbPairExampleRow | null`
  - the types `LabVerbPairRow { relation; verb; prep; noun; phraseNoun; score: number; pairFreq: number }` and `LabVerbPairExampleRow { relation; verb; prep; noun; rank: number; sentence; verbSurface; nounSurface }`
  - `null` means the line is malformed: wrong field count, an unknown relation, or a non-numeric score, freq or rank. An empty `prep` is valid.

Loader behaviour:
- It runs in one transaction: `DELETE FROM lab_verb_pair_examples; DELETE FROM lab_verb_pairs;`, then batched inserts in the style of `load-verb-arguments.ts` (`BATCH_SIZE = 1000`), then `COMMIT`, then `VACUUM ANALYZE` on both tables.
- DELETE rather than TRUNCATE keeps readers on the old rows until commit, without taking a lock.
- An example whose pair isn't in the pairs file is skipped and counted.
- If no valid pair rows are found, or more than 1% of lines are malformed, it throws before `COMMIT` and rolls back.
- It logs the counts loaded, skipped and malformed.
- It reads `lab_verb_pairs.tsv` and `lab_verb_pair_examples.tsv` from `DATA_DIR` (default `/data`).

- [ ] **Step 1: Write the failing tests** (`node:test` + `node:assert/strict`):
  - `parses a pair line`: `"obl\tstehen\tin\tKritik\tin der Kritik\t812.400\t153"` gives `{ relation: 'obl', verb: 'stehen', prep: 'in', noun: 'Kritik', phraseNoun: 'in der Kritik', score: 812.4, pairFreq: 153 }`.
  - `keeps an empty preposition`: an obj line with `prep: ''`.
  - `rejects malformed pair lines`: 6 fields, relation `iobj`, score `abc` → `null`.
  - `parses an example line`: rank `2` is the number 2, and the surfaces are kept as written.
  - `refuses an export with no pairs`: test the exported `assertLoadable(pairCount: number, malformedCount: number): void`, which throws on `(0, 0)` and on `(1000, 11)`, and passes on `(1000, 10)`.
- [ ] **Step 2: Run them.** `node --test database/src/labVerbPairsTsv.test.ts`. Expected: FAIL (cannot find the module).
- [ ] **Step 3: Implement** the parser module, then the loader script.
- [ ] **Step 4: Run them.** `node --test`. Expected: all pass.
- [ ] **Step 5: Real load.** Copy Task 1's two files into the app's `data/`, then run `docker-compose --profile manual build load-lab-verb-pairs && docker-compose run --rm load-lab-verb-pairs`. Expected: the logged counts match Task 1's export with 0 malformed. `SELECT pg_size_pretty(pg_total_relation_size('lab_verb_pairs') + pg_total_relation_size('lab_verb_pair_examples'))` should be under 100 MB; note it for #60. Then run the loader a second time to check that a reload gives the same counts. Then point `DATA_DIR` at an empty directory holding 0-byte files with those names: the loader exits non-zero and the row counts are unchanged.
- [ ] **Step 6: Commit.** `git commit -m "Add load-lab-verb-pairs loader for colloc export files"`.

---

### Task 4: Backend serves `verbNounPairs` (app)

**Files:**
- Create: `backend/src/services/verbNounPhrases.ts`, `backend/src/services/verbNounPhrases.test.ts`
- Modify: `types/src/index.ts`, `backend/src/contracts/CollocationRepository.ts`, `backend/src/contracts/CollocationService.ts`, `backend/src/services/CollocationService.ts`, `backend/src/repositories/CollocationRepository.ts`

**Interfaces:**
- Produces, in `types/src/index.ts`:
  ```ts
  export type VerbNounRelation = 'obj' | 'obl' | 'nsubj';
  export interface VerbNounPair {
    relation: VerbNounRelation;
    partner: string;      // the other side's lemma
    chip: string;         // short label on the chip
    phrase: string;       // shown when the chip is open
    score: number;
    frequency: number;
    examples: CollocationExample[];
  }
  export interface VerbNounPairs {
    side: 'noun' | 'verb'; // the searched word's side
    lemma: string;         // the lab lemma that matched, or the dominant lemma text when none did
    pairs: VerbNounPair[]; // ≤ 10 per relation, each relation best-first
  }
  // CollocationResponse gains: verbNounPairs: VerbNounPairs | null;  (null: not a noun/verb page)
  ```
- In `verbNounPhrases.ts`:
  - `pageSide(pos: string | null): 'noun' | 'verb' | null` maps NOUN to noun and VERB or AUX to verb.
  - `phraseOf(relation, verb, phraseNoun, noun): string`
  - `chipOf(side, relation, verb, phraseNoun, noun): string`
  - `lookupCandidates(searchedWord: string, lemmaText: string | null): string[]` returns the word first, then the lemma, de-duplicated.
- `CollocationLookup` and `CollocationResult` gain `verbNounPairs: VerbNounPairs | null`.

Phrase and chip rules (`np` = `phraseNoun`; for obj/nsubj `np` equals the noun):

| relation | phrase | chip, noun side | chip, verb side |
|---|---|---|---|
| obj | `np verb`, but `sich np rest` when verb is `sich rest` | verb | noun |
| obl | same as obj, e.g. `in der Kritik stehen`, `sich in Geduld üben` | `np` with its last word replaced by `…`, then verb: `in der … stehen` | `np`: `in Geduld` |
| nsubj | `noun … verb`: `Kritik … sich richten` | verb | noun |

Repository changes:
- `findByWord` additionally reads the word's `pos` from `word_dominant_pos` and the dominant lemma's text, joining `lemmas` on the lemma id it already fetches.
- For a side, it tries each of `lookupCandidates` in order with one query: noun side `WHERE noun = $1`; verb side `WHERE verb = $1 OR verb = 'sich ' || $1`. It ranks with `ROW_NUMBER() OVER (PARTITION BY relation ORDER BY score DESC, verb, noun)`, keeps rank ≤ 10, and LEFT JOINs examples with rank ≤ 3, ordered by relation, then score desc, then example rank. The first candidate that returns any row wins.
- `searchWord` and `collocateWord` in each example are the searched side's surface and then the partner's.
- Delete `VERB_ARGUMENTS_QUERY`, `VERB_ARGUMENTS_ENABLED`, `MIN_ARGUMENT_COUNT`, `groupVerbArgumentRows` and the `verbArguments` query call.
- Superseded sections: side noun drops adjacency `'verb'` entries, side verb drops `'noun'` entries, and the `adjective_attributes` superseding stays.
- Run `EXPLAIN (ANALYZE, BUFFERS)` on the pairs query for *Kritik* and *machen*, the largest verb side. Both should be index scans in a few ms. Paste the result into #60's notes.

- [ ] **Step 1: Write the failing tests** for `verbNounPhrases.ts`:
  - `pageSide`: `'NOUN'`→`'noun'`, `'AUX'`→`'verb'`, `'ADJ'`→`null`, `null`→`null`.
  - `phraseOf`: (`obj`, `üben`, `Kritik`, `Kritik`) → `Kritik üben`; (`obj`, `sich geben`, `Mühe`, `Mühe`) → `sich Mühe geben`; (`obl`, `stehen`, `in der Kritik`, `Kritik`) → `in der Kritik stehen`; (`nsubj`, `sich richten`, `Kritik`, `Kritik`) → `Kritik … sich richten`.
  - `chipOf`: noun side obl (`stehen`, `in der Kritik`) → `in der … stehen`; noun side obj → `üben`; verb side obl (`üben`, `in Geduld`) → `in Geduld`; verb side nsubj → `Kritik`.
  - `prefers the searched word over the dominant lemma`: `lookupCandidates('Kritiken', 'Kritik')` gives `['Kritiken', 'Kritik']`, `lookupCandidates('Kritik', 'Kritik')` gives `['Kritik']`, and `lookupCandidates('Kritik', null)` gives `['Kritik']`.
- [ ] **Step 2: Run them.** `node --test backend/src/services/verbNounPhrases.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the module, types, contracts, service and repository.
- [ ] **Step 4: Check.** `node --test` and `npm run typecheck -w backend -w types -w frontend` both pass. The frontend may need `verbNounPairs` ignored for now; it compiles because the field is additive.
- [ ] **Step 5: Local API check** after `docker-compose up -d --build backend`:
  - `curl -s localhost:3000/api/collocations/Kritik | jq '.verbNounPairs | {side, lemma, n: (.pairs|length), first: .pairs[0].chip}'` gives side `noun`, lemma `Kritik` and first chip `üben`. The response has no `section == "verb"` entries in `.collocations`.
  - `üben` gives side `verb`, and its pairs include the partner `Kritik`.
  - `Verfügung` includes an obl chip `zur … stellen`.
  - An adjective (`groß`) gives `verbNounPairs: null` and the same `.collocations` as on `main`. Diff it against the running container from before the build, saved first.
- [ ] **Step 6: Commit.** `git commit -m "Serve collocation-lab verb–noun pairs on noun and verb lookups (decision #60)"`.

---

### Task 5: Frontend groups and chips (app)

**Files:**
- Create: `frontend/src/lib/verbNounGroups.ts`, `frontend/src/lib/verbNounGroups.test.ts`, `frontend/src/lib/highlight.tsx` (the `highlightCollocates` moved out of `CollocationList.tsx` unchanged), `frontend/src/components/VerbNounPairs.tsx`
- Modify: `frontend/src/components/CollocationList.tsx` (import `highlightCollocates`; a new prop `showEmptyMessage: boolean`), `frontend/src/routes/Word.tsx`

**Interfaces:**
- Consumes: `VerbNounPairs` and `VerbNounPair` from Task 4.
- Produces, in `verbNounGroups.ts`, with no React and no `@/` alias so `node --test` can load it:
  - `groupHeadings(side, lemma): Record<VerbNounRelation, string>`, with the exact copy from Global Constraints.
  - `groupPairs(pairs): { relation: VerbNounRelation; pairs: VerbNounPair[] }[]` in the order obj, obl, nsubj, empty groups left out.
  - `initialOpen(groups): Record<VerbNounRelation, number | null>` returns 0 for the first group and `null` for the rest.
  - `hasAnyResults(response: CollocationResponse): boolean`

UI:
- `VerbNounPairs` renders nothing when `pairs` is empty.
- Each group has an `h3` styled like `CollocationList`'s section headings and coloured by the partner's part of speech. The noun side uses `text-pos-verb`, the verb side `text-pos-noun`.
- Under the heading is a wrapping row of `<button aria-pressed>` chips. Tapping the open chip closes it, and tapping another switches to it, with one open chip per group.
- Below the row, the open pair shows its `phrase` (searched-word part bold, partner coloured) and its examples, rendered with `highlightCollocates` exactly as `CollocationList` renders them.
- `Word.tsx` renders `<VerbNounPairs>` above `<CollocationList>`. That's my call: verbs are what the user came for. It passes `showEmptyMessage={!hasAnyResults(data)}`, so "Keine Ergebnisse." appears only when both are empty.

- [ ] **Step 1: Write the failing tests:**
  - `groupHeadings('noun', 'Kritik')` gives `{ obj: 'Kritik + Verb', obl: 'Präposition + Kritik + Verb', nsubj: 'Kritik als Subjekt' }`.
  - `groupHeadings('verb', 'üben')` gives `{ obj: 'Substantiv + üben', obl: 'Präposition + Substantiv + üben', nsubj: 'Substantiv als Subjekt' }`.
  - `groupPairs` keeps the input order inside a group, returns obj before obl before nsubj even when the input starts with nsubj, and leaves an absent relation out.
  - `initialOpen` on groups [obl, nsubj] gives `{ obl: 0, nsubj: null }` (and obj absent or `null`).
  - `hasAnyResults`: false for no collocations and `verbNounPairs: null`, true when only `verbNounPairs.pairs` has one item.
- [ ] **Step 2: Run them.** `node --test frontend/src/lib/verbNounGroups.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the module, `highlight.tsx`, the component and the wiring.
- [ ] **Step 4: Check.** `node --test` passes, and so does `npm run build -w frontend` (tsc + vite), with no errors.
- [ ] **Step 5: Look at it.** Use the `run` skill or the dev server at 375 px and desktop width: `/wort/Kritik`, `/wort/üben`, `/wort/Verfügung`, `/wort/Problem`, `/wort/groß`. Check:
  - three groups for *Kritik*, and *üben* open
  - tapping *äußern* switches the open pair
  - no "Verben" adjacency section on *Kritik*
  - *groß* looks as it does on `main`
  - no horizontal scroll at 375 px
  
  Take screenshots for the user.
- [ ] **Step 6: Commit.** `git commit -m "Show lab verb–noun pairs as chips per group on noun and verb pages"`.

---

### Task 6: Remove `verb_arguments`, record decision #60 (app)

**Files:**
- Create: `database/migrations/015_drop_verb_arguments.sql` (`DROP TABLE verb_argument_examples; DROP TABLE verb_arguments;`, with a header pointing to #60)
- Delete: `database/scripts/load-verb-arguments.ts`, `database/scripts/load-verb-argument-examples.ts`
- Modify:
  - `compose.yml`, `compose.prod.yml`: remove both `load-verb-argument*` services. Check each file separately (failure class 2).
  - `backend/src/contracts/CollocationRepository.ts`: remove `VerbArgumentRow`.
  - `types/src/index.ts`: remove `relation?` from `CollocationEntry` and its comment.
  - `frontend/src/components/CollocationList.tsx`: remove the commented-out relation block.
  - `docs/decisions.md`: entry #60 plus an index line.
- Leave: `tools/pos-tagging/extract_verb_arguments.py`, which #60 says is no longer loaded; `verb_prepositions` and the Rektion box.

Decision #60 contents:
- **Problem.** The user's complaint and the 22-noun comparison: broken lemmas, share ranking, missing pairs.
- **Chosen.** Lab pairs: LL, freq ≥ 5, 3M sentences, three relations, layout C.
- **Show nothing.** A word with no lab pairs shows nothing (the user's decision). This supersedes #53 and #55's fallback for these sections.
- **Lookup rules.** POS gating; text keys and why; the lookup order.
- **Data path.** The export/load path and the DELETE-in-one-transaction refresh.
- **Measurements.** The measured table size and EXPLAIN timings from Tasks 3 and 4.
- **Refresh runbook.** `colloc export` → copy to the VM's `data/` → `docker-compose -f compose.prod.yml --profile manual build load-lab-verb-pairs migrate` → run migrate → run the loader → `build backend frontend` → `up -d`. Every VM step is confirmed with the user.

- [ ] **Step 1:** `grep -rn "verb_argument\|VerbArgument\|VERB_ARGUMENTS" --include='*.ts' --include='*.tsx' --include='*.yml' . | grep -v node_modules`. After the edits, expect only migrations 010, 011 and 015 and comments in `012`/`013`.
- [ ] **Step 2:** Apply 015 locally. `node --test`, the typechecks and `npm run build -w frontend` pass. Repeat the curl checks from Task 4 Step 5, which should be unchanged.
- [ ] **Step 3: Commit.** `git commit -m "Drop verb_arguments now that lab pairs replace them (decision #60)"`.

---

## After the plan (needs the user)

- Merging the lab's `clean-web-and-spelling` and `export-for-app`, and the app's `lab-verb-noun-pairs`, into main.
- The production deploy, following #60's runbook. Copying the TSVs and running loaders on the Linode VM happens only on the user's explicit go at that time.
