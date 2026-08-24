# 1M corpus upgrade — session notes

Upgrading from the `deu_news_2025_100K` Leipzig package to
`deu_news_2025_1M`, and deploying the (already-built but never
shipped) POS-tagging/section-grouping feature to production for the
first time. See decisions #37 and #38 for the two decisions that came
out of this session; #36 documents a decision that was already in the
code but had never actually been logged.

## Leipzig word IDs are not stable across package sizes

Verified empirically before assuming anything: "Deutschland" is word
id `240` in the 100K package's `words.txt`, but id `234` in the 1M
package's. Leipzig reassigns IDs per package build, not per corpus
family.

This means the 1M upgrade is **not additive**. Running the loader
against the 1M files on top of an existing 100K-derived database would
silently corrupt data — `ON CONFLICT DO NOTHING` skips any numeric ID
already present, so old low-numbered words stay pointing at whatever
the 100K package assigned them, while new collocation rows from the 1M
file reference the same numeric IDs meaning *different* words. No
error, just silently wrong collocations. The only safe path is
`TRUNCATE ... CASCADE` on `words`/`collocations`/`sentences`/
`collocation_examples`/`word_pos`, then a full reload. See decision
#37 for the resulting `CORPUS_PREFIX` config pattern.

## VM capacity: RAM was fine, the disk was the real bottleneck

The production VM is a GCP e2-micro: 955Mi usable RAM (not the
nominal 1GB), 2 shared/burstable vCPUs, originally no swap (a 1GB
swapfile was added earlier this session as a cushion). At 1M scale the
full database lands around 400MB — comfortably inside both RAM and the
21GB free disk.

The actual bottleneck, found by checking `lsblk`: the root disk
(`sda`, 30GB) reports `ROTA=1` — it's GCP's `pd-standard` (HDD-class
network disk), not SSD. Confirmed via Postgres's own checkpoint logs
during the load: single checkpoints took 260-270 seconds, essentially
back-to-back, while `extract-examples.ts` was doing one unbatched
`INSERT` per sentence and per example. That write pattern is exactly
what a slow disk struggles hardest with.

## Incident timeline

1. **`load-pos` crash** — Postgres logged `untracked child process
   ... exited with exit code 2`, forced a full crash-recovery cycle
   (WAL redo, ~90s). No data loss (crash recovery replays
   committed transactions), but flagged the pattern early. Retried
   cleanly once it wasn't running immediately back-to-back with the
   just-finished bulk loader's checkpoint backlog.
2. **`extract-examples` crash #1** — same `exited with exit code 2`
   signature, again during heavy checkpoint I/O.
3. **`extract-examples` crash #2** — different symptom: an SSH
   transport reset (`Connection reset by peer`), not a Postgres crash.
   Learned here that `docker compose run` on the VM is **not** tied to
   the SSH session that started it — the container kept running
   server-side for hours after the local SSH connection died. Losing
   an SSH connection to a long-running remote job is not the same as
   the job failing; check `docker ps` on the VM before assuming a
   retry is needed.
4. **Root-caused and fixed**: batched the `sentences` and
   `collocation_examples` inserts in `extract-examples.ts` (matching
   the pattern `load-data.ts` already used) and made the pair-tracking
   resumable by seeding counts from what's already in
   `collocation_examples` instead of starting every pair at zero. See
   decision #38.
5. **Even the batched version eventually crashed** — same `exit code
   2` signature, after running cleanly for 1h44m. Because batching
   only flushes at 1000 accumulated rows or at the very end, this
   crash lost *all* unflushed progress from that entire run — a real
   durability regression versus the old per-row version, which
   committed (and thus kept) progress continuously. Still open: add a
   periodic flush independent of batch size (e.g. every N lines
   scanned) so a crash mid-run can't lose more than a bounded amount
   of work. See decision #38.
6. **Resolution**: local had already computed the complete result
   from the exact same corpus files and the exact same word/collocation
   IDs (verified identical between local and production, e.g. the
   `Deutschland` id-234 check). Since the matching algorithm is
   deterministic, local's finished `sentences`/`collocation_examples`
   data *is* what production would eventually compute too.
   `pg_dump`'d just those two tables, `scp`'d the dump to the VM, and
   `pg_restore`'d directly into production — sidestepping the VM's
   slow disk entirely for this step instead of fighting it further.

One red herring worth recording: `extract-examples.ts` logs an
"examples inserted" counter that overcounts by roughly 1.5x versus the
actual final row count. `buildWordIndex` indexes every collocation
pair under *both* its left word and its right word, so a sentence
containing both halves of a pair is matched twice in the same pass and
queued twice. `ON CONFLICT DO NOTHING` correctly dedupes this before
it ever reaches the table — the data was never wrong, only the log
line is misleading. Confirmed by querying `count(*)` directly rather
than trusting the printed summary. Not yet fixed in code; if the
counter is ever relied on for a real check again, dedupe the
`matchedPairs` array before queueing instead.

## Gotcha: rebuilding an image does not restart the service using it

After pushing the POS-tagging/section-grouping feature, `backend` and
`frontend` images were rebuilt on the VM (`docker compose build`), but
the already-running containers were never recreated to use them.
Result: the production API kept serving the pre-POS-tagging response
shape (no `section` field) for as long as the stale containers stayed
up, even though `word_pos`/`word_dominant_pos` were fully loaded and
correct. Caught by comparing `docker inspect <container> --format
'{{.State.StartedAt}}'` (2026-08-16) against the image's build
timestamp (2026-08-22).

Fix: `docker compose -f compose.prod.yml up -d` after `build`, not
`build` alone, for any long-running service (`backend`, `frontend`,
`caddy`). One-off `profiles: manual` services (`loader`,
`load-pos`, `extract-examples`) don't have this problem since each
`run` always uses whatever image currently exists — but they do need
`--profile manual` on `build` explicitly, since a bare `docker compose
build` silently skips profile-gated services entirely (also caught
this session: `loader`/`extract-examples` were 10 days stale after a
bare `build` that only covered `migrate`/`frontend`/`backend`).

This is the same failure family as CLAUDE.md's recurring failure #1
(stale images), one layer up: stale *containers*, not just stale
images.

## Production deploy mechanism (discovered this session, not previously documented anywhere)

- Live checkout: `/home/tuanchuhoang/german-collocations` on the
  `german-collocations-instance` VM (`us-central1-a`), owned by the
  `tuanchuhoang` OS-login user.
- **A second, unused checkout exists** under a different OS-login
  user's home directory on the same VM (stale commit, ~20 commits
  behind, with its own uncommitted local edits nobody remembers
  making). It is not part of the deploy path. Always confirm which
  checkout is live via `docker inspect <container> --format
  '{{index .Config.Labels "com.docker.compose.project.config_files"}}'`
  before trusting `git status`/`git log` output from a checkout found
  by guessing a path.
- Flow: push to `origin` (GitHub) locally → SSH to the VM → `git pull`
  as `tuanchuhoang` (needs `git -c safe.directory=...` or a
  `--global --add safe.directory` exception, since the checkout is
  owned by a different user than whoever SSHes in) → `docker compose
  -f compose.prod.yml --profile manual build <services>` → `docker
  compose -f compose.prod.yml up -d` to actually deploy long-running
  services.
- No CI/CD, no deploy script exists for any of this — it's manual
  end-to-end.

## Final verified state (2026-08-23)

| table | rows |
|---|---|
| words | 716,464 |
| collocations | 268,945 |
| sentences | 247,664 |
| collocation_examples | 499,516 |
| word_pos | 684,896 |

All five match the local database exactly. Live site confirmed
serving correct POS-section-grouped results with example sentences at
german-collocations.chickenkiller.com.

## Follow-up: example sentences weren't actually adjacent (found in a later session)

A separate session caught a real correctness bug in the data this
session had just shipped: `extract-examples.ts`'s matching only
required both words of a pair to appear *somewhere* in a sentence, not
adjacently. Example sentences for a collocation pair could — and did
— show the two words scattered across an unrelated part of the
sentence. Fixed by requiring true `left, right` token adjacency; see
decision #39 for the full reasoning.

Redeployed using the same pattern established earlier in this
document: regenerated `sentences`/`collocation_examples` locally from
a clean slate (36.9s this time — the stricter match is far more
selective, so batches fill and the corpus scan terminates much
faster), `pg_dump`'d just those two tables, `scp`'d the dump to the
VM, `TRUNCATE`'d production's stale versions, and `pg_restore`'d the
corrected data directly rather than re-running the matching script on
the VM. Also rebuilt and — this time — actually recreated the
`frontend` container (`docker compose ... up -d`, not just `build`) to
pick up the new highlighting feature that shipped alongside the fix,
applying the gotcha documented earlier in this same file instead of
repeating it.

Final corrected state: `sentences` 461,041, `collocation_examples`
748,707 (both local and production, verified identical). Spot-checked
directly against raw sentence text to confirm genuine adjacency, not
just row counts.
