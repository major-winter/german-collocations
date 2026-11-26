# Phase A0: usage baseline and legal pages (design)

Status: draft for approval. Implements Phase A0 of decision #71
(`docs/superpowers/specs/2026-11-27-saved-lists-practice-evaluation.md`,
sections 4–5). To be logged as decision #72.

## Why

Decision #71 gates the saved-list feature on measured repeat use, but
the app has no traffic numbers: no analytics, no Caddy access log, and
the backend logs only its startup line. A0 gives 2–4 weeks of baseline
before anything else ships, so the Phase A and B thresholds are set
against real traffic, not guesses. The site also lacks the Impressum
(§5 DDG) and Datenschutz page it needs anyway, and those must exist
before a supporter link (A1) makes the site more clearly
"geschäftsmäßig".

## Goals

- Per-day counts of word-page lookups and parsed checks, stored in
  Postgres.
- `/impressum` and `/datenschutz` pages, linked from the footer.
- The operator's name, postal address and email stay out of git: the
  repo is public on GitHub, and history cannot be cleaned later.

## Non-goals

- No dashboard or admin page. Numbers are read with `psql` over ssh.
- No events from the browser, no beacon, no cookies, no localStorage:
  those are Phase A1 and opt-in.
- No thresholds. They are set after the baseline, in the A1 decision.
- No legal advice: the page texts are a careful default the owner
  reviews before deploy.

## Anti-goals (a failure even if it works)

- Anything that identifies a visitor: an IP, user agent, cookie or
  fingerprint stored anywhere.
- A lookup or check that fails, or gets noticeably slower, because
  counting failed.
- The owner's address appearing in a commit.
- A production legal page showing placeholder text.

## Approaches

1. **Count in the backend, in Postgres (chosen).** The backend already
   receives the requests. One upsert per counted request into a tiny
   table. No device access, so no consent question (§25 TDDDG). Costs
   one write per lookup, negligible at this traffic.
2. Caddy access logs, counted offline. Rejected: logs IPs (personal
   data), need rotation on a 25 GB disk, and parsing is manual work.
3. In-memory counters flushed periodically. Rejected: loses counts on
   every restart, and production has no restart policy; more moving
   parts than an upsert.

For the Impressum details: build-time variables from the server's
`.env` (chosen by the owner) rather than a committed page.

## Design

### Counting

- Migration `018_add_usage_counts.sql`:
  `usage_counts(day date, kind text, count integer, PRIMARY KEY (day, kind))`.
  Additive; nothing else changes.
- Kinds, a closed set in code:
  - `word_page`: `GET /api/collocations/:word` that found the word
    (would return 200);
  - `check`: `GET /api/check` that parsed (`parsed: true`).
  Not counted: 404s, 400s, errors, unparsed checks, `/api/search`
  (keystroke suggestions, not visits).
- The day is the Berlin calendar day:
  `(now() AT TIME ZONE 'Europe/Berlin')::date`, computed in the
  upsert.
- Upsert: `INSERT … ON CONFLICT (day, kind) DO UPDATE SET count =
  usage_counts.count + 1`.
- Hexagonal fit: an outbound port `UsageCounter { record(kind) }` with a
  Postgres adapter; two application decorators,
  `CountingLookupCollocations` and `CountingCheckCollocation`, implement
  the existing inbound ports by wrapping the real services. The
  composition root (`backend/src/index.ts`) wires them; handlers and
  services do not change.
- **Fire and forget.** The decorator returns the inner result without
  awaiting the count. A failed count is logged with `console.error` and
  swallowed; it never fails or delays the response.
- Known over-counts, documented in the decision so nobody reads them as
  traffic:
  - a phrase typed in the search box is checked twice: once by the
    search box, once by the card on the page it navigates to;
  - the "Erneut versuchen" (try again) retry refetches the lookup;
  - bots and the developer count like anyone else.
  React StrictMode's double effects only run in dev, so production
  is unaffected.
- Reading the numbers: a query documented in the decision entry, for
  example a weekly sum per kind, run via
  `docker compose -f compose.prod.yml exec db psql …`.

### Legal pages

- Routes `/impressum` and `/datenschutz` in `frontend/src/main.tsx`; two
  small route components; footer links in `Layout.tsx` next to the
  existing data credit.
- German text, in the app's existing typography.
- **Impressum** (§5 DDG): name, postal address and email from build-time
  variables `VITE_IMPRESSUM_NAME`, `VITE_IMPRESSUM_ADDRESS` (lines
  separated by `|`, rendered one per line) and `VITE_IMPRESSUM_EMAIL`.
  - Production: `compose.prod.yml` passes them as frontend build args from
    the server's `/root/german-collocations/.env` (which already holds
    `DB_PASSWORD` and is git-ignored), via `${IMPRESSUM_NAME}` etc.
    `frontend/Dockerfile.prod` declares the args.
  - `.env.example` lists the three names with no values.
  - Local dev: unset, so the page shows clearly marked placeholders.
  - **The production build fails** if any of the three is empty, with a
    message naming the missing variable. A deploy with a placeholder
    Impressum is worse than a failed deploy. This check lives in
    `Dockerfile.prod`, so local dev and `npm run build` are unaffected.
- **Datenschutz** covers what is true today:
  - the operator (from the Impressum variables);
  - hosting (Linode/Akamai; the data-centre region to be confirmed by
    the owner);
  - no cookies, no localStorage, no third-party scripts or fonts, no
    access logs;
  - the anonymous daily counts above (what, why, retention), with the
    legal basis of legitimate interest, Art. 6(1)(f) GDPR. No personal
    data is stored, so it is stated for transparency;
  - what typed searches do: sent to the server to answer, not stored;
  - the visitor's rights and the competent supervisory authority.
  The Phase A1 parts (saved list in the browser, opt-in counting) are
  added when A1 ships.

## Tests

- Unit: each decorator records exactly once for a found or parsed
  result, never for `null` or `parsed: false`. It returns the inner
  result even when the counter rejects, and does not wait for a slow
  counter.
- Database test: two `record("word_page")` calls on the same day give
  `count = 2`; different kinds are separate rows.
- Frontend: build passes; the footer links render; the Impressum shows
  placeholders when the variables are unset.
- Prod build guard: `docker compose -f compose.prod.yml build frontend`
  with an empty variable fails with the named message.

## Deploy notes

- Before the first deploy, the owner adds `IMPRESSUM_NAME`,
  `IMPRESSUM_ADDRESS` and `IMPRESSUM_EMAIL` to the server's `.env` and
  reviews both page texts.
- Then the usual steps: build `migrate`, `backend` and `frontend`; run
  `migrate` (018); `up -d`; check the container start times.

## Left to the builder

- Exact page wording within the content list above.
- Naming of the port, adapter and decorator files, following the
  existing `ports/out` and `adapters/postgres` patterns.
