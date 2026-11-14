import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { describe, it, expect, afterEach } from 'vitest';
import { fingerprint, moveDatabase } from './dataMove.js';
import { openSqliteSource } from './sqliteSource.js';

const MIGRATIONS = new URL('../../../migrations/', import.meta.url);
const open = [];
const track = (thing) => { open.push(thing); return thing; };
afterEach(async () => {
  while (open.length) await open.pop().close();
});

const freshPostgres = async () => {
  const lite = track(await PGlite.create({ extensions: { citext } }));
  return { lite, target: { exec: (sql) => lite.exec(sql), query: (sql, params) => lite.query(sql, params) } };
};

// Same as the real reader: integers exact.
const sourceOf = (db) => ({ all: async (sql) => { const s = db.prepare(sql); s.setReadBigInts(true); return s.all(); } });

describe('fingerprint', () => {
  it('ignores row order and notices any changed value, row or null', () => {
    const a = fingerprint([{ id: 1, name: 'ก' }, { id: 2, name: null }], ['id', 'name']);
    expect(fingerprint([{ id: 2, name: null }, { id: 1, name: 'ก' }], ['id', 'name'])).toEqual(a);
    expect(fingerprint([{ id: 1, name: 'ก' }, { id: 2, name: '' }], ['id', 'name']).sha256).not.toBe(a.sha256);
    expect(fingerprint([{ id: 1, name: 'ก' }], ['id', 'name']).sha256).not.toBe(a.sha256);
    expect(fingerprint([{ id: 1, name: 'ข' }, { id: 2, name: null }], ['id', 'name']).sha256).not.toBe(a.sha256);
  });

  it('reads an integer the same whether it arrives as a number, a bigint or the text PostgreSQL gives', () => {
    const asNumber = fingerprint([{ n: 5 }], ['n']);
    expect(fingerprint([{ n: 5n }], ['n'])).toEqual(asNumber);
    expect(fingerprint([{ n: '5' }], ['n']).sha256).not.toBe(asNumber.sha256); // text 5 is not the number 5
  });
});

describe('moving a database into PostgreSQL', () => {
  const smallSchema = `
    CREATE TABLE depts (code TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE people (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE COLLATE NOCASE, dept TEXT NOT NULL REFERENCES depts(code), boss_id INTEGER REFERENCES people(id), big INTEGER);
    CREATE TABLE log (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), note TEXT);
    CREATE INDEX people_dept ON people (dept);
    CREATE TRIGGER log_no_delete BEFORE DELETE ON log BEGIN SELECT RAISE(ABORT, 'log is append-only'); END;
    INSERT INTO depts VALUES ('QA', 'Quality'), ('DC', 'Document Control');
    INSERT INTO people (id, email, dept, boss_id, big) VALUES (1, 'Boss@Test.Local', 'QA', NULL, 1779000000000), (2, 'staff@test.local', 'DC', 1, 9007199254740993);
    INSERT INTO log (id, at, note) VALUES (7, '2026-11-14T00:00:00.000Z', 'ไทย ✓'), (9, '2026-11-14T00:00:01.000Z', NULL);
  `;
  const smallSource = () => {
    const db = track(new DatabaseSync(':memory:'));
    db.exec(smallSchema);
    return db;
  };

  it('copies every row, keeps the rules and carries on numbering after the last id', async () => {
    const db = smallSource();
    const { lite, target } = await freshPostgres();
    const result = await moveDatabase({ source: sourceOf(db), target });
    expect(result.rows).toBe(2 + 2 + 2);
    expect(result.tables.map((t) => t.table).sort()).toEqual(['depts', 'log', 'people']);

    // A value above 2^53 arrives exactly.
    expect((await lite.query("SELECT big::text AS big FROM people WHERE id = 2")).rows[0].big).toBe('9007199254740993');
    // Next generated ids continue after the highest copied id, so a new record cannot reuse an old number.
    await lite.exec("INSERT INTO log (note) VALUES ('after the move')");
    expect((await lite.query("SELECT MAX(id)::int AS id FROM log")).rows[0].id).toBe(10);
    // Foreign keys, case-insensitive e-mail, the unique rule and the append-only trigger are back.
    await expect(lite.exec("INSERT INTO people (email, dept) VALUES ('x@test.local', 'NOPE')")).rejects.toThrow(/foreign key/i);
    await expect(lite.exec("INSERT INTO people (email, dept) VALUES ('BOSS@test.local', 'QA')")).rejects.toThrow(/unique|duplicate/i);
    await expect(lite.exec('DELETE FROM log')).rejects.toThrow(/append-only/);
  });

  it('refuses a source row that points at nothing and keeps nothing', async () => {
    const db = smallSource();
    db.exec("PRAGMA foreign_keys = OFF; INSERT INTO people (id, email, dept) VALUES (3, 'orphan@test.local', 'GONE');");
    const { lite, target } = await freshPostgres();
    await expect(moveDatabase({ source: sourceOf(db), target })).rejects.toThrow(/foreign key/i);
    expect((await lite.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'")).rows[0].n).toBe(0);
  });

  it('refuses a target that already has tables, and leaves them alone', async () => {
    const { lite, target } = await freshPostgres();
    await lite.exec("CREATE TABLE precious (id int); INSERT INTO precious VALUES (1)");
    await expect(moveDatabase({ source: sourceOf(smallSource()), target })).rejects.toThrow(/already has tables/);
    expect((await lite.query('SELECT count(*)::int AS n FROM precious')).rows[0].n).toBe(1);
  });

  it('refuses an empty source', async () => {
    const { target } = await freshPostgres();
    await expect(moveDatabase({ source: sourceOf(track(new DatabaseSync(':memory:'))), target })).rejects.toThrow(/no tables/);
  });

  it('stops and keeps nothing when what PostgreSQL stored differs from the source', async () => {
    const db = smallSource();
    const { lite, target } = await freshPostgres();
    // A target that quietly alters one value while the copy runs, as a bad column type or a driver bug would.
    const tampering = {
      exec: target.exec,
      query: (sql, params) => target.query(sql, sql.startsWith('INSERT INTO "depts"') ? [params[0], 'changed'].concat(params.slice(2)) : params)
    };
    await expect(moveDatabase({ source: sourceOf(db), target: tampering })).rejects.toThrow(/does not match the source/);
    expect((await lite.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'")).rows[0].n).toBe(0);
  });
});

describe('moving the real schema', () => {
  it('copies a database built from every migration, read from a file and from an export', async () => {
    const db = track(new DatabaseSync(':memory:'));
    for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8'));
    db.exec(`INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments) VALUES ('U1', 'ผู้ใช้ ทดสอบ', 'Mixed.Case@Test.Local', 'x', 'GENERAL_USER', 2, 'QA', '["QA"]');
      INSERT INTO audit_log (actor_id, action, details) VALUES ('U1', 'TEST', '{"a":1}'), (NULL, 'SYSTEM', NULL);`);
    const dir = mkdtempSync(join(tmpdir(), 'qms-move-'));
    try {
      const file = join(dir, 'copy.sqlite');
      db.exec(`VACUUM INTO '${file.replaceAll('\\', '/')}'`);
      const { lite, target } = await freshPostgres();
      const fromFile = openSqliteSource(file);
      const result = await moveDatabase({ source: fromFile, target });
      fromFile.close();
      expect(result.tables.length).toBeGreaterThanOrEqual(25);
      expect((await lite.query("SELECT count(*)::int AS n FROM audit_log")).rows[0].n).toBe(2);
      expect((await lite.query("SELECT email FROM users WHERE email = 'mixed.case@test.local'")).rows).toHaveLength(1);
      // After the move the triggers still protect the audit trail.
      await expect(lite.exec('DELETE FROM audit_log')).rejects.toThrow();

      // The SQL text `wrangler d1 export` writes gives the same answer.
      writeFileSync(join(dir, 'export.sql'), 'PRAGMA defer_foreign_keys=TRUE;\n' + db.prepare("SELECT group_concat(sql, ';\n') AS ddl FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'").get().ddl + ';\n' +
        db.prepare('SELECT * FROM users').all().map((u) => `INSERT INTO users (${Object.keys(u).join(',')}) VALUES (${Object.values(u).map((v) => (v === null ? 'NULL' : typeof v === 'number' ? v : `'${String(v).replaceAll("'", "''")}'`)).join(',')});`).join('\n'));
      const second = await freshPostgres();
      const fromSql = openSqliteSource(join(dir, 'export.sql'));
      const again = await moveDatabase({ source: fromSql, target: second.target });
      fromSql.close();
      expect(again.tables.find((t) => t.table === 'users').rows).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
