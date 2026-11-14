// LOCAL TRYOUT ONLY. Runs the whole new system on this machine, as it will run on Azure, with nothing to install:
//   - the web app and the API from one address (http://localhost:8787),
//   - PostgreSQL (in-process PGlite, kept in .wrangler/local-stack/pg),
//   - the files in a folder (.wrangler/local-stack/files).
// The first start copies the data of your local dev database (the one `pnpm dev` uses, with the seeded 1234 accounts)
// into PostgreSQL with the same tool that will move the real data, and builds the web app for this address.
// Your dev database and the web build used by `pnpm dev` are not touched.
//
//   pnpm --dir apps/api run local:stack            start (builds and copies on the first run)
//   pnpm --dir apps/api run local:stack -- --reset copy the dev data again, discarding what was done in the tryout
//   pnpm --dir apps/api run local:stack -- --port 9000
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { moveDatabase } from '../src/db/pg/dataMove.js';
import { openSqliteSource } from '../src/db/pg/sqliteSource.js';
import { createPgDatabase } from '../src/db/pgAdapter.js';
import { createDiskStore } from '../src/node/diskStore.js';
import { createNodeServer } from '../src/node/server.js';

const args = process.argv.slice(2);
const reset = args.includes('--reset');
const port = Number(args.includes('--port') ? args[args.indexOf('--port') + 1] : 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('--port must be a port number, e.g. --port 9000');
  process.exit(2);
}

const ROOT = resolve('.wrangler/local-stack');
const PG_DIR = resolve(ROOT, 'pg');
const FILES_DIR = resolve(ROOT, 'files');
const WEB_DIR = resolve(ROOT, 'web');
const WEB_MARKER = resolve(ROOT, 'web-built-for.txt');
const address = `http://localhost:${port}`;
mkdirSync(ROOT, { recursive: true });

const open = (dir) => PGlite.create(dir, { extensions: { citext } });

// 1. The web app, built to talk to this address.
const builtFor = existsSync(WEB_MARKER) ? readFileSync(WEB_MARKER, 'utf8') : '';
if (!existsSync(resolve(WEB_DIR, 'index.html')) || builtFor !== address) {
  console.log(`Building the web app for ${address} (takes a minute)...`);
  execSync(`pnpm --dir ../web exec vite build --outDir "${WEB_DIR}" --emptyOutDir`, { stdio: 'inherit', env: { ...process.env, VITE_API_URL: address } });
  writeFileSync(WEB_MARKER, address);
}

// 2. PostgreSQL, filled once from the local dev database.
if (reset) rmSync(PG_DIR, { recursive: true, force: true });
if (!existsSync(PG_DIR)) {
  console.log('Copying the local dev database into PostgreSQL...');
  const dump = resolve(ROOT, 'dev-d1.sql');
  try {
    execSync(`npx wrangler d1 export DB --local --output "${dump}"`, { stdio: 'ignore', env: { ...process.env, CI: 'true' } });
  } catch {
    console.error('Could not read the local dev database. Run the local seed once first: pnpm --dir apps/api run db:seed:local');
    process.exit(1);
  }
  const building = `${PG_DIR}.building`;
  rmSync(building, { recursive: true, force: true });
  const source = openSqliteSource(dump);
  const lite = await open(building);
  try {
    const moved = await moveDatabase({ source, target: { exec: (sql) => lite.exec(sql), query: (sql, params) => lite.query(sql, params) } });
    console.log(`Copied ${moved.tables.length} tables, ${moved.rows} rows; row counts and fingerprints match.`);
  } catch (err) {
    console.error(`Could not build the PostgreSQL copy: ${err.message}`);
    await lite.close();
    rmSync(building, { recursive: true, force: true });
    process.exit(1);
  } finally {
    source.close();
  }
  await lite.close();
  rmSync(dump, { force: true });
  renameSync(building, PG_DIR); // a half-built copy is never left under the real name
}

// 3. Start.
const lite = await open(PG_DIR);
const NUMERIC_OID = 1700; // SUM()/AVG() come back as text from PGlite; SQLite gave numbers
const run = (runner) => ({ query: (sql, params) => runner.query(sql, params, { parsers: { [NUMERIC_OID]: (v) => Number(v) } }) });
const driver = { ...run(lite), transaction: (fn) => lite.transaction((tx) => fn(run(tx))) };

const devVars = existsSync('.dev.vars') ? readFileSync('.dev.vars', 'utf8') : '';
const env = {
  DB: createPgDatabase(driver),
  FILES: createDiskStore(FILES_DIR),
  JWT_SECRET: /JWT_SECRET\s*=\s*"?([^"\r\n]+)"?/.exec(devVars)?.[1] || 'local-tryout-only-secret-not-for-any-real-use-0000',
  ALLOWED_ORIGIN: address,
  CLIENT_IP_HEADER: ''
};
const server = await createNodeServer({ env, port, hostname: '127.0.0.1', webDistDir: WEB_DIR, onError: (err) => console.error('daily job failed:', err?.message ?? err) });

const login = (await driver.query("SELECT email FROM users WHERE status = 'ACTIVE' AND is_dcc = 1 ORDER BY id LIMIT 1")).rows[0];
console.log(`\nReady: open ${address} in the browser.`);
if (login) console.log(`Sign in with ${login.email} and the password 1234 (the seeded dev accounts).`);
console.log('This is a local tryout copy: what you do here stays in .wrangler/local-stack and never reaches Cloudflare or Azure.');
console.log('Press Ctrl+C to stop. Start again with the same command and your tryout data is still there.');

let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  await server.stop();
  await lite.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
