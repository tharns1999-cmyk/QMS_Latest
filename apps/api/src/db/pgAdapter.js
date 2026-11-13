// Gives PostgreSQL the same calling shape the handlers already use on D1 (prepare / bind / first / all / run / batch),
// so the handlers do not change when the database does. `driver` needs query(sql, params) -> { rows, affectedRows }
// and transaction(fn(tx)) where tx has the same query().

// String literals are taken out while a statement is rewritten, so nothing inside one is ever touched.
const mask = (sql) => {
  const strings = [];
  const masked = sql.replace(/'(?:[^']|'')*'/g, (s) => `\u0001${strings.push(s) - 1}\u0001`);
  return { masked, unmask: (text) => text.replace(/\u0001(\d+)\u0001/g, (_, i) => strings[i]) };
};

// Index of the parenthesis that closes the one at `open`.
const closing = (sql, open) => {
  for (let i = open, depth = 0; i < sql.length; i++) {
    if (sql[i] === '(') depth++;
    else if (sql[i] === ')' && --depth === 0) return i;
  }
  throw new Error(`Unbalanced parentheses in SQL: ${sql}`);
};

// Rewrites every call of fn(...) through `to(argumentsText)`.
const rewriteCalls = (sql, fn, to) => {
  const re = new RegExp(`(?<![\\w.])${fn}\\(`, 'gi');
  let out = '';
  let from = 0;
  for (let m; (m = re.exec(sql)); ) {
    const open = m.index + m[0].length - 1;
    const close = closing(sql, open);
    const replacement = to(sql.slice(open + 1, close));
    if (replacement === null) continue;
    out += sql.slice(from, m.index) + replacement;
    from = close + 1;
    re.lastIndex = from;
  }
  return out + sql.slice(from);
};

// `x GLOB pattern`: the pattern runs to the next AND / OR / closing parenthesis at the same depth, because in SQLite
// `||` binds tighter than GLOB while PostgreSQL has no operator of that rank to map it to.
const rewriteGlob = (sql) => {
  const re = /([\w.]+)\s+GLOB\s+/g;
  const m = re.exec(sql);
  if (!m) return sql;
  const start = m.index + m[0].length;
  let end = start;
  for (let depth = 0; end < sql.length; end++) {
    if (sql[end] === '(') depth++;
    else if (sql[end] === ')' && depth-- === 0) break;
    else if (depth === 0 && /^\s(AND|OR|ORDER|GROUP|LIMIT|THEN|ELSE|END|UNION)\b/i.test(sql.slice(end, end + 8))) break;
  }
  return rewriteGlob(`${sql.slice(0, m.index)}sqlite_glob(${m[1]}, ${sql.slice(start, end).trim()})${sql.slice(end)}`);
};

const RENAMED = ['json_each', 'json_extract', 'json', 'date', 'datetime', 'strftime', 'printf'];
const RENAME_RE = new RegExp(`(?<![\\w.])(${RENAMED.join('|')})\\(`, 'g');

// Rewrites the SQLite spellings that have a mechanical PostgreSQL equivalent. `changes` is the row count of the
// previous data-changing statement in the same batch, which is what SQLite's changes() returns.
export const toPostgres = (sql, changes = 0) => {
  const { masked, unmask } = mask(sql);
  let n = 0;
  let out = masked
    .replace(/\bchanges\(\)/g, String(changes))
    .replace(/\blast_insert_rowid\(\)/g, 'lastval()')
    .replace(/\s+COLLATE NOCASE\b/g, '')
    // SQLite's LIKE ignores ASCII letter case.
    .replace(/\bLIKE\b/g, 'ILIKE')
    // PostgreSQL cannot infer a type for a parameter that is only tested for NULL.
    .replace(/\?(\s+IS\s+(?:NOT\s+)?NULL\b)/gi, 'CAST(? AS TEXT)$1')
    .replace(/\bIS \?/g, 'IS NOT DISTINCT FROM ?');
  out = rewriteGlob(out);
  // SQLite reads the leading digits of a text value and never fails; PostgreSQL's CAST would.
  out = rewriteCalls(out, 'CAST', (args) => (/\sAS\s+INTEGER\s*$/i.test(args) ? `sqlite_int((${args.replace(/\sAS\s+INTEGER\s*$/i, '')})::text)` : null));
  out = rewriteCalls(out, 'json_object', (args) => `sqlite_json_object(json_build_array(${args}))`);
  out = out.replace(RENAME_RE, 'sqlite_$1(');
  if (/\bINSERT OR IGNORE INTO\b/.test(out)) {
    out = out.replace(/\bINSERT OR IGNORE INTO\b/, 'INSERT INTO');
    const at = out.search(/\bRETURNING\b/);
    out = at < 0 ? `${out} ON CONFLICT DO NOTHING` : `${out.slice(0, at)}ON CONFLICT DO NOTHING ${out.slice(at)}`;
  }
  return unmask(out.replace(/\?/g, () => `$${++n}`));
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
const REPLACE_RE = /^\s*INSERT OR REPLACE INTO\s+(\w+)\s*\(([^)]*)\)/i;

export const createPgDatabase = (driver) => {
  // INSERT OR REPLACE swaps the whole row: listed columns take the new values, the rest go back to their defaults.
  const upserts = new Map();
  // The catalogue is read through the same runner: inside a batch the driver itself is busy until the batch ends.
  const asUpsert = async (runner, sql) => {
    const m = REPLACE_RE.exec(sql);
    if (!m) return sql;
    const table = m[1].toLowerCase();
    if (!upserts.has(table)) {
      const { rows } = await runner.query(
        `SELECT a.attname AS name, COALESCE(i.indisprimary, false) AS pk FROM pg_attribute a
           LEFT JOIN pg_index i ON i.indrelid = a.attrelid AND i.indisprimary AND a.attnum = ANY(i.indkey)
          WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped`,
        [table]
      );
      upserts.set(table, { key: rows.filter((r) => r.pk).map((r) => r.name), all: rows.filter((r) => !r.pk).map((r) => r.name) });
    }
    const { key, all } = upserts.get(table);
    const listed = new Set(m[2].split(',').map((c) => c.trim().replace(/"/g, '').toLowerCase()));
    const set = all.map((c) => `"${c}" = ${listed.has(c) ? `EXCLUDED."${c}"` : 'DEFAULT'}`).join(', ');
    return `${sql.replace(/^\s*INSERT OR REPLACE INTO/i, 'INSERT INTO')} ON CONFLICT (${key.map((c) => `"${c}"`).join(', ')}) DO UPDATE SET ${set}`;
  };

  const execute = async (runner, stmt, changes) => {
    try {
      const res = await runner.query(toPostgres(await asUpsert(runner, stmt.sql), changes), stmt.params.map(toParam));
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
