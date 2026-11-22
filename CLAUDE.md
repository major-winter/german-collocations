# German Collocations — orientation for Claude Code

Read this first. It's a map, not the full history — follow the
pointers below before making architectural decisions.

## What this is

A German collocation lookup tool.

Extract verb with accusative objects from a text corpus.

## Stack

Node.js/TypeScript monorepo (npm workspaces), Express backend,
React/Vite frontend, PostgreSQL 18, Docker Compose, Caddy reverse
proxy. Hosted on a Linode VM with 1 GB RAM, 1 CPU core and 25 GB
storage — this constraint affects every architectural choice, keep it
in mind before proposing anything memory-, CPU- or disk-heavy.

One deliberate exception to "everything is Node": `tools/pos-tagging/`
is a self-contained Python project (spaCy), isolated in its own venv.
It runs offline, on a laptop, and produces a file that gets loaded
like any other corpus data. It is never containerized and never part
of the deploy path. See `tools/pos-tagging/README.md`.

## Workflow

A new feature on a new branch.
A branch name can be 'frontend-feature-a-short-name' or 'backend-bug-a-bug-name'

## Commands

Local dev runs through Docker Compose, not host `npm run dev` (Colima
is the daemon; `colima start` if it's down). Always `--build`.

- Start everything: `docker-compose up -d --build` (db → migrate →
  backend :3000, frontend :5173 with bind-mounted source).
- Loaders/extractors are `profiles: ['manual']` services, e.g.
  `docker-compose --profile manual run --build loader`; see
  `compose.yml` for the full list (`extract-examples`, etc.).
- Tests (Node's built-in runner, TS run directly via type stripping —
  no Jest/Vitest, no build step): `npm test` from the root; single
  file: `node --test backend/src/domain/verbNounPhrases.test.ts`.
- Database tests (decision #67): `npm run test:db -w backend`, against a
  throwaway `collocations_test` database in the running dev Postgres. They
  are `*.dbtest.ts` files, so plain `npm test` never needs a database.
- Typecheck: `npm run typecheck -w backend` (or `-w database`). The
  root `typecheck` script has a typo (`--worksspaces`) and doesn't work.
- Frontend: `npm run lint -w frontend`, `npm run build -w frontend`
  (`tsc -b && vite build`).

## Architecture

Per-package structure is in the code. The loader scripts in
`database/scripts/` run in a fixed order; it is recorded in
`docs/decisions.md` and the session notes, not in the scripts themselves.
Database and loader pitfalls are in `database/CLAUDE.md`.

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
  `EXPLAIN (ANALYZE, BUFFERS)`, then decide.
- **Manual dependency injection**, no DI container library.
- **Decisions are numbered and logged.** Every non-trivial choice with
  reasoning goes at the end of `docs/decisions.md` as a new numbered
  entry, added to its index — never silently reversed.

## Where the real history lives

- `docs/decisions.md` — chronological decision log (#33 onwards; #1-32
  are not in this repo) with reasoning and an index. Read before
  revisiting any past choice.
- `docs/pos-tagging-session-notes.md`,
  `docs/1M-corpus-upgrade-session-notes.md` — "why is it built this
  way" / "hit this error before" notes, one per feature/incident.
- `database/migrations/*.sql`, in order — the current schema.

## Recurring failure classes (check these first when something's broken)

1. **Stale Docker images.** `docker-compose up`/`run` without
   `--build` silently reuses old images. This has caused more
   debugging detours than anything else in this project's history.
   Always `--build` after any source or migration file edit.
   Two things that make this worse in production, both hit during the
   1M corpus upgrade: `docker compose build` with no service names
   silently skips any service gated behind `profiles: manual` (build
   it explicitly, or pass `--profile manual`); and building a fresh
   image does **not** restart an already-running long-lived service
   (`backend`/`frontend`/`caddy`) — follow `build` with `docker
   compose -f compose.prod.yml up -d`, or the old container keeps
   serving the old code indefinitely with no error. Verify with
   `docker inspect <container> --format '{{.State.StartedAt}}'`
   against the image's build time if a deploy "doesn't seem to have
   taken."
2. **A decision logged as applied to "both compose files" often isn't.**
   The production outage was caused by exactly this — `name:`
   present in `compose.yml`, missing from `compose.prod.yml`. When a
   decision names multiple files, verify each one individually.
3. **Database and loader pitfalls** (`ON CONFLICT` vs FK violations,
   unstable Leipzig word IDs, `DISTINCT ON` view re-aggregation) live in
   `database/CLAUDE.md`. Any new pipeline outside `database/` that scans
   the raw corpus (e.g. `tools/pos-tagging/`) must apply the same
   stopword/non-alphabetic filters as `database/src/filters.ts`.
4. **Production moved from GCP to Linode; old deploy notes describe
   the wrong host.** Production is a Linode VM, reached with `ssh
   root@139.162.13.171`, with one checkout, `/root/german-collocations`,
   owned by root (no `sudo -u`). Decisions #48-#55 describe the old GCP
   VM (`gcloud compute ssh`, two checkouts under different OS-login
   users); don't follow their deploy steps. Before trusting `git
   log`/`git status` on the VM, confirm the live checkout with `docker
   inspect <container> --format '{{index .Config.Labels
   "com.docker.compose.project.config_files"}}'`.

## Conventions

- `docker-compose` (hyphenated) in examples, unless a file explicitly
  requires v2-only features (`depends_on: condition: service_healthy`
  requires v2).
- Commit messages: imperative mood.
- Migrations: plain numbered `.sql` files in `database/migrations/`,
  applied in order by the hand-rolled runner in `database/src/migrate.ts`.
- `import type` is required (not optional) for anything imported from
  a `contracts/`-style interfaces-only file — Node's type stripper
  can't resolve it otherwise.
