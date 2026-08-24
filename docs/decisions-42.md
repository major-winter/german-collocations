### 42. Per-section significance floor to stop weak backfill in collocation lists

> **Superseded by decision #43.** The per-section floors here were
> replaced entirely by a single logDice-based threshold once a second,
> structurally similar bug ("Einsatz war") showed that patching
> `significance` per-symptom didn't scale. `SECTION_MIN_SIGNIFICANCE`
> and `sectionMinSignificanceCase` no longer exist in the codebase — see
> `docs/decisions-43.md` for why and what replaced them. Left here as
> history, per this project's rule that decisions are logged, not
> silently reversed.

Spotted a real quality bug: `Einsatz` listed `am` as one of its top-10
prepositions, but "am" isn't a collocate of "Einsatz" — it's a common
preposition that rides along with almost any noun. Root cause: decision
#36's `PER_SECTION_LIMIT = 10` always tries to fill 10 slots per section
regardless of whether there are 10 genuinely strong partners, so a thin
section gets backfilled with whatever's left, however weak.

Considered one global significance floor across all sections first —
rejected once checked empirically: sections sit on very different natural
scales. Preposition significance has a median of 14.4 across the whole
`collocations` table, versus 22–37 for noun/verb/adjective/other, because
there are only a few dozen distinct prepositions, so they co-occur with
almost everything by volume even when "significant" in the chi-square
sense (the table's own minimum, 3.84, is exactly the p<0.05 critical
value — Leipzig's own extraction already filters to "statistically
significant," which isn't the same thing as "a meaningful fixed
collocation"). A single floor high enough to cut preposition noise would
gut the noun/verb/adjective sections; one low enough for those would do
nothing for prepositions.

**Chosen: a floor per section, set at that section's own 75th-percentile
significance** (computed once across the whole table: noun 67.95, verb
42.99, adjective 46.36, preposition 29.8, other 69.84), applied in
`backend/src/repositories/CollocationRepository.ts`'s `COLLOCATIONS_QUERY`
alongside the existing `rn <= PER_SECTION_LIMIT` cut, via a `CASE`
expression (`sectionMinSignificanceCase`) parametrized on the section
column, mirroring the existing `buildBranchQuery` pattern in the same
file for reusing SQL text with a different column reference.

Verified against 10 real query words before committing: this floor cuts
"Einsatz am" (28.98, just under the preposition floor of 29.8) while
correctly keeping "Polizei am" (709.48 — the strongest preposition for
that word; "am" isn't inherently bad, it's the specific pair's weakness
that matters). Same word, opposite outcome, decided per-pair not
per-word — confirms the mechanism targets the right thing.

**Trade-off, same shape as decision #41's `MAX_EXAMPLE_WORDS` tuning**:
no threshold is free. This one also cuts some real-but-modest pairs —
e.g. "Interesse für" (15.24), a legitimate alternative to "Interesse an,"
falls below the preposition floor. Considered 50th and 90th percentile
as alternatives (discussed with the user): 50th wouldn't have caught
"Einsatz am" at all (28.98 sits above the preposition median); 90th would
leave many words with far fewer than 10 results per section, some
sections empty. Went with 75th as the balance.

A section can now legitimately show fewer than 10 entries (or be entirely
absent) when a word doesn't have that many partners clearing the bar —
this replaces "always try to fill 10" with "only show what's actually
strong," which is the intended behavior change, not a bug.
