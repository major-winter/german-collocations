-- Fuzzy search support: two derived match columns on `words`.
--
-- word_normalized — German convention (ä→ae, ö→oe, ü→ue, ß→ss)
-- word_folded     — bare diacritic stripping (ä→a, ö→o, ü→u, ß→ss)
--
-- The search query normalizes user input with the SAME functions and
-- compares like-for-like: normalized query vs. normalized column,
-- folded query vs. folded column. Never crossed.
--
-- The loader is untouched. Generated columns are computed by Postgres
-- on insert, so there is exactly one implementation of these rules.
--
-- !! CAVEAT !!  CREATE OR REPLACE on normalize_de/fold_de does NOT
-- recompute already-stored generated values. Changing the rules
-- requires a new migration that DROPs and re-ADDs both columns.


-- 1. Extensions -------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;


-- 2. Immutable unaccent wrapper ---------------------------------------
-- unaccent() is not IMMUTABLE by default: the one-arg form looks up a
-- dictionary that could be swapped at runtime. The two-arg form names
-- the dictionary explicitly, which makes the IMMUTABLE label honest
-- rather than a lie to the planner.
--
-- Everything is schema-qualified: an immutable function backing an
-- index must not depend on search_path.

CREATE FUNCTION public.immutable_unaccent(text) RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  STRICT
AS $$
  SELECT public.unaccent('public.unaccent', $1)
$$;


-- 3. The two normalizers ----------------------------------------------
-- Order is load-bearing in normalize_de: the umlaut expansions must run
-- BEFORE unaccent, or unaccent strips ä→a first and this column becomes
-- identical to word_folded.
--
-- lower() is innermost in both, because replace() is case-sensitive —
-- lowercasing last would let 'Ärztin' escape the ä rule entirely.
--
-- ß is handled explicitly rather than left to unaccent's own rules,
-- which have varied across Postgres versions. One extra replace() is
-- cheaper than depending on that.

CREATE FUNCTION public.normalize_de(text) RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  STRICT
AS $$
  SELECT public.immutable_unaccent(
    replace(
      replace(
        replace(
          replace(
            lower($1),
            'ä', 'ae'),
          'ö', 'oe'),
        'ü', 'ue'),
      'ß', 'ss')
  )
$$;

CREATE FUNCTION public.fold_de(text) RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  STRICT
AS $$
  SELECT public.immutable_unaccent(
    replace(lower($1), 'ß', 'ss')
  )
$$;


-- 4. Generated columns -------------------------------------------------
-- STORED, not VIRTUAL — virtual columns cannot be indexed.
-- Both added in one ALTER so the table is rewritten once, not twice.

ALTER TABLE words
  ADD COLUMN word_normalized text
    GENERATED ALWAYS AS (public.normalize_de(word)) STORED,
  ADD COLUMN word_folded text
    GENERATED ALWAYS AS (public.fold_de(word)) STORED;


-- 5. Indexes ------------------------------------------------------------
-- GIN + gin_trgm_ops serves the `%` similarity operator (the fuzzy step).
-- It does NOT serve `=`, so the plain B-trees are needed for the exact
-- resolve step — without them that path is a seq scan over 170K rows.
--
-- No CONCURRENTLY: the migration runner wraps each file in a
-- transaction, and CREATE INDEX CONCURRENTLY cannot run inside one.
-- Fine here — nothing is reading this table mid-migration.

CREATE INDEX idx_words_normalized_trgm
  ON words USING gin (word_normalized gin_trgm_ops);

CREATE INDEX idx_words_folded_trgm
  ON words USING gin (word_folded gin_trgm_ops);

CREATE INDEX idx_words_normalized ON words (word_normalized);
CREATE INDEX idx_words_folded     ON words (word_folded);
