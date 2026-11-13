// Stands in for wrangler's getPlatformProxy when the suite runs against PostgreSQL (vitest.pg.config.js aliases
// 'wrangler' to this file), so the test files themselves stay the same for both databases.
import { existsSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { createPgDatabase } from '../db/pgAdapter.js';

export const PG_TEST_DIR = '.wrangler/test-pg/data';
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
    httpMetadata: o.httpMetadata,
    customMetadata: o.customMetadata,
    writeHttpMetadata: (headers) => {
      if (o.httpMetadata.contentType) headers.set('content-type', o.httpMetadata.contentType);
    }
  });
  return {
    put: async (key, value, options = {}) => {
      const o = { bytes: await bytesOf(value), uploaded: new Date(), httpMetadata: options.httpMetadata || {}, customMetadata: options.customMetadata || {} };
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

export const getPlatformProxy = async () => {
  const pg = await openPglite();
  return { env: { ...configuredVars(), DB: createPgDatabase(pg), FILES: createMemoryBucket() }, dispose: () => pg.close() };
};
