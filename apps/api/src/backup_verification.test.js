import { describe, it, expect } from 'vitest';
import { readdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  verifyMigrationsList,
  runVerify,
  COUNTED,
  REQUIRED_TRIGGERS
} from '../scripts/backup-tools.js';

describe('Backup Verification - Migration Integrity Suite', () => {
  const repoMigrations = readdirSync(join(__dirname, '../migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  it('verifies that the repository currently contains 39 migration files', () => {
    expect(repoMigrations.length).toBe(39);
    expect(repoMigrations[0]).toBe('0001_users_and_audit.sql');
    expect(repoMigrations[25]).toBe('0026_vcc_work_orders.sql');
    expect(repoMigrations[38]).toBe('0039_vcc_asset_hold_started_at.sql');
  });

  describe('verifyMigrationsList logic', () => {
    it('passes when database has the exact complete set of migrations (39/39)', () => {
      const dbEntries = repoMigrations.map((name, idx) => ({
        id: idx + 1,
        name
      }));

      const res = verifyMigrationsList(dbEntries, repoMigrations);
      expect(res.isValid).toBe(true);
      expect(res.isComplete).toBe(true);
      expect(res.isPrefix).toBe(true);
      expect(res.problems).toEqual([]);
      expect(res.appliedCount).toBe(39);
      expect(res.summary).toContain('39/39 (complete: 0001 to 0039_vcc_asset_hold_started_at.sql)');
    });

    it('passes when database has a valid sequential prefix of migrations (e.g. 26/39 as on current remote)', () => {
      const dbEntries = repoMigrations.slice(0, 26).map((name, idx) => ({
        id: idx + 1,
        name
      }));

      const res = verifyMigrationsList(dbEntries, repoMigrations);
      expect(res.isValid).toBe(true);
      expect(res.isComplete).toBe(false);
      expect(res.isPrefix).toBe(true);
      expect(res.problems).toEqual([]);
      expect(res.appliedCount).toBe(26);
      expect(res.summary).toContain('26/39 (valid prefix: 0001 to 0026_vcc_work_orders.sql)');
    });

    it('passes for any valid prefix from 1 up to 39', () => {
      for (const count of [1, 5, 10, 20, 26, 35, 39]) {
        const dbEntries = repoMigrations.slice(0, count).map((name, idx) => ({
          id: idx + 1,
          name
        }));
        const res = verifyMigrationsList(dbEntries, repoMigrations);
        expect(res.isValid).toBe(true);
        expect(res.appliedCount).toBe(count);
      }
    });

    it('fails when no migrations are recorded in database', () => {
      const resEmpty = verifyMigrationsList([], repoMigrations);
      expect(resEmpty.isValid).toBe(false);
      expect(resEmpty.problems).toContain('no migrations recorded in d1_migrations table');

      const resNull = verifyMigrationsList(null, repoMigrations);
      expect(resNull.isValid).toBe(false);
      expect(resNull.problems).toContain('no migrations recorded in d1_migrations table');
    });

    it('fails when database records more migrations than the repository contains', () => {
      const dbEntries = repoMigrations.map((name, idx) => ({ id: idx + 1, name }));
      dbEntries.push({ id: 40, name: '0040_future_uncommitted_migration.sql' });

      const res = verifyMigrationsList(dbEntries, repoMigrations);
      expect(res.isValid).toBe(false);
      expect(res.problems.some((p) => p.includes('database has 40 migrations recorded, but repository only has 39'))).toBe(true);
      expect(res.problems.some((p) => p.includes('unknown migration "0040_future_uncommitted_migration.sql" at position 40 exceeds repository migrations'))).toBe(true);
    });

    it('fails when an unknown or rogue migration name is recorded', () => {
      const dbEntries = repoMigrations.slice(0, 10).map((name, idx) => ({ id: idx + 1, name }));
      dbEntries[5] = { id: 6, name: '0006_custom_rogue_patch.sql' };

      const res = verifyMigrationsList(dbEntries, repoMigrations);
      expect(res.isValid).toBe(false);
      expect(res.problems.some((p) => p.includes('unknown migration "0006_custom_rogue_patch.sql" recorded at position 6'))).toBe(true);
    });

    it('fails when a migration is skipped (sequence gap in names)', () => {
      // 0001, 0002, 0004 (skipped 0003)
      const dbEntries = [
        { id: 1, name: '0001_users_and_audit.sql' },
        { id: 2, name: '0002_approval_matrix.sql' },
        { id: 3, name: '0004_dars.sql' }
      ];

      const res = verifyMigrationsList(dbEntries, repoMigrations);
      expect(res.isValid).toBe(false);
      expect(res.problems.some((p) => p.includes('migration sequence mismatch at position 3: expected "0003_documents.sql", found "0004_dars.sql"'))).toBe(true);
    });

    it('fails when migration order is swapped / out of order', () => {
      // 0002 before 0001
      const dbEntries = [
        { id: 1, name: '0002_approval_matrix.sql' },
        { id: 2, name: '0001_users_and_audit.sql' }
      ];

      const res = verifyMigrationsList(dbEntries, repoMigrations);
      expect(res.isValid).toBe(false);
      expect(res.problems.some((p) => p.includes('migration sequence mismatch at position 1'))).toBe(true);
      expect(res.problems.some((p) => p.includes('migration sequence mismatch at position 2'))).toBe(true);
    });

    it('fails when migration id has gaps or does not start at 1', () => {
      const dbEntries = [
        { id: 2, name: '0001_users_and_audit.sql' },
        { id: 3, name: '0002_approval_matrix.sql' }
      ];

      const res = verifyMigrationsList(dbEntries, repoMigrations);
      expect(res.isValid).toBe(false);
      expect(res.problems.some((p) => p.includes('migration id mismatch at position 1: expected id 1, found id 2'))).toBe(true);
    });

    it('fails when an invalid or non-object entry is in the records', () => {
      const dbEntries = [
        { id: 1, name: '0001_users_and_audit.sql' },
        null,
        { id: 3, name: '0003_documents.sql' }
      ];

      const res = verifyMigrationsList(dbEntries, repoMigrations);
      expect(res.isValid).toBe(false);
      expect(res.problems.some((p) => p.includes('invalid migration record at position 2'))).toBe(true);
    });
  });

  describe('Backup configuration constants integrity', () => {
    it('preserves all required counted tables for row count bracketing', () => {
      expect(COUNTED).toEqual(['users', 'audit_log', 'documents', 'dars']);
    });

    it('preserves all required audit triggers', () => {
      expect(REQUIRED_TRIGGERS).toEqual(['audit_log_no_delete', 'audit_log_no_update']);
    });
  });

  describe('runVerify End-to-End Dump Verification', () => {
    const buildSqlDump = ({ migrationCount = 26, customMigration = null, missingTrigger = false, brokenFk = false } = {}) => {
      const migrationInserts = [];
      for (let i = 0; i < migrationCount; i++) {
        const name = (i === 5 && customMigration) ? customMigration : repoMigrations[i];
        migrationInserts.push(`INSERT INTO d1_migrations (id, name, applied_at) VALUES (${i + 1}, '${name}', '2026-10-21 00:00:00');`);
      }

      return `
        PRAGMA foreign_keys = OFF;
        CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, applied_at TIMESTAMP);
        ${migrationInserts.join('\n')}

        CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT);
        INSERT INTO users (id, name) VALUES ('u1', 'Alice');

        CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT);
        INSERT INTO audit_log (action) VALUES ('LOGIN');

        ${missingTrigger ? '' : `
          CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log BEGIN
            SELECT RAISE(FAIL, 'cannot delete audit');
          END;
          CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log BEGIN
            SELECT RAISE(FAIL, 'cannot update audit');
          END;
        `}

        CREATE TABLE documents (id TEXT PRIMARY KEY, title TEXT);
        INSERT INTO documents (id, title) VALUES ('doc1', 'Quality Manual');

        CREATE TABLE dars (id TEXT PRIMARY KEY, doc_id TEXT REFERENCES documents(id));
        ${brokenFk ? `INSERT INTO dars (id, doc_id) VALUES ('dar1', 'nonexistent_doc');` : `INSERT INTO dars (id, doc_id) VALUES ('dar1', 'doc1');`}
      `;
    };

    it('proves runVerify succeeds on valid 26-migration prefix dump', () => {
      const dumpPath = join(tmpdir(), `test-dump-valid-prefix-${Date.now()}.sql`);
      writeFileSync(dumpPath, buildSqlDump({ migrationCount: 26 }));

      try {
        const res = runVerify(dumpPath, {
          migrationsDir: join(__dirname, '../migrations'),
          min: { users: 1, audit_log: 1, documents: 1, dars: 1 },
          max: { users: 5, audit_log: 5, documents: 5, dars: 5 }
        });

        expect(res.counts.users).toBe(1);
        expect(res.migrationCheck.isValid).toBe(true);
        expect(res.migrationCheck.isPrefix).toBe(true);
        expect(res.migrationCheck.appliedCount).toBe(26);
      } finally {
        unlinkSync(dumpPath);
      }
    });

    it('proves runVerify fails when a dump has an unknown migration', () => {
      const dumpPath = join(tmpdir(), `test-dump-unknown-${Date.now()}.sql`);
      writeFileSync(dumpPath, buildSqlDump({ migrationCount: 10, customMigration: '0006_hacked_table.sql' }));

      try {
        expect(() => {
          runVerify(dumpPath, {
            migrationsDir: join(__dirname, '../migrations')
          });
        }).toThrow(/unknown migration "0006_hacked_table.sql"/);
      } finally {
        unlinkSync(dumpPath);
      }
    });

    it('proves runVerify fails when a dump is missing required audit triggers', () => {
      const dumpPath = join(tmpdir(), `test-dump-notrigger-${Date.now()}.sql`);
      writeFileSync(dumpPath, buildSqlDump({ migrationCount: 26, missingTrigger: true }));

      try {
        expect(() => {
          runVerify(dumpPath, {
            migrationsDir: join(__dirname, '../migrations')
          });
        }).toThrow(/missing audit-log triggers: audit_log_no_delete, audit_log_no_update/);
      } finally {
        unlinkSync(dumpPath);
      }
    });

    it('proves runVerify fails when a dump has broken foreign keys', () => {
      const dumpPath = join(tmpdir(), `test-dump-brokenfk-${Date.now()}.sql`);
      writeFileSync(dumpPath, buildSqlDump({ migrationCount: 26, brokenFk: true }));

      try {
        expect(() => {
          runVerify(dumpPath, {
            migrationsDir: join(__dirname, '../migrations')
          });
        }).toThrow(/Command failed|broken foreign key/);
      } finally {
        unlinkSync(dumpPath);
      }
    });

    it('proves runVerify fails when row counts are outside expected min/max boundaries', () => {
      const dumpPath = join(tmpdir(), `test-dump-badcounts-${Date.now()}.sql`);
      writeFileSync(dumpPath, buildSqlDump({ migrationCount: 26 }));

      try {
        expect(() => {
          runVerify(dumpPath, {
            migrationsDir: join(__dirname, '../migrations'),
            min: { users: 10 } // Dump only has 1 user
          });
        }).toThrow(/users: 1 rows, expected 10\.\.any/);
      } finally {
        unlinkSync(dumpPath);
      }
    });
  });
});
