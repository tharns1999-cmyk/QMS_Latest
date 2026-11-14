// Stands in for wrangler's getPlatformProxy when the suite runs against PostgreSQL (vitest.pg.config.js aliases
// 'wrangler' to this file), so the test files themselves stay the same for both databases.
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { createPgDatabase } from '../db/pgAdapter.js';
import { triggerDdl } from '../db/pg/fromSqlite.js';

export const PG_TEST_DIR = '.wrangler/test-pg/data';
// Untouched copy of the freshly built database, made by scripts/test-migrate-pg.js.
export const PG_PRISTINE_DIR = '.wrangler/test-pg/pristine';
const SHARED_D1_PATH = '.wrangler/test/v3';
export const openPglite = (dir = PG_TEST_DIR) => PGlite.create(dir, { extensions: { citext } });

const bytesOf = async (value) => {
  if (typeof value === 'string') return new TextEncoder().encode(value);
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return new Uint8Array(await new Response(value).arrayBuffer());
};

// The part of the R2 bucket API the handlers use, kept in memory.
export const createMemoryBucket = () => {
  const objects = new Map();
  const describe = (key, o) => ({
    key,
    size: o.bytes.byteLength,
    uploaded: o.uploaded,
    // R2 sends the entity tag in quotes; any value that changes with the content will do for a cache validator.
    httpEtag: `"${o.version}"`,
    httpMetadata: o.httpMetadata,
    customMetadata: o.customMetadata,
    writeHttpMetadata: (headers) => {
      if (o.httpMetadata.contentType) headers.set('content-type', o.httpMetadata.contentType);
    }
  });
  return {
    put: async (key, value, options = {}) => {
      const o = { bytes: await bytesOf(value), version: crypto.randomUUID().replaceAll('-', ''), uploaded: new Date(), httpMetadata: options.httpMetadata || {}, customMetadata: options.customMetadata || {} };
      objects.set(key, o);
      return describe(key, o);
    },
    head: async (key) => (objects.has(key) ? describe(key, objects.get(key)) : null),
    get: async (key) => {
      const o = objects.get(key);
      if (!o) return null;
      const copy = () => o.bytes.slice();
      return {
        ...describe(key, o),
        body: new Response(copy()).body,
        arrayBuffer: async () => copy().buffer,
        text: async () => new TextDecoder().decode(o.bytes),
        json: async () => JSON.parse(new TextDecoder().decode(o.bytes))
      };
    },
    list: async ({ prefix = '' } = {}) => ({
      objects: [...objects].filter(([key]) => key.startsWith(prefix)).map(([key, o]) => describe(key, o)),
      truncated: false
    }),
    delete: async (keys) => {
      for (const key of [].concat(keys)) objects.delete(key);
    }
  };
};

// Some fixtures drop the protective triggers to plant bad data and then put them back, in SQLite's syntax.
const DO = '$do$';
const Q = '$q$';
const fixtureDdl = (sql) => {
  const drop = /^\s*DROP TRIGGER IF EXISTS\s+(\w+)\s*;?\s*$/i.exec(sql);
  if (drop) {
    return `DO ${DO} DECLARE r record; BEGIN
      FOR r IN SELECT tgrelid::regclass AS t FROM pg_trigger WHERE tgname = '${drop[1]}' AND NOT tgisinternal LOOP
        EXECUTE format('DROP TRIGGER ${drop[1]} ON %s', r.t);
      END LOOP;
    END ${DO}`;
  }
  const create = /^\s*CREATE TRIGGER\s+(?:IF NOT EXISTS\s+)?(\w+)/i.exec(sql);
  if (create) {
    const ddl = triggerDdl(sql.replace(/IF NOT EXISTS\s+/i, '')).replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION');
    const split = ddl.indexOf('CREATE TRIGGER');
    return `DO ${DO} BEGIN
      EXECUTE ${Q}${ddl.slice(0, split)}${Q};
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = '${create[1]}' AND NOT tgisinternal) THEN EXECUTE ${Q}${ddl.slice(split)}${Q}; END IF;
    END ${DO}`;
  }
  return sql;
};

// The plain variables wrangler would hand the Worker: "vars" of the default environment, then .dev.vars.
const configuredVars = () => {
  const vars = JSON.parse(/"vars":\s*(\{[^}]*\})/.exec(readFileSync('wrangler.jsonc', 'utf8'))[1]);
  if (existsSync('.dev.vars')) {
    for (const line of readFileSync('.dev.vars', 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_]\w*)\s*=\s*"?(.*?)"?\s*$/.exec(line);
      if (m) vars[m[1]] = m[2];
    }
  }
  return vars;
};

// A real database is a network hop away, so requests that run at the same time take turns between statements.
// In-process PGlite answers without ever yielding, which would let one request finish before the other starts and
// leave the concurrency tests exercising nothing.
const hop = () => new Promise((resolve) => setTimeout(resolve, 0));
// SUM()/AVG() come back as NUMERIC, which PGlite hands over as text; SQLite returns a number, so read them as numbers.
const NUMERIC_OID = 1700;
const overNetwork = (runner) => ({
  query: async (sql, params) => {
    await hop();
    return runner.query(sql, params, { parsers: { [NUMERIC_OID]: (v) => Number(v) } });
  }
});

// A test that asks wrangler for its own database folder gets its own freshly migrated PostgreSQL as well.
const dataDirFor = (persistPath) => {
  if (!persistPath || resolve(persistPath) === resolve(SHARED_D1_PATH)) return PG_TEST_DIR;
  const dir = `.wrangler/test-pg/own-${basename(dirname(resolve(persistPath)))}`;
  rmSync(dir, { recursive: true, force: true });
  cpSync(PG_PRISTINE_DIR, dir, { recursive: true });
  return dir;
};

export const getPlatformProxy = async ({ persist } = {}) => {
  const pg = await openPglite(dataDirFor(persist?.path));
  const driver = { ...overNetwork(pg), transaction: (fn) => pg.transaction((tx) => fn(overNetwork(tx))) };
  return { env: { ...configuredVars(), DB: createPgDatabase(driver, { rewrite: fixtureDdl }), FILES: createMemoryBucket() }, dispose: () => pg.close() };
};
