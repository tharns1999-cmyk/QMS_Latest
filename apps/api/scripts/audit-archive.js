// Moves old audit_log rows out of D1 in two separate steps, so a person looks at the archive before anything is deleted.
// Run from apps/api. Add --remote for the live database (default is the local one; --persist-to <dir> picks a local copy).
//   node scripts/audit-archive.js export [--days 365] [--out <dir>] [--remote]
//     writes audit_log_<from>-<to>.csv, its .sha256 and a .manifest.json for every row older than --days. Deletes nothing.
//   node scripts/audit-archive.js purge <manifest.json> [--confirm] [--remote]
//     without --confirm only prints the plan. With it: checks the archive file against its checksum and row count,
//     checks the database still holds exactly those rows, checks the last Nightly backup succeeded within 36 hours,
//     writes an AUDIT_LOG_PURGED row, then deletes. Copy the archive to the backup Drive (safe:audit-archive) first.
// The database itself refuses to delete rows younger than 365 days (migration 0023), whatever --days says.
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

const MIN_DAYS = 365;
const PAGE = 2000;
const COLUMNS = ['id', 'at', 'actor_id', 'action', 'details'];

const [command, ...args] = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const target = args.includes('--remote') ? '--remote' : `--local${option('--persist-to') ? ` --persist-to "${option('--persist-to')}"` : ''}`;
const tmp = mkdtempSync(join(tmpdir(), 'qms-audit-archive-'));

// A remote --file goes through D1's import path and returns no rows, so reads use --command (single quotes only in the SQL).
const read = (sql) => {
  const out = execSync(`npx wrangler d1 execute DB ${target} --json --command "${sql}"`, { encoding: 'utf8', env: { ...process.env, CI: 'true' }, stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 28 });
  return JSON.parse(out.slice(out.indexOf('['), out.lastIndexOf(']') + 1))[0].results;
};
const write = (sql) => {
  const file = join(tmp, 'write.sql');
  writeFileSync(file, sql);
  execSync(`npx wrangler d1 execute DB ${target} --yes --file "${file}"`, { env: { ...process.env, CI: 'true' }, stdio: ['ignore', 'ignore', 'inherit'] });
};
const sqlText = (s) => `'${String(s).replaceAll("'", "''")}'`;

const csvCell = (v) => (v === null || v === undefined ? '' : typeof v === 'number' ? String(v) : `"${String(v).replaceAll('"', '""')}"`);
const toCsv = (rows) => `${COLUMNS.join(',')}\n${rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(',')).join('\n')}${rows.length ? '\n' : ''}`;
// Counts records, not lines: a quoted details field may contain newlines.
const countCsvRecords = (text) => {
  let records = 0;
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') quoted = !quoted;
    else if (text[i] === '\n' && !quoted) records++;
  }
  return records - 1; // header
};
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

try {
  if (command === 'export') {
    const days = Number(option('--days') ?? MIN_DAYS);
    if (!Number.isInteger(days) || days < MIN_DAYS) throw new Error(`--days must be a whole number of at least ${MIN_DAYS}`);
    const before = new Date(Date.now() - days * 864e5).toISOString();
    const rows = [];
    for (let after = 0; ;) {
      const page = read(`SELECT ${COLUMNS.join(', ')} FROM audit_log WHERE at < ${sqlText(before)} AND id > ${after} ORDER BY id LIMIT ${PAGE}`);
      rows.push(...page);
      if (page.length < PAGE) break;
      after = page.at(-1).id;
    }
    if (!rows.length) { console.log(`No audit_log rows older than ${days} days (before ${before}). Nothing to archive.`); }
    else {
      const out = option('--out') ?? 'audit-archive';
      mkdirSync(out, { recursive: true });
      const name = `audit_log_${rows[0].id}-${rows.at(-1).id}`;
      const csv = Buffer.from(toCsv(rows));
      const manifest = { before, count: rows.length, minId: rows[0].id, maxId: rows.at(-1).id, csv: `${name}.csv`, sha256: sha256(csv), exportedAt: new Date().toISOString() };
      writeFileSync(join(out, `${name}.csv`), csv);
      writeFileSync(join(out, `${name}.sha256`), `${manifest.sha256}  ${name}.csv\n`);
      writeFileSync(join(out, `${name}.manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`);
      console.log(`Exported ${manifest.count} rows (ids ${manifest.minId}-${manifest.maxId}, older than ${before}) to ${join(out, name)}.csv`);
      console.log(`Next: copy ${out} to the backup Drive, then: node scripts/audit-archive.js purge ${join(out, `${name}.manifest.json`)} ${args.includes('--remote') ? '--remote ' : ''}--confirm`);
    }
  } else if (command === 'purge' && args[0] && !args[0].startsWith('--')) {
    const manifest = JSON.parse(readFileSync(args[0], 'utf8'));
    const csvPath = join(dirname(args[0]), basename(manifest.csv));
    if (!existsSync(csvPath)) throw new Error(`Archive file not found next to the manifest: ${csvPath}`);
    const csv = readFileSync(csvPath);
    if (sha256(csv) !== manifest.sha256) throw new Error('Archive checksum does not match the manifest. Nothing deleted.');
    if (countCsvRecords(csv.toString('utf8')) !== manifest.count) throw new Error('Archive row count does not match the manifest. Nothing deleted.');
    if (Date.parse(manifest.before) > Date.now() - MIN_DAYS * 864e5) throw new Error(`Archive cutoff is younger than ${MIN_DAYS} days. Nothing deleted.`);

    const where = `at < ${sqlText(manifest.before)} AND id <= ${Number(manifest.maxId)}`;
    const [{ n, lo, hi }] = read(`SELECT COUNT(*) AS n, MIN(id) AS lo, MAX(id) AS hi FROM audit_log WHERE ${where}`);
    if (n !== manifest.count || lo !== manifest.minId || hi !== manifest.maxId) {
      throw new Error(`The database holds ${n} such rows (ids ${lo}-${hi}) but the archive has ${manifest.count} (ids ${manifest.minId}-${manifest.maxId}). Export again. Nothing deleted.`);
    }
    console.log(`Plan: delete ${n} audit_log rows (ids ${lo}-${hi}) older than ${manifest.before}; archive checksum ${manifest.sha256.slice(0, 12)}... verified.`);
    if (!args.includes('--confirm')) { console.log('Dry run. Add --confirm to delete.'); }
    else {
      const runs = JSON.parse(execSync('gh run list --workflow nightly-backup.yml --status success --limit 1 --json createdAt', { encoding: 'utf8' }));
      if (!runs.length || Date.now() - Date.parse(runs[0].createdAt) > 36 * 36e5) throw new Error('No successful Nightly backup in the last 36 hours. Fix or re-run the backup first. Nothing deleted.');
      // The marker goes in first, so a failure halfway never leaves a deletion without a record.
      write(`INSERT INTO audit_log (action, details) VALUES ('AUDIT_LOG_PURGED', ${sqlText(JSON.stringify({ count: n, min_id: lo, max_id: hi, before: manifest.before, sha256: manifest.sha256 }))});\nDELETE FROM audit_log WHERE ${where};`);
      const [{ left }] = read(`SELECT COUNT(*) AS left FROM audit_log WHERE ${where}`);
      if (left) throw new Error(`${left} rows were not deleted. Check the database.`);
      console.log(`Deleted ${n} rows and recorded AUDIT_LOG_PURGED.`);
    }
  } else {
    console.error('Usage: node scripts/audit-archive.js export [--days 365] [--out dir] [--remote]\n       node scripts/audit-archive.js purge <manifest.json> [--confirm] [--remote]');
    process.exitCode = 2;
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
