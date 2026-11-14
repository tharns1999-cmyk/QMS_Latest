import { execSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import pg from 'pg';
import { exactIntegers, moveDatabase } from '../src/db/pg/dataMove.js';
import { applyPending, listD1Migrations, loadMigrations } from '../src/db/pg/migrator.js';
import { dbUrl, openPglite, PG_PRISTINE_DIR, PG_TEST_DIR, PRISTINE_DB, REAL_PG_URL, SHARED_DB } from '../src/test/pgPlatformProxy.js';

// Loaded by path: vitest.pg.config.js aliases the bare name 'wrangler' to the PostgreSQL stand-in.
const { getPlatformProxy } = createRequire(import.meta.url)('wrangler');
const SOURCE = '.wrangler/test-pg/src';

// The database the schema is built in: in-process PGlite, or a real server when QMS_TEST_PG_URL is set.
const connectBuilder = async () => {
  if (!REAL_PG_URL) {
    const lite = await openPglite(PG_TEST_DIR);
    return {
      exec: (sql) => lite.exec(sql),
      query: (sql, params) => lite.query(sql, params),
      finish: async () => {
        await lite.close();
        cpSync(PG_TEST_DIR, PG_PRISTINE_DIR, { recursive: true });
      }
    };
  }
  const maintenance = new pg.Client({ connectionString: dbUrl('postgres') });
  await maintenance.connect();
  for (const name of [SHARED_DB, PRISTINE_DB]) await maintenance.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await maintenance.query(`CREATE DATABASE ${PRISTINE_DB}`);
  const client = new pg.Client({ connectionString: dbUrl(PRISTINE_DB), types: exactIntegers });
  await client.connect();
  return {
    exec: (sql) => client.query(sql),
    query: (sql, params) => client.query(sql, params),
    finish: async () => {
      await client.end();
      // Every test file gets a copy: the shared one now, and a private one per file that asks for its own.
      await maintenance.query(`CREATE DATABASE ${SHARED_DB} TEMPLATE ${PRISTINE_DB}`);
      await maintenance.end();
    }
  };
};

// Fresh PostgreSQL for every test run, derived from a freshly migrated local D1: same tables, indexes, triggers and
// the rows the migrations seed.
export default async function setup() {
  rmSync('.wrangler/test-pg', { recursive: true, force: true });
  execSync(`npx wrangler d1 migrations apply DB --local --persist-to ${SOURCE}`, { stdio: 'ignore', env: { ...process.env, CI: 'true' } });
  // Same starting point as scripts/test-migrate.js.
  execSync(`npx wrangler d1 execute DB --local --persist-to ${SOURCE} --command "UPDATE settings SET value = '0' WHERE key IN ('two_factor_min_level', 'two_factor_for_dcc')"`, { stdio: 'ignore' });

  const proxy = await getPlatformProxy({ persist: { path: `${SOURCE}/v3` } });
  const target = await connectBuilder();
  try {
    // The same code that moves the real data builds the test database, so every test run exercises it, including
    // the row-count and fingerprint comparison.
    const sqlite = proxy.env.DB;
    await moveDatabase({
      source: { all: async (sql) => (await sqlite.prepare(sql).all()).results },
      target,
      expectedMigrations: listD1Migrations(fileURLToPath(new URL('../migrations/', import.meta.url)))
    });
    // The PostgreSQL migrations on top, exactly as a deployment applies them.
    await applyPending({
      target,
      migrations: loadMigrations(fileURLToPath(new URL('../migrations-pg/', import.meta.url))),
      compatSql: readFileSync(new URL('../src/db/pg/compat.sql', import.meta.url), 'utf8')
    });
  } finally {
    await proxy.dispose();
  }
  await target.finish();
}
