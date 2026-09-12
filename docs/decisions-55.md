### 55. Verb-argument noise floor: fall back to unfiltered pairs when a verb/noun has none above it

Follow-up to decision #53. Investigated why `/api/collocations/weiterfahren`
showed no "noun" section (subject/object collocates) at all, despite real,
hand-readable example sentences existing for it in
`verb_argument_examples.tsv`/the `verb_argument_examples` table (e.g.
"Auto"/"Fahrer"/"Fahrzeug" as Subjekt, "Richtung" as Akkusativobjekt).

Root cause: every one of `weiterfahren`'s 22 `verb_arguments` rows has
`count` 1 or 2 - none reach `MIN_ARGUMENT_COUNT = 3` (decision #53's noise
floor). `VERB_ARGUMENTS_QUERY`'s `verb_side`/`argument_side` CTEs filtered
with a flat `AND va.count >= MIN_ARGUMENT_COUNT`, so a verb with *no*
qualifying pair produced zero rows for that section - not just a
shorter list, an empty one - and the example-sentence `LEFT JOIN LATERAL`
never got anything to join against, even though the examples themselves
were correctly loaded.

This is a real gap in the decision #53 threshold, not a data or loader
bug: the floor was tuned as "hide the long tail of one-off noise among a
verb's otherwise-plentiful pairs" (85% of all triples are count 1), not
"hide a verb entirely because it happens to have no pair above 3". A
verb like `weiterfahren` - genuinely used, just without a single
recurring subject/object across the corpus sample - was being treated
identically to pure parser noise.

#### Fix: per-fixed-lemma fallback, not a lowered floor

Rejected lowering `MIN_ARGUMENT_COUNT` globally (would re-admit the 85%
one-off tail decision #53 measured and explicitly excluded). Instead,
each of `verb_side`/`argument_side` now computes, via
`bool_or(va.count >= MIN_ARGUMENT_COUNT) OVER ()` over the same
already-`WHERE`-filtered-to-one-fixed-lemma row set the query already
relied on for share calculations (see #53's `verb_side`/`argument_side`
comments on window functions running after `WHERE`), whether *any* of
that lemma's own pairs clears the floor. The floor then only applies
when the answer is yes:

```sql
WHERE cooccurrence >= MIN_ARGUMENT_COUNT OR NOT any_meets_floor
```

A verb/noun with at least one well-attested pair keeps the exact
pre-#55 behavior (only threshold-passing pairs shown, verified against
`warten`: still exactly its 87 count>=3 rows, cooccurrence range 4-28,
5.8ms via `EXPLAIN (ANALYZE, BUFFERS)` - no measurable regression from
the added window function). A verb/noun with nothing above the floor
(`weiterfahren`, max count 2) now shows all of its pairs, ranked by
share same as always, capped by the existing `PER_SECTION_LIMIT = 10`.

Applied to both `verb_side` (a verb headword's noun section) and
`argument_side` (a noun headword's verb section) - the same gap exists
on either fixed side, and a noun whose only governing verbs are all
low-count would hit the identical empty-section problem.

Not applied to `adjective_attributes`/`ADJECTIVE_ATTRIBUTES_QUERY`
(decision #54, same `MIN_ADJECTIVE_ATTRIBUTE_COUNT = 3` shape, an even
steeper 90.4%-under-3 tail) - left as a known open question for a
follow-up session rather than assumed to need the identical fix; the
user's request was scoped to the verb-argument case surfaced by
`weiterfahren`.

#### Verification

Queried the live DB directly (`weiterfahren`, lemma id 2910356) before
and after: `verb_side` alone went from 0 rows to 13 (all 22 raw pairs
minus the `DISTINCT ON`/relation collapsing and one deduped case), and
the full `VERB_ARGUMENTS_QUERY` end-to-end now returns a "noun" section
with attached example sentences for "Richtung", "Fahrer", "Fahrzeug",
"Auto", "Duo", "Ehefrau", etc. - each checked against the real sentence
text, all genuine.

`tsc --noEmit` clean on `backend`. Rebuilt and restarted the backend
container (`docker compose build backend && docker compose up -d
backend`), confirmed via `docker inspect --format
'{{.State.StartedAt}}'` against the build time (CLAUDE.md failure class
#1). Hit the live local endpoint directly:
`/api/collocations/weiterfahren` now returns the noun section with
examples as above; `/api/collocations/warten` unchanged (10 noun
entries, cooccurrence 4-28, same as pre-#55).

**Not yet done**: production deploy (this session was local-dev only).
No frontend changes needed - `CollocationList.tsx` already renders
whatever entries the API returns, and a fallback-sourced entry has the
exact same shape (`word`, `cooccurrence`, `significance`, `section`,
`relation`, `examples`) as a threshold-passing one, with no flag
distinguishing "this cleared the floor" from "this is the best
available despite not clearing it" - revisit if that distinction turns
out to matter to a learner (e.g. a low-confidence indicator), but not
requested here. Whether `adjective_attributes` needs the same fallback
is open, not decided either way.

#### Follow-up: deployed to production (2026-09-12)

Deployed same day, following the established mechanism (decisions
#48/#51/#54): `git push` → `gcloud compute ssh` into
`german-collocations-instance` (`us-central1-a`) → confirmed the live
checkout via `docker inspect`'s compose-project-config-files label
(`/home/tuanchuhoang/german-collocations`, CLAUDE.md failure class #5)
→ operations as `tuanchuhoang`.

`git pull` picked up two commits behind: this fix plus an unrelated
layout change already bundled in by the user (`b4256a6`, also touched
`Layout.tsx`/`SearchBox.tsx`/`Word.tsx` and a whitespace-only fix to
migration 001 - no re-migration needed, content-only formatting).

`docker compose -f compose.prod.yml build backend frontend` failed on
the frontend: `tsc -b` (the prod build's strict project-reference
check, same one decision #54's follow-up flagged as distinct from local
`tsc --noEmit`) hit `TS6133` on `Word.tsx` - a `GovernedPrepositions`
import left behind when its JSX usage got commented out in the same
bundled layout change. Exact repeat of decision #54's own follow-up bug,
same root cause (commented-out JSX, forgotten import), same fix
(removed the import, committed as `dbcdd99`, left the commented-out
JSX alone since it's someone else's in-progress change, not mine to
resolve). Reproduced locally first via `npx tsc -b` before touching
anything, confirmed clean after the fix, then pushed and re-pulled on
prod before rebuilding again - this time both `backend` and `frontend`
built clean.

`docker compose -f compose.prod.yml up -d backend frontend` (not
`build` alone - CLAUDE.md failure class #1). Verified via `docker
inspect --format '{{.State.StartedAt}}'` that both containers actually
restarted (StartedAt matched the deploy time).

Verified against the live public site
(`german-collocations.chickenkiller.com`): `/api/collocations/weiterfahren`
now returns a 10-entry "noun" section with attached examples (Richtung,
Fahrer, Fahrzeug, Auto, Duo, ...), matching the local-dev verification
above. Confirmed no regression: `/api/collocations/warten`'s noun
section is unchanged (10 entries, cooccurrence 4-28). Site itself
responds `200`.

Worth noting for next time: this is the second time in two consecutive
feature sessions (#54, #55) that a layout/UI change left a stray unused
import that only the prod build's `tsc -b` catches. Since this keeps
recurring, running `npx tsc -b` (not just `tsc --noEmit`) before pushing
any frontend change - not just before a deploy - would catch it earlier;
raised here as an observation, not yet adopted as a standing rule.
