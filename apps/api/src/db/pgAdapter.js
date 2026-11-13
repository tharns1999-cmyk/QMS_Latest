// Gives PostgreSQL the same calling shape the handlers already use on D1 (prepare / bind / first / all / run / batch),
// so the handlers do not change when the database does. `driver` needs query(sql, params) -> { rows, affectedRows }
// and transaction(fn(tx)) where tx has the same query().

// Applies fn to the parts of a statement that are not inside a single-quoted string.
const outsideStrings = (sql, fn) => sql.split(/('(?:[^']|'')*')/).map((part, i) => (i % 2 ? part : fn(part))).join('');

const RENAMED = ['json_each', 'json_extract', 'json_object', 'json', 'date', 'strftime', 'printf'];
const RENAME_RE = new RegExp(`(?<![\\w.])(${RENAMED.join('|')})\\(`, 'g');

// Rewrites the SQLite spellings that have a mechanical PostgreSQL equivalent. `changes` is the row count of the
// previous data-changing statement in the same batch, which is what SQLite's changes() returns.
export const toPostgres = (sql, changes = 0) => {
  let n = 0;
  let ignore = false;
  let out = outsideStrings(sql, (part) =>
    part
      .replace(/\bINSERT OR IGNORE INTO\b/g, () => ((ignore = true), 'INSERT INTO'))
      .replace(/\bchanges\(\)/g, String(changes))
      .replace(/\blast_insert_rowid\(\)/g, 'lastval()')
      .replace(RENAME_RE, 'sqlite_$1(')
      .replace(/\s+COLLATE NOCASE\b/g, '')
      // SQLite's LIKE ignores ASCII letter case.
      .replace(/\bLIKE\b/g, 'ILIKE')
      .replace(/\bIS \?/g, 'IS NOT DISTINCT FROM ?')
  );
  if (ignore) {
    const at = out.search(/\bRETURNING\b/);
    out = at < 0 ? `${out} ON CONFLICT DO NOTHING` : `${out.slice(0, at)}ON CONFLICT DO NOTHING ${out.slice(at)}`;
  }
  return outsideStrings(out, (part) => part.replace(/\?/g, () => `$${++n}`));
};

// Handlers and tests recognise failures by SQLite's wording, so PostgreSQL errors are reworded to match.
const SQLITE_WORDING = {
  23505: (e) => `UNIQUE constraint failed: ${e.constraint || ''}`,
  23503: () => 'FOREIGN KEY constraint failed',
  23514: (e) => `CHECK constraint failed: ${e.constraint || ''}`,
  23502: (e) => `NOT NULL constraint failed: ${e.table || ''}.${e.column || ''}`
};
const reword = (err) => {
  const wording = SQLITE_WORDING[err?.code];
  if (!wording) return err;
  const out = new Error(`${wording(err)} (${err.message})`, { cause: err });
  out.code = err.code;
  return out;
};

const toParam = (v) => (typeof v === 'boolean' ? Number(v) : v instanceof ArrayBuffer ? new Uint8Array(v) : v);
const toValue = (v) => (typeof v === 'boolean' ? Number(v) : typeof v === 'bigint' ? Number(v) : v);
const toRow = (row) => {
  for (const key in row) row[key] = toValue(row[key]);
  return row;
};
const CHANGES_ROWS = /^\s*(?:WITH\b[\s\S]*?\)\s*)?(INSERT|UPDATE|DELETE)\b/i;

export const createPgDatabase = (driver) => {
  const execute = async (runner, stmt, changes) => {
    try {
      const res = await runner.query(toPostgres(stmt.sql, changes), stmt.params.map(toParam));
      const changed = CHANGES_ROWS.test(stmt.sql) ? res.affectedRows ?? 0 : null;
      return { results: res.rows.map(toRow), success: true, meta: { changes: changed ?? 0 }, changed };
    } catch (err) {
      throw reword(err);
    }
  };
  const strip = ({ changed: _changed, ...result }) => result;

  const statement = (sql, params = []) => ({
    sql,
    params,
    bind: (...values) => statement(sql, values),
    all: async () => strip(await execute(driver, { sql, params }, 0)),
    run: async () => strip(await execute(driver, { sql, params }, 0)),
    first: async (column) => {
      const row = (await execute(driver, { sql, params }, 0)).results[0];
      if (row === undefined) return null;
      return column === undefined ? row : row[column] ?? null;
    }
  });

  return {
    prepare: (sql) => statement(sql),
    // All or nothing, like D1.
    batch: (statements) =>
      driver.transaction(async (tx) => {
        const results = [];
        let changes = 0;
        for (const stmt of statements) {
          const result = await execute(tx, stmt, changes);
          if (result.changed !== null) changes = result.changed;
          results.push(strip(result));
        }
        return results;
      })
  };
};
