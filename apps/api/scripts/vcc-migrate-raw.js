#!/usr/bin/env node
/**
 * VCC Raw Migration Runner (Local Development ONLY)
 * 
 * Strictly prohibits execution against remote or production environments.
 * All remote and production migrations must pass through vcc-migrate-safe.js.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiDir = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const isRemote = args.includes('--remote') || args.includes('-r');
const isProd = args.includes('production') || (args.includes('--env') && args[args.indexOf('--env') + 1] === 'production') || process.env.NODE_ENV === 'production';

if (isRemote || isProd) {
  console.error('🛑 [SECURITY VIOLATION] ห้ามรัน Raw Migration บน Remote หรือ Production เด็ดขาด');
  console.error('ทุกการอัปเกรดฐานข้อมูลบนคลาวด์/Production ต้องดำเนินการผ่าน vcc-migrate-safe.js เท่านั้น');
  process.exit(1);
}

// Find wrangler binary
const wranglerBin = path.resolve(apiDir, 'node_modules/wrangler/bin/wrangler.js');
const res = spawnSync(process.execPath, [wranglerBin, 'd1', 'migrations', 'apply', 'DB', '--local', ...args], {
  cwd: apiDir,
  stdio: 'inherit'
});
process.exit(res.status ?? 0);

