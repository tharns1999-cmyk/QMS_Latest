// Changes to the PostgreSQL schema after the data move. Forward-only numbered SQL files in migrations-pg/, written for
// PostgreSQL, each applied once in its own transaction and recorded in schema_migrations.
//
// schema_migrations is created by the data move (src/db/pg/dataMove.js). It records:
//   baseline  the D1 migrations (0001 ... 0044) the moved schema already contained; never run again
//   migration the files in migrations-pg/ that were applied here, with the sha256 of the file as it was applied
//   compat    the sqlite_* helper functions (compat.sql) as last applied
//
// A migration that was edited after it was applied, one that is numbered below an applied one, and a database that has
// applied a migration this code does not have are all refused: each means the database and the code have drifted.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const MIGRATIONS_TABLE_DDL = `CREATE TABLE schema_migrations (
  name TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('baseline', 'migration', 'compat')),
  checksum TEXT,
  applied_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
)`;

const RUNNER_LOCK_KEY = 8217002; // not the write lock the application takes
const FILE_NAME = /^(\d{4})_[a-z0-9_]+\.sql$/;

export const checksumOf = (text) => createHash('sha256').update(text).digest('hex');

// The migration files in a folder, in order. A .sql file whose name does not follow the pattern is an error, not a
// file to skip: a typo would otherwise mean a migration that never runs.
export const loadMigrations = (dir) => {
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.sql')).sort();
  const seen = new Map();
  return files.map((name) => {
    const m = FILE_NAME.exec(name);
    if (!m) throw new Error(`${name}: migration files are named NNNN_what_it_does.sql (lower case letters, digits, underscores)`);
    if (seen.has(m[1])) throw new Error(`${name} and ${seen.get(m[1])} have the same number ${m[1]}`);
    seen.set(m[1], name);
    const sql = readFileSync(join(dir, name), 'utf8');
    return { name, number: Number(m[1]), sql, checksum: checksumOf(sql) };
  });
};

// What the database records against what the code has, from a function that runs SQL and returns rows.
export const migrationStatus = async (rows, migrations, compatSql) => {
  const table = (await rows("SELECT to_regclass('schema_migrations') AS t"))[0]?.t;
  if (!table) return { tableMissing: true, applied: [], pending: migrations.map((m) => m.name), edited: [], unknown: [], outOfOrder: [], compatStale: Boolean(compatSql) };
  const applied = await rows('SELECT name, kind, checksum FROM schema_migrations ORDER BY name');
  const byName = new Map(migrations.map((m) => [m.name, m]));
  const done = applied.filter((a) => a.kind === 'migration');
  const doneNames = new Set(applied.map((a) => a.name));
  const highest = [...applied.filter((a) => a.kind !== 'compat').map((a) => a.name)].sort().at(-1) ?? '';
  const pending = migrations.filter((m) => !doneNames.has(m.name));
  return {
    tableMissing: false,
    applied,
    pending: pending.map((m) => m.name),
    edited: done.filter((a) => byName.has(a.name) && byName.get(a.name).checksum !== a.checksum).map((a) => a.name),
    unknown: done.filter((a) => !byName.has(a.name)).map((a) => a.name),
    outOfOrder: pending.filter((m) => m.name < highest).map((m) => m.name),
    // compat.sql changed since it was last applied here
    compatStale: Boolean(compatSql) && applied.find((a) => a.kind === 'compat')?.checksum !== checksumOf(compatSql)
  };
};

// target: { exec(sql), query(sql, params) -> { rows } } on one session. Returns { applied: [names], compatUpdated }.
export const applyPending = async ({ target, migrations, compatSql, log = () => {} }) => {
  await target.query('SELECT pg_advisory_lock($1)', [RUNNER_LOCK_KEY]);
  try {
    const status = await migrationStatus(async (sql) => (await target.query(sql)).rows, migrations);
    if (status.tableMissing) throw new Error('schema_migrations does not exist: this database was not created by the data move (scripts/migrate-data-to-pg.js)');
    if (status.unknown.length) throw new Error(`The database has applied migrations this code does not have: ${status.unknown.join(', ')}. Run the version of the code that has them.`);
    if (status.edited.length) throw new Error(`Migrations were edited after they were applied: ${status.edited.join(', ')}. Never edit an applied migration; add a new one.`);
    if (status.outOfOrder.length) throw new Error(`Migrations numbered below one already applied: ${status.outOfOrder.join(', ')}. Renumber them after the latest.`);

    // The helper functions come first so a migration can use a newer one.
    let compatUpdated = false;
    if (compatSql) {
      const sum = checksumOf(compatSql);
      const stored = status.applied.find((a) => a.kind === 'compat');
      if (stored?.checksum !== sum) {
        await target.exec('BEGIN');
        try {
          await target.exec(compatSql);
          await target.query("INSERT INTO schema_migrations (name, kind, checksum) VALUES ('compat.sql', 'compat', $1) ON CONFLICT (name) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = DEFAULT", [sum]);
          await target.exec('COMMIT');
        } catch (err) {
          await target.exec('ROLLBACK').catch(() => {});
          throw new Error(`compat.sql could not be applied: ${err.message}`);
        }
        compatUpdated = true;
        log('compat.sql applied');
      }
    }

    const applied = [];
    for (const migration of migrations.filter((m) => status.pending.includes(m.name))) {
      await target.exec('BEGIN');
      try {
        await target.exec(migration.sql);
        await target.query("INSERT INTO schema_migrations (name, kind, checksum) VALUES ($1, 'migration', $2)", [migration.name, migration.checksum]);
        await target.exec('COMMIT');
      } catch (err) {
        await target.exec('ROLLBACK').catch(() => {});
        throw new Error(`${migration.name} failed and was rolled back: ${err.message}`);
      }
      applied.push(migration.name);
      log(`${migration.name} applied`);
    }
    return { applied, compatUpdated };
  } finally {
    await target.query('SELECT pg_advisory_unlock($1)', [RUNNER_LOCK_KEY]).catch(() => {});
  }
};

// The names of the D1 migration files (../../../migrations), which a source database must have run in full.
export const listD1Migrations = (dir) => readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.sql')).sort();

// For a database that was moved before schema_migrations existed (the local tryout copy, a rehearsal): records the D1
// migrations it was built from as the baseline. Only call it for a database known to be at that schema.
export const adoptBaseline = async ({ target, baselineNames, compatSql }) => {
  const table = (await target.query("SELECT to_regclass('schema_migrations') AS t")).rows[0]?.t;
  if (table) return false;
  await target.exec('BEGIN');
  try {
    await target.exec(MIGRATIONS_TABLE_DDL);
    for (const name of baselineNames) await target.query("INSERT INTO schema_migrations (name, kind) VALUES ($1, 'baseline')", [name]);
    if (compatSql) await target.query("INSERT INTO schema_migrations (name, kind, checksum) VALUES ('compat.sql', 'compat', $1)", [checksumOf(compatSql)]);
    await target.exec('COMMIT');
  } catch (err) {
    await target.exec('ROLLBACK').catch(() => {});
    throw err;
  }
  return true;
};
