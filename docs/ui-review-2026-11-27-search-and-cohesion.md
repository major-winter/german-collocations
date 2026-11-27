# UI review (2026-11-27): search box vs. check field, and visual cohesion

Audit only. No product code was changed.

**Scope.** Two questions from the dispatch:

- **A.** Should the header search box (`SearchBox`) and the "Verbindung
  prüfen" field on the noun page (`CollocationCheckCard`) be merged, and
  how?
- **B.** Five ways to make the frontend look more cohesive, ranked by
  what each is worth to a learner for the work it takes.

Context read: decisions #62, #63, #69, #70, #74, #75, #76, and the
earlier audit `docs/superpowers/specs/2026-11-27-frontend-ui-audit.md`.
Its "Left for later" items are not raised again here, except where this
review gives a new reason to look at them (B2, B3).

**Method.** I used the dev stack (`docker-compose up -d --build`,
frontend on :5173) at `main` `7848858`. I rendered it in headless Chrome
through the DevTools protocol at 360×780 (mobile emulation) and
1280×900, with `prefers-color-scheme` emulated light and dark: 13 pages ×
4 combinations, 52 screenshots. The script measured `scrollWidth` against
`clientWidth`, element boxes, computed fonts, radii, live regions and Tab
order. A second script typed into both fields and submitted them with a
real Enter key. Contrast was computed from the `oklch` tokens in
`index.css`.

Pages: `/`, `/wort/Entscheidung`, `/wort/Frage`, `/wort/treffen`,
`/wort/Bundesverfassungsgericht`,
`/wort/Entscheidung?pruefen=eine Entscheidung machen`, `/wort/Sitzung`,
`/wort/Sitzung?pruefen=an einer Sitzung teilnehmen`,
`/wort/Sitzung?pruefen=bei einer Sitzung teilnehmen`,
`/wort/Regen?pruefen=schwerer Regen`, `/wort/Sitzung?pruefen=Sitzung sehr lange`
(unparsed), `/wort/Entscheidungx` (not found), `/impressum`.

The screenshots are in the session scratchpad, not in the repo.

**Baseline that holds.** None of the 52 renders overflows horizontally.
Every check page has an `aria-live="polite"` region. Tab order is logo →
search field → search button → check field → "Prüfen" → chips, and each
has a visible 2 px ring (`--ring` 0.45 light, 0.708 dark). Phone touch
targets are 40–44 px.

---

## A. Search box and check field

### What a learner meets today

On `/wort/Sitzung` at 360 px there are **two text fields 200 px apart**,
both above the fold. They usually hold different text:

| | Header search box | Card field |
|---|---|---|
| Position (360 px) | y = 12, 276 × 44, sticky | y = 214 (no check) or y = 427 (after a check), 224 × 40 |
| Label / placeholder | "Wort suchen" / "Geben Sie ein Wort ein…" (`SearchBox.tsx:50-51`) | "Verbindung prüfen" / "Wort oder Verbindung" (`CollocationCheckCard.tsx:208-217`) |
| After a check | resets to "Sitzung" (`Layout.tsx:26`, page word only) | shows "bei einer Sitzung teilnehmen" (`CollocationCheckCard.tsx:169`) |
| Phrase (2+ words) | check, then navigate (`SearchBox.tsx:32-39`) | check (`checkQueryFor`) |
| Single word | **lookup**, leaves the page (`leiten` → `/wort/leiten`) | **check** with the page's noun (`teilnehmen` → `Sitzung teilnehmen`) |
| Phrase the server can't parse | falls through to a plain search → "Keine Ergebnisse für „Sitzung sehr lange“" with 11 look-alike words (`SearchBox.tsx:41`) | hint "Das können wir nicht prüfen … z. B. *Entscheidung treffen* …" (`CollocationCheckCard.tsx:197-202`) |
| Submit | ghost magnifier icon | solid "Prüfen" button |
| Exists on | every page | noun pages with obj/obl pairs or adjectives only; not on `/wort/treffen` |

For phrases the two fields do exactly the same thing. I typed
*bei einer Sitzung teilnehmen* into the search box on `/wort/treffen`. It
went to `/wort/Sitzung?pruefen=…` and showed the same verdict the card
gives. The phrase then **moved** from the header field into the card
field, and the header went back to "Sitzung". The search box also calls
`/api/check`, and the card calls it again for the same phrase on arrival
(`SearchBox.tsx:34`, then `CollocationCheckCard.tsx:163`), so every phrase
search costs two check requests.

The only real difference is a single word. That is where the card misleads
with prepositional verbs since #76:

> Typing **teilnehmen** in the card on `/wort/Sitzung` sends
> `Sitzung teilnehmen`, which the server reads as an object check. The
> card says **"Nicht typisch … ist *teilnehmen* kein typisches Verb zu
> *Sitzung*"** and suggests *Sitzungen abhalten, die Sitzung leiten*.
> Yet *an den Sitzungen teilnehmen* is the first chip in the
> "Präposition + Sitzung + Verb" group on the same page.
> Screenshot: `card-single-teilnehmen-360.png`.

`Sitzung an` gets an adjective verdict for *an* ("kein typisches
Adjektiv"). The single-word path cannot express a preposition, and the
learner cannot tell what it did with their word.

So the learner has to guess which field to use and why the same phrase
gives different results in each. In the one case where the fields
differ, the card can give the wrong answer.

### Option 1: one field, the header search box (recommended)

The card keeps the verdict and loses its form. The header search box is
the only input on every page.

- **Phone.** One field, sticky at the top, so it is always in reach.
  Today the card field scrolls away with the verdict. With a check in the
  URL, the header field shows the phrase (*bei einer Sitzung
  teilnehmen*) instead of resetting to the noun. The learner corrects
  *bei* to *an* in place and presses the keyboard's "Suchen" key.
  Without a check, the noun page shows one muted line under the legend,
  for example: "Passt ein Wort zu *Sitzung*? Geben Sie oben die ganze
  Verbindung ein, z. B. *die Sitzung leiten*." The example is a link that
  runs that check.
  Known cost: a long phrase does not fit in the 276 px field (about
  216 px usable after the button padding). The card field truncates the
  same phrase today ("teilnehmer|").
- **Desktop.** Same behaviour. The card becomes a pure result block, the
  same height as today minus the form row (about 45 px).
- **Single word.** It always means "look this word up", as on every other
  page. To check *leiten* with *Sitzung*, the learner types *Sitzung
  leiten*, 8 more characters. The *teilnehmen* trap disappears from the
  card. A bare verb typed with its noun in the search box still has the
  trap; see the `product-builder` candidates.
- **Placeholder and label.** Placeholder "Wort oder Verbindung", label
  "Wort suchen oder Verbindung prüfen". The home page sentence about
  checking phrases (`Home.tsx:43-59`) stays.
- **Keyboard.** Tab stops drop from 5 to 3 before the chips. Enter in the
  only field does both jobs. Focus stays in the header after a check,
  which is right for a correct-and-retry loop.
- **Screen reader.** One `role="search"` landmark with one input. The
  verdict is still announced from the card's existing `aria-live`
  region. That region mounts empty when the word page renders and fills
  when `/api/check` returns, so it is announced; still to confirm with
  VoiceOver on iOS. The confusing pair of "Wort suchen" and "Verbindung
  prüfen" fields goes away.
- **Cost (S–M, about half a day).** Six files.
  - `SearchBox.tsx`: initial value from `?pruefen`; label and placeholder.
  - `Layout.tsx`: read the search params.
  - `CollocationCheckCard.tsx`: remove the form, the `phrase` state and
    the `setPhrase`; add the hint line.
  - `Word.tsx`: `showField` becomes `showHint`.
  - `lib/collocationCheck.ts`: drop `checkQueryFor` and its tests; add a
    tested `searchFieldValue(word, pruefen)`.
  - `docs/decisions.md`: a new entry.
  - The double request can go too: pass the check result in
    `navigate(target, { state })` and let the card use it when the query
    matches.
- **Risk.**
  - It **amends #75**, which the user chose ("the card's field takes a
    whole phrase … pre-filled"). That needs the user's decision, not a
    silent reversal.
  - Learners lose the one-word shortcut. The usage counts (#72) do not
    record which field a check came from, so there is no data on how
    often it is used. If that matters, log the source for a week first.
  - On noun pages without lab pairs, nothing points at checking except
    the hint line.

### Option 2: keep both fields, make them one visible system

Both fields stay, and the differences that are accidents go away.

- The card field states its scope. Its label becomes "Mit *Sitzung*
  prüfen", and a single word shows as *Sitzung* + *leiten* in the verdict
  line, as today. Placeholder: "z. B. leiten, an … teilnehmen".
- **Same failure for the same input.** The search box sends an unparsed
  phrase of three or more words on a noun page to the card's hint, not
  to "Keine Ergebnisse". Two-word fallbacks such as *seit langem* still
  search, as in #70.
- **Same controls.** Both submit buttons are either the icon or the
  text; today one is a ghost magnifier and one is a solid primary
  "Prüfen", which also looks exactly like the open chip below (see B3).
- No double request: the same `navigate` state trick as in Option 1.
- **Phone and desktop:** unchanged layout.
- **Single word:** unchanged. The *teilnehmen* trap stays until the
  backend handles it.
- **Keyboard and screen reader:** unchanged order. The card field's
  accessible name gets the noun ("Mit Sitzung prüfen").
- **Cost (S, 1–2 hours):** `SearchBox.tsx`, `CollocationCheckCard.tsx`,
  `lib/collocationCheck.ts` (+ test). No decision needed beyond a line
  amending #75.
- **Risk:** low, but it keeps the "which field?" question. Two fields
  with overlapping jobs is the thing the dispatch flagged.

### Option 3: one header field, scoped to the noun by a removable token

On a noun page the header field starts with a token, "Sitzung ×". With
the token, a single word is a check (*leiten* → *Sitzung leiten*).
Removing the token (× or Backspace at the start) turns it back into a
plain lookup.

- **Phone:** the token takes about 80 px of the 276 px field, and much
  more for *Bundesverfassungsgericht* (it would need truncation).
- **Single word:** kept. But typing a new word to look it up (*Frage* on
  the *Sitzung* page) silently becomes the check *Sitzung Frage* unless
  the learner first notices the token and removes it.
- **Keyboard and screen reader:** a custom token-input pattern. The
  token needs its own button ("Bezug Sitzung entfernen"), Backspace
  handling and an announcement when it is removed. Neither shadcn nor
  `@base-ui` ships it.
- **Cost (M–L):** a new component plus tests for the token logic.
- **Risk:** high. It is non-standard ("boring and minimal"), and it
  creates a new ambiguity in the place learners use most.

### Recommendation

**Option 1.** For phrases the two fields already do the same thing. They
differ only on single words, where the card's guess is either redundant
(*Sitzung leiten* is one tap away as a chip) or wrong (*teilnehmen*). One
sticky field that shows the current phrase is the shorter loop on a
phone. Because it amends #75, ask the user first. If the user wants to
keep the shortcut, do Option 2 instead; its two parity fixes (the
unparsed hint and the double request) are worth doing in either case.

---

## B. Five ways to make the frontend more cohesive

Ranked by learner value for the work. Each one can be done alone.

### B1. The logo is drawn in the noun colour, and fails contrast in dark mode (S). Fix first

The "WN" mark is `bg-pos-noun text-white` (`Layout.tsx:12`).

- **Dark mode:** white on `--pos-noun` `oklch(0.80 0.15 250)` measures
  **1.92:1**. It is 12 px semibold text, so AA needs 4.5:1. Visible in
  every `*-dark.png` (for example `notfound-360-dark.png`, top left).
- **Rules:** this also breaks #63's own rule: "the `blue-900` header
  shared a hue with the noun blue, so 'blue' meant both site chrome and
  'noun'". #63 made the header neutral but left the mark blue. A
  learner who has just read "Blau das Substantiv" on the home page sees
  blue chrome.
- **Fix:** `bg-foreground text-background`, the same pair as the open
  chip, which keeps colour for word classes only. One class string; no
  decision needed (it applies #63).

### B2. Partners appear in four different shapes, one of them 3,000 px long (M). Needs a decision

On `/wort/Sitzung` (360 px) the same kind of thing, a partner of the
headword, is drawn four ways:

1. **Verb pairs:** chips; one open chip with its phrase and three
   examples (`VerbNounPairs.tsx:95-130`).
2. **Adjectives / nouns / others with examples:** a serif lemma plus
   three italic sentences, **every entry expanded**
   (`CollocationList.tsx:44-58`). The "Adjektive" group runs from
   y = 1772 to y = 5024: **3,250 px, four phone screens**. The whole page
   is 5,839 px; *Entscheidung* is 6,647 px.
3. **Entries without examples:** a grey bold headword and a coloured
   partner on one line, in sans (`CollocationList.tsx:60-66`): see
   `bvg-360-light.png`, "Bundesverfassungsgericht angeordnet".
4. **Check suggestions:** "→ *starker Regen*" lines in serif 18 px. They
   look like the open phrase but **cannot be tapped**
   (`CollocationCheckCard.tsx:116-123`).

The learner scanning adjectives has to read sentences, while for verbs
they scan chips.

- **Fix:** render the `CollocationList` groups with the `VerbNounPairs`
  chip pattern: a chip row and one open entry with its examples. Extract
  the chip button and the open block into a shared component. Entries
  without examples become chips that open to the bare pair.
- The earlier audit left "long chip lists" and "grey italic sentences"
  for later. This is a different argument: one pattern for one job, and
  four fewer screens on a phone.
- It sets a layout rule, so it needs a numbered decision. It also needs
  a check that `highlightCollocates` colouring still reads with one open
  entry. #63's prototype-and-pick process fits.

### B3. Things that look alike behave differently (S)

Three look-alikes and one exception:

- **The verdict pill looks like a chip.** "Nicht typisch" / "Üblich ✓"
  is a `rounded-full border` pill (`CollocationCheckCard.tsx:62-69`), the
  same shape as the tappable chips 150 px below. Usual and unusual differ
  only in grey versus black text (4.73:1 versus about 18:1). Make it a
  label, not a pill (for example small caps text with a leading ✓ or ✗
  glyph). That keeps #63's no-colour rule and stops it reading as a
  button.
- **The "Prüfen" button looks like the open chip.** Both are solid
  `bg-foreground` (`CollocationCheckCard.tsx:224`;
  `VerbNounPairs.tsx:104`): an action and a state in one style. This is
  moot under Option 1. Under Option 2, use `variant="outline"`.
- **Suggestions are not links.** Everything else that names a partner
  can be tapped. Make each suggestion a link to
  `?pruefen=<suggestion phrase>`: tapping *an den Sitzungen teilnehmen*
  shows it as "Üblich" with the matched phrase. It is pure frontend:
  `checkTarget` already builds the URL.
- **Chip borders measure 1.26:1** (`--border` 0.922 on white) and about
  1.2:1 in dark mode. The chip is recognisable by shape and text, so
  this is not a WCAG failure, but it is faint on a sunlit phone. One
  token step (`--border` 0.87) would help every chip and the card at
  once. Check the card and the header rule do not get heavy.

### B4. Empty, not-found and "can't check" states each speak differently (S)

| State | Where | Look |
|---|---|---|
| Not found | `Word.tsx:100-126` | centred, serif 24 px h2. `hyphens-auto` splits "Sit-zung" (`search-unparsed-360.png`) |
| Error | `Word.tsx:89-97` | centred, plain 16 px + outline button |
| Loading | `Word.tsx:83` | centred, 14 px muted |
| No partners | `CollocationList.tsx:32` | centred 14 px muted "Keine Ergebnisse." |
| Unparsed check | `CollocationCheckCard.tsx:197-202` | left-aligned 14 px muted, inside the card |
| No data | `CollocationCheckCard.tsx:103-113` | left-aligned, inside the card |

The word page itself is left-aligned. The states switch between centred
and left-aligned, serif and sans, and "Keine Ergebnisse" versus "Keine
Daten". The search box's unparsed phrase lands on the not-found page,
while the card's lands on a helpful hint (section A).

- **Fix:** one small `StatusMessage` (title + one sentence + optional
  action) used by all six, left-aligned like the content they replace,
  with no `hyphens-auto` on a sentence heading. Keep the wording.
- No decision is needed if it only reuses the existing type scale.

### B5. Two type roles, applied unevenly (S)

The computed fonts on `/wort/Sitzung` show the system serif at 30, 20 and
18 px and the sans at 16, 14 and 12 px. The serif mostly marks German
language content (headword, phrases, lemmas), but not always:

- Group headings (h3) are sans 16 px / 500, **muted**
  (`VerbNounPairs.tsx:88`, `CollocationList.tsx:37`). The lemmas under
  them are serif 18 px **black** (`CollocationList.tsx:48`), so a child
  looks heavier than its heading.
- The open phrase is indented 8 px (`px-2` on a `rounded-lg` box with no
  background, `VerbNounPairs.tsx:44`), as are the list entries
  (`CollocationList.tsx:44`). Chips and headings sit at 0. Visible in
  `sitzung-an-1280-light.png` ("Sitzungen abhalten" sits right of the
  chip row).
- No-example entries in sans (B2, case 3) and the 12 px footnotes inside
  the card are further variants.

**Fix:** write the rule into `index.css` as two or three `@utility`
classes, a numbered decision, and apply them:

- **Serif** = German phrases: headword `3xl`, phrase `xl`, lemma `lg`.
- **Sans** = interface: headings `base` / `medium` in foreground, not
  muted.
- **Alignment:** everything left-aligned to the chip row (drop the
  `px-2`).

Lower value than B1–B4 because nothing is wrong, only uneven. But B2
and B4 get easier when these classes exist.

---

## Candidates for the `product-builder` (not frontend)

1. **A bare verb with its noun ignores prepositional pairs.**
   `Sitzung teilnehmen` → obj → "Nicht typisch", although
   `an den Sitzungen teilnehmen` is the noun's first obl pair. When the
   obj verdict is unusual and the verb has an obl pair with the noun
   above `MIN_OBL_SCORE`, the response could say "meist mit Präposition"
   and suggest the obl phrase. That matters under every option in A,
   because learners will type *Sitzung teilnehmen* in the search box too.
2. **A preposition as the "adjective".** `Sitzung an` returns
   `relation: "amod"`, adjective *an*, "Nicht typisch". It should be
   unparsed (show the hint).
3. **Mojibake in examples.** `/wort/Sitzung`, adjective *vergangen*:
   "â€žOrga-Teamâ€œ" (UTF-8 read as Windows-1252, then re-encoded). A
   corpus or loader encoding issue; a grep over `*_examples` for `â€`
   would size it.
4. **Odd entries for long compounds.** "Bundesverfassungsgericht
   angeordnet / empfohlen" as adjectives and *Müsst* under "Sonstige":
   window co-occurrence noise; low priority.

## Checked and fine

- No horizontal overflow at 360 px on any of the 13 pages, light or
  dark, including *Bundesverfassungsgericht*, which hyphenates.
- The prepositional checks render correctly in both themes.
  - *an einer Sitzung teilnehmen* shows "Üblich ✓" and the matched
    *an den Sitzungen teilnehmen*, the noun blue and the verb orange.
  - *bei einer Sitzung teilnehmen* shows "Nicht typisch", the
    struck-through typed phrase, and "Mit *teilnehmen* steht bei
    *Sitzung* meist eine andere Präposition", with the right phrase
    suggested.
- Word-class colours: noun 5.94:1 and verb 5.07:1 on white; muted text
  4.73:1 light and 7.63:1 dark.
- The focus ring is visible on every stop in the first eight Tab stops,
  in both themes.
- The card's `aria-live` region and the loading `role="status"` /
  error `role="alert"` are present.

## Left for later

- **The case a preposition takes** (#76 "Left out", improvement idea 12)
  needs data first.
- **Tab-list semantics for chip groups**: unchanged from the previous
  audit. If B2 makes every group a chip row, revisit it then, once.
- **A phrase longer than the field on a phone** (both fields truncate):
  accept it. A multi-line field would change Enter semantics.
