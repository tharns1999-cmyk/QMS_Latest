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

-- Only the '$.key' form is used.
CREATE OR REPLACE FUNCTION sqlite_json_extract(doc text, path text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT doc::jsonb ->> substr(path, 3)
$$;

CREATE OR REPLACE FUNCTION sqlite_json_each(doc text) RETURNS TABLE (key text, value text) LANGUAGE sql IMMUTABLE AS $$
  SELECT (ord - 1)::text, elem FROM jsonb_array_elements_text(doc::jsonb) WITH ORDINALITY AS t(elem, ord)
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
