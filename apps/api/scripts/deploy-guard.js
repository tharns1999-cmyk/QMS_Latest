#!/usr/bin/env node
// Runs before `wrangler deploy`: stops the deploy when the Cloudflare config would mix environments.
// Usage: node scripts/deploy-guard.js <uat|production>   (uat = the top-level block of wrangler.jsonc)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLACEHOLDER = /REPLACE_|00000000-0000-0000-0000-000000000000/;
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i;

export const parseJsonc = (raw) => JSON.parse(raw.replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, '$1').replace(/,(\s*[}\]])/g, '$1'));

const dbIds = (block) => (block?.d1_databases || []).map((d) => d.database_id);

export function checkDeployConfig(config, target) {
  const errors = [];
  const warnings = [];
  const isProd = target === 'production';
  if (!isProd && target !== 'uat') return { errors: [`unknown target "${target}" (use uat or production)`], warnings };

  const block = isProd ? config.env?.production : config;
  if (!block) return { errors: ['wrangler.jsonc has no env.production block'], warnings };

  const mine = dbIds(block);
  if (mine.length === 0) errors.push('no D1 database is bound for this target');
  for (const id of mine) if (!id || PLACEHOLDER.test(id)) errors.push(`database_id "${id}" is still a placeholder`);

  // The same D1 id in two environments means UAT tests would write into production data (or the reverse).
  const others = isProd ? dbIds(config) : Object.values(config.env || {}).flatMap(dbIds);
  for (const id of mine) if (id && others.includes(id)) errors.push(`database_id ${id} is shared with another environment`);

  const origin = block.vars?.ALLOWED_ORIGIN || '';
  if (!origin || PLACEHOLDER.test(origin)) errors.push(`ALLOWED_ORIGIN "${origin}" is not set`);
  else if (LOCAL_ORIGIN.test(origin)) errors.push(`ALLOWED_ORIGIN "${origin}" points at localhost`);

  if (isProd) {
    // Same names are fine on the company account but would overwrite UAT if the wrong Cloudflare login is active.
    if (block.name && block.name === config.name) warnings.push(`worker name "${block.name}" is the same as UAT: check "wrangler whoami" shows the company account`);
    const uatBuckets = (config.r2_buckets || []).map((b) => b.bucket_name);
    for (const b of block.r2_buckets || []) if (uatBuckets.includes(b.bucket_name)) warnings.push(`R2 bucket "${b.bucket_name}" has the same name as UAT: it must be on the company account`);
  }
  return { errors, warnings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.argv[2];
  const config = parseJsonc(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../wrangler.jsonc'), 'utf8'));
  const { errors, warnings } = checkDeployConfig(config, target);
  for (const w of warnings) console.warn(`[deploy-guard] warning: ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`[deploy-guard] STOP: ${e}`);
    console.error(`[deploy-guard] deploy to ${target} blocked`);
    process.exit(1);
  }
  console.log(`[deploy-guard] ${target} config OK`);
}
