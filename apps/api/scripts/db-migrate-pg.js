// Applies the pending PostgreSQL migrations (migrations-pg/) to the database in DATABASE_URL, or shows the state.
//   DATABASE_URL=postgres://user:password@host:5432/qms?sslmode=require node scripts/db-migrate-pg.js [--status]
// Run it as the deployment step before starting a new version of the API. See migrations-pg/README.md.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { applyPending, loadMigrations, migrationStatus } from '../src/db/pg/migrator.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL=postgres://... first.');
  process.exit(2);
}
const statusOnly = process.argv.includes('--status');
const client = new pg.Client({ connectionString: url });
try {
  const migrations = loadMigrations(fileURLToPath(new URL('../migrations-pg/', import.meta.url)));
  await client.connect();
  const rows = async (sql) => (await client.query(sql)).rows;
  if (statusOnly) {
    const s = await migrationStatus(rows, migrations);
    if (s.tableMissing) throw new Error('schema_migrations does not exist: this database was not created by the data move.');
    const baseline = s.applied.filter((a) => a.kind === 'baseline').length;
    console.log(`Baseline (moved from D1): ${baseline} migrations`);
    console.log(`Applied here: ${s.applied.filter((a) => a.kind === 'migration').map((a) => a.name).join(', ') || 'none'}`);
    console.log(`Pending: ${s.pending.join(', ') || 'none'}`);
    for (const [label, list] of [['EDITED after being applied', s.edited], ['Applied but unknown to this code', s.unknown], ['Numbered below an applied one', s.outOfOrder]]) {
      if (list.length) console.log(`${label}: ${list.join(', ')}`);
    }
    process.exitCode = s.edited.length || s.unknown.length || s.outOfOrder.length ? 1 : 0;
  } else {
    const compatSql = readFileSync(new URL('../src/db/pg/compat.sql', import.meta.url), 'utf8');
    const result = await applyPending({ target: { exec: (sql) => client.query(sql), query: (sql, params) => client.query(sql, params) }, migrations, compatSql, log: (line) => console.log(line) });
    console.log(result.applied.length || result.compatUpdated ? `Done: ${result.applied.length} migration(s) applied.` : 'Nothing to do: the database is up to date.');
  }
} catch (err) {
  console.error(`NOT APPLIED. ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
