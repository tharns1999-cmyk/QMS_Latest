-- SQLite functions the application's SQL calls, reproduced so one set of statements runs on both databases.
-- pgAdapter.js renames json_each/json_extract/json_object/json/date/strftime/printf to the sqlite_* names here.

CREATE EXTENSION IF NOT EXISTS citext;

-- 'now' or a stored text timestamp, moved by modifiers such as '+7 hours', '-365 days', '+3 months'.
CREATE OR REPLACE FUNCTION sqlite_time(ts text, mods text[]) RETURNS timestamp LANGUAGE plpgsql STABLE AS $$
DECLARE
  t timestamp;
  m text;
BEGIN
  IF ts IS NULL THEN RETURN NULL; END IF;
  t := CASE WHEN ts = 'now' THEN clock_timestamp() AT TIME ZONE 'UTC' ELSE replace(replace(ts, 'T', ' '), 'Z', '')::timestamp END;
  FOREACH m IN ARRAY mods LOOP
    IF m IS NULL THEN RETURN NULL; END IF;
    t := t + m::interval;
  END LOOP;
  RETURN t;
END $$;

CREATE OR REPLACE FUNCTION sqlite_strftime(fmt text, ts text, VARIADIC mods text[] DEFAULT '{}') RETURNS text LANGUAGE sql STABLE AS $$
  SELECT to_char(sqlite_time(ts, mods),
    replace(replace(replace(replace(replace(replace(replace(replace(replace(fmt,
      'T', '"T"'), 'Z', '"Z"'), '%Y', 'YYYY'), '%m', 'MM'), '%d', 'DD'), '%H', 'HH24'), '%M', 'MI'), '%f', 'SS.MS'), '%S', 'SS'))
$$;

CREATE OR REPLACE FUNCTION sqlite_date(ts text, VARIADIC mods text[] DEFAULT '{}') RETURNS text LANGUAGE sql STABLE AS $$
  SELECT to_char(sqlite_time(ts, mods), 'YYYY-MM-DD')
$$;

-- json(x) in SQLite fails with "malformed JSON" on invalid input; the stale-update guard relies on that wording.
CREATE OR REPLACE FUNCTION sqlite_json(doc text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN doc::jsonb::text;
EXCEPTION WHEN others THEN
  RAISE EXCEPTION 'malformed JSON';
END $$;

CREATE OR REPLACE FUNCTION json_valid(doc text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  PERFORM doc::jsonb;
  RETURN doc IS NOT NULL;
EXCEPTION WHEN others THEN
  RETURN false;
END $$;

-- Only the '$.key' form is used. Text that is not JSON gives NULL rather than an error: SQLite checks conditions
-- left to right, so the statements rely on an earlier condition to keep such rows away, and PostgreSQL may reorder.
CREATE OR REPLACE FUNCTION sqlite_json_extract(doc text, path text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN json_valid(doc) THEN doc::jsonb ->> substr(path, 3) END
$$;

CREATE OR REPLACE FUNCTION sqlite_json_each(doc text) RETURNS TABLE (key text, value text) LANGUAGE sql IMMUTABLE AS $$
  SELECT (ord - 1)::text, elem
    FROM jsonb_array_elements_text(CASE WHEN json_valid(doc) AND jsonb_typeof(doc::jsonb) = 'array' THEN doc::jsonb ELSE '[]'::jsonb END)
         WITH ORDINALITY AS t(elem, ord)
$$;

-- Only printf('%0Nd', number) is used (document, DAR and copy numbers).
CREATE OR REPLACE FUNCTION sqlite_printf(fmt text, n bigint) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lpad(n::text, GREATEST(length(n::text), substring(fmt FROM '%0(\d+)d')::int), '0')
$$;

-- SQLite's two-argument max() is a plain function, not an aggregate.
CREATE OR REPLACE FUNCTION max(a text, b text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN a IS NULL OR b IS NULL THEN NULL WHEN a >= b THEN a ELSE b END
$$;
CREATE OR REPLACE FUNCTION max(a bigint, b bigint) RETURNS bigint LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN a IS NULL OR b IS NULL THEN NULL WHEN a >= b THEN a ELSE b END
$$;

-- The catalogue under SQLite's name, for the checks that list tables, indexes and triggers.
CREATE OR REPLACE VIEW sqlite_master AS
  SELECT 'table'::text AS type, c.relname::text AS name, c.relname::text AS tbl_name, NULL::text AS sql
    FROM pg_class c WHERE c.relkind = 'r' AND c.relnamespace = 'public'::regnamespace
  UNION ALL
  SELECT 'index', i.relname::text, t.relname::text, pg_get_indexdef(x.indexrelid)
    FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid JOIN pg_class t ON t.oid = x.indrelid
    WHERE t.relnamespace = 'public'::regnamespace AND NOT x.indisprimary
  UNION ALL
  SELECT 'trigger', g.tgname::text, t.relname::text, pg_get_triggerdef(g.oid)
    FROM pg_trigger g JOIN pg_class t ON t.oid = g.tgrelid
    WHERE NOT g.tgisinternal AND t.relnamespace = 'public'::regnamespace;

CREATE OR REPLACE FUNCTION sqlite_datetime(ts text, VARIADIC mods text[] DEFAULT '{}') RETURNS text LANGUAGE sql STABLE AS $$
  SELECT to_char(sqlite_time(ts, mods), 'YYYY-MM-DD HH24:MI:SS')
$$;

-- CAST(text AS INTEGER) in SQLite: the leading integer, or 0 when there is none; it never fails.
CREATE OR REPLACE FUNCTION sqlite_int(v text) RETURNS bigint LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN v IS NULL THEN NULL ELSE COALESCE(substring(v FROM '^\s*([+-]?\d+)'), '0')::bigint END
$$;

-- GLOB: * any run, ? one character, [...] a set; case-sensitive and matched against the whole value.
CREATE OR REPLACE FUNCTION sqlite_glob(v text, pattern text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  re text := '^';
  ch text;
  i int := 1;
  close_at int;
BEGIN
  IF v IS NULL OR pattern IS NULL THEN RETURN NULL; END IF;
  WHILE i <= length(pattern) LOOP
    ch := substr(pattern, i, 1);
    IF ch = '*' THEN re := re || '.*';
    ELSIF ch = '?' THEN re := re || '.';
    ELSIF ch = '[' AND position(']' IN substr(pattern, i + 2)) > 0 THEN
      close_at := i + 1 + position(']' IN substr(pattern, i + 2));
      re := re || '[' || replace(substr(pattern, i + 1, close_at - i - 1), '\', '\') || ']';
      i := close_at;
    ELSE re := re || regexp_replace(ch, '([\.^$|()\[\]{}*+?])', '\\1');
    END IF;
    i := i + 1;
  END LOOP;
  RETURN v ~ (re || '$');
END $$;

-- json_object('k', v, ...) with SQLite's compact output; the adapter passes the arguments as one JSON array.
CREATE OR REPLACE FUNCTION sqlite_json_object(pairs json) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT '{' || COALESCE(string_agg(k.elem::text || ':' || v.elem::text, ',' ORDER BY k.ord), '') || '}'
    FROM json_array_elements(pairs) WITH ORDINALITY AS k(elem, ord)
    JOIN json_array_elements(pairs) WITH ORDINALITY AS v(elem, ord) ON v.ord = k.ord + 1
   WHERE k.ord % 2 = 1
$$;
