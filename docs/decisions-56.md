### 56. Verb arguments: drop proper nouns, decided per lemma rather than per token

Follow-up to decision #53, and a partial reversal of it: #53 restricted
verb arguments to `NOUN`/`PROPN` children, which let names through as
collocates - `sagen` → `Trump` (305), `erklären` → `Trump` (104), 1,155
distinct `Trump` triples in `verb_argument.tsv` alone. A name is a real
grammatical subject/object, but it is not a collocation: it reflects who
was in the news in the corpus year, not which nouns a verb combines with.
#53's own Verification section already shows the symptom
(`unterstützen` → `Ukraine`/`USA` listed among the "sensible" results).

#### Why not just delete `PROPN` from the three `pos_` checks

Measured on a 40,000-sentence sample before deciding (13% of all argument
tokens are `PROPN`: 6,364 of 47,326). `de_core_news_sm` tags the same
word inconsistently from one sentence to the next:

- `Trump` as an argument: 123 tokens `PROPN`, 8 tokens `NOUN`. A
  per-token filter leaves those 8 behind - every name survives as a thin
  low-count residue, which decision #55's fallback then surfaces for any
  verb with nothing above the noise floor.
- `Mann` 2 `PROPN` / 359 `NOUN`, `Kind` 1 / 166, `Sachschaden` 4 / 56: a
  per-token filter shaves counts off genuine nouns.

So the filter is per lemma: every `NOUN`/`PROPN` token in the corpus (not
only those in argument position - more evidence, no extra cost, same
parse) is tallied by lemma, and a lemma tagged `PROPN` in a strict
majority of its occurrences (`PROPER_NOUN_MIN_SHARE = 0.5`) has all of
its triples and example sentences dropped at write time.
`find_verb_arguments` still yields `PROPN` tokens, because the verdict
isn't known until the whole corpus has been read.

#### Rejected: spaCy NER as a second signal

The lemma-level `PROPN` rule has a known leak: names the model tags
`NOUN` most of the time. `word_pos.tsv` shows it corpus-wide - `Putin`
1,514 `NOUN` / 693 `PROPN`, `Russland` 3,464 / 248, `Alcaraz` 118 / 26,
`Airbus` 137 / 23. Enabling the `ner` pipe and also counting
`NOUN` tokens carrying a `PER`/`LOC`/`ORG` entity label does catch those,
but on a 60,000-sentence sample it also pushed `Haus` (0.52), `Staat`
(0.61), `Straße` (0.68), `Armee`, `Kurs`, `Gegner`, `Sohn`, `Anleger`,
`Bewohner` and `Kirche` over the 0.5 line - 15,840 argument tokens
dropped instead of 9,708, with most of the difference being exactly the
common nouns this feature exists to show. Including `MISC` was worse
again (`Krieg`, `Frieden`, `Niederlage`). It also cost speed (597 vs.
~990 sentences/sec). Precision over recall, same call as #52/#53: the
leak stays, documented, rather than trading it for lost real collocates.

Also rejected: lowering the threshold below 0.5 to catch `Putin` (0.32).
The same band holds `Deal` (0.32), `Tipp` (0.45), `Coach` (0.45),
`Startschuss` (0.38), `Bewusstsein` (0.38).

#### Known limitations, not fixed

- Names tagged mostly `NOUN` still appear (`Putin`, `Russland`, `FC`,
  `AfD`, `Union`). A larger spaCy model would likely tag these better,
  but switching models changes the dependency parse under every
  hand-verified rule in #52/#53/#54 - out of scope here.
- A few genuine common nouns the model tags mostly `PROPN` are lost:
  seen in the sample were `Beschluss`, `Anschluss`, `PKW`, `KI`, `Apps`,
  and surname/noun homographs (`Wolf`, `Koch`, `Wagner`).
- Not applied to `extract_adjective_attributes.py` (decision #54), whose
  head-noun check accepts `NOUN`/`PROPN` the same way. Left as an open
  question rather than assumed to need the identical rule - the request
  was scoped to `verb_argument.tsv`.

#### Rollout

No schema or query change. Neither loader truncates:
`load-verb-arguments.ts` is `INSERT ... ON CONFLICT DO NOTHING`, so
loading the regenerated TSV on top of the existing rows would remove
nothing, and `load-verb-argument-examples.ts` has no conflict handling
at all, so it would duplicate every example. Both tables need
`TRUNCATE verb_arguments, verb_argument_examples` first, then both
loaders re-run - same operator-run-TRUNCATE convention as #37/#44.

#### Verification

Full corpus run: 1,000,000 sentences, 683,835 distinct (verb, relation,
argument) triples (down from #53's 814,714 - 130,879 proper-noun triples
dropped, 16%), 847,789 example rows (down from 994,020).

Spot checks against the regenerated `verb_argument.tsv`:

- `Trump`, `Merz`, `Deutschland`, `Amazon`: 0 triples each (`Trump` had
  1,155).
- `sagen` top 10 before: `Sprecher`, `Trump`, `Sprecherin`, `Merz`,
  `Präsident`, ... After: `Sprecher`, `Sprecherin`, `Präsident`,
  `Polizeisprecher`, `Trainer`, `Bürgermeister`, `Zeitung`, `Experte`,
  `Sender`, `vorsitzend` - counts of the surviving nouns unchanged.
- `unterstützen` top 10 lost `Ukraine` and `Deutschland`, nothing else.
- Common nouns intact: `Mann` 1,725 triples, `Polizei` 832, `Zeit` 712.
- The documented leak is real at full scale: `Russland` 631 triples,
  `AfD` 460, `Putin` 450, `FC` 414 still present.
- The documented loss is real too: `Beschluss` and `KI` have 0 triples.

Not done in this session: the regenerated TSVs sit in
`tools/pos-tagging/` only. `data/` still holds the pre-#56 files, and
neither the local nor the production database has been reloaded.
