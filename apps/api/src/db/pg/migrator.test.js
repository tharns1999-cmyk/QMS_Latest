import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkMigrations } from '../../node/dbChecks.js';
import { moveDatabase } from './dataMove.js';
import { adoptBaseline, applyPending, listD1Migrations, loadMigrations } from './migrator.js';
import { createPgDatabase } from '../pgAdapter.js';

const COMPAT = "CREATE OR REPLACE FUNCTION compat_probe() RETURNS int LANGUAGE sql AS 'SELECT 1';";
const D1_NAMES = ['0001_start.sql', '0002_more.sql'];

describe('loading migration files', () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'qms-mig-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const write = (name, text) => writeFileSync(join(dir, name), text);

  it('returns the files in number order with their checksums, and ignores files that are not SQL', () => {
    write('0046_second.sql', 'SELECT 2;');
    write('0045_first.sql', 'SELECT 1;');
    write('README.md', 'notes');
    const found = loadMigrations(dir);
    expect(found.map((m) => [m.name, m.number])).toEqual([['0045_first.sql', 45], ['0046_second.sql', 46]]);
    expect(found[0].checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(found[0].checksum).not.toBe(found[1].checksum);
  });

  it('stops on a misnamed SQL file and on two files with one number, instead of skipping them', () => {
    write('0045_ok.sql', 'SELECT 1;');
    write('0046-wrong-name.sql', 'SELECT 1;');
    expect(() => loadMigrations(dir)).toThrow(/NNNN_what_it_does\.sql/);
    rmSync(join(dir, '0046-wrong-name.sql'));
    write('0045_other.sql', 'SELECT 2;');
    expect(() => loadMigrations(dir)).toThrow(/same number 0045/);
  });

  it('lists the D1 migration files the source must have run', () => {
    write('0001_a.sql', 'x');
    write('0002_b.sql', 'x');
    write('notes.txt', 'x');
    expect(listD1Migrations(dir)).toEqual(['0001_a.sql', '0002_b.sql']);
  });
});

describe('applying PostgreSQL migrations after the move', () => {
  let dir;
  let lite;
  let target;
  const open = [];

  const sqliteSource = (names = D1_NAMES) => {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL);
      CREATE TABLE things (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL);
      INSERT INTO things (label) VALUES ('one');
      ${names.map((n) => `INSERT INTO d1_migrations (name) VALUES ('${n}');`).join('\n')}`);
    open.push(db);
    return { all: async (sql) => { const s = db.prepare(sql); s.setReadBigInts(true); return s.all(); } };
  };
  const write = (name, text) => writeFileSync(join(dir, name), text);
  const migrations = () => loadMigrations(dir);
  const recorded = async () => (await lite.query('SELECT name, kind FROM schema_migrations ORDER BY name')).rows.map((r) => `${r.kind}:${r.name}`);
  const tableExists = async (name) => (await lite.query('SELECT to_regclass($1) AS t', [name])).rows[0].t !== null;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'qms-mig-'));
    lite = await PGlite.create({ extensions: { citext } });
    target = { exec: (sql) => lite.exec(sql), query: (sql, params) => lite.query(sql, params) };
    await moveDatabase({ source: sqliteSource(), target, compatSql: COMPAT, expectedMigrations: D1_NAMES });
  });
  afterEach(async () => {
    await lite.close();
    while (open.length) open.pop().close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('records what the moved schema already contains as the baseline', async () => {
    expect(await recorded()).toEqual(['compat:compat.sql', 'baseline:0001_start.sql', 'baseline:0002_more.sql'].sort());
  });

  it('refuses a source that has not run exactly the migrations this code expects, and creates nothing', async () => {
    const fresh = await PGlite.create({ extensions: { citext } });
    try {
      const t = { exec: (sql) => fresh.exec(sql), query: (sql, params) => fresh.query(sql, params) };
      await expect(moveDatabase({ source: sqliteSource(['0001_start.sql']), target: t, compatSql: COMPAT, expectedMigrations: D1_NAMES })).rejects.toThrow(/Not applied there: 0002_more\.sql/);
      await expect(moveDatabase({ source: sqliteSource([...D1_NAMES, '0003_new.sql']), target: t, compatSql: COMPAT, expectedMigrations: D1_NAMES })).rejects.toThrow(/unknown here: 0003_new\.sql/);
      expect((await fresh.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'")).rows[0].n).toBe(0);
    } finally {
      await fresh.close();
    }
  });

  it('applies pending files in order, once each, and does nothing the second time', async () => {
    write('0045_add_notes.sql', 'CREATE TABLE notes (id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, body TEXT NOT NULL);');
    write('0046_index_notes.sql', 'CREATE INDEX notes_body ON notes (body);');
    const first = await applyPending({ target, migrations: migrations(), compatSql: COMPAT });
    expect(first).toEqual({ applied: ['0045_add_notes.sql', '0046_index_notes.sql'], compatUpdated: false });
    expect(await tableExists('notes')).toBe(true);
    expect(await recorded()).toContain('migration:0046_index_notes.sql');
    expect(await applyPending({ target, migrations: migrations(), compatSql: COMPAT })).toEqual({ applied: [], compatUpdated: false });
  });

  it('rolls a failing migration back completely, records nothing, and does not run the ones after it', async () => {
    write('0045_ok.sql', 'CREATE TABLE ok_table (id INT);');
    write('0046_breaks.sql', 'CREATE TABLE half_done (id INT); SELECT 1 / 0;');
    write('0047_after.sql', 'CREATE TABLE after_table (id INT);');
    await expect(applyPending({ target, migrations: migrations(), compatSql: COMPAT })).rejects.toThrow(/0046_breaks\.sql failed and was rolled back/);
    expect(await tableExists('ok_table')).toBe(true);
    expect(await tableExists('half_done')).toBe(false);
    expect(await tableExists('after_table')).toBe(false);
    expect(await recorded()).not.toContain('migration:0046_breaks.sql');
    // Fixed and run again: it carries on from where it stopped.
    write('0046_breaks.sql', 'CREATE TABLE fixed_table (id INT);');
    expect((await applyPending({ target, migrations: migrations(), compatSql: COMPAT })).applied).toEqual(['0046_breaks.sql', '0047_after.sql']);
  });

  it('refuses a migration that was edited after it was applied, applying nothing else', async () => {
    write('0045_one.sql', 'CREATE TABLE one (id INT);');
    await applyPending({ target, migrations: migrations(), compatSql: COMPAT });
    write('0045_one.sql', 'CREATE TABLE one (id INT, extra INT);');
    write('0046_two.sql', 'CREATE TABLE two (id INT);');
    await expect(applyPending({ target, migrations: migrations(), compatSql: COMPAT })).rejects.toThrow(/edited after they were applied: 0045_one\.sql/);
    expect(await tableExists('two')).toBe(false);
  });

  it('refuses a database that has applied a migration this code does not have', async () => {
    write('0045_one.sql', 'CREATE TABLE one (id INT);');
    await applyPending({ target, migrations: migrations(), compatSql: COMPAT });
    rmSync(join(dir, '0045_one.sql'));
    await expect(applyPending({ target, migrations: migrations(), compatSql: COMPAT })).rejects.toThrow(/does not have: 0045_one\.sql/);
  });

  it('refuses a new file numbered below one already applied', async () => {
    write('0046_later.sql', 'CREATE TABLE later (id INT);');
    await applyPending({ target, migrations: migrations(), compatSql: COMPAT });
    write('0045_missed.sql', 'CREATE TABLE missed (id INT);');
    await expect(applyPending({ target, migrations: migrations(), compatSql: COMPAT })).rejects.toThrow(/below one already applied: 0045_missed\.sql/);
    expect(await tableExists('missed')).toBe(false);
    write('0001_a.sql', 'SELECT 1;');
    rmSync(join(dir, '0045_missed.sql'));
    await expect(applyPending({ target, migrations: migrations(), compatSql: COMPAT })).rejects.toThrow(/below one already applied: 0001_a\.sql/);
  });

  it('applies a changed compat.sql by itself, before the migrations, and records it', async () => {
    const newer = `${COMPAT}\nCREATE OR REPLACE FUNCTION compat_probe2() RETURNS int LANGUAGE sql AS 'SELECT 2';`;
    write('0045_uses_probe.sql', 'CREATE TABLE probed AS SELECT compat_probe2() AS n;');
    const result = await applyPending({ target, migrations: migrations(), compatSql: newer });
    expect(result).toEqual({ applied: ['0045_uses_probe.sql'], compatUpdated: true });
    expect((await lite.query('SELECT n FROM probed')).rows[0].n).toBe(2);
    expect((await applyPending({ target, migrations: migrations(), compatSql: newer })).compatUpdated).toBe(false);
  });

  it('refuses a database that was not created by the move', async () => {
    const bare = await PGlite.create();
    try {
      await expect(applyPending({ target: { exec: (s) => bare.exec(s), query: (s, p) => bare.query(s, p) }, migrations: [], compatSql: COMPAT })).rejects.toThrow(/not created by the data move/);
    } finally {
      await bare.close();
    }
  });

  it('records the history of a database moved before the record existed, once', async () => {
    const old = await PGlite.create({ extensions: { citext } });
    try {
      const t = { exec: (s) => old.exec(s), query: (s, p) => old.query(s, p) };
      await old.exec('CREATE TABLE things (id INT)');
      expect(await adoptBaseline({ target: t, baselineNames: D1_NAMES, compatSql: COMPAT })).toBe(true);
      expect(await adoptBaseline({ target: t, baselineNames: D1_NAMES, compatSql: COMPAT })).toBe(false);
      expect((await old.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n).toBe(3);
      expect((await applyPending({ target: t, migrations: [], compatSql: COMPAT })).applied).toEqual([]);
    } finally {
      await old.close();
    }
  });

  it('lets the start-up check pass only when the schema is exactly what the code expects', async () => {
    const run = (runner) => ({ query: async (sql, params) => { const r = await runner.query(sql, params); return { rows: r.rows, affectedRows: r.affectedRows ?? 0 }; } });
    const db = createPgDatabase({ ...run(lite), transaction: (fn) => lite.transaction((tx) => fn(run(tx))) });
    expect(await checkMigrations(db, migrations(), COMPAT)).toEqual({ ok: true, problems: [] });

    write('0045_pending.sql', 'CREATE TABLE pending_table (id INT);');
    const pending = await checkMigrations(db, migrations(), COMPAT);
    expect(pending.ok).toBe(false);
    expect(pending.problems.join(' ')).toMatch(/not applied yet: 0045_pending\.sql/);

    await applyPending({ target, migrations: migrations(), compatSql: COMPAT });
    expect((await checkMigrations(db, migrations(), COMPAT)).ok).toBe(true);
    expect((await checkMigrations(db, migrations(), `${COMPAT} `)).problems.join(' ')).toMatch(/compat\.sql changed/);

    write('0045_pending.sql', 'CREATE TABLE pending_table (id INT, edited INT);');
    expect((await checkMigrations(db, migrations(), COMPAT)).problems.join(' ')).toMatch(/edited after being applied/);

    await lite.exec('DROP TABLE schema_migrations');
    expect((await checkMigrations(db, migrations(), COMPAT)).problems.join(' ')).toMatch(/no schema_migrations table/);
  });
});

describe('the migrations-pg folder shipped with the code', () => {
  it('loads cleanly, so a mistyped file name is caught before anything is deployed', () => {
    expect(() => loadMigrations(fileURLToPath(new URL('../../../migrations-pg/', import.meta.url)))).not.toThrow();
  });
});
