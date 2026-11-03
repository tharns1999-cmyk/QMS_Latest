import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { checkDeployConfig, parseJsonc } from '../scripts/deploy-guard.js';
import { GUARD_SQL, MARKER_SQL } from '../scripts/local-seed-guard.js';

const base = () => ({
  name: 'qms-api',
  d1_databases: [{ binding: 'DB', database_id: 'uat-id' }],
  r2_buckets: [{ binding: 'FILES', bucket_name: 'qms-files' }],
  vars: { ALLOWED_ORIGIN: 'https://uat.example.com' },
  env: { production: { name: 'qms-api', d1_databases: [{ binding: 'DB', database_id: 'prod-id' }], r2_buckets: [{ binding: 'FILES', bucket_name: 'qms-files' }], vars: { ALLOWED_ORIGIN: 'https://qms.company.com' } } }
});

describe('deploy guard', () => {
  it('passes when UAT and production are separate', () => {
    expect(checkDeployConfig(base(), 'uat').errors).toEqual([]);
    expect(checkDeployConfig(base(), 'production').errors).toEqual([]);
  });

  it('stops when production still has placeholders', () => {
    const c = base();
    c.env.production.d1_databases[0].database_id = 'REPLACE_WITH_COMPANY_D1_ID';
    c.env.production.vars.ALLOWED_ORIGIN = 'REPLACE_WITH_COMPANY_WEB_ORIGIN';
    expect(checkDeployConfig(c, 'production').errors).toHaveLength(2);
  });

  it('stops when UAT and production share a database, from either side', () => {
    const c = base();
    c.env.production.d1_databases[0].database_id = 'uat-id';
    expect(checkDeployConfig(c, 'production').errors.join()).toMatch(/shared/);
    expect(checkDeployConfig(c, 'uat').errors.join()).toMatch(/shared/);
  });

  it('stops on a localhost origin and warns about same worker and bucket names', () => {
    const c = base();
    c.vars.ALLOWED_ORIGIN = 'http://localhost:5173';
    expect(checkDeployConfig(c, 'uat').errors.join()).toMatch(/localhost/);
    expect(checkDeployConfig(base(), 'production').warnings).toHaveLength(2);
  });

  it('rejects an unknown target and a missing production block', () => {
    expect(checkDeployConfig(base(), 'prod').errors).toHaveLength(1);
    const c = base();
    delete c.env;
    expect(checkDeployConfig(c, 'production').errors).toHaveLength(1);
  });

  it('the real wrangler.jsonc: UAT is deployable and production is blocked until it is filled in', () => {
    const config = parseJsonc(fs.readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
    expect(checkDeployConfig(config, 'uat').errors).toEqual([]);
    if (/REPLACE_/.test(JSON.stringify(config.env.production))) expect(checkDeployConfig(config, 'production').errors.length).toBeGreaterThan(0);
  });
});

describe('local seed guard', () => {
  const db = () => {
    const d = new DatabaseSync(':memory:');
    d.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    return d;
  };

  it('stops on a database without the local marker (what a --remote run would be)', () => {
    expect(() => db().exec(GUARD_SQL)).toThrow(/CHECK/);
  });

  it('lets the seed through once the marker was written locally, and leaves no helper table', () => {
    const d = db();
    d.exec(MARKER_SQL);
    d.exec(GUARD_SQL);
    expect(d.prepare("SELECT count(*) n FROM sqlite_master WHERE name = '_seed_guard'").get().n).toBe(0);
  });
});
