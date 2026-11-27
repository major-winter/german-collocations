# Architecture review, 2026-11-27

Scope: the repo at `main` `0a70406` and the local dev stack. Production
was not contacted. Where a production number matters, the command to get
it is in "Could not measure". Local numbers come from a 2-CPU / 2 GB
Colima VM on an Apple-silicon laptop, which is faster than the 1 vCPU
Linode, so treat them as lower bounds for production latency.

## Summary

The code can carry the roadmap. The hexagonal backend (#65, #68) gives
every planned feature a seam: the adjective + noun check, the saved list,
gap-fill and even accounts all fit as new ports, adapters and additive
tables. The operations around it are the weak part. **One dropped
database connection kills the backend process. I reproduced this
locally: exit code 1, because there is no `pool.on('error')`.
`compose.prod.yml` sets no restart policy, so in production that crash,
a Postgres restart or a VM reboot leaves the site down until the owner
notices.** All three follow-ups from the 2026-11-22 review are still
open. Nothing off the VM backs up the data that cannot be rebuilt:
`usage_counts` (the #71 gate baseline) and the `collocation-lab` repo and
database. The frontend cannot be deployed at all while `IMPRESSUM_EMAIL`
is unset on the server (#73 follow-up). That blocks the next proposed
increment, and it probably means the live site has no Impressum. On
performance, verb–noun, adjective and check queries take 0.2–11 ms. The
logDice window query does not: for very frequent headwords it takes
0.1–0.5 s and touches 4 GB of buffers per call (*haben*). It is the first
thing a larger corpus or real concurrency will break. It is not a
problem at today's traffic. The fix is a load-time table, not a cache.

## 1. The app as it is

| Layer | What it does | Cost to run | Shaped by |
|---|---|---|---|
| Backend | Express 5 on Node 24 with type stripping and no build step. `domain/` holds pure rules (grouping, `mergeSections`, `verbNounPhrases`, `collocationCheck`). `application/` holds three use cases: `LookupCollocations`, `SearchWords` and `CheckCollocation`. `CountingUseCases.ts` decorates the first and the third (#72). Outbound ports are `CollocationStore`, `CollocationCheckStore`, `WordIndex` and `UsageCounter`. The adapters are `adapters/postgres` (SQL only, `PgCollocationStore.ts` 452 lines) and `adapters/http` (3 routes). `index.ts` wires everything with manual DI, one `pg.Pool` with default max 10. | RSS 50–60 MiB (`docker stats`) | #65, #67, #68, #70, #72 |
| Where features plug in | A new relation adds a table, a `find…` method on `CollocationStore`, a branch in `mergeSections` and a type in `types/src`. A new kind of question (check, practice) adds an inbound port and its own narrow outbound port (#68 pattern). Counting stays a decorator. **Cross-cutting, with no seam yet:** auth/sessions (an Express middleware plus a user context inside the use cases), rate limiting, and HTTP caching (it would bypass the counting decorators, so `usage_counts` would under-count). | — | |
| Data | Postgres 18 with 18 migrations, all applied locally. Two lemma authorities live side by side: spaCy/Leipzig-1M tables keyed by `lemmas.id` (`lemma_collocations`, `adjective_attributes`, `word_dominant_lemma`…) and lab/Stanza-3M tables keyed by lemma text (`lab_verb_pairs`, `lab_verb_pair_examples`, `lab_noun_genders`). The loaders run offline-first. The lab loader swaps data with DELETE+INSERT in one transaction (readers keep the old rows). The Leipzig pipeline does a full `TRUNCATE … CASCADE` reload on any corpus change (#37). | DB 1,372 MB locally | #37, #44, #54, #60, #69, #70 |
| Frontend | React 19 SPA with react-router 8. Routes: `/`, `/wort/:word`, `/impressum`, `/datenschutz`. Three plain `fetch` calls (`api/collocations.ts`, `search.ts`, `check.ts`) with no client cache library. It is served as static files by a `caddy:2-alpine` image. | JS 294.9 kB (95.1 kB gzip), CSS 36.7 kB (7.2 kB gzip) | #62, #63, #66, #72 |
| Operations | `compose.prod.yml` has 5 long-lived services: db, backend, frontend (Caddy static), Caddy (TLS, gzip/zstd, HTTP/3), plus migrate. Loaders sit behind `profiles: manual`. Images are built **on the VM**. There is **no `restart:`** and **no `logging:`** key, so Docker's default json-file logging has no rotation. There is no CI (`.github` is absent). Backups are one-off dumps only (decision text). A deploy is `git pull`, then `build <services>` and `up -d` (the `deploy` agent). A data refresh copies export files to `data/` and runs a manual loader on the VM. | 1 GB RAM / 1 vCPU / 25 GB | #46, #49, #57 procedure, #72, `deploy.md` |

## 2. Measurements (local)

| Metric | Value | Command |
|---|---|---|
| Database size | 1,372 MB | `SELECT pg_size_pretty(pg_database_size('collocations'))` |
| Largest relations (total / indexes) | `lemma_collocations` 305 MB / 173 MB (3.1M rows); `words` 227 / 171 MB; `adjective_attribute_examples` 143 MB; `lab_verb_pair_examples` 140 MB; `sentences` 84 MB | `pg_total_relation_size`, `pg_indexes_size` over `pg_class` |
| Tables or indexes the running app never reads | `collocations` 26 MB, `word_lemmas` 47 MB, `verb_prepositions` 12 MB (paused, #68); `idx_words_normalized` and `idx_words_folded` 31 MB each with 0 scans; `lemma_collocations_pkey` 93 MB with 0 scans (used by the loader) | `pg_stat_user_indexes.idx_scan`, plus reading the adapters. Stats are since the last reset, so verify on prod |
| Postgres settings | shared_buffers 128 MB, work_mem 4 MB, effective_cache_size 4 GB, max_connections 100 (all defaults) | `SHOW …` |
| Lookup, use case wall time / logDice query execution, warm | *Entscheidung* 36 / 17.6 ms; *Frage* 118 / 20.7 ms (first run); *Zeit* 102 / 27.6 ms; *machen* 92 / 99 ms; *groß* 224 / 138 ms; *haben* 350 / 282 ms | a throwaway script (not committed) that captures the adapters' real SQL, then runs `EXPLAIN (ANALYZE, BUFFERS)` |
| *haben* logDice query buffers | 539,617 hits (4.1 GB logical) + 17,122 reads (134 MB) **on every call**, warm. The reads come from the OS cache because the working set does not fit in 128 MB of shared_buffers | same |
| Other lookup queries | headword 0.02–0.2 ms; lab pairs 0.5–2.1 ms; adjective attributes 0.06–6.6 ms | same |
| Check (`/api/check`) | use case 2–16 ms; queries ≤ 0.5 ms each | same |
| Search (`/api/search`) | trigram query 15–38 ms | same |
| Partners per lemma in `lemma_collocations` | p50 1, p99 84, max 37,940 | `SELECT max(n), percentile_cont(…) FROM (SELECT left_lemma_id, count(*) n … GROUP BY 1)` |
| Upper bound for a precomputed top-N table | 505,980 pairs with logDice ≥ 6.3 | `count(*) … WHERE 14 + log(2, 2.0*cooc/(fa+fb)) >= 6.3` (17 s) |
| HTTP, warm, sequential | *Entscheidung* 18–20 ms; *Frage* 21–23 ms; *machen* 84–90 ms; *groß* 116–128 ms; *haben* 254–266 ms; check 3–5 ms; search 18–30 ms. Response size 12–31 kB before gzip | `curl -w '%{time_total}'` ×5 against `localhost:3000` |
| HTTP with db and backend each capped at 1 CPU | *Entscheidung* c=1 p50 17 ms, c=5 p95 149 ms, about 33 req/s; *haben* c=1 p50 415 ms, c=5 p50 1.98 s / p95 3.27 s, about 2.5 req/s | `docker update --cpus 1` (reverted afterwards), `xargs -P` curl loop |
| Parallel vs serial plan at 1 CPU, *haben* | 492–496 ms parallel, 442–457 ms with `max_parallel_workers_per_gather=0` | `PGOPTS='-c max_parallel_workers_per_gather=0'` |
| **Backend survives a dropped DB connection** | **No.** After `pg_terminate_backend` on its 2 idle pool connections the process exits with code 1 (`terminating connection due to administrator command`, unhandled `error` event) | `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state='idle' …`, then `docker inspect … .State.ExitCode` |
| Restart policy | `no` (local); there is no `restart:` key in `compose.yml` or `compose.prod.yml` | `docker inspect --format '{{.HostConfig.RestartPolicy.Name}}'`; `grep restart compose*.yml` |
| Backend image built from `backend/Dockerfile` (what prod uses) vs `backend/Dockerfile.prod` (unused) | 432 MB vs 368 MB; node_modules 35 MB vs 5.3 MB; `NODE_ENV` unset vs `production`. The prod image answered 200 / 200 / 200 / 404 on collocations / check / search / unknown word, at RSS 49 MiB | `docker build -f backend/Dockerfile.prod`, `du -sh /app/node_modules`, a smoke run on port 3999 (image removed afterwards) |
| Frontend bundle | 294.86 kB JS (95.08 kB gzip), 36.68 kB CSS (7.19 kB gzip) | `npm run build -w frontend` |
| Unit tests | 64 pass | `npm test` |
| Draft adjective check queries (see §5) | noun pairs with share and written phrase: *Zeit* 11.1 ms (96 pairs), *Problem* 7.6 ms; adjective form → lemma 0.02 ms | `EXPLAIN ANALYZE` of a plausible `findAdjectivePairs` |
| Production numbers already in the decisions | Warm *Entscheidung* 0.23–0.27 s; first lookups after a restart 1.2–1.5 s; first lookup after building two images on the VM **7.3 s** (#68 follow-up) | `docs/decisions.md` #65, #68, #69 |

The measurements generated a few rows in the local `usage_counts`; no
production data was involved.

## 3. Growth map

| Growth | What breaks or gets expensive first | Evidence |
|---|---|---|
| **Today's traffic, unchanged** | Availability, not capacity. A Postgres restart, an OOM kill of a Postgres backend (it happened during the 1M load, per the session notes), or a VM reboot takes the site down with no automatic recovery. | Measured crash (§2). No restart policy |
| **10× / 100× daily counts** | Unknown baseline: prod `usage_counts` is not readable from here. If today is under 100 lookups/day (inferred: the #73 deploy checks were a visible share of 2026-11-27), 100× is about 10k/day, around 0.1 req/s on average and perhaps 1 req/s at peak. That fits: about 33 req/s for typical nouns, about 2.5 req/s for *haben*-class words at 1 CPU locally. Expect prod to manage half that or less. What breaks first is a burst of frequent-verb lookups or a crawler walking `/wort/*` cold. There is no rate limit, and bots inflate `usage_counts` (#72 lists this). | Estimated from local 1-CPU runs |
| **#71 A1 browser-only list** | Nothing on the VM. It adds one backend change: the check response gains the verb lemma and examples. Fits `CheckCollocation` without a new port. Static manifest. | Code read |
| **#71 B gap-fill** | Grading reuses the check's form → lemma (≤ 0.5 ms). The distractor rule ("no window co-occurrence with the noun") is a `lemma_collocations` primary-key probe. Cheap. Needs a new inbound port (e.g. `BuildPracticeCards`) and no new table if cards stay in the browser. | Code read, check timings |
| **#71 C accounts** | Operations and privacy, not CPU. Server data becomes irreplaceable for the first time, which needs off-box backups with a tested restore, a restart policy, a transactional email provider for magic links (a processor contract under Art. 28 DSGVO, a Datenschutz update, deletion on request). The first cross-cutting concern in the backend: a session middleware in `adapters/http` and a user id passed into use cases. Tables stay additive (`users`, `sessions`, `saved_cards`). Memory is negligible. | Code read; #71 text |
| **Next increment: adjective + noun check** (draft spec) | Carries. Queries take 7.6–11 ms. Seams: two methods on `CollocationCheckStore` and a union on `CollocationCheck`. Costs: (a) it is blocked by the frontend deploy (`IMPRESSUM_EMAIL`); (b) one use case now judges with two lemma authorities (lab text lemmas for verbs, spaCy `lemmas.id` for adjectives), so any spaCy lemma breakage (#60's reason to move to the lab) leaks into a verdict. | §2, §5 |
| **A second relation** (e.g. prepositional check, Rektion revival) | Additive table plus a port method: the pattern has held 4 times. `PgCollocationStore.ts` (452 lines, three queries) is the file that grows. Split it per relation when the next one lands, the same move #65 made. | Code read |
| **A second or larger corpus** (#37, `larger-corpus-options.md`) | 1) The logDice query: its cost is proportional to the headword's partner count (*haben* 37,940 partners → 282–496 ms and 134 MB read per call). At 10× sentences, estimated 2–4× partners for frequent words, so seconds per lookup on prod. 2) RAM: the DB (1.37 GB locally) already exceeds the VM's RAM, and the first lookups after any cache loss take 1.2–7.3 s on prod. 3) Reload procedure: `TRUNCATE … CASCADE` plus loaders on the VM is the procedure that crashed Postgres in the 1M upgrade. Disk (25 GB) is not the first limit, estimated 3–5 GB DB at 10× with a frequency floor. | §2; 1M session notes |
| **Lab re-export** | DELETE+INSERT in one transaction doubles the lab tables' heap until autovacuum (about 170 MB). Fine on 25 GB. The real risk is upstream: the lab repo has no remote, and its database holds manual example pins and removals. | `load-lab-verb-pairs.ts`; `git remote -v` |
| **Deploys** | Building images on the 1 GB VM evicts the database's cache (7.3 s first lookup) and competes with Postgres for memory. Every frontend increment is blocked until `IMPRESSUM_EMAIL` is set. | #68, #73 follow-ups |

## 4. Follow-ups from the 2026-11-22 review

| Follow-up | Status | Evidence in the repo |
|---|---|---|
| Prod services have `restart=no` | **Open** | `grep restart compose.prod.yml` finds nothing; #71 and #72 (2026-11-27) still cite "no restart policy in production" as current |
| Dev Dockerfile used in prod | **Open** | `compose.prod.yml` backend: `dockerfile: backend/Dockerfile`; `backend/Dockerfile.prod` is referenced nowhere |
| `collocation-lab` has no git remote | **Open** | `git -C ../collocation-lab remote -v` is empty; the #69 follow-up (2026-11-26) says "it has no remote" |
| (same review) no recurring `pg_dump` | **Probably open** | no backup script or cron in the repo; the server is unchecked |

Also checked: the #65 "known, not fixed" `ERR_HTTP_HEADERS_SENT` on a
blank word is fixed (`collocationsHandler.ts` returns after the 400).

## 5. Recommendations

Ranked by risk to learners and to the owner's time.

### R1. Restart policy on every long-lived service, and a pool error handler [now]
- Problem: an idle-connection error kills the backend (measured, exit 1), and nothing restarts it or any other service. Likely causes on this VM: a Postgres restart, an OOM kill of a Postgres backend during a build or load, a reboot after Linode maintenance. Downtime lasts until the owner happens to look.
- Trigger: already met.
- Options: (a) `restart: unless-stopped` on `db`, `backend`, `frontend` and `caddy` in `compose.prod.yml` (and `compose.yml`, failure class 2), plus `pool.on('error', err => console.error(…))` in `backend/src/index.ts`. No RAM cost. (b) The same plus a free external uptime check on `/api/collocations/Entscheidung` that emails the owner. No VM cost; a third party sees only the public URL. (c) A systemd unit around `docker compose up`, which does more than (a) with more parts.
- Recommendation: (a) now, in one small deploy. Add (b) if the owner wants to hear about outages that (a) cannot fix (a disk-full or a broken deploy).
- Touches: `compose.prod.yml`, `compose.yml`, `backend/src/index.ts`; a new decision; it removes the premise in #71 ("a VM with no restart policy") and #72's "Not chosen" note.

### R2. Unblock the frontend deploy by setting `IMPRESSUM_EMAIL`, then verify the legal pages are live [now, owner action]
- Problem: since #72, `frontend/Dockerfile.prod` fails without the three Impressum variables. The #73 deploy skipped the frontend for that reason. From the decisions, the #72 pages have probably never shipped, so the live site likely lacks the Impressum (§5 DDG) and Datenschutz it was meant to get. Every frontend increment is blocked, including roadmap item 1.
- Trigger: met.
- Options: (a) set the variable in the server's `.env` and rebuild the frontend (the build guard stays as it is); (b) nothing else is sensible. Do not weaken the guard.
- Recommendation: (a), then check `/impressum` live.
- Touches: the server `.env` only; a deploy follow-up under #72.

### R3. Back up what cannot be rebuilt: the lab repo and database, and `usage_counts` [now]
- Problem: everything else in the app database can be rebuilt from export files. Three things cannot. `collocation-lab` has no remote, and its Postgres holds manual example pins and removals, so a lost laptop means the verb–noun data can no longer be maintained. `usage_counts` is the 2–4-week baseline #71's gates depend on (started 2026-11-27). Prod has only one-off dumps.
- Trigger: met for both. A hard prerequisite for #71 Phase C.
- Options: (a) a private git remote for `collocation-lab` plus a `pg_dump -Fc` of the lab database alongside it. On the VM, a daily cron `pg_dump -Fc -t usage_counts` into `/root/backups`, copied off-box now and then (`scp` to the laptop). No VM cost (the table has 2 rows a day). (b) Linode's own Backups service for whole-VM snapshots (low monthly cost; price not verified) plus the lab remote. Zero scripts, but it restores the whole VM, not a table. (c) Object storage with scheduled uploads. More moving parts, only worth it at Phase C.
- Recommendation: (a) now. It is minutes of work. Decide between (a) and (b) for the database when Phase C is approved.
- Touches: the lab repo, the server crontab; a new decision (backups were never decided).

### R4. Build the production backend from `backend/Dockerfile.prod` [now]
- Problem: prod runs the dev image: 432 vs 368 MB, 35 vs 5.3 MB node_modules (TypeScript 7 native binaries included), `NODE_ENV` unset. Small costs, but a second unused prod Dockerfile is the kind of drift failure class 2 describes.
- Trigger: met. Do it in the same deploy as R1.
- Options: (a) point `compose.prod.yml` at `Dockerfile.prod` (smoke-tested locally: all routes correct, 49 MiB RSS); (b) delete `Dockerfile.prod` and keep the dev image. Honest, but it keeps the dev dependencies in prod.
- Recommendation: (a).
- Touches: `compose.prod.yml`; the `deploy` agent's service table already rebuilds `backend` on a compose change.

### R5. Precompute the logDice ranking at load time [at trigger]
- Problem: the window query computes logDice for every partner of the headword on every request, then keeps 10 per section. For *haben*: 282–496 ms execution, 540k buffer hits and 134 MB of reads per call. At 1 CPU and 5 concurrent requests, p95 is 3.3 s. Its cost grows with the corpus. Typical nouns (17–28 ms) are fine.
- Trigger: prod p95 for `word_page` lookups above 500 ms on the 20 spot-check headwords; or any larger or second corpus (#37); or CPU on the VM sustained above 50 % (`docker stats`).
- Options: (a) cheapest first: `max_parallel_workers_per_gather = 0` and `effective_cache_size = 512MB` in the db service's `command:` (about 10 % on *haben* locally; parallel workers cannot help on 1 vCPU). (b) An in-process LRU decorator on `LookupCollocations` (the #65 Decorator branch), placed **inside** the counting decorator so counts stay correct. A few MB of RAM. Helps only repeated words, and goes stale until restart after a reload. (c) A new table filled by the loader, `lemma_collocation_ranked(lemma_id, section, rank, partner_lemma_id, log_dice, …)`, top 10 per section. Upper bound 506k source pairs, estimated under 100 MB. The query becomes an index range scan. Additive, the same precedent as `word_dominant_lemma` (#44).
- Recommendation: (a) when the trigger fires, then measure. (c) if it is still over the trigger, and before any corpus change. (b) only if `usage_counts` shows heavy repetition of the same words, which it cannot today (it counts kinds, not words).
- Touches: #43, #44, #50 (example selection would move into the load step); `PgCollocationStore.ts`; a new loader step and migration.

### R6. Stop building images on the 1 GB VM [at trigger]
- Problem: a build on the VM evicted the database's cache (first lookup 7.3 s, #68) and competes with Postgres for memory. Without R1 an OOM during a build is an outage.
- Trigger: a deploy where the VM swaps or OOM-kills (`dmesg`, `free -m` during the build); a first lookup after a deploy above 5 s again; or the frontend build taking over 5 minutes.
- Options: (a) keep building on the VM, but follow each deploy with a warm-up curl over the 20 spot-check headwords (a line in `deploy.md`); (b) build on the laptop with `docker buildx --platform linux/amd64` (the laptop is arm64; check the VM with `uname -m`), then `docker save | ssh … docker load`, with no registry; (c) GHCR plus CI, which adds an account and a pipeline.
- Recommendation: (a) now as a procedure note (no new technology), (b) at the trigger.
- Touches: `.claude/agents/deploy.md`, CLAUDE.md failure class 1 (images arriving by `docker load` remove the stale-image class on the VM).

### R7. Prerequisites before #71 Phase C (accounts) [at trigger: Phase B gate passed and C approved]
- Problem: the first irreplaceable server data, the first personal data, the first cross-cutting backend concern.
- Trigger: #71 Phase C approved.
- Options: (a) Postgres tables for users, sessions and cards; magic-link sign-in through a transactional email provider (with a processor agreement); an Express session middleware in `adapters/http` that passes a user id into new inbound ports; R1 and R3 done, plus a restore drill. No new service. (b) A hosted auth provider: less code, but a third party sees learners' email addresses. (c) Passwords: more liability, no benefit here.
- Recommendation: (a). No Redis and no second service: session lookups are one primary-key probe.
- Touches: #71; Datenschutz text (#72); a new migration series.

### R8. Build a new corpus's database on the laptop and ship a dump [at trigger: #37 corpus change approved]
- Problem: the Leipzig pipeline reloads with `TRUNCATE … CASCADE` (#37), and loaders on the VM crashed Postgres during the 1M upgrade.
- Trigger: a corpus change approved.
- Options: (a) load and verify locally, then `pg_dump -Fc` the affected tables and `pg_restore` on the VM (the #50 `--data-only` precedent), with R5(c) built first; (b) loaders on the VM as before.
- Recommendation: (a). Apply a minimum pair frequency at load (larger-corpus doc). Measure prod `df -h` first.
- Touches: #37, `docs/larger-corpus-options.md`, `deploy.md`.

### R9. Disk and log hygiene [watch]
- Problem: no log rotation (`logging:` absent, so Docker json-file grows without limit). Docker build cache grows with every on-VM build (17 GB of build cache locally, for illustration only). The app logs almost nothing today, so this is slow.
- Trigger: VM disk above 70 % (`df -h /`), or `docker system df` showing more than 5 GB of build cache.
- Options: (a) `docker builder prune -f` after deploys, plus `logging: {driver: json-file, options: {max-size: 10m, max-file: '3'}}` on each service; (b) a daemon-wide `/etc/docker/daemon.json` log limit.
- Recommendation: (a) when triggered. The logging key can ride along with R1 at no cost.
- Touches: `compose.prod.yml`.

### R10. Unused tables and indexes, about 150 MB [watch]
- Problem: `collocations` (26 MB), `word_lemmas` (47 MB), `verb_prepositions` (12 MB, #52 paused) and two `words` indexes with 0 scans (62 MB) cost disk, reload time and cache. Small on a 25 GB disk.
- Trigger: disk above 70 %, or the next Leipzig reload (drop then, never `ALTER words` outside a reload).
- Options: (a) leave them; (b) a drop migration after confirming zero scans on prod.
- Recommendation: (a) for now. Confirm with prod `pg_stat_user_indexes` first, because local stats were reset.
- Touches: migrations 001–004, 009; #52, #68.

### R11. Crawlers and rate limiting [watch]
- Problem: `/wort/:word` invites crawling. Each page is one uncached lookup, and a crawler walking frequent words could peg the single CPU (2.5 req/s for *haben*-class words locally). Bot hits also inflate the #71 baseline.
- Trigger: `usage_counts` jumping more than 10× day-over-day, or backend CPU sustained above 50 %.
- Options: (a) `robots.txt` with a crawl delay; (b) a Caddy rate limit, which needs a third-party module, so not boring; (c) R5(c), which makes every lookup cheap.
- Recommendation: (a), and (c) if that is not enough.
- Touches: `frontend/public/`.

### R12. Adjective + noun check (draft spec): the architecture carries it [now: no change needed; at trigger for the data source]
- Problem: none at the VM level: 7.6–11 ms, two port methods, a contract union. The real costs are two. It cannot ship until R2 is done. And a verdict now mixes lab text lemmas (verbs) with spaCy `lemmas.id` lemmas (adjectives).
- Trigger for the data source: the builder's 20-headword spot-check shows a broken adjective lemma in a suggestion or a verdict.
- Options: (a) ship on the #54 data as the spec proposes; (b) first move adjective–noun extraction into the lab (item 3 of the 2026-11-22 review), so the check has one lemma authority.
- Recommendation: (a), with the trigger for (b) written into its decision (#74).
- Touches: `docs/superpowers/specs/2026-11-27-adjective-noun-check-design.md` (not edited here), #54, #70.

## 6. Could not measure

Production was out of scope. To fill the gaps, the owner can run these
read-only commands on the VM, in `/root/german-collocations`, with
`dc` = `docker compose -f compose.prod.yml`:

- Memory, disk, swap, architecture: `free -m; swapon --show; df -h /; uname -m; docker stats --no-stream; docker system df`.
- Restart policies as deployed: `docker inspect --format '{{.Name}} {{.HostConfig.RestartPolicy.Name}}' $(docker ps -q)`.
- Daily traffic (the 10×/100× baseline): the #72 query, plus per day: `dc exec db psql -U app -d collocations -c "SELECT day, kind, count FROM usage_counts ORDER BY day, kind;"`.
- DB and table sizes: `dc exec db psql -U app -d collocations -c "SELECT pg_size_pretty(pg_database_size('collocations'));" -c "SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 12;"`.
- Unused indexes on prod: `… -c "SELECT indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid)) FROM pg_stat_user_indexes ORDER BY idx_scan, pg_relation_size(indexrelid) DESC LIMIT 12;"` together with `SELECT stats_reset FROM pg_stat_database WHERE datname='collocations';`.
- Lookup plan on prod hardware: run `EXPLAIN (ANALYZE, BUFFERS)` on the logDice query for *haben*, *machen* and *Entscheidung*. The SQL is `COLLOCATIONS_QUERY` in `PgCollocationStore.ts` with `$1` = the lemma id from `SELECT wdl.lemma_id FROM words w JOIN word_dominant_lemma wdl ON wdl.word_id = w.id WHERE w.word = 'haben';`.
- Public timing from a laptop, cold and warm: `for w in Entscheidung Frage machen haben; do for i in 1 2 3; do curl -s -o /dev/null -w "$w %{time_total}\n" "https://german-collocations.chickenkiller.com/api/collocations/$w"; done; done`.
- Whether the legal pages are live: `curl -s https://german-collocations.chickenkiller.com/ | grep -o 'assets/index-[^"]*\.js'`, then grep that bundle for `Impressum`; and `grep -c '^IMPRESSUM_EMAIL=..*' .env` on the VM.
- Backups on the VM: `ls -la /root/backups; crontab -l`.
- Log growth: `du -sh /var/lib/docker/containers/*/*-json.log`.

Estimated, not measured: production latency and throughput (local hardware
is faster); the size of a precomputed top-N table (upper bound only);
the corpus-growth effect on partner counts (2–4× at 10× sentences); the
price of Linode Backups; and whether the live site lacks the Impressum
(inferred from the #73 follow-up).

Other agents' input that would help: `docs-auditor`, to bring #71 and #72's
"no restart policy" wording and the 2026-11-22 memory notes up to date
once R1 ships. `collocation-feature-analyst` is not needed for this
review.
