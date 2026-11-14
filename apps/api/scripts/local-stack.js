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
//   pnpm --dir apps/api run local:stack -- --microsoft   sign in through a pretend Microsoft page
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { moveDatabase } from '../src/db/pg/dataMove.js';
import { adoptBaseline, applyPending, listD1Migrations, loadMigrations } from '../src/db/pg/migrator.js';
import { openSqliteSource } from '../src/db/pg/sqliteSource.js';
import { createPgDatabase } from '../src/db/pgAdapter.js';
import { createDiskStore } from '../src/node/diskStore.js';
import { createNodeServer } from '../src/node/server.js';
import { startFakeMicrosoft } from './fake-microsoft.js';

const args = process.argv.slice(2);
const reset = args.includes('--reset');
// --microsoft: sign in through a pretend Microsoft page instead of passwords, to try the button the company will use.
const microsoft = args.includes('--microsoft');
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
// What the web build was made for: the address, and the tester's user switcher (see TryoutUserSwitcher.jsx).
const buildTag = `${address}|user-switcher`;
mkdirSync(ROOT, { recursive: true });

const open = (dir) => PGlite.create(dir, { extensions: { citext } });

// 1. The web app, built to talk to this address.
const builtFor = existsSync(WEB_MARKER) ? readFileSync(WEB_MARKER, 'utf8') : '';
// Rebuilt when the address changed or any web source file is newer than the last build, so the tryout never shows old screens.
const newestSource = (dir) => readdirSync(dir, { withFileTypes: true }).reduce((newest, entry) => {
  const path = resolve(dir, entry.name);
  return Math.max(newest, entry.isDirectory() ? newestSource(path) : statSync(path).mtimeMs);
}, 0);
const webChanged = existsSync(WEB_MARKER) && newestSource(resolve('../web/src')) > statSync(WEB_MARKER).mtimeMs;
if (!existsSync(resolve(WEB_DIR, 'index.html')) || builtFor !== buildTag || webChanged) {
  console.log(`Building the web app for ${address} (takes a minute)...`);
  execSync(`pnpm --dir ../web exec vite build --outDir "${WEB_DIR}" --emptyOutDir`, { stdio: 'inherit', env: { ...process.env, VITE_API_URL: address, VITE_TRYOUT_SWITCHER: '1' } });
  writeFileSync(WEB_MARKER, buildTag);
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
    const target = { exec: (sql) => lite.exec(sql), query: (sql, params) => lite.query(sql, params) };
    const moved = await moveDatabase({ source, target, expectedMigrations: listD1Migrations(fileURLToPath(new URL('../migrations/', import.meta.url))) });
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
// PostgreSQL migrations added since the copy was made (migrations-pg/), applied the way a deployment does.
try {
  const target = { exec: (sql) => lite.exec(sql), query: (sql, params) => lite.query(sql, params) };
  const compatSql = readFileSync(new URL('../src/db/pg/compat.sql', import.meta.url), 'utf8');
  // A copy made before the migration record existed was built from exactly these D1 migrations.
  if (await adoptBaseline({ target, baselineNames: listD1Migrations(fileURLToPath(new URL('../migrations/', import.meta.url))), compatSql })) console.log('Recorded the migration history of the existing tryout copy.');
  await applyPending({
    target,
    migrations: loadMigrations(fileURLToPath(new URL('../migrations-pg/', import.meta.url))),
    compatSql,
    log: (line) => console.log(line)
  });
} catch (err) {
  console.error(`The tryout database is not up to date: ${err.message}
Start it again with --reset to copy the dev data afresh.`);
  await lite.close();
  process.exit(1);
}
const NUMERIC_OID = 1700; // SUM()/AVG() come back as text from PGlite; SQLite gave numbers
const run = (runner) => ({ query: (sql, params) => runner.query(sql, params, { parsers: { [NUMERIC_OID]: (v) => Number(v) } }) });
const driver = { ...run(lite), transaction: (fn) => lite.transaction((tx) => fn(run(tx))) };

// The people the tester can switch between (tryout builds only): written fresh at every start.
const roster = (await driver.query("SELECT id, name, email, primary_department AS department, approval_level AS level, position FROM users WHERE status = 'ACTIVE' ORDER BY primary_department, approval_level, id")).rows;
writeFileSync(resolve(WEB_DIR, 'tryout-users.json'), JSON.stringify(roster));

const TENANT = '11111111-2222-4333-8444-555555555555';
const CLIENT_ID = '66666666-7777-4888-8999-aaaaaaaaaaaa';
const CLIENT_SECRET = 'local-tryout-client-secret';
let fake = null;
if (microsoft) {
  const people = (await driver.query("SELECT name, email FROM users WHERE status = 'ACTIVE' ORDER BY is_dcc DESC, name LIMIT 40")).rows;
  fake = await startFakeMicrosoft({ port: port + 1, tenant: TENANT, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, redirectUri: `${address}/api/auth/entra/callback`, people });
}

const devVars = existsSync('.dev.vars') ? readFileSync('.dev.vars', 'utf8') : '';
const env = {
  DB: createPgDatabase(driver),
  FILES: createDiskStore(FILES_DIR),
  JWT_SECRET: /JWT_SECRET\s*=\s*"?([^"\r\n]+)"?/.exec(devVars)?.[1] || 'local-tryout-only-secret-not-for-any-real-use-0000',
  ALLOWED_ORIGIN: address,
  CLIENT_IP_HEADER: '',
  ...(fake && {
    AUTH_MODE: 'entra',
    ENTRA_TENANT_ID: TENANT,
    ENTRA_CLIENT_ID: CLIENT_ID,
    ENTRA_CLIENT_SECRET: CLIENT_SECRET,
    ENTRA_REDIRECT_URI: `${address}/api/auth/entra/callback`,
    ENTRA_AUTHORITY_HOST: fake.host
  })
};
const server = await createNodeServer({ env, port, hostname: '127.0.0.1', webDistDir: WEB_DIR, onError: (err) => console.error('daily job failed:', err?.message ?? err) });

const login = (await driver.query("SELECT email FROM users WHERE status = 'ACTIVE' AND is_dcc = 1 ORDER BY id LIMIT 1")).rows[0];
console.log(`\nReady: open ${address} in the browser.`);
if (fake) console.log('Sign-in is through a PRETEND Microsoft page (local tryout): press "เข้าสู่ระบบด้วย Microsoft" and pick a person from the list.');
else if (login) console.log(`Sign in with ${login.email} and the password 1234 (the seeded dev accounts).`);
console.log('This is a local tryout copy: what you do here stays in .wrangler/local-stack and never reaches Cloudflare or Azure.');
console.log('Press Ctrl+C to stop. Start again with the same command and your tryout data is still there.');

let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  await server.stop();
  await fake?.close();
  await lite.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
