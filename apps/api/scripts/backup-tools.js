// Backup helpers for .github/workflows/nightly-backup.yml and docs/ops/backup-restore.md. Run from apps/api.
//   node scripts/backup-tools.js counts [--remote]                      row counts of the live database, as JSON
//   node scripts/backup-tools.js verify <dump.sql> [--min a.json] [--max b.json]
//     restores the dump into a throwaway local D1 and proves it is usable: no broken foreign keys, every migration
//     recorded, the audit-log triggers present, and (with --min/--max, counts taken before and after the
//     export) no table smaller or larger than the live database could have been during the export.
import { execSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Tables that only ever grow, so their size brackets what an export taken in between must contain.
const COUNTED = ['users', 'audit_log', 'documents', 'dars'];
const COUNTS_SQL = `SELECT ${COUNTED.map((t) => `(SELECT COUNT(*) FROM ${t}) AS ${t}`).join(', ')};`;
const REQUIRED_TRIGGERS = ['audit_log_no_delete', 'audit_log_no_update'];

const d1 = (args, file) => {
  const out = execSync(`npx wrangler d1 execute DB ${args} --json ${file}`, { encoding: 'utf8', env: { ...process.env, CI: 'true' }, stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 28 });
  return JSON.parse(out.slice(out.indexOf('['), out.lastIndexOf(']') + 1));
};

const withSqlFile = (dir, sql) => {
  const file = join(dir, 'query.sql');
  writeFileSync(file, sql);
  return `--file "${file}"`;
};

const [command, ...args] = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const dir = mkdtempSync(join(tmpdir(), 'qms-backup-'));

try {
  if (command === 'counts') {
    // A remote --file goes through D1's import path, which returns no rows, so the remote count uses --command.
    const [{ results: [counts] }] = args.includes('--remote') ? d1('--remote', `--command "${COUNTS_SQL}"`) : d1('--local', withSqlFile(dir, COUNTS_SQL));
    if (counts?.users === undefined) throw new Error('The database returned no row counts');
    console.log(JSON.stringify(counts));
  } else if (command === 'verify' && args[0]) {
    d1(`--local --persist-to "${dir}"`, `--file "${args[0]}"`);
    const [counts, triggers, migrations, brokenKeys] = d1(`--local --persist-to "${dir}"`, withSqlFile(dir,
      `${COUNTS_SQL}\nSELECT name FROM sqlite_master WHERE type = 'trigger';\nSELECT COUNT(*) AS n FROM d1_migrations;\nPRAGMA foreign_key_check;`)).map((r) => r.results);

    const problems = [];
    // D1 does not allow PRAGMA integrity_check; a dump that restores cleanly plus this check is what it offers.
    if (brokenKeys.length) problems.push(`${brokenKeys.length} rows with a broken foreign key`);
    const missing = REQUIRED_TRIGGERS.filter((name) => !triggers.some((t) => t.name === name));
    if (missing.length) problems.push(`missing audit-log triggers: ${missing.join(', ')}`);
    const expectedMigrations = readdirSync('migrations').filter((f) => f.endsWith('.sql')).length;
    if (migrations[0].n !== expectedMigrations) problems.push(`${migrations[0].n} migrations recorded, expected ${expectedMigrations}`);
    const min = option('--min') && JSON.parse(readFileSync(option('--min'), 'utf8'));
    const max = option('--max') && JSON.parse(readFileSync(option('--max'), 'utf8'));
    for (const table of COUNTED) {
      if ((min && counts[0][table] < min[table]) || (max && counts[0][table] > max[table])) {
        problems.push(`${table}: ${counts[0][table]} rows, expected ${min?.[table] ?? 0}..${max?.[table] ?? 'any'}`);
      }
    }
    console.log(`Restored: ${COUNTED.map((t) => `${t}=${counts[0][t]}`).join(' ')} migrations=${migrations[0].n} triggers=${triggers.length}`);
    if (problems.length) throw new Error(`Backup verification FAILED:\n- ${problems.join('\n- ')}`);
    console.log('Backup verification passed.');
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
