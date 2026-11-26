# Saved lists + practice: evaluation (2026-11-27, revised)

Status: evaluation, logged as decision #71 (direction only; nothing built).
Revision 3. Revision 2 took in a review of revision 1; revision 3 takes
in a second review (N1–N7, I-4, I-5, M1–M7). Repo state at writing: main
at `6c8d06e`, #70 deployed.

## Verdict

Build a smaller version first: legal pages and a server-side traffic
baseline (Phase A0), a browser-only saved list (Phase A1), then a
gap-fill on that list (Phase B), each behind a gate set against the
measured baseline. No
accounts, sync, payments or SRS algorithm yet. Do not treat this as the
paid-tier feature until the free version shows repeat use.

The research supports deliberate, spaced retrieval of collocations. The
competitive gap is narrower than it first looks: DWDS already offers free
corpus-ranked collocations. What is defensible here is the combination
of the "typical?" verdict (#70), learner-simple ranked examples (#41/#50)
and practice built from that data, not a practice engine.

## 1. Learner value

All three studies below are EFL studies with East-Asian L1 learners
(Japanese, Chinese); applying them to learners of German is an inference.

- **Spacing helps verb–noun collocations.** Yamagata, Nakata & Rogers
  (SSLA 45(2), 2022/23; 90 Japanese high-school EFL learners) report the
  spaced schedule gave the largest gains for studied and unstudied
  collocations ([Cambridge](https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/effects-of-distributed-practice-on-the-acquisition-of-verbnoun-collocations/AFDA91E8ECFDB03151056108E0341FA3)).
  Qualified in the body: for unstudied items on the immediate test,
  spaced was not significantly better than node-massed (hypothesis 2
  "partially supported"). Earlier work is thin (Snoder 2017, which found
  no benefit of longer spacing; Macis et al. 2021).
- **Spacing matters for fluent knowledge.** Fang, Elgort & Chen (SSLA
  46(3), 2024; 36 verb–noun collocations, flashcard retrieval with
  feedback) found massed and spaced practice equal for *explicit*
  knowledge, but spacing better for *implicit* knowledge on both
  posttests and for automatized-explicit knowledge on the delayed test
  ([Cambridge](https://www.cambridge.org/core/product/201FABD72088A7F590598A5973E5B499);
  cite the current version, a figure corrigendum was replaced in early
  2025). So spacing is worth having. That a simple fixed-interval box is
  enough, rather than SM-2/FSRS, is an engineering judgement, not a
  finding.
- **Incidental exposure is slow.** Webb, Newton & Chang (Language
  Learning 63(1), 91–120, 2013) found collocation knowledge rising with
  encounters (1/5/10/15), with sizeable gains at 15
  ([paper](https://openaccess.wgtn.ac.nz/articles/journal_contribution/Incidental_learning_of_collocation/12749645));
  a multi-site replication (Peters et al. 2023) gave mixed results. A
  lookup gives one or two encounters, so deliberate review fills a real
  hole.
- **Not found:** a study comparing gap-fill with flashcards for
  collocations. Roediger & Karpicke 2006, Cepeda et al. 2006 and
  Boers/Lindstromberg are background knowledge, not checked; verify
  before citing publicly.

Audience: B1–B2 (literal-transfer errors such as *eine Entscheidung
machen*, which the check card already diagnoses) and C1 (less obvious
pairs: *Kritik üben*, *Rücksicht nehmen*; Funktionsverbgefüge). A2 is
not the audience; the corpus sentences are too hard.

## 2. Competitive landscape

- **DWDS Wortprofil** (free): collocations grouped by grammatical
  relation, logDice-ranked, with corpus examples. It is the closest
  substitute for the lookup itself. It lacks a "is this typical?"
  verdict and practice. Whether its example selection favours simple
  sentences the way #41/#50 do is not checked.
- **Anki**: free on desktop and Android; AnkiMobile on iOS is a paid
  one-off (about US$25, not checked). Shared German frequency decks with
  sentences exist; no dedicated collocation deck was found in one
  search. Export to Anki is cheaper than rebuilding SRS, but iOS users
  pay for it.
- **Clozemaster**: sentence cloze, German supported, free tier plus Pro,
  reported US$12.99/month or $79.99/year (review sites, Nov 2026, not
  confirmed on clozemaster.com; regional/app-store prices and sales
  vary). It is the benchmark a €3–5 tier is compared against.
- **Not verified**: Lingvist, Reverso/Linguee, ChatGPT (can produce
  gap-fills on demand, but cannot say how typical a pair is).
- **The gap**: the verdict + learner-simple examples + practice on
  exactly those pairs. Practice generic enough for Anki or ChatGPT to do
  is not an edge.

## 3. Feasibility against the code

What exists (checked):
- No accounts, no `localStorage`/`sessionStorage` in `frontend/src`.
  Routes: `/`, `/wort` (redirect), `/wort/:word`.
- No Impressum or Datenschutz page, no analytics, and no access logs:
  the prod `Caddyfile` has no `log` directive and the backend logs only
  its startup line.
- `toVerbNounPairs` (`backend/src/domain/collocations.ts`) returns per
  pair `relation`, `partner`, `phrase`, `phraseNoun`, `chip`,
  `chipArticle`, `score`, `frequency` and up to 3 ranked `examples
  [{sentence, searchWord, collocateWord}]` from `lab_verb_pair_examples`
  (migration 014, with `verb_surface`/`noun_surface`). Enough for a
  card snapshot from a word page with no schema change.
- The check card is **not** enough on its own, and needs a small backend
  change. `CheckPhrase` carries only `phrase`/`nounWord`/`verbWord`
  (`verbWord` has *sich* stripped, so it is no key). A join to the page's
  `verbNounPairs` by phrase string would work only for the top 10 pairs
  the page loads (`PER_SECTION_LIMIT`), while `judge()` matches object
  pairs at any rank (17,765 obj pairs sit below rank 10). Those
  below-chip matches are exactly where saving from the check adds
  value. Fix: add the lab verb lemma and up to 3 examples to
  `matched` in the check response, and key saved cards on the identity
  below, not on the display string.
- `/api/check` plus `lab_verb_pair_examples.verb_surface` (migration 017
  index) already maps a typed verb form to its lemma (*fällte* →
  *fällen*). Phase B reuses it to grade typed answers; no inflection
  generator. It only knows forms that occur in the lab examples
  (`VERB_CANDIDATES_QUERY`), so grading also accepts the lemma itself
  and the exact surface of the blanked sentence.

### Card design (Phase B)

- **Prompt**: the noun and the example sentence with the verb blanked.
  The lemma is **not** shown, or the card tests conjugation instead of
  the collocation. Hints come on request, in steps: first letter, then
  lemma. A hinted answer counts as "partial".
- **Typed answer, three grades** (via the check's form → lemma mapping):
  - the pair's own verb, any form: correct;
  - another object verb the lab pairs with this noun (*fällen* for
    *Entscheidungen ___ treffen*), **after #70's subject-error filter**
    (`isSubjectError`), so *Entscheidung fallen*, an obj pair at rank 2
    that is really a subject, is not praised: "also usual, but this
    sentence uses *treffen*", not wrong;
  - anything else: wrong, showing the answer.
- **Multiple choice** (fallback on phones). "The lab does not pair it with
  the noun" is weak evidence of "wrong": the median noun has only 2 obj
  pairs (90th percentile 13), and #70 notes *Kaffee bestellen* is missing
  from the corpus. The obvious interference verbs are often real pairs
  (`haben` with 1,113 nouns, `machen` 436, `geben` 266, `nehmen` 259).
  So multiple choice is offered only for nouns with at least 10 obj
  pairs, and a distractor must be a frequent verb that pairs with
  neither this noun (any relation) nor co-occurs with it in the logDice
  window table. Never from the noun's own pairs, which are correct
  answers. Other cards are typed-answer only.
- **Card identity**: `(relation, verb, prep, noun)`, plus a snapshot
  version. `VerbNounPair` has no `prep` or noun-lemma field today; for obj
  pairs prep is `''` and the noun is the page lemma, and obl pairs (below)
  need both added to the snapshot. A lab re-export can change phrases or
  examples; a card whose pair is gone keeps its snapshot and is marked
  "no longer in the data".

### What goes in v1, and what is left out

Saving (Phase A) is open to every verb–noun pair: object, prepositional
(including Funktionsverbgefüge) and subject. Nothing in saving or the
list needs a cloze. Practice (Phase B v1) is object pairs only, and the
list marks other saved cards "not practisable yet".

| Excluded from practice v1 | Why | Measured (local dev DB) |
|---|---|---|
| Particle verbs | Stem and particle split (*nimmt … ein*); exclusion keyed on the **lemma** with #70's 13 separable particles (surface forms like *eingelegt* contain the particle) | 24,446 of 129,299 obj examples (~19%); 8,189 of 43,348 obj pairs; ~18% of the top-10 object chips on noun pages. About 1 in 5 saved object pairs can never become a v1 card. |
| *sich* pairs | The pronoun (*mir/dich/uns*) is a giveaway or splits the phrase | 445 obj pairs |
| Examples with the verb or noun twice | Blank would be ambiguous; skip to the pair's next example | verb 242, noun 1,605 of 129,299 |
| Pairs without examples | Nothing to blank | 22 obj pairs |
| Subject pairs | Poor cloze material (subject far from verb) | — |
| Adjective + noun | 93% of examples (532,000 of 569,207) inflect the adjective, so a blank tests endings; data is from the spaCy lemmas #60 moved away from; separate card type (`CollocationEntry`) | — |
| Prepositional / Funktionsverbgefüge (*zur Verfügung stellen*, *in Kraft treten*) | **Deferred, not dropped**: prime B2/C1 material, needs its own blank design (preposition or verb) | — |

Other risks to the cards:
- Examples can use another meaning of the pair (#70: *Platz nehmen*
  vs *belegen*), and the known #70 data issues (broken lab lemmas,
  quantifiers kept in phrases such as *keinen Sinn haben*) will show up
  as bad cards. CLAUDE.md's linguistic spot-check applies: before Phase
  B ships, generate cards for ~20 real headwords (*Entscheidung*,
  *Frage*, *Rolle*, *Kritik*, *Hilfe*, …) and read them.

### iOS storage

Safari deletes script-written storage for a site after 7 days of Safari
use without user interaction with that site. A web app added to the home
screen has its own storage, separate from Safari's, and its own
days-of-use counter, which is safer but not "exempt". Mitigations, all in
Phase A1:
- JSON backup and restore (CSV/Anki export is one-way, not a backup);
- `navigator.storage.persist()` where supported (Safari support not
  verified);
- a web app manifest (`display: standalone`) and the Apple meta tags.
  The frontend has neither today (`frontend/index.html`, `frontend/public`
  holds only `favicon.svg`), so a home-screen icon would just open Safari;
- the home-screen note shown before the first save, because a list saved
  in Safari does not appear in the installed app. Moving an existing list
  over is backup, then restore;
- in Phase B, review intervals capped at 1, 2, 4 and 6 days, as a
  **stopgap**. Spacing research favours gaps that grow with the retention
  interval, and a 6-day cap means at least N/6 reviews a day for good
  (200 cards ≈ 33/day). So there is also a daily review cap (e.g. 20),
  and longer intervals wait for sync.

### Effort and VM cost

- Phase A0 (legal pages, server-side baseline counts): 1–2 days. No new
  frontend feature.
- Phase A1 (save on chips and check card, `/liste`, JSON backup/restore,
  manifest, `persist()`, home-screen note, supporter link, opt-in local
  counts): 4–6 days, including the small check-response change. CSV/Anki
  export comes later: its blanked-verb prompt already needs Phase B's
  exclusion logic. Negligible VM cost.
- Phase B: 1–2 weeks, including grading, distractor filtering, the
  exclusion filters, the box UI, the 20-headword spot-check and the
  decision write-up. Queries are the existing ~10 ms lookups.
- Phase C (accounts, sync): 2+ weeks. Additive `users`,
  `saved_collocations`, `reviews` tables (no `words` change), magic-link
  login (needs reliable email: a provider, SPF/DKIM). Light on CPU and
  disk. The real cost is operational: auth security, email delivery, and
  an **off-box backup**, which must exist before the first user row.
  Corpus tables can be reloaded; user data cannot. Conflicts with
  "boring and minimal" and the current prod posture (no `restart`
  policy in `compose.prod.yml`).

## 4. Measuring the gates

The gates need numbers the app cannot produce today. Two sources, kept
apart because the law treats them differently (section 5).

**Server-side baseline (Phase A0, shipped first).** The backend counts
requests it already receives: `GET /api/collocations` (a word-page view)
and `GET /api/check` (a check), into a per-day table
(`usage_counts(day, kind, count)`, additive). No beacon, nothing read
from the device, no IP or user agent stored. Caddy access logs stay off
(IP addresses are personal data). Bots and the developer inflate this
too; it is a traffic baseline, not a gate on its own.

**Local events (Phase A1, opt-in).** Saves, list use and practice only
happen in the browser. Reporting them means reading the device, so it is
off by default, behind a small "Anonym mitzählen" switch on `/liste`:
- `POST /api/event {type}` with a fixed list of types, fired once with
  `navigator.sendBeacon`, guarded against double fires (React StrictMode,
  back navigation).
- **Deduplicated on the client, per device, still anonymous.** The
  browser remembers locally what it has already reported:
  - `view_with_save`: at most once per noun-page view, not per save;
  - `list_opened_first_today`: once per device per day;
  - `weekly_active_saver`: once per device per ISO week, when the device
    saved or opened its list that week;
  - Phase B: `weekly_practiser` and `practiser_returned`: once per device
    per ISO week, the latter when the device also practised in the
    previous 7 days.
  So the server counts devices per day or week, never events, and still
  learns no identity.
- A local "don't count me" flag, which the developer sets on their own
  browsers.
- Abuse: the endpoint is unauthenticated, so an in-memory per-IP rate
  limit (IP not stored) and a per-type daily cap. A determined script can
  still inflate counts; the gates compare against the A0 baseline and
  are read with that in mind.

**Thresholds** are set against measured traffic, after 2–4 weeks of A0
and **before** A1 ships, in devices per week, logged in the A1 decision
entry with a fail action. The shape, with numbers to fill in:
- **Phase A gate** (4 weeks after A1): `weekly_active_saver` at least X%
  of weekly word-page views (scaled to opted-in devices), and at least
  Y devices per week. **Fail**: keep the list (it is cheap and free),
  do not build Phase B.
- **Phase B gate** (4 weeks after B): at least Z% of `weekly_practiser`
  devices are `practiser_returned`. **Fail**: keep practice free, do not
  build Phase C.
- `supporter_link_clicked` gets a threshold too; it is the only direct
  signal of willingness to pay.

Opt-in counts undercount, so the numbers are a lower bound. That is
acceptable for a go/no-go: if even the opted-in minority shows repeat
use, the signal is real.

## 5. Privacy and legal

- **Missing today, regardless of this feature**: an Impressum (§5 DDG)
  and a Datenschutz page. Add both in Phase A0. The Impressum needs a
  postal address where the operator can be served; a supporter link
  makes the site more clearly "geschäftsmäßig". That is a personal cost
  for the owner to accept (or use a paid address service).
- **localStorage for the list** stores what the learner asked to save, so
  it is "unbedingt erforderlich" under §25(2) TDDDG: no consent banner.
- **Measurement is a different purpose.** §25(1) TDDDG covers reading
  information from the device, not only storing it; reading the practice
  history to report it is measurement, not strictly necessary (EDPB
  Guidelines 2/2023 treat script-triggered sends from the device as in
  scope; the DSK does not treat reach measurement as necessary by
  default). Hence the split in section 4: the server-side baseline
  touches nothing on the device and needs no consent; local events are
  opt-in. GDPR exposure is low either way, since no identifier is
  stored. The Datenschutz page describes both.
- **No email field** in Phase A/B. A "notify me" list would mean storing
  personal data and, in Germany, double opt-in. A supporter link
  (Ko-fi/GitHub Sponsors) measures willingness to pay without that.
- **Before any paid tier**:
  - terms and the Widerruf (right of withdrawal) rules for digital
    content;
  - EU VAT through OSS, or a merchant of record (Paddle, Lemon Squeezy)
    that handles it;
  - an own domain: production runs on a free dynamic-DNS subdomain
    (`german-collocations.chickenkiller.com`), which hurts trust and may
    trouble payment providers.

## 6. Monetisation

- Unknown inputs: traffic (no baseline; section 4 fixes this) and
  conversion. Niche language tools typically convert low single-digit
  percent of active users (industry experience, not measured here).
- Break-even is low. The Linode VM is the only running cost today (the
  1 GB plan is US$5/month). At €4/month gross, VAT comes out first
  (19% in Germany, about €0.64), then merchant-of-record fees of about 5%
  + US$0.50 per transaction (about €0.65, ~17% of €4), leaving about
  €2.70 per user, so roughly 2 paying users cover the VM. Phase C adds a
  domain, an email provider and off-box backup (a few euros a month
  more). Making it worth maintaining is another matter.
- Sync is the obvious paywall because it needs a server, but it is the
  costliest part to build and run and the least distinctive (Anki syncs
  free). Selling it as protection against iOS data loss is a weak and
  slightly coercive pitch.
- Free forever: lookup, check card, saved list, practice, export,
  backup. Gating the check card or lookup would cut acquisition.
- The actual monetisation test in Phases A/B is the supporter link,
  counted with `supporter_link_clicked`.

### Alternative: a paid whole-text checker

Strongest on differentiation, since it builds on #70 and needs no
accounts. Costly to run:
- #70's rule-based parser handles 2–5-token phrases. A pasted paragraph
  needs runtime dependency parsing to find verb–object pairs.
- spaCy or Stanza on the 1 GB VM breaks the CLAUDE.md rule that Python
  runs offline only, and its memory use competes with Postgres.
- An LLM API for parsing adds per-request cost (which suits a paid
  tier) but sends learner text to a third party, which needs a privacy
  notice and processor agreement.

Worth its own evaluation if revenue is the goal. It does not compete
with Phase A, which is cheap and informs both.

## 7. Recommendation and phases

1. **Phase A0 (1–2 days)**: Impressum and Datenschutz pages; server-side
   per-day counts of word-page views and checks. Run 2–4 weeks, then set
   the A and B thresholds (section 4).
2. **Phase A1 (4–6 days)**:
   - "Merken" (save) button on every verb–noun chip and on check-card
     results. The check response gains the verb lemma and examples for
     `matched`; cards are keyed on `(relation, verb, prep, noun)`.
   - `/liste` page, marking cards that are not practisable yet.
   - JSON backup and restore; `persist()`; web app manifest and the
     home-screen note before the first save.
   - Opt-in, per-device-deduplicated local counts; supporter link.
   - Gate as in section 4.
3. **Phase B (1–2 weeks)**: practice on saved object pairs with the
   card design and v1 exclusions of section 3, intervals capped below
   7 days plus a daily review cap, after the 20-headword spot-check.
   CSV/Anki export (noun + blanked sentence → verb) ships here, reusing
   the same exclusions. Gate as in section 4.
3. **Phase C**, only if B's gate passes: off-box backup first, then
   accounts (additive tables, magic link) and sync, an own domain, and
   the legal and VAT setup. Paid features then sit on things with
   running cost.

Risks:
- **Learning claim.** Spaced retrieval helps collocations in EFL
  studies; nothing shows these particular cards beat Anki or
  Clozemaster.
- **Bad cards.** Bad cards would erode the trust in the corpus data that
  is the edge. Filter conservatively, and spot-check.
- **Lost lists.** localStorage loss is mitigated, not solved, until
  sync.
- **Scope creep.** A one-person project competing with Clozemaster.
  Keep the identity "the collocation reference with a check".
- **Operations.** User data on a VM with no restart policy and no
  off-box backup (Phase C prerequisite).
