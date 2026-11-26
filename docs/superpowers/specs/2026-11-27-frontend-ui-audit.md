# Frontend UI audit (2026-11-27)

Scope: `frontend/src` on branch `frontend-feature-ui-polish` (cut from
`backend-feature-collocation-check`, which adds the "Passt das
zusammen?" card, #70). Judged as an A2–C1 learner on a 360 px phone
and a 1280 px desktop, light and dark.

Method: read every route, component and `lib/` module, then rendered
the running dev stack (`localhost:5173`) in headless Chrome via the
DevTools protocol at 360 px and 1280 px with `prefers-color-scheme`
emulated, measuring `scrollWidth` against `clientWidth` for horizontal
overflow. Pages: `/`, `/wort/Entscheidung?pruefen=eine Entscheidung machen`,
`/wort/Sport?pruefen=Sport machen` (dark), `/wort/Frage`,
`/wort/treffen` (1280 px), `/wort/Bundesverfassungsgericht`,
`/wort/Entscheidungx` (not found).

Ranked by learner impact × confidence. "Fix" marks what this branch
changes; the rest is left for later with a reason at the end.

## 1. Verb-page chips run the article into the noun — Fix

`/wort/treffen` shows chips as **dieEntscheidung**, **derNerv**,
**dasMitglied (sich)**. `chipParts` returns `"die"` and `" Entscheidung"`
correctly (tested), but `VerbNounPairs.tsx:97-117` renders each part as
a `<span>` directly inside an `inline-flex` button. Every span becomes a
flex item, and a flex item's leading/trailing whitespace is dropped, so
the space vanishes. Every verb page is affected, and the chip is the
thing a learner copies (#69 added the article precisely so they learn
it).

## 2. Long compounds overflow the page on phones — Fix

`/wort/Bundesverfassungsgericht` at 360 px: `scrollWidth` 587 vs.
`clientWidth` 360, the whole page scrolls sideways and the
"Substantiv" label is pushed off-screen. Cause: the headword
`<h2 className="font-serif text-4xl">` (`Word.tsx:111-118`) sits in a
non-wrapping flex row with no `min-w-0`, no `overflow-wrap` and no
hyphenation. German compounds make this common, not an edge case. The
same row also breaks *die Entscheidung* across two lines at 360 px
with "Substantiv" floating at the far right (`Word.tsx:111`).

## 3. Keyboard focus is nearly invisible — Fix

`index.css:135` gives every element `outline-ring/50`: half-transparent
`oklch(0.708 0 0)` on white, roughly 1.5:1, below WCAG 2.2 non-text
contrast (3:1) and hard to see for 2.4.7. Chips (`VerbNounPairs.tsx:97`),
example-word and suggestion links (`Home.tsx:32`, `Word.tsx:92`) and
the logo link (`Layout.tsx:11`) have no focus style of their own. The
shadcn `Input`/`Button` use `focus-visible:ring-ring/50`, same weak
grey. In dark mode `--ring` is `oklch(0.556 0 0)` (`index.css:113`).

## 4. Collocation list is a wall of grey italics with no labels — Fix

`CollocationList.tsx:48-71`: each entry (e.g. *politisch*, *richtig*)
renders only its example sentences. There is no visible lemma, so the
"Adjektive" section of *Entscheidung* is ~20 italic grey lines where the
learner must find the green word in each sentence to know which partner
the next three lines belong to. Entries are separated only by
`gap-1.5` (6 px), the same rhythm as sentences inside an entry. Each
row also has `hover:bg-accent/50` (`:50`) although it is not
interactive (the cursor-pointer was removed in an earlier decision for
the same reason).

## 5. Lookup states are cramped and dead-ended — Fix

- Loading, error and not-found render flush against the header
  (`Word.tsx:75`, `:79`, `:84`), unlike the ok state's `mt-6`.
- The error state (`Word.tsx:78-80`) has no way to retry except the
  browser reload.
- Not-found (`Word.tsx:82-106`): "Keine Ergebnisse für …" and
  "Meinten Sie:" are two plain lines with no spacing between them and
  the chip row; the chips use `rounded-md` while every other chip in
  the app is `rounded-full` (`Word.tsx:93`).
- Loading text is not announced (`Word.tsx:75`, no `role="status"`).

## 6. Search box gives no feedback while a phrase is checked — Fix

`SearchBox.tsx:22-36`: a 2+ word query awaits `/api/check` before
navigating. Nothing changes on screen in the meantime and a second
Enter fires a second request. The field also lacks `enterKeyHint`
(phone keyboards show "Return", not "Suchen") and `autoComplete="off"`
(browser history dropdown covers the results).

## 7. Check card: verdict not announced, empty field unexplained — Fix

- `CollocationCheckCard.tsx:138`: after "Prüfen" the verdict appears
  above the field, out of view of a screen-reader user's focus, with no
  live region.
- The bare "Verb prüfen" field on every noun page (`:143-149`) has no
  placeholder, so a learner doesn't know it wants *one verb*. Phone
  keyboards capitalise the first letter ("Machen") and autocorrect
  German verbs; the field sets neither `autoCapitalize` nor
  `spellCheck`/`autoCorrect`.

## 8. Logo link is a 28 px touch target — Fix

`Layout.tsx:11-12`: on phones the link is only the 28 × 28 "WN" mark
(the "Wortnetz" text is `sr-only` below `sm`). Below the 40 px target
size this project uses elsewhere (`min-h-11`).

## 9. Inconsistent type scale for section headings — Fix (small)

Group headings use an arbitrary `text-[0.95rem]` in two places
(`CollocationList.tsx:39`, `VerbNounPairs.tsx:88`); everything else
uses the Tailwind scale. Spacing between groups is `gap-4` + `py-3`
(40 px) but the gap from the check card to the first group is
`mt-4` only (`CollocationCheckCard.tsx:137`), so the card visually
attaches to the verb chips under it.

## 10. Phrase checking is undiscoverable from the home page — Fix (copy)

`Home.tsx:22-25` explains single-word lookup only. The search box can
now take *eine Entscheidung machen* (#70), but nothing tells the
learner. One sentence with an example link costs nothing.

## Checked and fine

- Dark mode: word-class colours, open chip (white on near-black),
  verdict pill and the card all read well; `muted-foreground`
  `oklch(0.708)` on `oklch(0.145)` passes AA.
- Light `muted-foreground` `oklch(0.556)` on white ≈ 4.7:1 (AA for the
  grey example sentences); the word-class colours were tuned to AA in #63.
- Landmarks: `header`, `main`, `footer`, `role="search"`; heading order
  h1 (logo, `sr-only` on phones) → h2 headword → h3 groups.
- Chips, search and home links are ≥ 44 px tall on phones.
- No horizontal scroll at 360 px on *Entscheidung*, *Frage*, *Sport*,
  home, not-found.
- The check card copy matches the spec
  (`2026-11-26-collocation-check-design.md`) word for word.

## Left for later

- **Suggestions in the check card are not links.** Tapping
  *Entscheidungen treffen* could open that chip. That's new behaviour,
  not polish.
- **Chip group semantics.** One open chip per group behaves like a tab
  list; `aria-pressed` buttons are acceptable, a full `tablist` with
  arrow keys would be a larger change worth its own decision.
- **Grey italic example sentences.** Italic at `text-base` in grey is a
  deliberate look (#63's "quiet" variant); changing it needs the same
  prototype-and-pick process.
- **Long chip lists (10+) on phones** take several screens on
  *Entscheidung*. Collapsing to "mehr …" is a ranking/UX decision.
- **Loading skeleton.** A text line is enough for the usual sub-second
  lookup; a skeleton adds code for little gain.
