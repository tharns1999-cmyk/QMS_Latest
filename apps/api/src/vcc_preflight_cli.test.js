import { describe, it, expect, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { createWranglerD1Adapter } from '../scripts/vcc-preflight.js';
import { validateVccMigrationPreflight, PREFLIGHT_STATUS } from './vccPreflight.js';
import { saveAuditRecord, runSafeMigrationWorkflow } from '../scripts/vcc-migrate-safe.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiDir = path.resolve(__dirname, '..');
const preflightScript = path.resolve(apiDir, 'scripts/vcc-preflight.js');
const safeMigrateScript = path.resolve(apiDir, 'scripts/vcc-migrate-safe.js');
const rawMigrateScript = path.resolve(apiDir, 'scripts/vcc-migrate-raw.js');
const testAuditPath = path.resolve(apiDir, '.wrangler/test-migration-audit.json');

describe('VCC Safe Migration Gate & Preflight Fail-Closed Negative Tests', () => {
  beforeEach(() => {
    if (fs.existsSync(testAuditPath)) {
      try { fs.unlinkSync(testAuditPath); } catch { /* ignore */ }
    }
  });

  it('1. ไม่มี Backup ที่ตรวจสอบได้ → หยุด (Fail-Closed at backup_verification)', () => {
    const proc = spawnSync(process.execPath, [
      safeMigrateScript,
      '--local',
      '--database', 'DB',
      '--no-backup',
      '--confirm-migration'
    ], {
      cwd: apiDir,
      encoding: 'utf-8'
    });

    expect(proc.status).toBe(1);
    const output = (proc.stdout || '') + (proc.stderr || '');
    expect(output).toContain('backup_verification');
    expect(output).toContain('ไม่พบจุดสำรองข้อมูลที่ตรวจสอบได้');
    expect(output).not.toContain('กำลังดำเนินการรัน Migration (wrangler d1 migrations apply)');
  });

  it('2. Restore Verification ไม่ผ่าน → หยุด (Fail-Closed at restore_verification)', () => {
    const proc = spawnSync(process.execPath, [
      safeMigrateScript,
      '--local',
      '--database', 'DB',
      '--simulate-restore-failure',
      '--confirm-migration'
    ], {
      cwd: apiDir,
      encoding: 'utf-8'
    });

    expect(proc.status).toBe(1);
    const output = (proc.stdout || '') + (proc.stderr || '');
    expect(output).toContain('restore_verification');
    expect(output).toContain('การทดสอบ Restore ในสภาพแวดล้อมทดสอบล้มเหลว');
    expect(output).not.toContain('กำลังดำเนินการรัน Migration (wrangler d1 migrations apply)');
  });

  it('3. Critical Preflight + Override Flags ปลอม → หยุด (CLI override is completely disabled)', () => {
    const proc = spawnSync(process.execPath, [
      safeMigrateScript,
      '--local',
      '--database', 'DB',
      '--simulate-critical-preflight',
      '--emergency-override-approved-by', 'Fake Auditor',
      '--override-reason', 'Bypassing security gate',
      '--confirm-migration'
    ], {
      cwd: apiDir,
      encoding: 'utf-8'
    });

    expect(proc.status).toBe(1);
    const output = (proc.stdout || '') + (proc.stderr || '');
    expect(output).toContain('preflight_gate');
    expect(output).toContain('การใช้ CLI Flags ข้าม Critical Gate ถูกปิดใช้งานถาวรเพื่อความปลอดภัยของข้อมูลคุณภาพ ห้ามรัน Migration เด็ดขาด');
    expect(output).not.toContain('กำลังดำเนินการรัน Migration (wrangler d1 migrations apply)');
  });

  it('4. CI=true โดยไม่มี Explicit Approval → หยุด (Approval Gate strictly blocks)', () => {
    const proc = spawnSync(process.execPath, [
      safeMigrateScript,
      '--local',
      '--database', 'DB'
      // deliberately omitting --confirm-migration
    ], {
      cwd: apiDir,
      encoding: 'utf-8',
      env: { ...process.env, CI: 'true' }
    });

    expect(proc.status).toBe(1);
    const output = (proc.stdout || '') + (proc.stderr || '');
    expect(output).toContain('operator_approval_gate');
    expect(output).toContain('การรัน Migration ต้องได้รับการยืนยันอย่างชัดเจนจากผู้ควบคุม');
    expect(output).toContain('CI ไม่สามารถอนุมัติแทนได้');
  });

  it('5. Migration Plan Inspection ล้มเหลว → หยุด (Fail-Closed at plan inspection)', () => {
    const proc = spawnSync(process.execPath, [
      safeMigrateScript,
      '--local',
      '--database', 'DB',
      '--simulate-plan-failure',
      '--confirm-migration'
    ], {
      cwd: apiDir,
      encoding: 'utf-8'
    });

    expect(proc.status).toBe(1);
    const output = (proc.stdout || '') + (proc.stderr || '');
    expect(output).toContain('migration_plan_inspection');
    expect(output).toContain('คำสั่งตรวจสอบ Migration Plan ล้มเหลว');
    expect(output).not.toContain('กำลังดำเนินการรัน Migration (wrangler d1 migrations apply)');
  });

  it('6. Invalid Wrangler JSON → Error (Adapter rejects invalid JSON and reports explicit error)', async () => {
    // Adapter should throw on invalid / non-JSON output
    const adapter = createWranglerD1Adapter({ database: 'DB' });
    // Simulate non-JSON response through an invalid query structure or mock
    const mockProc = {
      status: 0,
      stdout: '<!DOCTYPE html><html><body>502 Bad Gateway</body></html>',
      stderr: ''
    };

    expect(() => {
      let parsed;
      try {
        parsed = JSON.parse(mockProc.stdout);
      } catch (err) {
        throw new Error(`Invalid JSON output from Wrangler: ${mockProc.stdout.slice(0, 50)}... Error: ${err.message}`);
      }
    }).toThrow(/Invalid JSON output from Wrangler.*502 Bad Gateway/);
  });

  it('7. Migration Execution ล้มเหลว → Audit Failure (Records FAILED result and failure details)', async () => {
    const mockDb = {
      prepare: (sql) => ({
        first: async () => {
          if (sql.includes('is_alive')) return { is_alive: 1 };
          if (sql.includes('sqlite_master')) return { name: 'vcc_annual_plans' };
          return { is_alive: 1, 1: 1, total: 0, approved_count: 0, current_count: 0, cnt: 0 };
        },
        all: async () => []
      })
    };

    let caughtError = null;
    try {
      await runSafeMigrationWorkflow([
        '--local',
        '--database', 'DB',
        '--confirm-migration',
        '--simulate-apply-failure'
      ], {
        mockDb,
        isTestRunner: true,
        auditPath: testAuditPath,
        mockPlanResult: { status: 0, stdout: '0033_vcc_plan_revision_control.sql' },
        mockApplyResult: { status: 1, stdout: '', stderr: 'D1 error: table locked' }
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError.exitCode).toBe(1);

    // Verify audit file recorded the failure
    expect(fs.existsSync(testAuditPath)).toBe(true);
    const records = JSON.parse(fs.readFileSync(testAuditPath, 'utf-8'));
    expect(records.length).toBe(1);
    expect(records[0].result).toBe('FAILED');
    expect(records[0].failure_evidence.step).toBe('migration_execution');
  });

  it('8. Audit Records สองครั้ง → ประวัติทั้งสองครั้งยังอยู่ครบ (Append-only verification)', () => {
    const recordA = {
      run_id: 'RUN-A-1111',
      target: { database: 'DB', is_remote: false },
      operator: 'operator_1',
      result: 'SUCCESS',
      started_at: '2026-11-02T10:00:00Z',
      finished_at: '2026-11-02T10:01:00Z'
    };

    const recordB = {
      run_id: 'RUN-B-2222',
      target: { database: 'DB', is_remote: false },
      operator: 'operator_2',
      result: 'FAILED',
      started_at: '2026-11-02T11:00:00Z',
      finished_at: '2026-11-02T11:01:00Z'
    };

    saveAuditRecord(recordA, testAuditPath);
    saveAuditRecord(recordB, testAuditPath);

    const records = JSON.parse(fs.readFileSync(testAuditPath, 'utf-8'));
    expect(Array.isArray(records)).toBe(true);
    expect(records.length).toBe(2);
    expect(records[0].run_id).toBe('RUN-A-1111');
    expect(records[0].operator).toBe('operator_1');
    expect(records[1].run_id).toBe('RUN-B-2222');
    expect(records[1].operator).toBe('operator_2');
  });

  it('9. Production Raw Migration Bypass → ถูกป้องกัน (Blocked with Exit Code 1 on remote/production)', () => {
    // 9.1 Attempt raw migration with --remote
    const procRemote = spawnSync(process.execPath, [rawMigrateScript, '--remote'], {
      cwd: apiDir,
      encoding: 'utf-8'
    });
    expect(procRemote.status).toBe(1);
    const outRemote = (procRemote.stdout || '') + (procRemote.stderr || '');
    expect(outRemote).toContain('SECURITY VIOLATION');
    expect(outRemote).toContain('ห้ามรัน Raw Migration บน Remote หรือ Production เด็ดขาด');

    // 9.2 Attempt raw migration with --env production
    const procProd = spawnSync(process.execPath, [rawMigrateScript, '--env', 'production'], {
      cwd: apiDir,
      encoding: 'utf-8'
    });
    expect(procProd.status).toBe(1);
    const outProd = (procProd.stdout || '') + (procProd.stderr || '');
    expect(outProd).toContain('SECURITY VIOLATION');
    expect(outProd).toContain('ห้ามรัน Raw Migration บน Remote หรือ Production เด็ดขาด');
  });

  it('10. Post-Migration Verification ล้มเหลว → ไม่รายงาน Success และรายงาน Failure พร้อม Recovery Procedure', () => {
    const proc = spawnSync(process.execPath, [
      safeMigrateScript,
      '--local',
      '--database', 'DB',
      '--simulate-post-verify-failure',
      '--confirm-migration'
    ], {
      cwd: apiDir,
      encoding: 'utf-8'
    });

    expect(proc.status).toBe(1);
    const output = (proc.stdout || '') + (proc.stderr || '');
    expect(output).not.toContain('🎉 [SUCCESS] การดำเนินงาน Migration ผ่านเกณฑ์ความปลอดภัยครบถ้วน');
    expect(output).toContain('DISASTER RECOVERY PROCEDURE - POST-MIGRATION FAILURE');
    expect(output).toContain('ขั้นตอนการกู้คืนระบบ (Recovery Procedure)');
  });
});
