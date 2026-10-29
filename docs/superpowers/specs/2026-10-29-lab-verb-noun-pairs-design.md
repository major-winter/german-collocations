# Verb–noun pairs from the collocation lab — design

Date: 2026-10-29. Status: approved in brainstorming, pending plan.

## Why

The user looks up a noun to find out **which verbs go with it** (and a verb
to find its nouns). Today that section comes from the spaCy-based
`verb_arguments` tables (decision #53), and the user's complaint is that
"the results sometimes return trivial combinations, sometimes incorrectly
label verb noun". A side-by-side comparison on 22 nouns confirmed it: broken
lemmas (*Spielt*, *leistn*, *birgen*), ranking by the verb's share of count
(which favours trivial verbs), and missing core pairs (*Frage stellen*,
*Hilfe brauchen*).

The sister repo `~/Projekte/collocation-lab` (Python, Stanza `hdt` parser)
now has better data: log-likelihood-ranked pairs over news + wiki + web
(Leipzig, 3M sentences, dataset `news-wiki-web-3M`), in three relations,
with GDEX-chosen example sentences. In the comparison, the main verb was
in the lab's top two for all 22 nouns. This project serves that data on the
live site in place of `verb_arguments`.

## Goals

- The noun page's verb section and the verb page's noun section show lab
  pairs only, in three groups (layout "C", chosen by the user).
- Prepositional pairs (*auf Kritik stoßen*, *zur Verfügung stellen*) appear
  on the page. They didn't before.
- A repeatable export (lab) → load (app) path, so improved lab data
  (e.g. the postponed free-combination filter) can reach the site with one
  export and one load.

## Non-goals

- Meanings/definitions of pairs (postponed by the user).
- Filtering out free combinations (*Euro kosten*); postponed with the
  meanings. They still show until the lab filters them.
- Changes to the other sections (adjectives, prepositions, other), the
  search box, suggestions, or the Rektion box (`GovernedPrepositions`, already
  commented out in `frontend/src/routes/Word.tsx`; its `verb_prepositions`
  table stays).
- Fixing the app's `lemmas` table.
- Any paid service (the user: "I don't wanna pay dime").

## Anti-goals

- Falling back to old results. The user decided that a word with no lab
  pairs shows **nothing** in that section, not the old spaCy pairs.
- A half-loaded site during a data refresh.
- Anything that strains the 1 GB RAM / 1 CPU / 25 GB Linode VM.

## What the user sees (decided)

### Noun page (e.g. *Kritik*)

The verb section is replaced by up to three groups, in this order:

1. **"Kritik + Verb"**: lab relation `obj`. Chips: *üben, äußern,
   zurückweisen, ernten, …*
2. **"Präposition + Kritik + Verb"**: relation `obl`. Each chip carries its
   preposition: *auf … stoßen, in der … stehen, in die … geraten*.
3. **"Kritik als Subjekt"**: relation `nsubj`. Chips: *sich richten,
   kommen, …*

Chips and headings use lemmas (my call, after the builder check). The
mockup showed conjugated chips ("richtet sich") and a heading with the
article ("Die Kritik …"), but the app has no gender or verb-form data, and
guessing them from surfaces adds export columns for a cosmetic gain. The
mockup's "(gegen)"-style follow-up prepositions and the "es hagelt" chip
are dropped: the data doesn't have them.

Each group is a compact, wrapping row of chips ranked by LL score. Tapping
a chip opens that pair below the row: the phrase as written (*Kritik üben*,
*auf Kritik stoßen*, *in der Kritik stehen*) and up to 3 example sentences.
In the sentences, the searched word is bold and the partner is in the
section colour, as `CollocationList` does now. Only one pair is open per
group (my call). The first chip of the first non-empty group is open when
the page loads.

The user approved the following, which I proposed:

- up to 10 pairs per group
- pair frequency ≥ 5
- up to 3 examples
- German labels
- empty groups hidden
- the obl phrase shown with its most frequent written form (*zur Verfügung*,
  not *zu Verfügung*)

The mockup is at
`.superpowers/brainstorm/57616-1793254539/content/noun-page-verbs.html`
(option C).

### Verb page (e.g. *üben*)

This is the mirror image and the user approved it ("switch the verb page
too"). The noun section is replaced by "Substantiv + üben", "Präposition +
Substantiv + üben" and "Substantiv als Subjekt". The chips are nouns, with
the same rules as the noun page.

My calls on verbs:

- Separable verbs are their own lemma, as in the lab: *ausüben* is looked up
  as *ausüben*, not under *üben*.
- Reflexive lab verbs ("sich richten") are included on the page of the plain
  verb (*richten*), and their chips and phrases show "sich".

### No lab pairs

That section is not shown at all (user's decision).

Which page a word gets (my call, after the builder check): the searched
word's `word_dominant_pos` decides.

- **NOUN:** the "Verben" section always comes from the lab, or is hidden.
  The old `lemma_collocations` verbs never show, since they carry the same
  broken lemmas. The noun page's other sections, noun–noun neighbours
  included, stay as they are.
- **VERB/AUX:** the "Substantive" section always comes from the lab, or is
  hidden. Its other sections stay.
- **Any other part of speech** (adjectives, prepositions, …): the page is
  unchanged. The adjective page's noun section still comes from
  `adjective_attributes` or `lemma_collocations`, as now.

Which lab lemma is matched (my call): only the side the part of speech
names, so a noun page queries the lab's noun column and a verb page its verb
column. The searched word itself is tried first. If it has no lab pairs on
that side, the dominant lemma's text is tried. So one page shows one side,
at most three groups.

## Data path (my calls; user said "go ahead")

### Lab side: `colloc export`

A new CLI command in collocation-lab, for example
`colloc export --dataset news-wiki-web-3M --out <dir>`. It writes two
UTF-8 TSV files into the app's `data/` directory, which is git-ignored and
mounted read-only into the loader containers:

- `lab_verb_pairs.tsv`, one row per pair:
  - relation (`obj` | `obl` | `nsubj`), verb, prep, noun: lemma strings
  - phrase noun: the most frequent `np_surface` of the pair for `obl`
    (*zur Verfügung*); for other relations the noun lemma itself
  - LL score from the dataset's latest `ll` run for that relation
  - pair_freq
- `lab_verb_pair_examples.tsv`, one row per example:
  - the pair key and rank (1–3)
  - the sentence
  - the verb surface and noun surface as written in that sentence, for
    highlighting

Selection:

- Only pairs with pair_freq ≥ 5.
- Only pairs that are attracted, i.e. observed more often than expected.
  If the LL scorer is unsigned, the exporter checks observed > expected
  itself.
- Examples respect the lab's hand choices (`example_choices`: pinned
  first, removed excluded), which is what `chosen_examples` does.
- Expected size: about 134k pairs and about 400k sentences, well under
  100 MB in Postgres. I'll check this when building.

The exporter is the one place that knows the lab's schema. The app knows
only these two file formats.

### App side

- **Migration 014.** It creates `lab_verb_pairs` and
  `lab_verb_pair_examples`, keyed by lemma **text**, not `lemmas.id`. That
  avoids mapping onto the app's broken lemmas. Indexes allow lookup by
  noun and by verb. It drops `verb_arguments` and `verb_argument_examples`.
  This follows the "additive" rule for the new tables. The drop is logged
  as a decision rather than reversed silently.
- **Loader.** `database/scripts/load-lab-verb-pairs.ts` replaces
  `load-verb-arguments.ts` and `load-verb-argument-examples.ts`, which are
  deleted along with their compose services. It loads into fresh tables
  and swaps them in a single transaction, so a refresh never shows
  half-loaded data. It follows the existing loader style.
- **Lookup.** As in "No lab pairs" above: the backend matches the lab tables against the searched
  word's dominant lemma text (`word_dominant_lemma` → `lemmas.lemma`) and
  also against the searched word itself. That way *Kritik* finds noun
  pairs and *übt*/*üben* finds verb pairs even where the app's lemma is
  wrong. A word that isn't in `words` still returns 404, as now.
  `VERB_ARGUMENTS_QUERY`, `groupVerbArgumentRows` and the
  `VERB_ARGUMENTS_ENABLED` flag go away.
- **API.** `CollocationResponse` gains a separate field for the lab pairs,
  for example `verbNounPairs`. Each item has:
  - relation
  - partner lemma
  - preposition
  - phrase
  - score
  - frequency
  - examples (`CollocationExample`)
  
  The `relation?` field on `CollocationEntry`, which only `verb_arguments`
  used, goes away. The frontend groups the items by relation into a new
  component and keeps `CollocationList` for the other sections.

### Refresh and deploy

The refresh is `colloc export`, then copy the two TSVs to the VM's `data/`,
then run the loader service. That is followed by the usual
`docker compose -f compose.prod.yml build` + `up -d` for backend and
frontend (CLAUDE.md failure class 1). Every step on the Linode VM is
confirmed with the user first.

### Record

Decision **#60** in `docs/decisions.md`, with an index entry. It records:

- `verb_arguments` replaced by lab pairs, and why: the comparison
- that a word with no lab pairs shows nothing (the user's decision)
- the text-keyed tables
- the export/load path

It supersedes #53 and #55's fallback for these sections.

## Constraints

- Production: Linode VM with 1 GB RAM, 1 CPU and 25 GB disk. Postgres 18,
  Docker Compose, Caddy.
- Changes must work in both `compose.yml` and `compose.prod.yml`. Check
  each one (failure class 2).
- The app stays Node/TS. Python lives only in collocation-lab, offline, on
  the laptop.
- Descriptive names, never single letters.
- No production deploy or SSH without the user's confirmation at that time.

## Left to the builder

- Exact table columns, index choice and query shape. Verify with
  `EXPLAIN (ANALYZE, BUFFERS)` per CLAUDE.md.
- The name and shape of the new response field and frontend component.
- Chip styling, within the existing Tailwind/section colours.
- How the exporter finds the surfaces for each example sentence, via
  `occurrences` of the dataset's parses.
- Tests, following each repo's conventions. The lab has pytest. The app has
  no test runner yet, only typechecks, so the builder decides how the app
  side is verified (at least typecheck plus a local end-to-end check of
  *Kritik*, *üben*, *Verfügung*, *Problem*).
