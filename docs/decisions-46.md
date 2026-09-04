### 46. Enable response compression in both Caddy configs

Investigated a report of slow production responses. Backend query time
wasn't the obvious suspect: decision #44 already measured the
collocations endpoint end-to-end at ~55-65ms wall time after the
lemma-table rework, and this session's static review of
`CollocationRepository.ts`/`WordSearchRepository.ts` found the query
and index shape unchanged since — precomputed `lemma_frequency`/
`lemma_dominant_pos` tables, `pg_trgm` GIN indexes for fuzzy search,
nothing that looked like a new slow path.

Wanted to confirm with a real timing breakdown (`curl -w` against
`german-collocations.chickenkiller.com`, splitting TTFB from total
transfer time) before touching anything, per this project's
empirical-before-deciding convention. Couldn't: this session's sandbox
egress proxy rejects connections to arbitrary domains by policy, and
there's no SSH access to the VM from here either. So this fix is
based on static review, not a confirmed measurement — flagged as a
known gap, not silently treated as proven.

What static review did find: neither Caddy config compressed
responses. The reverse-proxy `Caddyfile` (root) and the static-file
`frontend/Caddyfile` (served from inside the `frontend` container)
both lacked an `encode` directive, so JSON API responses and the built
JS/CSS bundle were all served uncompressed. This is a plausible
contributor to "slow" specifically *because* the app is US-hosted for
users elsewhere: more bytes over a high-RTT path means more TCP round
trips to complete the transfer, so uncompressed payloads compound with
geography rather than being an independent cost.

Added `encode gzip zstd` to both files — one line each, no
architectural change, reversible by deleting the line. Didn't add
per-route tuning (e.g. excluding already-compressed asset types) since
Caddy's `encode` already skips content it judges not worth compressing.

**Not done as part of this decision**: no production redeploy, no
before/after timing comparison. This needs verifying against real
numbers once deployed (`curl -w` timing, or a browser network-tab
comparison) rather than assumed fixed — if TTFB itself (not just
transfer time) turns out to be the dominant cost, this change won't
move it, and query-level profiling on the live DB would be the next
step instead.
