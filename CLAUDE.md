# German Collocations — orientation for Claude Code

Read this first. It's a map, not the full history — follow the
pointers below before making architectural decisions.

## What this is

A German collocation lookup tool, built from the Leipzig Corpora
Collection. Given a word, shows what words most commonly appear
immediately before/after it, ranked by statistical significance.
Solo hobby project, progressing through numbered milestones, with a
stated goal of SEO-indexable per-word pages.

## Stack

Node.js/TypeScript monorepo (npm workspaces), Express backend,
React/Vite frontend, PostgreSQL 18, Docker Compose, Caddy reverse
proxy. Hosted on a GCP e2-micro VM (1GB RAM) — this constraint
affects every architectural choice, keep it in mind before proposing
anything memory-heavy.

One deliberate exception to "everything is Node": `tools/pos-tagging/`
is a self-contained Python project (spaCy), isolated in its own venv.
It runs offline, on a laptop, and produces a file that gets loaded
like any other corpus data. It is never containerized and never part
of the deploy path. See `tools/pos-tagging/README.md`.

## Philosophy — read before proposing a change

- **"Boring and minimal."** Prefer the standard, well-documented
  choice over the more powerful/interesting one, unless there's a
  concrete reason this project needs the extra power.
- **Additive over modifying.** New features get their own table where
  reasonable, rather than altering existing tables — especially
  `words`, which has two `STORED GENERATED` columns and triggers a
  full rewrite on `ALTER TABLE`.
- **Empirical validation before schema decisions.** Don't assume
  directionality, performance, or data shape — query it, run
  `EXPLAIN (ANALYZE, BUFFERS)`, then decide. See `decisions.md` #4 and
  the fuzzy-search session notes for the established pattern.
- **Manual dependency injection**, no DI container library.
- **Decisions are numbered and logged.** Every non-trivial choice with
  reasoning goes in `decisions.md` (or a `decisions-N-M.md` addendum
  file) as a new numbered entry — never silently reversed.

## Where the real history lives

- `decisions.md` (+ `decisions-26-28.md`, `decisions-29-32.md`,
  `decisions-33-35.md`, ...) — chronological decision log with
  reasoning. Read before revisiting any past choice.
- `architecture.md` — current schema, data pipeline, and open
  questions.
- `glossary.md` — corpus-linguistics and project-specific terms.
- `milestone-N-session-notes.md`, `production-outage-session-notes.md`,
  `fuzzy-search-session-notes.md`, `example-sentences-session-notes.md`,
  `pos-tagging-session-notes.md` — "why is it built this way" / "hit
  this error before" notes, one per feature/incident.

## Recurring failure classes (check these first when something's broken)

1. **Stale Docker images.** `docker-compose up`/`run` without
   `--build` silently reuses old images. This has caused more
   debugging detours than anything else in this project's history.
   Always `--build` after any source or migration file edit.
2. **A decision logged as applied to "both compose files" often isn't.**
   The production outage was caused by exactly this — `name:`
   present in `compose.yml`, missing from `compose.prod.yml`. When a
   decision names multiple files, verify each one individually.
3. **`ON CONFLICT DO NOTHING` only suppresses duplicate-key conflicts**,
   not FK violations — the `validIds`/lookup-map pattern is required
   to skip orphaned or unresolvable rows safely.

## Conventions

- `docker-compose` (hyphenated) in examples, unless a file explicitly
  requires v2-only features (`depends_on: condition: service_healthy`
  requires v2 — see decision #19).
- Commit messages: imperative mood.
- Migrations: plain numbered `.sql` files in `database/migrations/`,
  applied in order by the hand-rolled runner in `database/src/migrate.ts`.
- `import type` is required (not optional) for anything imported from
  a `contracts/`-style interfaces-only file — Node's type stripper
  can't resolve it otherwise. See decision from Milestone 2 session
  notes.
