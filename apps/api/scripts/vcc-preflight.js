#!/usr/bin/env node
/**
 * VCC Migration Preflight CLI Runner
 * 
 * Usage:
 *   node scripts/vcc-preflight.js [--local | --remote | --persist-to <dir>]
 */

import { execSync } from 'node:child_process';
import { validateVccMigrationPreflight } from '../src/vccPreflight.js';

const args = process.argv.slice(2);
const persistIndex = args.indexOf('--persist-to');
const persistDir = persistIndex !== -1 ? args[persistIndex + 1] : null;
const isRemote = args.includes('--remote');

// Create a D1-compatible adapter using wrangler d1 execute --json
function createWranglerD1Adapter() {
  const baseCmd = isRemote
    ? 'npx wrangler d1 execute DB --remote --json'
    : persistDir
    ? `npx wrangler d1 execute DB --local --persist-to ${persistDir} --json`
    : 'npx wrangler d1 execute DB --local --json';

  return {
    prepare(sql) {
      return {
        async first() {
          try {
            // Escape double quotes in SQL
            const escapedSql = sql.replace(/"/g, '\\"').replace(/\n/g, ' ');
            const out = execSync(`${baseCmd} --command "${escapedSql}"`, {
              stdio: ['pipe', 'pipe', 'pipe'],
              encoding: 'utf-8'
            });
            const parsed = JSON.parse(out);
            const results = parsed[0]?.results || [];
            return results[0] || null;
          } catch (err) {
            return null;
          }
        },
        async all() {
          try {
            const escapedSql = sql.replace(/"/g, '\\"').replace(/\n/g, ' ');
            const out = execSync(`${baseCmd} --command "${escapedSql}"`, {
              stdio: ['pipe', 'pipe', 'pipe'],
              encoding: 'utf-8'
            });
            const parsed = JSON.parse(out);
            const results = parsed[0]?.results || [];
            return results;
          } catch (err) {
            return [];
          }
        }
      };
    }
  };
}

async function main() {
  console.log('กำลังตรวจสอบความพร้อมของฐานข้อมูลก่อนรัน Migration (VCC Preflight Validation)...');
  const db = createWranglerD1Adapter();
  const result = await validateVccMigrationPreflight(db);

  console.log(result.reportText);

  if (!result.isValid) {
    console.error('❌ ตรวจพบข้อบกพร่องระดับวิกฤต (CRITICAL). กรุณาแก้ไขข้อมูลตามแนวทางในรายงานก่อนรัน Migration');
    process.exit(1);
  } else {
    console.log('✅ ตรวจสอบผ่านเกณฑ์สมบูรณ์ สามารถรัน Migration ได้');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('เกิดข้อผิดพลาดในการรัน Preflight:', err);
  process.exit(1);
});
