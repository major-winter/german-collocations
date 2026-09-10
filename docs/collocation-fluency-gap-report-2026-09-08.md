# CEFR fluency needs vs. current app coverage — gap report

**Date:** 2026-09-08
**Status:** Proposal / research input for discussion. Not a logged decision — nothing here should be treated as agreed until the user reviews it and (if adopted) it gets written up as a numbered `docs/decisions-N.md` entry in the normal way. The next available number is **#54** (highest existing entry is #53, currently uncommitted — see "In-flight work" below).

## Method

Per-repo ground truth was established by reading `git log`/`git status`, all of `docs/decisions-33.md` through `docs/decisions-53.md` (decisions #1–32 and `architecture.md`/`glossary.md`/a single `decisions.md` do not exist in this repo snapshot — CLAUDE.md's pointers to them are stale), all migrations in `database/migrations/`, the backend contracts/services/repositories, and the frontend routes/components — plus a diff of every currently uncommitted file. CEFR/collocation-pedagogy needs were established via web research (Goethe-Institut Wortlisten, CEFR/Profile Deutsch framework, L2 collocation-acquisition literature, DWDS Wortprofil and comparable dictionary tools) — see citations inline.

---

## 1. Ground truth: what the app actually ships today

| Feature | Evidence | Status |
|---|---|---|
| Word lookup with fuzzy/typo-tolerant search (umlaut folding, trigram similarity) | `backend/src/repositories/WordSearchRepository.ts` (`pg_trgm`, `normalize_de`/`fold_de`, `similarity()`); "Did you mean" suggestions in `Word.tsx` (decision #48) | **Shipped, committed, in production** |
| Collocations grouped by POS section (Substantive/Verben/Adjektive/Präpositionen/Sonstige), ranked by logDice, capped at 10/section | `backend/src/repositories/CollocationRepository.ts` (`COLLOCATIONS_QUERY`, `SECTION_CASE`, `PER_SECTION_LIMIT`, `MIN_LOG_DICE`); decisions #33–36, #43 | **Shipped, committed, in production** |
| Lemma-based grouping (merges inflected forms: "Einsatz"/"Einsätze"/"Einsatzes" → one entry) | `lemmas`, `word_lemmas`, `lemma_collocations` tables (migrations 007–008); decision #44 | **Shipped, committed, in production** |
| Example sentences per collocation, rank-selected for simplicity (single-clause preferred), literal-surface-form highlighting | `collocation_examples`/`sentences` tables, `extract-examples.ts`; decisions #41, #45, #50 | **Shipped, committed, in production** |
| Governed preposition (Rektion) callout — "warten **auf** (Akkusativ)" | `verb_prepositions` table (migration 009), `GOVERNED_PREPOSITIONS_QUERY`, `GovernedPrepositions.tsx`, wired into `Word.tsx` and `CollocationResponse.governedPrepositions` | **Built and functionally wired end-to-end (confirmed by reading the diff directly), but uncommitted and not deployed to production.** Decision #52 believed this was wired when it was written; decision #53 found it wasn't and fixed the wiring in the same (still-uncommitted) session. |
| Verb subject/object arguments (who does what to whom — Subjekt/Akkusativobjekt/Dativobjekt/Genitivobjekt), replacing the noun/verb sections | `verb_arguments`/`verb_argument_examples` tables (migrations 010–011), `VERB_ARGUMENTS_QUERY`, relation badges in `CollocationList.tsx`/`grammaticalCase.ts` | **Built end-to-end but explicitly disabled** via `VERB_ARGUMENTS_ENABLED = false` in `CollocationRepository.ts` — the user asked to stop showing it "for now" after verifying it worked. No user (dev or prod) currently sees this. |
| Grammatical case color-coding shared between the two features above | `frontend/src/lib/grammaticalCase.ts`, `index.css` new `--case-*` tokens | Built, uncommitted; only visibly exercised via governed prepositions (arguments are off) |
| Per-word SEO page route (`/wort/:word`) | `frontend/src/routes/Word.tsx` | **Route exists**, but no per-page `<title>`/meta description/structured data — `frontend/index.html`'s `<title>` is still the literal placeholder `frontend`, and no `sitemap.xml`/`robots.txt` exists anywhere in the repo. The stated CLAUDE.md goal ("SEO-indexable per-word pages") is only half-built: the page exists, the indexing signals don't. (Flagged for completeness; out of scope for the CEFR-need comparison below.) |
| Direction (before/after) between collocates | — | **Deliberately dropped** (decision #40) — not a gap, a scope cut |
| Synonym discrimination, register/formality marking, frequency-band tagging (e.g. "this word is A1 vocabulary"), translation glosses, audio/pronunciation, idiomatic/fixed-expression flagging distinct from statistical collocation strength, adjective-noun or noun-noun (genitive) grammar-based relations | — | **Not shipped.** No schema, no migration, no code reference anywhere. |

---

## 2. In-flight work — do not duplicate

As of this session, the working tree has substantial **uncommitted** work implementing decisions #52 (governed prepositions) and #53 (verb subject/object arguments), plus their docs. Concretely:

- Governed-preposition callout (#52): complete and live-rendering in the dev build (`GovernedPrepositions` is imported and rendered in `Word.tsx`), but never committed, migrated, or deployed to prod.
- Verb-argument noun/verb sections (#53): complete but intentionally **flag-disabled** (`VERB_ARGUMENTS_ENABLED = false`). Re-enabling is a one-line flip plus rebuild — not a rebuild-from-scratch.
- Both `compose.yml` and `compose.prod.yml` already have the three new loader services (`load-verb-prepositions`, `load-verb-arguments`, `load-verb-argument-examples`) added to **both** files individually (correctly avoiding CLAUDE.md's failure class #2).
- `sample.txt` (untracked, looks like a raw corpus snippet, not part of any decision) appears to be scratch/test data left over from this work; not evaluated further here since it's not application code.

**Any recommendation below that would re-propose Rektion or verb-argument grammar relations is redundant with work already done.** The natural next steps for that *specific* thread are: (a) commit #52/#53, (b) decide whether to re-enable `VERB_ARGUMENTS_ENABLED`, (c) deploy both to production (migrate + reload all four new loaders + rebuild backend/frontend on the VM). None of that requires new research or design — it's finishing what's already built. The recommendations in §5 are about what comes **after** that, informed by what the current architecture doesn't yet cover at all.

---

## 3. What learners need at each level

Synthesized from CEFR/Goethe-Institut Wortlisten, the L2-collocation-acquisition literature (verb-noun/adjective-noun collocations are acquired earlier and more accurately than adverb-verb/adverb-adjective ones; productive knowledge of a word's part of speech precedes productive recall of its collocates; L1-transfer errors are the dominant error type at every level, gradually giving way to near-synonym substitution errors as proficiency rises), and feature comparison against DWDS Wortprofil (the professional German collocation dictionary this project is closest to — organizes co-occurrences into ~12 grammatical relations: subject, object, genitive attribute, adjective attribute, PP-complement, etc., each linked back to corpus example sentences) and Duden/Wiktionary DE (case/gender/valency info, register labels, example sentences).

**A1/A2 — survival vocabulary, whole-chunk memorization**
1. A handful of very common, very concrete fixed chunks per word ("Zeit haben", "Angst haben"), not a long ranked list — cognitive load matters more than coverage at this level.
2. Verb + case government made explicit and unmissable (learners at this stage cannot yet reliably infer case from context; Goethe A1/A2 Wortlisten and "Verben mit Präpositionen" reference lists exist specifically because this needs to be memorized as a fact, not induced).
3. A short, simple example sentence per chunk — ideally shorter/simpler than what's needed at higher levels, since parsing a subordinate clause is itself a barrier at A1/A2.
4. Some indication the word/collocation is actually common ("worth learning now" vs. a corpus artifact) — frequency-band or curation signal.

**B1/B2 — productive fluency, natural-sounding output**
1. Broader collocate coverage per word (verb-noun, adjective-noun, and adverb-verb/adverb-adjective — this is exactly the pair type the acquisition literature shows still causing the most errors at this stage) so learners can check "does this actually go together" while writing/speaking.
2. Multiple example sentences per collocation, since one example under-constrains how a chunk is actually used across registers/tenses.
3. Near-synonym discrimination becomes relevant here specifically — the literature notes B1/B2+ learners increasingly substitute near-synonyms for a target collocate ("großes Interesse" vs. "starkes Interesse"), which is exactly where a "these two are not interchangeable" signal is most useful, not before.
4. Subject/object patterns for verbs ("who does what to whom") — B1/B2 learners are constructing full sentences, not just chunks, so knowing a verb's typical arguments (not just its adjacent word) starts to matter.

**C1/C2 — register, nuance, idiomaticity**
1. Register/formality marking (a collocation that's fine in a news corpus may be too formal/informal for the learner's context) — this is the stage where using a "correct but tonally wrong" collocation is the main remaining error class.
2. Fixed/idiomatic expressions distinguished from merely-frequent statistical pairs (BBI's grammatical-vs-lexical-collocation distinction, already cited in decision #52) — a C1/C2 learner needs "zum Einsatz kommen" flagged as a genuine fixed idiom, not just a high-logDice pair indistinguishable from any other strong collocate.
3. Full grammatical-relation coverage (genitive attributes, adjective attributes, PP-complements beyond simple Rektion) — the DWDS Wortprofil reference point offers ~12 relations; this project currently has at most 2 relation types built (Rektion, subject/object) and only 1 of those is even switched on.
4. Corpus-grounded, register-varied example sentences (not just the shortest/simplest one) — C1/C2 learners specifically want to see a word "in the wild" across contexts, which cuts against the existing simplicity-scoring bias (decisions #41/#50) that was tuned for coverage, not for advanced learners' needs.

---

## 4. Gap analysis

| Need (by level) | Shipped / partial / missing | Evidence |
|---|---|---|
| A1/A2: verb+case government explicit | **Partially shipped** (uncommitted) | Governed-preposition callout (#52) does exactly this for verb+preposition+case, but is uncommitted/undeployed. No equivalent for plain accusative/dative verbs (e.g. "helfen" + Dativ with no preposition) — `verb_arguments` captures the *argument noun*, not a bare case-government fact for non-PP verbs. |
| A1/A2: small, curated chunk set (not a long ranked list) | **Not shipped** | `PER_SECTION_LIMIT = 10` and no frequency/curation-band filter exist; every user sees the same statistically-ranked list regardless of level. |
| A1/A2: simple example sentences | **Shipped** | Decisions #41/#50 (simplicity-scored, rank-and-keep-best-3). |
| A1/A2: frequency/"is this worth learning" signal | **Partially shipped, not surfaced** | `words.frequency`/`lemma_frequency` exist and back logDice ranking, but no frequency band or "common word" indicator is ever shown in the UI — a learner can't tell if a listed collocate is itself rare. |
| B1/B2: verb-noun, adjective-noun, adverb pairs | **Partially shipped** | Verb-noun via `lemma_collocations` adjacency (shipped) and via `verb_arguments` (built, disabled). Adjective-noun and adverb-verb/adverb-adjective: none of these get their own grammar-based relation — they fall into whatever the plain adjacency query happens to find, with no relation-type distinction. |
| B1/B2: multiple varied examples | **Shipped** (3 per pair) | `collocation_examples`/`verb_argument_examples`, capped at 3. |
| B1/B2: subject/object ("who does what to whom") | **Built, disabled** | `verb_arguments`, `VERB_ARGUMENTS_ENABLED = false`. |
| B1/B2: near-synonym discrimination | **Not shipped** | No schema, no UI concept of "these two words are near-synonyms, here's how they differ." |
| C1/C2: register/formality marking | **Not shipped** | No column, no UI. Leipzig news-corpus source has no register metadata to begin with — would need a new data source or heuristic. |
| C1/C2: idiomatic vs. merely-frequent flagging | **Not shipped** | logDice-based ranking treats every pair the same way; no fixed-expression list or idiom detector exists. |
| C1/C2: broader grammatical-relation coverage (genitive, adjective attribute, etc.) | **Not shipped beyond verb relations** | Only Rektion (#52) and subject/object (#53) exist; decision #53 explicitly notes adjective-noun attributive and noun-noun genitive were "raised as options... deferred." |
| C1/C2: register-varied (not just simplest) examples | **Not shipped; current bias runs the other way** | Simplicity scoring (#41/#50) optimizes for short/single-clause, which serves A1/A2 well but is not tunable per learner level. |

---

## 5. Gaps, ranked

1. **No level-awareness anywhere in the product.** Every learner — A1 or C2 — gets the identical ranked list, identical example-sentence style, identical absence of case/register/frequency signaling beyond what #52/#53 add for verbs. This is the umbrella gap; most items below are instances of it.
2. **Grammar-based relations exist only for verbs, and only one of two built relations is switched on.** DWDS Wortprofil's ~12-relation model is the field's own reference point; this project has at most 2 (Rektion, subject/object), and per-item #2 of "in-flight work," subject/object is currently invisible to every user.
3. **No frequency/curation signal in the UI**, despite the data (`words.frequency`, `lemma_frequency`) already existing — this is the cheapest possible A1/A2 win and is pure surfacing, no new pipeline.
4. **No register/formality marking or idiom-vs-statistical-collocate distinction** — a real C1/C2 need, but also the hardest gap to close: the Leipzig news corpus has no register metadata, so this would need either a new/supplementary data source or a heuristic (e.g. flagging entries whose logDice sits far above the section's typical range as "fixed expression" candidates) — a bigger, less certain project than anything else on this list.
5. **Adjective-noun and adverb-collocation types have no dedicated treatment**, despite the acquisition literature flagging adverb-collocations as the *most* error-prone type across all levels — currently these only surface incidentally via plain lemma adjacency, with no relation label the way verb-noun pairs now can get one.

---

## 6. Recommendation

### Primary: a per-entry "frequency/commonness" signal, surfaced in the UI, driven entirely by data the app already has

**What:** Show a lightweight indicator (e.g. a "common"/"less common" badge, or a simple frequency-tier label) on each collocation entry and/or the queried headword itself, derived from `lemma_frequency`/`words.frequency` — data already loaded and already used internally for logDice ranking, just never exposed to the user.

**Why this level, why first:** This is the single highest-leverage, lowest-risk item on the list. It directly serves the A1/A2 need ("is this worth memorizing right now") identified as a top-3 priority in the research, and it's the only recommendation here that requires **zero new data pipeline, zero new offline extraction, and no schema change** — the numbers exist today. It's also the natural complement to the just-built (if not yet deployed) Rektion/argument work: those features tell a learner *what* goes together; this tells them *how much it matters that they learn it*.

**Scope:** Additive in the truest sense — no migration at all, just a repository query change (expose an existing column) and a small frontend component (a badge, reusing the existing `--pos-*`/`--case-*` token pattern from decisions #51/#52 rather than inventing new colors). Threshold tuning (what counts as "common") should follow the project's own established empirical pattern (percentile-based, per decisions #36/#42/#43) rather than a guessed cutoff.

**Fit with the 1GB VM:** Negligible — no new table, no new query complexity, reads a column that's already indexed and already read for every request.

### Alternatives, ranked

**1. Finish and ship what's already built (#52 + #53), including re-enabling verb arguments.** Not a new feature at all, but it's the highest-value thing on the table if "next" means "next thing a real user sees" rather than "next thing to design." Serves B1/B2 (subject/object) and A1/A2/B1 (Rektion) simultaneously. Scope: commit, migrate + reload 4 loaders in prod, rebuild backend/frontend, flip one flag. Fits the VM fine — decision #53 already measured the live query cost (~30ms) and the loaders are one-shot batch jobs, not persistent load.

**2. Extend the grammar-based-relation approach to adjective-noun attributive pairs**, the relation type explicitly deferred in decision #53 and the one the acquisition literature flags as both earlier-acquired than verb-based relations *and* still error-prone through B1/B2. This is a direct continuation of the #52/#53 pattern (new offline spaCy extraction script for the `nk`/attributive dependency relation, additive table mirroring `verb_arguments`' shape, share-based ranking) rather than a new architecture. Scope: additive table + offline tool + query, same shape as #53 — moderate effort, well-precedented. Fits the VM: same cost profile as #53's ~30ms query and one-shot 18-minute offline extraction.

**3. A curated "fixed expression / idiom" flag for the highest-logDice tier**, addressing the C1/C2 idiomatic-vs-statistical gap without needing new corpus data — e.g. flag entries above some high percentile (following the project's percentile-threshold convention) as "feste Wendung" candidates, manually reviewable rather than fully automated given the noise risk. Lower confidence than #1/#2 because there's no clean automatic signal for "idiomatic" the way there was for "governed" (decision #52's dependency-based approach worked because syntax gives a clean structural test; idiomaticity doesn't have an equivalent clean test in this data). Scope: no schema change if done as a threshold+manual-review-list rather than a stored classification; a small additive table if the review list needs to persist. Register/formality marking proper (needing new corpus/metadata) is a substantially bigger, lower-certainty project and is not recommended as a near-term step.

---

## 7. Note on process

This report is research and a proposal only. No application code, migrations, or deploy configuration were modified in producing it. If any recommendation above is adopted, it should be logged as decision **#54** (or later, once #52/#53 are committed) following this project's existing convention — that write-up should happen after the user decides, not as part of this report.
