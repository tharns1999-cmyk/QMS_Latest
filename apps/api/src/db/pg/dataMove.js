// Moves a whole QMS database from SQLite (Cloudflare D1) into an empty PostgreSQL database and proves the copy.
//
// Everything happens in ONE transaction: the tables, every row, the indexes and the triggers, then a comparison of row
// counts and a fingerprint of every table on both sides. If anything differs the transaction is rolled back and the
// PostgreSQL database is left exactly as it was. Nothing is written to the source.
//
// The same function builds the PostgreSQL test database (scripts/test-migrate-pg.js), so every test run exercises it.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { tableDdl, indexDdl, triggerDdl } from './fromSqlite.js';
import { checksumOf, MIGRATIONS_TABLE_DDL } from './migrator.js';

// Created by SQLite or Cloudflare, not by the application. d1_migrations only records which D1 migrations ran.
const internal = (name) => name.startsWith('sqlite_') || name.startsWith('_cf_') || name === 'd1_migrations';
const quote = (name) => `"${name}"`;
const MAX_PARAMS = 10_000;

export const readSchema = async (source) => {
  const rows = await source.all('SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid');
  return rows.filter((o) => !internal(o.name) && ['table', 'index', 'trigger'].includes(o.type)).map((o) => ({ type: o.type, name: o.name, sql: o.sql }));
};

// One value as text, the same for both databases: SQLite and PostgreSQL hand integers back as numbers, bigints or strings.
const canonical = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'bigint') return `n:${value}`;
  if (value instanceof Uint8Array) return `b:${Buffer.from(value).toString('hex')}`;
  return `s:${String(value)}`;
};

const rowText = (row, columns) => JSON.stringify(columns.map((c) => canonical(row[c])));

// Order does not matter (a table has no defined order), so each row is hashed and the hashes are sorted.
export const fingerprint = (rows, columns) => {
  const hashes = rows.map((row) => createHash('sha256').update(rowText(row, columns)).digest('hex')).sort();
  return { rows: rows.length, sha256: createHash('sha256').update(hashes.join('\n')).digest('hex') };
};

const columnsOf = (rows, fallback) => (rows.length ? Object.keys(rows[0]) : fallback);

const createTables = async (target, tables) => {
  // A table may reference one created later, so keep going round until none is left.
  let pending = tables;
  while (pending.length) {
    const failed = [];
    let lastError;
    for (const table of pending) {
      // A failed statement aborts a PostgreSQL transaction, so each attempt is its own savepoint.
      await target.exec('SAVEPOINT create_table');
      try {
        await target.exec(tableDdl(table.sql));
        await target.exec('RELEASE SAVEPOINT create_table');
      } catch (err) {
        await target.exec('ROLLBACK TO SAVEPOINT create_table');
        failed.push(table);
        lastError = `${table.name}: ${err.message}`;
      }
    }
    if (failed.length === pending.length) throw new Error(`Cannot create PostgreSQL tables. ${lastError}`);
    pending = failed;
  }
};

// Foreign keys are taken off while rows are loaded (any order works then, and no special database right is needed)
// and put back afterwards. Putting them back makes PostgreSQL check every existing row, so an orphan row in the
// source stops the move instead of arriving silently.
const takeOffForeignKeys = async (target) => {
  const { rows } = await target.query(
    "SELECT conrelid::regclass::text AS tbl, conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace ORDER BY oid"
  );
  for (const fk of rows) await target.exec(`ALTER TABLE ${fk.tbl} DROP CONSTRAINT ${quote(fk.conname)}`);
  return rows;
};

const putForeignKeysBack = async (target, keys) => {
  for (const fk of keys) await target.exec(`ALTER TABLE ${fk.tbl} ADD CONSTRAINT ${quote(fk.conname)} ${fk.def}`);
};

const loadRows = async (target, table, rows, columns) => {
  const perStatement = Math.max(1, Math.floor(MAX_PARAMS / columns.length));
  for (let from = 0; from < rows.length; from += perStatement) {
    const chunk = rows.slice(from, from + perStatement);
    const params = [];
    const tuples = chunk.map((row) => `(${columns.map((c) => { params.push(row[c]); return `$${params.length}`; }).join(', ')})`);
    await target.query(`INSERT INTO ${quote(table)} (${columns.map(quote).join(', ')}) VALUES ${tuples.join(', ')}`, params);
  }
};

const resetIdentity = async (target, table) => {
  const { rows } = await target.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND is_identity = 'YES'", [table]);
  for (const { column_name: column } of rows) {
    await target.exec(`SELECT setval(pg_get_serial_sequence('${quote(table)}', '${column}'), COALESCE((SELECT MAX(${quote(column)}) FROM ${quote(table)}), 0) + 1, false)`);
  }
};

// Connection settings for a plain pg client used here: 64-bit integers must come back exact and as numbers (bigint), the
// way the source reader gives them, or the comparison would see "1" against 1.
export const exactIntegers = { getTypeParser: (oid, format) => (oid === 20 ? (text) => BigInt(text) : pg.types.getTypeParser(oid, format)) };

// The D1 migrations the source says it has run, in order. A source without the table (a plain SQLite file) has none.
const readHistory = async (source) => {
  try {
    return await source.all('SELECT name, applied_at FROM d1_migrations ORDER BY id');
  } catch {
    return [];
  }
};

// expectedMigrations (the file names in migrations/), when given, must be exactly what the source has run: a source that
// lags would give a PostgreSQL schema the current code does not expect, one that is ahead has changes this code lacks.
const checkHistory = (history, expectedMigrations) => {
  if (!expectedMigrations) return;
  const have = history.map((h) => h.name);
  const missing = expectedMigrations.filter((n) => !have.includes(n));
  const extra = have.filter((n) => !expectedMigrations.includes(n));
  if (missing.length || extra.length || !have.length) {
    throw new Error(`The source database is not at the schema this code expects. Not applied there: ${missing.join(', ') || 'none'}. Applied there but unknown here: ${extra.join(', ') || 'none'}. ${have.length ? '' : 'It has no migration history at all. '}Bring it to the same migrations first.`);
  }
};

// source: { all(sql) -> rows }   target: { exec(sql), query(sql, params) -> { rows } }, one session, so the transaction holds.
// Returns { tables: [{ table, rows, sha256 }], rows } or throws and leaves the target untouched.
export const moveDatabase = async ({ source, target, compatSql = readFileSync(new URL('./compat.sql', import.meta.url), 'utf8'), expectedMigrations, log = () => {} }) => {
  const objects = await readSchema(source);
  const tables = objects.filter((o) => o.type === 'table');
  if (!tables.length) throw new Error('The source holds no tables; refusing to continue.');
  const history = await readHistory(source);
  checkHistory(history, expectedMigrations);

  await target.exec('BEGIN');
  try {
    const existing = await target.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    if (existing.rows.length) {
      throw new Error(`The target database already has tables (${existing.rows.map((r) => r.table_name).slice(0, 5).join(', ')}...). Use an empty database.`);
    }

    await target.exec(compatSql);
    await createTables(target, tables);
    // What the schema already contains is recorded, so later changes (src/db/pg/migrator.js) start from here.
    await target.exec(MIGRATIONS_TABLE_DDL);
    for (const h of history) await target.query("INSERT INTO schema_migrations (name, kind, applied_at) VALUES ($1, 'baseline', $2)", [h.name, String(h.applied_at)]);
    await target.query("INSERT INTO schema_migrations (name, kind, checksum) VALUES ('compat.sql', 'compat', $1)", [checksumOf(compatSql)]);
    const keys = await takeOffForeignKeys(target);

    const expected = [];
    for (const table of tables) {
      const rows = await source.all(`SELECT * FROM ${quote(table.name)}`);
      const { rows: described } = await target.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position", [table.name]);
      const columns = columnsOf(rows, described.map((c) => c.column_name));
      const missing = columns.filter((c) => !described.some((d) => d.column_name === c));
      if (missing.length) throw new Error(`${table.name}: the source has columns the PostgreSQL table lacks (${missing.join(', ')})`);
      await loadRows(target, table.name, rows, columns);
      await resetIdentity(target, table.name);
      expected.push({ table: table.name, columns, ...fingerprint(rows, columns) });
      log(`${table.name}: ${rows.length} rows copied`);
    }

    await putForeignKeysBack(target, keys);
    for (const index of objects.filter((o) => o.type === 'index')) await target.exec(indexDdl(index.sql));
    for (const trigger of objects.filter((o) => o.type === 'trigger')) await target.exec(triggerDdl(trigger.sql));

    // Read everything back from PostgreSQL itself and compare with what the source gave.
    const mismatches = [];
    const report = [];
    for (const want of expected) {
      const { rows } = await target.query(`SELECT * FROM ${quote(want.table)}`);
      const got = fingerprint(rows, want.columns);
      report.push({ table: want.table, rows: got.rows, sha256: got.sha256 });
      if (got.rows !== want.rows || got.sha256 !== want.sha256) mismatches.push(`${want.table}: source ${want.rows} rows, PostgreSQL ${got.rows} rows, fingerprints ${got.sha256 === want.sha256 ? 'equal' : 'differ'}`);
    }
    if (mismatches.length) throw new Error(`The copy does not match the source; nothing was kept.\n- ${mismatches.join('\n- ')}`);

    await target.exec('COMMIT');
    return { tables: report, rows: report.reduce((sum, t) => sum + t.rows, 0), baselineMigrations: history.length };
  } catch (err) {
    await target.exec('ROLLBACK').catch(() => {});
    throw err;
  }
};
