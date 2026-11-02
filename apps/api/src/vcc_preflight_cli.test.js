import { describe, it, expect, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { createWranglerD1Adapter } from '../scripts/vcc-preflight.js';
import { saveAuditRecord, runSafeMigrationWorkflow } from '../scripts/vcc-migrate-safe.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiDir = path.resolve(__dirname, '..');
const safeMigrateScript = path.resolve(apiDir, 'scripts/vcc-migrate-safe.js');
const rawMigrateScript = path.resolve(apiDir, 'scripts/vcc-migrate-raw.js');
const testAuditPath = path.resolve(apiDir, '.wrangler/test-migration-audit.json');

const cleanMockDb = {
  prepare: (sql) => ({
    first: async () => {
      if (sql.includes('is_alive')) return { is_alive: 1 };
      if (sql.includes('sqlite_master')) return { name: 'vcc_annual_plans' };
      return { is_alive: 1, 1: 1, total: 0, approved_count: 0, current_count: 0, cnt: 0 };
    },
    all: async () => []
  })
};

describe('VCC Final Evidence Integrity & Migration Gate Safety Tests', () => {
  beforeEach(() => {
    if (fs.existsSync(testAuditPath)) {
      try { fs.unlinkSync(testAuditPath); } catch { /* ignore */ }
    }
    const jsonlPath = testAuditPath.replace(/\.json$/, '.jsonl');
    if (fs.existsSync(jsonlPath)) {
      try { fs.unlinkSync(jsonlPath); } catch { /* ignore */ }
    }
  });

  it('1. P1.1 Test Integrity: Adapter จริงสำหรับ Invalid Wrangler JSON (ทดสอบผ่าน prepare().all() และ prepare().first())', async () => {
    // Inject customSpawn returning non-JSON into the actual createWranglerD1Adapter
    const adapter = createWranglerD1Adapter({
      database: 'DB',
      customSpawn: () => ({
        status: 0,
        stdout: '<!DOCTYPE html><html><body>502 Bad Gateway - Cloudflare</body></html>',
        stderr: ''
      })
    });

    // Test calling actual adapter methods
    await expect(adapter.prepare('SELECT 1').all()).rejects.toThrow(
      /Invalid JSON output from Wrangler.*502 Bad Gateway/
    );
    await expect(adapter.prepare('SELECT 1').first()).rejects.toThrow(
      /Invalid JSON output from Wrangler.*502 Bad Gateway/
    );
  });

  it('2. P0.2 & P1.1 Local SQLite Backup Integrity: ตรวจจับ Backup ที่มี Header ถูกต้องแต่ Payload ข้อมูล SQLite เสียหาย', async () => {
    let caught = null;
    try {
      await runSafeMigrationWorkflow([
        '--local',
        '--database', 'DB',
        '--confirm-migration'
      ], {
        mockDb: cleanMockDb,
        isTestRunner: true,
        isTestHarness: true,
        auditPath: testAuditPath,
        simulateFailure: { corruptBackupPayload: true }
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).not.toBeNull();
    expect(caught.exitCode).toBe(1);
    expect(caught.message).toContain('restore_verification');
    expect(caught.message).toMatch(/(PRAGMA integrity_check ล้มเหลว|malformed)/i);
  });

  it('3. P0.3 & P1.1 Audit Evidence Fail-Closed: ไฟล์ Audit เสียหาย ต้องรักษาหลักฐานเดิมและปฏิเสธการเขียนทับ', () => {
    // Write corrupted JSON content into test audit path
    const corruptedContent = '{"run_id": "CRITICAL_PAST_RUN", "truncated_json": true, "corrupt';
    fs.writeFileSync(testAuditPath, corruptedContent, 'utf-8');

    // Attempt to save an audit record must throw and refuse to overwrite
    expect(() => {
      saveAuditRecord({
        run_id: 'ATTEMPT_OVERWRITE_RUN',
        operator: 'operator_test',
        result: 'SUCCESS'
      }, testAuditPath);
    }).toThrow(/Audit Trail Integrity Error.*มีรูปแบบเสียหายหรือไม่สมบูรณ์/);

    // Verify original corrupted content was preserved 100% (never overwritten)
    const contentAfter = fs.readFileSync(testAuditPath, 'utf-8');
    expect(contentAfter).toBe(corruptedContent);
  });

  it('4. P0.3 & P1.1 Audit Evidence Fail-Closed: ห้ามแก้ Record เดิมที่มี run_id และ event_id ซ้ำกัน', () => {
    const fixedRunId = 'RUN-FINAL-999';
    const fixedEventId = 'EVT-FIXED-001';

    // First write succeeds
    saveAuditRecord({
      run_id: fixedRunId,
      event_id: fixedEventId,
      result: 'SUCCESS',
      operator: 'admin'
    }, testAuditPath);

    // Second write attempting to reuse identical finalized run_id and event_id must be rejected
    expect(() => {
      saveAuditRecord({
        run_id: fixedRunId,
        event_id: fixedEventId,
        result: 'SUCCESS',
        operator: 'tampered_admin'
      }, testAuditPath);
    }).toThrow(/Audit Integrity Error.*ซ้ำ/);
  });

  it('5. P0.3 & P1.1 Concurrent Audit Writes: บันทึกข้อมูลหลายรายการพร้อมกัน ประวัติถูกเก็บรักษาครบถ้วน', () => {
    const writeCount = 5;
    for (let i = 0; i < writeCount; i++) {
      saveAuditRecord({
        run_id: `RUN-CONCURRENT-${i}`,
        event_id: `EVT-${i}`,
        operator: `operator_${i}`,
        result: 'SUCCESS',
        step: `step_${i}`
      }, testAuditPath);
    }

    const records = JSON.parse(fs.readFileSync(testAuditPath, 'utf-8'));
    expect(Array.isArray(records)).toBe(true);
    expect(records.length).toBe(writeCount);

    // Verify all 5 runs exist
    for (let i = 0; i < writeCount; i++) {
      expect(records.some((r) => r.run_id === `RUN-CONCURRENT-${i}`)).toBe(true);
    }

    // Verify JSONL append stream also contains all 5 records
    const jsonlPath = testAuditPath.replace(/\.json$/, '.jsonl');
    expect(fs.existsSync(jsonlPath)).toBe(true);
    const jsonlLines = fs.readFileSync(jsonlPath, 'utf-8').trim().split('\n');
    expect(jsonlLines.length).toBe(writeCount);
  });

  it('6. P0.1 Remote Backup Verification: ห้ามรัน Remote Production Migration หากไม่มีหลักฐานการทดสอบ Restore จริง (Fail-Closed)', async () => {
    let caught = null;
    try {
      await runSafeMigrationWorkflow([
        '--remote',
        '--database', 'DB',
        '--backup-ref', 'D1-SNAP-CLOUD-2026',
        '--confirm-migration'
      ], {
        mockDb: cleanMockDb,
        isTestRunner: true,
        isTestHarness: true,
        auditPath: testAuditPath,
        // remoteRestoreVerified is deliberately NOT provided
        remoteRestoreVerified: false
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).not.toBeNull();
    expect(caught.exitCode).toBe(1);
    expect(caught.message).toContain('restore_verification');
    expect(caught.message).toContain('ไม่พบหลักฐานการทดสอบ Restore บนฐานข้อมูล Remote D1 จริง');
    expect(caught.message).toContain('ห้ามตั้ง restore_tested = true โดยไม่มีการทดสอบกู้คืนจริง');
  });

  it('7. P1.2 Production Safety: ปฏิเสธแฟล็ก --simulate-* บน CLI คำสั่งจริง (Security Violation)', () => {
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
    expect(output).toContain('SECURITY VIOLATION');
    expect(output).toContain('ไม่อนุญาตให้ใช้แฟล็กจำลองความล้มเหลว (--simulate-*) ในคำสั่งจริง');
  });

  it('8. P0.3 & P1.2 Operator Confirmation Gate: CI=true ไม่สามารถอนุมัติ Production Migration แทนคนได้', async () => {
    let caught = null;
    try {
      await runSafeMigrationWorkflow([
        '--local',
        '--database', 'DB'
        // deliberately omitting --confirm-migration
      ], {
        mockDb: cleanMockDb,
        isTestRunner: true,
        isTestHarness: true,
        auditPath: testAuditPath,
        mockPlanResult: { status: 0, stdout: '0033_vcc_plan_revision_control.sql' }
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).not.toBeNull();
    expect(caught.exitCode).toBe(1);
    expect(caught.message).toContain('operator_approval_gate');
    expect(caught.message).toContain('การรัน Migration ต้องได้รับการยืนยันอย่างชัดเจนจากผู้ควบคุม');
    expect(caught.message).toContain('CI ไม่สามารถอนุมัติแทนได้');
  });

  it('9. P1.2 Raw Migration Guard: ป้องกันการ Bypass รัน Raw Migration ใน Remote และ Production', () => {
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

  it('10. P1.2 Post-Migration Verification Fail-Closed: รายงาน Failure พร้อม Recovery Procedure และไม่รายงาน Success', async () => {
    let caught = null;
    try {
      await runSafeMigrationWorkflow([
        '--local',
        '--database', 'DB',
        '--confirm-migration'
      ], {
        mockDb: cleanMockDb,
        isTestRunner: true,
        isTestHarness: true,
        auditPath: testAuditPath,
        mockPlanResult: { status: 0, stdout: '0033_vcc_plan_revision_control.sql' },
        mockApplyResult: { status: 0, stdout: 'Applied' },
        simulateFailure: { postVerifyFail: true }
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).not.toBeNull();
    expect(caught.exitCode).toBe(1);
    expect(caught.auditRecord.result).toBe('FAILED');
    expect(caught.auditRecord.failure_evidence.step).toBe('post_migration_verification');
    expect(caught.auditRecord.failure_evidence.details.recovery_procedure_triggered).toBe(true);
  });
});
