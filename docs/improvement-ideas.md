# Ways to make the app better

Written 2026-11-27, from the code, `docs/roadmap.md`, `docs/open-items.md`
and `docs/collocation-fluency-gap-report-2026-09-08.md`. Items 11 and 12 were
added the same day after reviewing the list from a learner's point of view.
These are candidates,
not decisions. A chosen item gets a numbered entry in `docs/decisions.md` and
a line in the roadmap. Size: **S** is under a day, **M** is a few days, **L**
is a week or more.

Ordered by value to a learner for the work it takes, with one exception:
item 1 is here because without it, none of the others can be used.

---

## 1. The backend comes back after a crash (S, ops)

**Problem.** One dropped database connection kills the backend (exit 1, no
`pool.on('error')`), and no service has a `restart:` policy. That outage lasts
until someone notices. (Open item R1.)

**Change.** Add `restart: unless-stopped` to `db`, `backend`, `frontend` and
`caddy` in **both** `compose.yml` and `compose.prod.yml` (failure class 2).
Add a `pool.on('error', …)` that logs, in `backend/src/index.ts`. Ship it with
R4 (`Dockerfile.prod`) in one deploy.

**Why it matters.** Every feature below assumes the site is up.

## 2. Suggestions while typing (M, frontend + one query check)

**Problem.** The search box does nothing until Enter. `/api/search`
(`PgWordIndex`, pg_trgm fuzzy match ranked by frequency) only runs *after* a
lookup fails, on the "Meinten Sie:" screen. A learner who misspells *Entscheidung*
pays a full failed lookup before getting help, and nothing guides them to the
form the corpus knows (lemma vs. inflected word).

**Change.** A debounced (~250 ms, ≥ 3 letters) dropdown under `SearchBox` that
calls the existing `/api/search`, with keyboard and screen-reader support
(`role="combobox"`). It is off while the field holds a phrase, so the #70 check
still works.

**Check first.** `EXPLAIN (ANALYZE, BUFFERS)` of the trigram query on prod.
Autocomplete fires it several times per lookup, and the VM has one core. If it
is slow for 3-letter inputs, add a prefix match (`word_normalized LIKE $1 || '%'`
on a `text_pattern_ops` index) for short queries and keep trigram for longer ones.

## 3. Check results lead somewhere (S, frontend)

**Problem.** "Passt das zusammen?" names better partners (*eine Entscheidung
treffen*), but the suggestion is a dead end, and an unknown verb (*trefen*)
just falls back to a plain search. (Roadmap #2.)

**Change.** Each suggestion scrolls to its chip on the noun page and opens
its examples. If the lab does not know the verb, say "Verb nicht erkannt" and
offer the item 2 suggestions for that verb.

## 4. Prepositional verb–noun check (M, backend + frontend)

**Status:** built on `backend-feature-prepositional-check`, decision #76.

**Problem.** The check covers objects (#70) and adjectives (#74), but not
the prepositional pairs learners often get wrong: *an einer Sitzung
teilnehmen*, *in Frage stellen*, *zur Verfügung stehen*. (Roadmap #4.)

**Change.** Read the lab's `obl` pairs, already imported for the noun pages
(#60), through the existing `CollocationCheckStore`. The parsing work is
contractions (*zur* = *zu der*, *im*, *am*, *beim*), which `collocationCheck.ts`
needs to split before matching.

**Spot-check.** ~20 real phrases, right and wrong, before and after, as for #70.

**Pair with item 12.** A learner who picks the right preposition can still
get the case wrong (*an der Sitzung*, not *an die Sitzung*). The check is
worth much more if it also names the case.

## 5. Show how common each partner is (S–M, backend + frontend)

**Problem.** A learner can't tell *Entscheidung treffen* (learn this today)
from a rare pair that ranks high only because logDice rewards exclusivity.
The frequencies are already in the database (`lemma_frequency`,
`words.frequency`). They drive the ranking and never reach the UI. This was
the main recommendation of the 2026-09-08 gap report and was never built.

**Change.** Return the pair's count (co-occurrence for logDice entries, the
lab's frequency for LL pairs) and show a quiet two- or three-step label
("sehr häufig / häufig / seltener") on each chip. Set the cut-offs from
percentiles per relation, as in #36/#43. LL and logDice must not share one
scale (CLAUDE.md, Terms).

## 6. Long lists collapse on phones (S, frontend)

**Problem.** On a phone, a common noun's page scrolls through every section
at full length. Learners mostly need the top few partners per relation.
(Roadmap #5.)

**Change.** Show the top 5 per section and a "mehr …" button for the rest.
CSS and state only, so no API change. Desktop can stay expanded.

## 7. Different example sentences on each visit (M, loader + backend)

**Problem.** Each pair shows the same 3 sentences forever. Seeing a pair in
varied contexts helps it stick, and the corpus usually has more than 3
simple sentences per pair. (Step 2 of the example-quality plan after #50.)

**Change.** `extract-examples.ts` keeps the best 10 ranked sentences per pair
instead of 3. At request time, pick 3 seeded by the day (`hash(pair, date)`),
so a page is stable within a day, which keeps the cache useful. Add a
"Weitere Beispiele" button that asks for the next 3.

**Cost.** The examples table grows about 3×. Measure its size on prod first
against the 25 GB disk and R9/R10. If it's too big, keep 6 instead of 10.

## 8. Fix split lemmas for irregular plurals (M, offline tooling)

**Problem.** spaCy gives umlaut plurals their own lemma (*Motorräder*,
*Bücher*, *Räder*), which splits one noun's collocations into two weaker
halves. A larger model does not fix it. This hits central vocabulary, and
it probably explains part of the 54 % of lemma pairs with no examples.

**Change.** A small lemma-exception table (`surface → lemma`) applied in
`tools/pos-tagging/`, seeded from the corpus's highest-frequency nouns where
the lemma ≠ singular (detect: a lemma whose own singular also exists as a
lemma). Measure how many pairs merge and how many gain examples before
deciding. This is a reload (#37), so do it on the laptop and ship a dump
(R8).

## 9. Hear the words and examples (S, frontend only)

**Problem.** A learner who reads *Rechnung begleichen* still doesn't know
how to say it, and collocations are learned by sound as much as by sight.

**Change.** A small speaker button on the headword, each chip and each
example, using the browser's built-in `speechSynthesis` with a `de-DE` voice.
No server, no API key, no cost on the VM. Hide the button when the device has
no German voice.

## 10. Recently looked-up words, then a saved list (S, then L; frontend)

**Problem.** Nothing on the home page brings a returning learner back to
what they looked up yesterday.

**Change.** Step one (S, not gated): the home page lists the last ~10 lookups,
stored in `localStorage` (wrapped in try/catch, with a "Verlauf löschen"
button; mention it in `Datenschutz`, since it is browser-only and never sent).
Step two is the #71 A1 saved list ("Merken" on chips, `/liste`, JSON backup).
It stays gated on the `usage_counts` baseline (earliest 2026-12-11), and step
one's data on repeat visits is part of the evidence for opening that gate.

## 11. A short meaning for each partner (M–L, offline data + frontend)

**Problem.** The app shows *which* words go together but never what they
mean. Below about B2, a learner reads *Rechnung begleichen* or *Bedenken
äußern* with a dictionary open in another tab. The examples are news
sentences (Leipzig), so they are often harder than the pair itself. This is
probably the biggest gap for A2–B1 learners, and nothing on the roadmap
covers it.

**Change.** A short gloss (a few words) for each partner lemma, and later
for frequent whole pairs where the meaning isn't the sum of the parts
(*in Frage stellen*, *zur Verfügung stehen*). Show it muted under the chip,
or when the chip is opened. Store it in a new table keyed by lemma
(additive, so `words` and `lemmas` stay untouched), filled by an offline
loader like the others.

**Decide first.**
- **Language.** #62 made the interface German-only. An English gloss is
  content, not interface, but it still amends #62 and needs its own decision.
  The other choice is a short German paraphrase (DWDS-style), which keeps
  the app monolingual but helps fewer A2 learners.
- **Source and licence.** Options are an open dictionary (Wiktionary
  extractions such as kaikki.org, CC BY-SA, which needs attribution on the
  page; FreeDict / Ding, check each licence) or glosses written offline by an
  LLM. Generated glosses need the same care as generated examples: offline
  only, marked `source: generated`, and spot-checked by a human on the top
  partners before they ship.
- **Sense.** A lemma has several senses (*Bank*, *Schloss*, *umfahren*). A
  dictionary gloss for the lemma can be the wrong sense for the pair. Show
  at most the first one or two senses, and spot-check the ~20 usual
  headwords for wrong-sense glosses before shipping.

**Cost on the VM.** One small indexed table and a join on the page query.
Measure it like the other lookups.

## 12. Show the case wherever a noun follows a verb or preposition (M, lab + loader + frontend)

**Problem.** Choosing the right word is half the error. The other half is
declining the noun: *teilnehmen an* + **Dativ**, *sich verlassen auf* +
**Akkusativ**, *helfen* + **Dativ**. #69 already shows the noun's article
(*der/die/das*), but nowhere does the page say which case the phrase takes.
That matters most for two-way prepositions (*in, an, auf, über, unter,
vor, hinter, neben, zwischen*), where the case decides whether it means
location or direction.

**What exists.** The lab export (`lab_verb_pairs.tsv`) has `relation`
(`obj`, `obl`, `nsubj`) and `prep`, but no case. The paused Rektion table
from #52 (`verb_prepositions`, migration 009) has a `grammatical_case`
column, but it comes from a different extraction and #68 took it out of the
lookup.

**Change.**
1. **Objects.** Label `obj` pairs "Akk." straight away. The lab extracts
   accusative objects as `obj`, which needs no new data. Confirm that
   assumption against the lab's extraction code first.
2. **Prepositional pairs.** Add the noun's case to the lab export, taken from
   spaCy's morphology (`Case=` on the noun or its determiner), and keep the
   majority case per `(verb, prep, noun)` together with its share, like
   the 0.8 dominance rule in #36. Leave the case out when no case is clearly
   dominant, rather than guess. This is a change in `collocation-lab`, which
   fits the open item to make the lab the single lemma authority.
3. **Display.** A small muted label after the preposition on the chip
   ("an + Dat."), using the existing word-class tokens (`lib/wordClass.ts`)
   with no new colours. Item 4's check can then say "richtig, aber: an +
   Dativ → *an der Sitzung*".
4. **Dative-only verbs** (*helfen, danken, gefallen*) need `iobj` / dative
   `obj` from the lab, which is a later, separate step.

**Spot-check.** Case labels on ~20 verbs with two-way prepositions (*denken
an, warten auf, sich freuen auf/über, sich verlieben in*) before shipping,
since a wrong case label teaches the error the feature is meant to prevent.

---

## Considered and left out

- **Per-word link previews (Open Graph).** Shared links still say "Wortnetz",
  and `document.title` is already per word. Crawlers don't run the SPA's
  JavaScript, so previews would need server-side HTML. That is too much for
  how often links get shared today.
- **LLM-generated examples for pairs with none.** Only after item 7, only
  offline, and marked `source: generated`. A wrong sentence in a learning tool
  costs more than a missing one.
- **Register / idiom flags.** The news corpus has no register metadata, and
  idiomaticity has no clean signal in this data (gap report §6).
