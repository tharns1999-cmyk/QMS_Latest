// Backup helpers for .github/workflows/nightly-backup.yml and docs/ops/backup-restore.md. Run from apps/api.
//   node scripts/backup-tools.js counts [--remote]                      row counts of the live database, as JSON
//   node scripts/backup-tools.js verify <dump.sql> [--min a.json] [--max b.json]
//     restores the dump into a throwaway local D1 and proves it is usable: no broken foreign keys, continuous
//     valid prefix of migrations recorded, audit-log triggers present, and (with --min/--max, counts taken before
//     and after the export) no table smaller or larger than the live database could have been during the export.
import { execSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Tables that only ever grow, so their size brackets what an export taken in between must contain.
export const COUNTED = ['users', 'audit_log', 'documents', 'dars'];
export const COUNTS_SQL = `SELECT ${COUNTED.map((t) => `(SELECT COUNT(*) FROM ${t}) AS ${t}`).join(', ')};`;
export const REQUIRED_TRIGGERS = ['audit_log_no_delete', 'audit_log_no_update'];

export const d1 = (args, file) => {
  const out = execSync(`npx wrangler d1 execute DB ${args} --json ${file}`, {
    encoding: 'utf8',
    env: { ...process.env, CI: 'true' },
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 1 << 28
  });
  return JSON.parse(out.slice(out.indexOf('['), out.lastIndexOf(']') + 1));
};

export const withSqlFile = (dir, sql) => {
  const file = join(dir, 'query.sql');
  writeFileSync(file, sql);
  return `--file "${file}"`;
};

/**
 * Validates the migration list recorded in d1_migrations against available repository migrations.
 * Verifies exact sequential continuity, correct IDs, valid naming, and absence of unknown migrations.
 * Accepts a valid prefix (e.g. 26 deployed migrations while repo has 39 pending deployments).
 */
export function verifyMigrationsList(recordedMigrations, availableMigrationFiles) {
  const problems = [];
  const expectedList = [...availableMigrationFiles].filter((f) => f.endsWith('.sql')).sort();

  if (!Array.isArray(recordedMigrations) || recordedMigrations.length === 0) {
    problems.push('no migrations recorded in d1_migrations table');
    return {
      isValid: false,
      problems,
      appliedCount: 0,
      totalAvailable: expectedList.length,
      isComplete: false,
      isPrefix: false,
      summary: '0 migrations recorded'
    };
  }

  const appliedCount = recordedMigrations.length;
  if (appliedCount > expectedList.length) {
    problems.push(`database has ${appliedCount} migrations recorded, but repository only has ${expectedList.length} migrations`);
  }

  for (let i = 0; i < appliedCount; i++) {
    const entry = recordedMigrations[i];
    const expectedId = i + 1;
    const expectedName = expectedList[i];

    if (!entry || typeof entry !== 'object') {
      problems.push(`invalid migration record at position ${i + 1}`);
      continue;
    }

    if (entry.id !== expectedId) {
      problems.push(`migration id mismatch at position ${i + 1}: expected id ${expectedId}, found id ${entry.id} (${entry.name || 'unnamed'})`);
    }

    if (!expectedName) {
      problems.push(`unknown migration "${entry.name}" at position ${expectedId} exceeds repository migrations`);
      continue;
    }

    if (entry.name !== expectedName) {
      if (!expectedList.includes(entry.name)) {
        problems.push(`unknown migration "${entry.name}" recorded at position ${expectedId}`);
      } else {
        problems.push(`migration sequence mismatch at position ${expectedId}: expected "${expectedName}", found "${entry.name}"`);
      }
    }
  }

  const isPrefix = problems.length === 0 && appliedCount <= expectedList.length;
  const isComplete = problems.length === 0 && appliedCount === expectedList.length;
  const pendingCount = Math.max(0, expectedList.length - appliedCount);
  const pendingMigrations = pendingCount > 0 ? expectedList.slice(appliedCount) : [];

  let warning = null;
  if (isPrefix && !isComplete) {
    warning = `database is at migration prefix ${appliedCount}/${expectedList.length}; ${pendingCount} pending migration(s) in repository (${pendingMigrations[0]} to ${pendingMigrations[pendingMigrations.length - 1]})`;
  }

  let summary = '';
  if (isComplete) {
    summary = `${appliedCount}/${expectedList.length} (complete: 0001 to ${expectedList[appliedCount - 1]})`;
  } else if (isPrefix) {
    summary = `${appliedCount}/${expectedList.length} (valid prefix: 0001 to ${expectedList[appliedCount - 1]})`;
  } else {
    summary = `invalid (${problems.length} issue${problems.length > 1 ? 's' : ''})`;
  }

  return {
    isValid: problems.length === 0,
    problems,
    appliedCount,
    totalAvailable: expectedList.length,
    pendingCount,
    pendingMigrations,
    isComplete,
    isPrefix,
    warning,
    summary
  };
}

export function runVerify(dumpFile, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'qms-backup-'));
  try {
    d1(`--local --persist-to "${dir}"`, `--file "${dumpFile}"`);
    const [counts, triggers, migrations, brokenKeys] = d1(
      `--local --persist-to "${dir}"`,
      withSqlFile(
        dir,
        `${COUNTS_SQL}\nSELECT name FROM sqlite_master WHERE type = 'trigger';\nSELECT id, name FROM d1_migrations ORDER BY id ASC;\nPRAGMA foreign_key_check;`
      )
    ).map((r) => r.results);

    const problems = [];
    // D1 does not allow PRAGMA integrity_check; a dump that restores cleanly plus foreign key check is what it offers.
    if (brokenKeys.length) problems.push(`${brokenKeys.length} rows with a broken foreign key`);
    const missing = REQUIRED_TRIGGERS.filter((name) => !triggers.some((t) => t.name === name));
    if (missing.length) problems.push(`missing audit-log triggers: ${missing.join(', ')}`);

    const availableFiles = readdirSync(options.migrationsDir || 'migrations').filter((f) => f.endsWith('.sql'));
    const migrationCheck = verifyMigrationsList(migrations, availableFiles);
    if (!migrationCheck.isValid) {
      problems.push(...migrationCheck.problems);
    } else if (options.strictMigrations && !migrationCheck.isComplete) {
      problems.push(`strict migration check failed: database is at ${migrationCheck.appliedCount}/${migrationCheck.totalAvailable} (${migrationCheck.pendingCount} pending migrations)`);
    }

    if (migrationCheck.warning) {
      if (process.env.CI) {
        console.log(`::warning::${migrationCheck.warning}`);
      }
      console.warn(`[WARN] ${migrationCheck.warning}`);
    }

    const min = options.min;
    const max = options.max;
    for (const table of COUNTED) {
      if ((min && counts[0][table] < min[table]) || (max && counts[0][table] > max[table])) {
        problems.push(`${table}: ${counts[0][table]} rows, expected ${min?.[table] ?? 0}..${max?.[table] ?? 'any'}`);
      }
    }

    console.log(
      `Restored: ${COUNTED.map((t) => `${t}=${counts[0][t]}`).join(' ')} migrations=${migrationCheck.summary} triggers=${triggers.length}`
    );
    if (problems.length) throw new Error(`Backup verification FAILED:\n- ${problems.join('\n- ')}`);
    console.log('Backup verification passed.');
    return { counts: counts[0], triggers, migrationCheck };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [command, ...args] = process.argv.slice(2);
  const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const dir = mkdtempSync(join(tmpdir(), 'qms-backup-'));

  try {
    if (command === 'counts') {
      const [{ results: [counts] }] = args.includes('--remote')
        ? d1('--remote', `--command "${COUNTS_SQL}"`)
        : d1('--local', withSqlFile(dir, COUNTS_SQL));
      if (counts?.users === undefined) throw new Error('The database returned no row counts');
      console.log(JSON.stringify(counts));
    } else if (command === 'verify' && args[0]) {
      const min = option('--min') && JSON.parse(readFileSync(option('--min'), 'utf8'));
      const max = option('--max') && JSON.parse(readFileSync(option('--max'), 'utf8'));
      const strictMigrations = args.includes('--strict-migrations');
      runVerify(args[0], { min, max, strictMigrations });
    } else {
      console.error('Usage: node scripts/backup-tools.js counts [--remote] | verify <dump.sql> [--min a.json] [--max b.json]');
      process.exitCode = 2;
    }
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
