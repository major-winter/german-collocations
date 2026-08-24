### 43. Replaced significance-based ranking with logDice (supersedes #42)

A second spurious "collocation" surfaced shortly after #42 shipped:
"Einsatz war" — "war" is a form of the copula "sein," not a real
collocate of "Einsatz," any more than "am" was. Same failure mode. A
POS-based exclusion list for auxiliary/modal verb forms (on top of #42's
per-section floors) would have patched this specific case, but every fix
so far had been a reaction to one symptom at a time rather than a fix to
the underlying metric — the right move was to address the metric itself.

Root-caused: the `significance` column (loaded verbatim from Leipzig's
`co_n.txt`) is a chi-square-style statistical-significance measure — its
minimum value across the whole table is exactly 3.84, the textbook
p<0.05 critical value at 1 degree of freedom, confirming Leipzig already
filters to "unlikely to occur by chance." But statistical significance
is not the same thing as "meaningful fixed collocation": it scales with
raw frequency, so common function words (prepositions, copula/auxiliary
verb forms) look "significant" with almost any content word purely by
volume, even when the actual lexical association is weak. This is *why*
#42 needed five different hand-tuned per-section floors in the first
place — prepositions and verbs (inflated by AUX forms) sit on
structurally different significance scales, and no single number could
span both.

**Chosen: logDice** (Rychlý 2008, "A Lexicographer-Friendly Association
Score" — the default association measure in Sketch Engine, the
professional word-sketch/collocation-dictionary tool this project is
conceptually closest to). `logDice = 14 + log2(2×cooccurrence /
(freq_left + freq_right))`, using `words.frequency` (already loaded from
the Leipzig word-frequency file) and `collocations.cooccurrence` (already
loaded) — no new data, no corpus reprocessing, purely a query-logic
change in `backend/src/repositories/CollocationRepository.ts`.

PMI was tried first and rejected: it's the more commonly cited
association measure, but it overweights rare pairs — "Angst vorm" (only
9 cooccurrences) scored a *higher* PMI (9.06) than the canonical "Angst
vor" (6.24, 393 cooccurrences), which is backwards. logDice's Dice-style
normalization (frequency sum in the denominator, not the product) doesn't
have this blowup.

Validated empirically before committing:
- **Clean separation on the flagged cases** — a real gap raw
  significance never showed. Good: Polizei am 7.19, Angst vor 8.20,
  Interesse an 7.46, Einsatz kommen 8.91. Bad: Einsatz war 5.08, Einsatz
  am 4.46. (For comparison, Einsatz war's raw significance, 60.68, looked
  entirely unremarkable next to legitimate pairs — no threshold on
  `significance` alone could have separated it cleanly without also
  cutting good pairs.)
- **Naturally suppresses AUX/copula noise with no stopword list**: at a
  global logDice floor of 6.3, only 2.4% of AUX-tagged partners survive
  (635/25,993) versus 29.0% of true VERB partners (11,052/38,070). The
  metric itself tells grammatical scaffolding from real lexical
  collocations apart — the POS-exclusion-list approach that was
  considered and explicitly rejected in favor of this would have been
  redundant.
- **Normalizes across POS sections far better than raw significance**:
  logDice section medians land at 3.95–4.78, versus 14.4–37.3 for raw
  significance. This is *why* one global threshold works now where #42
  needed five.
- 6.3 = the whole `collocations` table's own 75th-percentile logDice —
  same percentile methodology #42 already used and had accepted, now
  applied to a metric that doesn't need per-section calibration.
- No division-by-zero risk: `words.frequency` minimum across the table
  is 1, never 0.

**This supersedes decision #42**, not just supplements it — the
per-section `SECTION_MIN_SIGNIFICANCE` floors and the
`sectionMinSignificanceCase` helper are removed from
`CollocationRepository.ts` entirely, replaced by a single `MIN_LOG_DICE
= 6.3` constant applied uniformly across sections. `PER_SECTION_LIMIT`
(the top-10-per-section cap from decision #36) is unrelated to this
change and is untouched. `significance` and `cooccurrence` are still
returned in the API response (still real, correct statistics worth
showing), they're just no longer the ranking/filtering key — neither
field is read anywhere in the frontend, so no contract change was
needed.

Also updated the footer copy ("Ranked by statistical significance" →
"Ranked by collocation strength" in `frontend/src/components/Layout.tsx`)
since it was describing the now-replaced mechanism.

Deployed the same day — pure code change, no `TRUNCATE`, no data
dump/restore, just rebuild + recreate the `backend` container in
production (same deploy shape as decision #42).
