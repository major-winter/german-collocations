# Backend refactor: five design patterns compared

2026-11-22. Five branches, each cut from `main` at `b496541`, each
refactoring `backend/src` around one pattern. This is a comparison, not
a decision: nothing is merged, and no `docs/decisions.md` entry exists
yet. Whichever direction is adopted should get one.

| Branch | Pattern |
|---|---|
| `backend-refactor-hexagonal` | Hexagonal (ports and adapters) |
| `backend-refactor-strategy` | Strategy |
| `backend-refactor-pipeline` | Pipeline / Chain of Responsibility |
| `backend-refactor-decorator` | Decorator |
| `backend-refactor-mediator` | Mediator (query bus) |

## How behavior was verified

Every branch was checked the same way:

- `npm run typecheck -w backend` is clean.
- `npm test` passes, including the new tests each branch adds.
- **Golden comparison.** The branch ran against the local database and
  its responses were diffed with `main`'s. The set covered 17 collocation
  lookups and 7 search cases. The lookups were noun, verb, adjective and
  function-word pages, an inflected form (`Kritiken`), a reflexive verb,
  umlauts and an unknown word (404). The search cases included an empty
  query, a too-short query, a missing parameter and a folded spelling
  (`Muehe`). All five branches gave byte-identical responses. On the
  Decorator branch this held with the cache and timing switched on as
  well.

## The starting point

`main` has a conventional layered shape: routes → service → repository,
with interfaces in `contracts/` and wiring by hand in `index.ts`. The
service layer is a pass-through. Nearly all of the logic sits in one
585-line `CollocationRepository.ts`: seven SQL queries, three row-grouping
functions, the rule for which sections a page supersedes, and the
lab-pair fallback from word to lemma. That file is the main thing a
refactor can improve.

## Size at a glance

| Branch | Source lines | Test lines | Largest file | Files changed |
|---|---|---|---|---|
| `main` | 893 | 41 | CollocationRepository.ts (585) | — |
| hexagonal | 937 | 116 | PgCollocationStore.ts (406, SQL only) | 21 |
| strategy | 957 | 88 | CollocationRepository.ts (489) | 3 |
| pipeline | 983 | 83 | findAdjacency.ts (206) | 10 |
| decorator | 1040 | 92 | CollocationRepository.ts (585, untouched) | 8 |
| mediator | 930 | 77 | CollocationRepository.ts (585, untouched) | 12 |

Most of the line growth is the new tests. The comments that carry
decision history (#36, #43, #44, #47, #52, #54, #57, #60) were moved
along with their code on every branch, never dropped.

---

## 1. Hexagonal (ports and adapters)

**Shape.** The code is split into three layers:

- `domain/`: pure functions. These are row grouping, `mergeSections`
  and `verbNounPhrases`.
- `application/`: the use cases `LookupCollocationsService` and
  `SearchWordsService`, plus their ports, one interface per file. The
  inbound (driving) ports live in `application/ports/in/`:
  `LookupCollocations` and `SearchWords`. The outbound (driven) ports
  live in `application/ports/out/`: `CollocationStore` and `WordIndex`.
- `adapters/`: `adapters/postgres` holds only SQL. `adapters/http` holds
  only Express.

`index.ts` is the composition root.

**Pros**
- It splits the god-file the right way. Business rules now live in one
  place that can be tested without a database: which sections are
  superseded, the word → lemma fallback, and the "no lemma means empty
  but keep lab pairs" rule. The use-case tests run against an in-memory
  store in milliseconds.
- The Postgres adapter is SQL plus thin methods, one per query. Reviewing
  a query change no longer means reading the grouping logic.
- Dependencies point one way: adapters → application → domain. Nothing
  in `domain/` imports `pg` or `express`, and that is easy to check.
- It matches the project's existing manual DI style. Ports are
  `interface`s, imported with `import type` as CLAUDE.md requires.

**Cons**
- It touches the most files (21) and moves every file. That makes
  `git blame` harder and breaks paths in older docs. CLAUDE.md's
  single-test command was updated on the branch. Older session notes and
  plans still mention `services/`, `repositories/` and `routes/`.
- There is more indirection for a small, read-only app with one database
  and one transport. A swappable storage adapter is mostly theoretical
  here. The real gain is testability, not swappability.
- The outbound port is shaped by today's queries: seven `find*` methods
  that mirror the SQL. A new data source means editing the port, the
  adapter and the use case.

## 2. Strategy

**Shape.** `repositories/pageStrategies.ts` defines a `PageStrategy`.
There are three objects: `nounPage`, `verbPage` and `plainPage` (a null
object). `pageStrategyFor(pos)` picks one from the dominant POS. Each
strategy owns the things that used to be scattered `side === "noun"`
checks:

- the lab-pair SQL match, including the reflexive `sich $1` match for
  verbs
- which section it supersedes
- which side of a pair is the partner
- which surface form is the search word

**Pros**
- The smallest, most focused diff (3 files). The rest of the
  architecture is unchanged, which fits "boring and minimal" best.
- All the facts about one page kind are in one object. A new page kind,
  such as adjective pages getting their own lab data, means one new
  strategy instead of another `if` in four places.
- `plainPage` as a null object removes the `side ? … : null` branches.

**Cons**
- It only touches one axis of variation. The repository is still 489
  lines and still mixes SQL with grouping and merging.
- The strategy takes a `Pool` argument, so it mixes data access with
  policy. Its tests need a fake `pool.query`.
- With only two real variants, an `if` was already readable. The
  benefit grows only if more page kinds arrive.

## 3. Pipeline / Chain of Responsibility

**Shape.** `findByWord` runs `LOOKUP_STEPS`:

```
findWord
→ parallel(findLemma, findPageSide)
→ findVerbNounPairs
→ requireLemma
→ parallel(findAdjacency, findAdjectiveAttributes, findGovernedPrepositions)
→ mergeSections
```

Each step is a file that owns one query, its constants and its grouping.
A step can return `"stop"`, and `parallel()` keeps the independent
queries concurrent. Query order and concurrency match `main` exactly.

**Pros**
- It reads like a table of contents. The six-line step list is the best
  documentation of what a word page is made of. Today that order is only
  implicit inside one long method.
- Each query sits next to its own tuning constants and comments, in a
  file of about 50–200 lines. `findAdjacency.ts` holds everything about
  decisions #43, #44 and #47 and nothing else.
- New sources slot in as a step, and you can see exactly where. Steps
  can be unit-tested alone, as the `mergeSections` test does.

**Cons**
- The shared mutable `LookupContext` is the classic weakness. Every step
  can read and write everything. Ordering dependencies are only
  conventions: `findAdjacency` uses `ctx.lemma!` and relies on
  `requireLemma` having run before it. TypeScript can't enforce that,
  so a reordered step fails at runtime.
- Parallelism has to be stated by hand. Forgetting `parallel()` silently
  makes a lookup slower (about three round trips) with no error. This is
  exactly the kind of regression #47 measured.
- It adds the most files (22) and the most source lines.

## 4. Decorator

**Shape.** The services are wrapped in decorators that implement the
same interfaces:

- `LoggingCollocationService` and `LoggingWordSearchService` take over
  the error logging from the route handlers.
- `TimingCollocationService` warns when a lookup takes longer than
  `SLOW_LOOKUP_MS`.
- `CachingCollocationService` is a bounded LRU sized by
  `COLLOCATION_CACHE_SIZE`. It caches the promise, so concurrent lookups
  of the same word share one database query, and failures are evicted.

The order of the wrappers is set in `index.ts`. Timing and caching are
off by default.

**Pros**
- It is the only branch that adds capability while still passing the
  golden test. This is the pattern's strength: new behavior without
  changing the core. Measured locally, `geben` took 188 ms cold and
  under 1 ms on a cache hit. The data only changes when a loader runs, so
  restarting the backend is enough to invalidate the cache.
- The slow-lookup log is a cheap, always-on way to find the next
  EXPLAIN-worthy word. Decisions #47 and #54 were both found by spotting
  one slow word.
- The core code is untouched, so the risk is low and it is easy to
  revert.
- It combines with any other branch: decorators wrap an interface, and
  every branch has one.

**Cons**
- It doesn't address the structural problem. The 585-line repository is
  untouched.
- Wrapper order matters and is easy to get wrong. A cache inside the
  timer, for example, makes timings meaningless. One decorator class is
  needed per interface (two logging classes already), so it is more
  boilerplate than a middleware chain.
- The cache costs memory on a 1 GB VM. At about 10–30 KB per response,
  500 entries is 5–15 MB. That is affordable but must stay bounded, and
  it is a new piece of state to reason about after a data reload.
- A small observability change: errors thrown by `res.json` inside a
  route are no longer logged, because logging moved into the service
  layer.

## 5. Mediator (query bus)

**Shape.** `bus/queries.ts` is a type map from query names to their
input and output types. `QueryBus` has three methods:

- `register(name, handler)` adds the handler for a name, and only one
  handler per name is allowed.
- `use(middleware)` adds middleware; `logErrors` is applied to every
  query.
- `ask(name, input)` runs a query and returns its typed result.

Routes depend only on the bus. The pass-through service classes and
their contracts are deleted; the handlers are plain functions.

**Pros**
- It removes the pass-through service layer for free. On `main` that
  layer was mostly ceremony.
- Cross-cutting behavior is written once as middleware and applies to
  every query. That is the same idea as the Decorator branch, without one
  class per interface.
- It is fully typed end to end. `bus.ask("SearchWords", { query })`
  checks both the input and the result type.
- It is a natural place for future commands, such as an admin "reload"
  that would also clear caches.

**Cons**
- The indirection hides control flow. "Go to definition" on `bus.ask`
  lands in the bus, not the handler, so finding who answers a query
  means a lookup in `index.ts`.
- A missing registration is a runtime error, not a compile error.
- The repository is untouched (585 lines). For an app with two queries,
  a bus is mostly overhead. It pays off with many handlers that share
  policy, which this project doesn't have.

---

## Comparison

| | Hexagonal | Strategy | Pipeline | Decorator | Mediator |
|---|---|---|---|---|---|
| Fixes the 585-line repository | **yes** | partly | **yes** | no | no |
| Business rules testable without a DB | **yes** | partly | per step | n/a | handlers only |
| Diff size / risk | large | **small** | large | small | medium |
| Adds runtime capability | no | no | no | **cache, timing** | middleware hook |
| New indirection | ports | low | context + step order | wrapper order | name lookup |
| Fit with "boring and minimal" | medium | **high** | medium | high | low |
| Fit with the 1 GB VM | neutral | neutral | neutral | needs a bounded cache | neutral |

## Recommendation

1. **Hexagonal as the structural base.** It is the only branch that
   splits the god-file by responsibility: SQL in the adapter, rules in
   the domain. It also leaves the decision-history comments next to the
   code they explain. It is the largest move, so merge it on its own,
   before other backend work branches off and conflicts.
2. **Then add the Decorator branch's caching and timing on top.** Their
   value doesn't depend on the structure: they wrap the
   `LookupCollocations` port as easily as `CollocationService`. Turn on
   `SLOW_LOOKUP_MS` in production first, since it is cheap and
   diagnostic. Turn on the cache after measuring memory on the VM.
3. Strategy is the best low-risk alternative if a large move isn't
   wanted now. Pipeline and Mediator add more mechanism than this app's
   two endpoints need.

## Found along the way (not fixed on any branch)

In `routes/collocations.ts`, the 400 response for a blank `:word` has no
`return`. A whitespace-only word (`/api/collocations/%20`) sends the 400
and then carries on into the lookup. That ends in "headers already sent".
Every branch keeps this as it was so the golden comparison stays exact.
It is a one-line fix worth making separately.
