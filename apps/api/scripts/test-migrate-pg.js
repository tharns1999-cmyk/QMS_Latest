import { execSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tableDdl, indexDdl, triggerDdl } from '../src/db/pg/fromSqlite.js';
import { openPglite, PG_PRISTINE_DIR, PG_TEST_DIR } from '../src/test/pgPlatformProxy.js';

// Loaded by path: vitest.pg.config.js aliases the bare name 'wrangler' to the PostgreSQL stand-in.
const { getPlatformProxy } = createRequire(import.meta.url)('wrangler');
const SOURCE = '.wrangler/test-pg/src';

// Fresh PostgreSQL for every test run, derived from a freshly migrated local D1: same tables, indexes, triggers and
// the rows the migrations seed.
export default async function setup() {
  rmSync('.wrangler/test-pg', { recursive: true, force: true });
  execSync(`npx wrangler d1 migrations apply DB --local --persist-to ${SOURCE}`, { stdio: 'ignore', env: { ...process.env, CI: 'true' } });
  // Same starting point as scripts/test-migrate.js.
  execSync(`npx wrangler d1 execute DB --local --persist-to ${SOURCE} --command "UPDATE settings SET value = '0' WHERE key IN ('two_factor_min_level', 'two_factor_for_dcc')"`, { stdio: 'ignore' });

  const proxy = await getPlatformProxy({ persist: { path: `${SOURCE}/v3` } });
  const pg = await openPglite(PG_TEST_DIR);
  try {
    const sqlite = proxy.env.DB;
    const { results: objects } = await sqlite
      .prepare("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations' ORDER BY rowid")
      .all();
    const of = (type) => objects.filter((o) => o.type === type);

    await pg.exec(readFileSync(new URL('../src/db/pg/compat.sql', import.meta.url), 'utf8'));

    // A table may reference one created later, so keep going round until none is left.
    let pending = of('table');
    while (pending.length) {
      const failed = [];
      let lastError;
      for (const table of pending) {
        try { await pg.exec(tableDdl(table.sql)); } catch (err) { failed.push(table); lastError = `${table.name}: ${err.message}`; }
      }
      if (failed.length === pending.length) throw new Error(`Cannot create PostgreSQL tables. ${lastError}`);
      pending = failed;
    }

    // Rows first, with foreign keys and triggers out of the way, exactly as stored.
    await pg.exec("SET session_replication_role = 'replica'");
    for (const table of of('table')) {
      const { results: rows } = await sqlite.prepare(`SELECT * FROM "${table.name}"`).all();
      for (const row of rows) {
        const columns = Object.keys(row);
        await pg.query(`INSERT INTO "${table.name}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`, Object.values(row));
      }
      const identity = await pg.query("SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND is_identity = 'YES'", [table.name]);
      for (const { column_name: column } of identity.rows) {
        await pg.exec(`SELECT setval(pg_get_serial_sequence('"${table.name}"', '${column}'), COALESCE((SELECT MAX("${column}") FROM "${table.name}"), 0) + 1, false)`);
      }
    }
    await pg.exec("SET session_replication_role = 'origin'");

    for (const index of of('index')) await pg.exec(indexDdl(index.sql));
    for (const trigger of of('trigger')) await pg.exec(triggerDdl(trigger.sql));
  } finally {
    await pg.close();
    await proxy.dispose();
  }
  cpSync(PG_TEST_DIR, PG_PRISTINE_DIR, { recursive: true });
}
