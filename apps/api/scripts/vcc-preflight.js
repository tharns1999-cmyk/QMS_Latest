#!/usr/bin/env node
/**
 * VCC Migration Preflight CLI Runner (Fail-Closed Architecture)
 * 
 * Safely executes read-only validation against Cloudflare D1 databases without shell interpolation.
 * Strictly exits with code 1 upon connection failure, invalid target, query error, JSON parse error, or critical violation.
 * 
 * Usage:
 *   node scripts/vcc-preflight.js [--local | --remote] [--env <env>] [--persist-to <dir>] [--database <name>]
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { validateVccMigrationPreflight, PREFLIGHT_STATUS } from '../src/vccPreflight.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiDir = path.resolve(__dirname, '..');

// Parse CLI arguments safely
const rawArgs = process.argv.slice(2);
const isRemote = rawArgs.includes('--remote');
const persistIndex = rawArgs.indexOf('--persist-to');
const persistDir = persistIndex !== -1 ? rawArgs[persistIndex + 1] : null;
const envIndex = rawArgs.indexOf('--env');
const targetEnv = envIndex !== -1 ? rawArgs[envIndex + 1] : null;
const dbIndex = rawArgs.indexOf('--database');
const targetDb = dbIndex !== -1 ? rawArgs[dbIndex + 1] : 'DB';

// Locate wrangler binary without shell
function getWranglerBinPath() {
  const possiblePaths = [
    path.resolve(apiDir, 'node_modules/wrangler/bin/wrangler.js'),
    path.resolve(apiDir, '../../node_modules/wrangler/bin/wrangler.js')
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`ไม่พบ Wrangler binary ที่ตำแหน่ง: ${possiblePaths.join(', ')}`);
}

// Build secure argument list without shell interpolation
export function createWranglerD1Adapter(options = {}) {
  const dbName = options.database || targetDb;
  const wranglerBin = options.wranglerBin || getWranglerBinPath();
  const cwd = options.cwd || apiDir;

  const baseArgs = [wranglerBin, 'd1', 'execute', dbName];
  if (options.remote ?? isRemote) {
    baseArgs.push('--remote');
  } else {
    baseArgs.push('--local');
  }

  const pDir = options.persistTo ?? persistDir;
  if (pDir) {
    baseArgs.push('--persist-to', pDir);
  }

  const tEnv = options.env ?? targetEnv;
  if (tEnv) {
    baseArgs.push('--env', tEnv);
  }

  baseArgs.push('--json');

  return {
    prepare(sql) {
      return {
        async first() {
          const rows = await this.all();
          return rows[0] || null;
        },
        async all() {
          const execArgs = [...baseArgs, '--command', sql];
          const proc = spawnSync(process.execPath, execArgs, {
            cwd,
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024
          });

          if (proc.error) {
            throw new Error(`Database Connection Error: ไม่สามารถเริ่มการทำงานของ Wrangler process ได้: ${proc.error.message}`);
          }

          if (proc.status !== 0) {
            const stderr = proc.stderr ? proc.stderr.trim() : '';
            const stdout = proc.stdout ? proc.stdout.trim() : '';
            throw new Error(`Database Query Execution Failed (exit code ${proc.status}): ${stderr || stdout}`);
          }

          let parsed;
          try {
            parsed = JSON.parse(proc.stdout);
          } catch (jsonErr) {
            throw new Error(`Invalid JSON output from Wrangler: ${proc.stdout?.slice(0, 200)}... Error: ${jsonErr.message}`);
          }

          if (!Array.isArray(parsed) || !parsed[0]) {
            throw new Error(`Malformed response structure from Wrangler: ${JSON.stringify(parsed)}`);
          }

          const firstResult = parsed[0];
          if (firstResult.success === false) {
            throw new Error(`Database Query Error: ${firstResult.error || JSON.stringify(firstResult)}`);
          }

          return firstResult.results || [];
        }
      };
    }
  };
}

async function main() {
  console.log('================================================================');
  console.log('🔍 เริ่มต้นการตรวจประเมินความพร้อมฐานข้อมูล VCC (Preflight Safety Check)');
  console.log(`🎯 เป้าหมาย: Database="${targetDb}" Mode="${isRemote ? 'REMOTE' : 'LOCAL'}" Env="${targetEnv || 'default'}" Persist="${persistDir || 'default'}"`);
  console.log('================================================================\n');

  let db;
  try {
    db = createWranglerD1Adapter();
  } catch (initErr) {
    console.error(`❌ [FATAL] ไม่สามารถเริ่มต้นการเชื่อมต่อฐานข้อมูลได้: ${initErr.message}`);
    process.exit(1);
  }

  const result = await validateVccMigrationPreflight(db);
  console.log(result.reportText);

  if (!result.isValid) {
    console.error('🛑 [FAIL-CLOSED] การตรวจประเมินไม่ผ่านเกณฑ์ความปลอดภัย ห้ามดำเนินการรัน Migration โดยเด็ดขาด');
    process.exit(1);
  }

  if (result.status !== PREFLIGHT_STATUS.READY) {
    console.error(`🛑 [FAIL-CLOSED] สถานะระบบไม่อยู่ในระดับ READY (${result.status}) ห้ามดำเนินการ Migration`);
    process.exit(1);
  }

  console.log('✅ [PASSED] ฐานข้อมูลผ่านเกณฑ์ความสมบูรณ์ 100% พร้อมสำหรับการดำเนินการ Migration');
  process.exit(0);
}

// Only execute when invoked directly from CLI
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((err) => {
    console.error('❌ [FATAL ERROR]:', err.message);
    process.exit(1);
  });
}
