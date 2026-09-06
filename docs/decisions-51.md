### 51. Frontend color/layout polish: token-based POS palette, responsive container

A frontend audit this session found the UI's color choices had
accreted across separate sessions rather than following one system:
the four part-of-speech section colors (`CollocationList.tsx`,
decision #45) and the header logo badge (decision #48) were raw
Tailwind default swatches (`blue-600`/`orange-600`/`green-600`/
`purple-600`/`indigo-600`), each with its own hand-written `dark:`
variant, bypassing the CSS-variable token system `index.css` uses for
everything else.

Considered three bigger "give the app a visual identity" directions
(a data-precision/concordance-line theme, a dictionary-headword theme,
a "Wortschatz" ledger theme) grounded in the app's actual subject
matter, per the project's front-end-design guidance. **Rejected all
three** (by the user) in favor of a narrower fix — this decision covers
only color-system and layout cleanup, not new typography, a hero
section, or any rebrand.

**Color**: added four new tokens to `index.css` (`--pos-noun`,
`--pos-verb`, `--pos-adjective`, `--pos-preposition`), following the
same `oklch(L C H)` light/dark pattern already used by
`--destructive` (same hue, higher lightness in `.dark`). Hues chosen
evenly spread around the wheel (250/65/145/300) at matched
lightness/chroma so they read as one deliberate categorical set rather
than four independently-eyeballed swatches, and clear of
`--destructive`'s hue (~25). Registered in `@theme inline` so Tailwind
generates real utility classes (`text-pos-noun`, etc.) - these need no
`dark:` variant in component code, since the underlying CSS variable
already flips under `.dark`, matching how `text-foreground` already
works elsewhere in this codebase. `CollocationList.tsx`'s
`PAINT_COLORS` map now references these instead of hardcoded Tailwind
classes; the header logo badge (`Layout.tsx`) switched from indigo to
a neutral, token-derived tone - the POS colors are the page's actual
functional use of color, so the logo doesn't need an unrelated fifth
hue competing with them.

Initial values (L=0.55 light / L=0.72-0.75 dark for the POS tokens,
solid `bg-foreground`/`text-background` for the badge) read as too
dark on user review - raised to L=0.62 light / L=0.78-0.80 dark for
the POS tokens (same hues, same chroma-matching rule, just globally
brighter), and the badge switched to `bg-primary/70 text-primary-foreground`
(alpha-blended against the page background rather than solid) so it
lightens in both color modes without introducing a non-token color.

**Section labels translated to German**: `SECTION_LABELS` (`Nouns`/
`Verbs`/`Adjectives`/`Prepositions`/`Other`) were left in English from
earlier milestones despite the rest of the UI being German (the
"Loading…" strings noted as an open gap in decision #48 remain
English, unaddressed here too - out of scope for what was asked).
Changed to `Substantive`/`Verben`/`Adjektive`/`Präpositionen`/
`Sonstige`.

**Layout**: `Layout.tsx`'s header duplicated its badge+title JSX
between the home-page and word-page branches (introduced across
decisions #48 and #48's word-page-header follow-up) - extracted into
one `Logomark` component taking a `compact` prop, so sizing is tuned
once instead of twice independently drifting. The single fixed
`max-w-xl` container (used at every viewport width, no responsive
breakpoints existing anywhere in the live app) became
`max-w-xl md:max-w-2xl` on both the header and `<main>` wrappers, so
wider viewports use more of the available width instead of a narrow
column with large dead margins. On the word-page's compact header, the
`SearchBox` was originally inline beside the logomark in a single row
(`flex items-center`) - moved to its own row below it (`flex flex-col`)
per user review.

**Rough edges fixed**: `Word.tsx`'s bare `<p>Loading…</p>` and
`<p role="alert">` now carry the same `text-center`/muted-foreground
treatment the `notFound` state already had, so all four lookup states
feel like one design. `Home.tsx` returned an empty, redundant nested
`<main>` (invalid-ish - `Layout.tsx` already renders its own `<main>`
around `children`, and the home route's actual content is the hero
Layout renders unconditionally) - changed to return `null`, since it
has no content of its own to add. `CollocationList.tsx`'s collocation
rows had `cursor-pointer` with no click handler behind them - removed,
since making rows genuinely clickable (e.g. linking to the collocate's
own word page) is a feature decision out of scope for this pass, not a
color/layout fix.

Verified: `tsc -b --noEmit` clean; confirmed via the running dev
container (bind-mounted source, Vite HMR) that the compiled CSS
contains the new `.text-pos-noun { color: var(--pos-noun) }`-style
rules with both light/dark values, and that `Layout.tsx`'s served
source no longer references `indigo`. Visual check left to the user in
a browser (opened locally) rather than an automated screenshot - no
headless-browser tooling available in this environment (same gap noted
earlier this session).

**Deployed same day**, after the brightness/layout/label revisions
above landed from user review: `git push`, `gcloud compute ssh` into
`german-collocations-instance`, `docker compose -f compose.prod.yml
build frontend`, `docker compose -f compose.prod.yml up -d frontend`.
No database changes in this decision - frontend-only rebuild/restart,
same deploy shape as decisions #48/#51's predecessor sessions.
