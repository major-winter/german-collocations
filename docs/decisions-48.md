### 48. Word-page header redesign, German-language empty states

Three small, independent frontend changes made together in one session:

**Compact header on word pages.** The header was a large centered hero
(`text-4xl` title + subtitle) on every route, including `/wort/:word`
pages. Since most traffic to an SEO-indexable per-word page lands
directly on that page rather than the home route, the full hero pushed
actual collocation results below the fold on every lookup. `Layout.tsx`
now branches on whether the current route matches `/wort/:word`: the
home route keeps the large centered hero; word pages get a compact,
single-row header (small "DK" badge + neutral-weight title + search
box inline) instead.

Went through two visual iterations before landing here. First attempt
colored just the word "Kollokationen" in indigo, both to give the
brand a first accent color and to signal the smaller word-page header
was intentional, not a broken layout. Reviewed live and rejected:
coloring one word in the title read as arbitrary, and indigo had no
connection to anything else in the app - `CollocationList.tsx`
(decision #45) already uses blue/orange/green/purple to distinguish
POS sections, so an unrelated indigo on the page title risked reading
as another, undocumented category. Replaced with a small colored "DK"
badge preceding the (fully neutral-color) title text instead - reads
as a logomark rather than a semantic color, and collapses cleanly to
just badge + inline search on the word-page layout.

**German-language empty states.** `CollocationList.tsx`'s "No results."
and `Word.tsx`'s `No results for "{word}".` were left in English from
earlier milestones despite the rest of the UI (header, subtitle) being
German. Changed to "Keine Ergebnisse." and `Keine Ergebnisse für
„{word}“.` respectively. Not done in this pass: `Word.tsx`'s "Loading…"
and "Did you mean:" strings are still English - out of scope for what
was asked, noted here so a future pass doesn't assume the page was
fully localized.

**Centered empty states.** Both of the above empty-state blocks
(`Word.tsx`'s not-found message + suggestion chips, and
`CollocationList.tsx`'s zero-entries message) were left-aligned by
inheriting the page's default alignment, which reads oddly for a
message with no accompanying list or card grid to align against.
Both now center (`text-center`, plus `justify-center` on the
suggestion-chip flex row).

**Deploy-mechanism correction to #46**: this session reached the
production VM directly via `gcloud compute ssh` (instance
`german-collocations-instance`, zone `us-central1-a`) - both raw TCP
to port 22 and the gcloud-brokered SSH session worked from this
sandbox, contradicting #46's "there's no SSH access to the VM from
here either." Whatever blocked #46 was likely specific to that
session's egress policy for arbitrary-domain HTTP (the `curl` case
#46 actually needed), not a blanket restriction on this sandbox
reaching the VM at all. `gcloud compute ssh` also sidesteps needing a
stored username/key: it provisions a short-lived keypair via instance
metadata itself. One wrinkle worth recording for future sessions: the
account `gcloud compute ssh` logs in as (`tuanchu`, an OS Login
identity) does not own the live checkout - that's
`/home/tuanchuhoang/german-collocations`, per decision-log convention
#5 - so commands need `sudo -u tuanchuhoang` to operate on it.

Deployed same session: `git push` → `gcloud compute ssh` → `sudo -u
tuanchuhoang git pull` → `docker compose -f compose.prod.yml build
frontend` → `docker compose -f compose.prod.yml up -d frontend`.
Verified via `docker inspect`'s `StartedAt` matching the fresh image's
build time, and by grepping the live container's built CSS bundle for
the new indigo class name.
