// Copies the whole QMS database from Cloudflare D1 into an EMPTY PostgreSQL database and proves the copy.
//
//   1. Export D1:       npx wrangler d1 export DB --remote --output d1-export.sql        (read-only on Cloudflare)
//      or point at a SQLite file: .wrangler/state/v3/d1/.../<id>.sqlite
//   2. Set the target:  DATABASE_URL=postgres://user:password@host:5432/qms?sslmode=require
//      (an environment variable on purpose: a password on the command line ends up in shell history)
//   3. Run:             node scripts/migrate-data-to-pg.js --source d1-export.sql --report migration-report.json
//
// The copy is all-or-nothing and nothing is written to the source. The report lists, per table, the row count and a
// fingerprint, so it can be kept as the record that the move was complete.
import { writeFileSync } from 'node:fs';
import pg from 'pg';
import { exactIntegers, moveDatabase } from '../src/db/pg/dataMove.js';
import { openSqliteSource } from '../src/db/pg/sqliteSource.js';

const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};

const sourcePath = option('--source');
const reportPath = option('--report');
const url = process.env.DATABASE_URL;
if (!sourcePath || !url) {
  console.error('Usage: DATABASE_URL=postgres://... node scripts/migrate-data-to-pg.js --source <d1-export.sql | file.sqlite> [--report report.json]');
  process.exit(2);
}

const source = openSqliteSource(sourcePath);
const client = new pg.Client({ connectionString: url, types: exactIntegers });
try {
  await client.connect();
  const result = await moveDatabase({
    source,
    target: { exec: (sql) => client.query(sql), query: (sql, params) => client.query(sql, params) },
    log: (line) => console.log(line)
  });
  console.log(`\nDone: ${result.tables.length} tables, ${result.rows} rows. Row counts and fingerprints match the source for every table.`);
  if (reportPath) {
    writeFileSync(reportPath, JSON.stringify({ movedAt: new Date().toISOString(), source: sourcePath, ...result }, null, 2));
    console.log(`Report written to ${reportPath}`);
  }
} catch (err) {
  console.error(`\nNOT MOVED. ${err.message}`);
  process.exitCode = 1;
} finally {
  source.close();
  await client.end().catch(() => {});
}
