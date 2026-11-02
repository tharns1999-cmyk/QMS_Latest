import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createWranglerD1Adapter } from '../scripts/vcc-preflight.js';
import {
  saveAuditRecord,
  runSafeMigrationWorkflow,
  createConsistentSqliteBackup,
  verifySqliteBackupIntegrity,
  verifyAuditStorageReadiness,
  generateTrustedDrillEvidence,
  verifyDrillEvidenceSignature,
  withAuditLock,
  isProcessAlive
} from '../scripts/vcc-migrate-safe.js';

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

describe('VCC Final Security Gate & Real Integrity Verification Tests', () => {
  beforeEach(() => {
    if (fs.existsSync(testAuditPath)) {
      try { fs.unlinkSync(testAuditPath); } catch { /* ignore */ }
    }
    const jsonlPath = testAuditPath.replace(/\.json$/, '.jsonl');
    if (fs.existsSync(jsonlPath)) {
      try { fs.unlinkSync(jsonlPath); } catch { /* ignore */ }
    }
    const lockDir = `${testAuditPath}.lock`;
    if (fs.existsSync(lockDir)) {
      try { fs.rmSync(lockDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  afterEach(() => {
    if (fs.existsSync(testAuditPath)) {
      try { fs.unlinkSync(testAuditPath); } catch { /* ignore */ }
    }
    const jsonlPath = testAuditPath.replace(/\.json$/, '.jsonl');
    if (fs.existsSync(jsonlPath)) {
      try { fs.unlinkSync(jsonlPath); } catch { /* ignore */ }
    }
    const lockDir = `${testAuditPath}.lock`;
    if (fs.existsSync(lockDir)) {
      try { fs.rmSync(lockDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it('1. P1.1 Test Integrity: Adapter จริงสำหรับ Invalid Wrangler JSON (ทดสอบผ่าน prepare().all() และ prepare().first())', async () => {
    const adapter = createWranglerD1Adapter({
      database: 'DB',
      customSpawn: () => ({
        status: 0,
        stdout: '<!DOCTYPE html><html><body>502 Bad Gateway - Cloudflare</body></html>',
        stderr: ''
      })
    });

    await expect(adapter.prepare('SELECT 1').all()).rejects.toThrow(
      /Invalid JSON output from Wrangler.*502 Bad Gateway/
    );
    await expect(adapter.prepare('SELECT 1').first()).rejects.toThrow(
      /Invalid JSON output from Wrangler.*502 Bad Gateway/
    );
  });

  it('2. P0 SQLite Integrity Test: สร้าง SQLite จริง ทำให้เสียหายจริง แล้วเรียก Restore Verification จริง (ไม่ใช้ Error จำลอง)', async () => {
    const testRealDb = path.resolve(apiDir, '.wrangler/temp_real_corrupt.sqlite');
    if (fs.existsSync(testRealDb)) fs.unlinkSync(testRealDb);

    // 2.1 สร้าง SQLite Database จริงพร้อมข้อมูลตาราง
    const realDb = new DatabaseSync(testRealDb);
    realDb.exec('CREATE TABLE test_assets (id INTEGER PRIMARY KEY, tag TEXT, cal_date TEXT);');
    for (let i = 0; i < 30; i++) {
      realDb.exec(`INSERT INTO test_assets (tag, cal_date) VALUES ('TAG-${i}', '2026-05-15');`);
    }
    realDb.close();

    // 2.2 ทำให้ข้อมูลเสียหายจริงในระดับ Page B-tree (คง 16 ไบต์แรกของ SQLite Header ไว้)
    const dbBytes = fs.readFileSync(testRealDb);
    expect(dbBytes.toString('utf-8', 0, 15)).toBe('SQLite format 3');
    // จงใจเขียนทับข้อมูลส่วน Page Body ด้วยไบต์ขยะ
    dbBytes[108] = 0xee;
    dbBytes[109] = 0xaa;
    fs.writeFileSync(testRealDb, dbBytes);

    // 2.3 รัน Safe Migration Workflow โดยส่งไฟล์ฐานข้อมูลที่เสียหายจริงเข้าไปตรวจ Restore Verification
    let caught = null;
    try {
      await runSafeMigrationWorkflow([
        '--local',
        '--database', 'DB',
        '--confirm-migration'
      ], {
        backupFile: testRealDb,
        mockDb: cleanMockDb,
        isTestRunner: true,
        isTestHarness: true,
        auditPath: testAuditPath
      });
    } catch (err) {
      caught = err;
    } finally {
      if (fs.existsSync(testRealDb)) {
        try { fs.unlinkSync(testRealDb); } catch { /* ignore */ }
      }
    }

    expect(caught).not.toBeNull();
    expect(caught.exitCode).toBe(1);
    expect(caught.message).toContain('restore_verification');
    // ตรวจสอบว่า Error มาจาก SQLite engine จริง (PRAGMA integrity_check ล้มเหลว)
    expect(caught.message).toMatch(/(PRAGMA integrity_check ล้มเหลว|malformed|corrupt)/i);
  });

  it('3. P1 Consistent SQLite Backup: สร้าง Snapshot ผ่าน VACUUM INTO ขณะฐานข้อมูลมี Active Concurrent Writes ได้สำเร็จและสมบูรณ์ 100%', async () => {
    const liveDbPath = path.resolve(apiDir, '.wrangler/temp_live_wal.sqlite');
    const bkpDbPath = path.resolve(apiDir, '.wrangler/temp_live_bkp.sqlite');
    if (fs.existsSync(liveDbPath)) fs.unlinkSync(liveDbPath);
    if (fs.existsSync(bkpDbPath)) fs.unlinkSync(bkpDbPath);

    // สร้าง Live DB ในโหมด WAL
    const liveDb = new DatabaseSync(liveDbPath);
    liveDb.exec('PRAGMA journal_mode = WAL;');
    liveDb.exec('CREATE TABLE work_orders (id INTEGER PRIMARY KEY, wo_no TEXT, created_at TEXT);');

    // จำลองการเขียนข้อมูลอย่างต่อเนื่องใน background
    let isWriting = true;
    let writeCount = 0;
    const backgroundWriter = async () => {
      while (isWriting) {
        writeCount++;
        liveDb.exec(`INSERT INTO work_orders (wo_no, created_at) VALUES ('WO-${writeCount}', '${new Date().toISOString()}');`);
        await new Promise((r) => setTimeout(r, 4));
      }
    };
    const writerPromise = backgroundWriter();

    // รอให้มีการเขียนเริ่มขึ้น
    await new Promise((r) => setTimeout(r, 25));

    // ทำ Consistent Backup ด้วย VACUUM INTO ขณะที่มีการเขียนพร้อมกัน
    createConsistentSqliteBackup(liveDbPath, bkpDbPath);

    // หยุด background writer
    isWriting = false;
    await writerPromise;
    liveDb.close();

    // ตรวจสอบความสมบูรณ์ของไฟล์ Backup ที่กู้คืนมาด้วย SQLite Engine จริง
    const verifyResult = verifySqliteBackupIntegrity(bkpDbPath);
    expect(verifyResult.integrity).toBe('ok');
    expect(verifyResult.tableCount).toBeGreaterThanOrEqual(1);

    // เปิด Backup Query ดูข้อมูล
    const bkpDb = new DatabaseSync(bkpDbPath, { readOnly: true });
    const countRow = bkpDb.prepare('SELECT count(*) as count FROM work_orders;').all();
    expect(countRow[0].count).toBeGreaterThan(0);
    bkpDb.close();

    // ทำความสะอาด
    fs.unlinkSync(liveDbPath);
    if (fs.existsSync(`${liveDbPath}-wal`)) fs.unlinkSync(`${liveDbPath}-wal`);
    if (fs.existsSync(`${liveDbPath}-shm`)) fs.unlinkSync(`${liveDbPath}-shm`);
    fs.unlinkSync(bkpDbPath);
  });

  it('4. P0 Audit Concurrency & Durability: ทดสอบ Child Processes จริง 5 ตัวเขียน Audit พร้อมกันโดยไม่สูญหายและตรงกัน 100%', async () => {
    const safeScriptUrl = pathToFileURL(safeMigrateScript).href;
    const processCount = 5;
    const writesPerProcess = 3;
    const totalExpected = processCount * writesPerProcess;

    const childPromises = [];
    for (let p = 0; p < processCount; p++) {
      childPromises.push(new Promise((resolve, reject) => {
        const cp = spawn(process.execPath, [
          '--input-type=module',
          '-e',
          `
          import { saveAuditRecord } from '${safeScriptUrl}';
          for (let i = 0; i < ${writesPerProcess}; i++) {
            saveAuditRecord({
              run_id: 'RUN-PROC' + ${p} + '-ITEM' + i,
              event_id: 'EVT-PROC' + ${p} + '-ITEM' + i,
              operator: 'worker_${p}',
              result: 'SUCCESS',
              process_id: ${p},
              item_id: i
            }, ${JSON.stringify(testAuditPath)});
          }
          `
        ]);

        let stderr = '';
        cp.stderr.on('data', (d) => stderr += d.toString());
        cp.on('exit', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Child Process ${p} failed with exit code ${code}: ${stderr}`));
        });
      }));
    }

    await Promise.all(childPromises);

    // ตรวจสอบไฟล์ Audit JSON
    expect(fs.existsSync(testAuditPath)).toBe(true);
    const records = JSON.parse(fs.readFileSync(testAuditPath, 'utf-8'));
    expect(Array.isArray(records)).toBe(true);
    expect(records.length).toBe(totalExpected);

    // ตรวจสอบไฟล์ Audit JSONL
    const jsonlPath = testAuditPath.replace(/\.json$/, '.jsonl');
    expect(fs.existsSync(jsonlPath)).toBe(true);
    const lines = fs.readFileSync(jsonlPath, 'utf-8').trim().split('\n');
    expect(lines.length).toBe(totalExpected);

    // ตรวจสอบความสอดคล้อง 1-to-1 ระหว่าง JSON และ JSONL (ห้ามมีข้อมูลตกหล่นหรือคลาดเคลื่อน)
    const jsonRunIds = records.map((r) => r.run_id).sort();
    const jsonlRunIds = lines.map((l) => JSON.parse(l).run_id).sort();
    expect(jsonRunIds).toEqual(jsonlRunIds);

    // ตรวจสอบว่าบันทึกครบทุก Process จาก 0 ถึง 4
    for (let p = 0; p < processCount; p++) {
      for (let i = 0; i < writesPerProcess; i++) {
        expect(records.some((r) => r.run_id === `RUN-PROC${p}-ITEM${i}`)).toBe(true);
      }
    }
  });

  it('5. P0.3 Audit Evidence Fail-Closed: ไฟล์ Audit เสียหาย ต้องรักษาหลักฐานเดิมและปฏิเสธการเขียนทับ', () => {
    const corruptedContent = '{"run_id": "CRITICAL_PAST_RUN", "truncated_json": true, "corrupt';
    fs.writeFileSync(testAuditPath, corruptedContent, 'utf-8');

    expect(() => {
      saveAuditRecord({
        run_id: 'ATTEMPT_OVERWRITE_RUN',
        operator: 'operator_test',
        result: 'SUCCESS'
      }, testAuditPath);
    }).toThrow(/Audit Trail Integrity Error.*มีรูปแบบเสียหายหรือไม่สมบูรณ์/);

    const contentAfter = fs.readFileSync(testAuditPath, 'utf-8');
    expect(contentAfter).toBe(corruptedContent);
  });

  it('6. P0.3 Non-Repudiation: ห้ามแก้ไขทับ Record เดิมที่มี run_id และ event_id ซ้ำกัน', () => {
    const fixedRunId = 'RUN-FINAL-999';
    const fixedEventId = 'EVT-FIXED-001';

    saveAuditRecord({
      run_id: fixedRunId,
      event_id: fixedEventId,
      result: 'SUCCESS',
      operator: 'admin'
    }, testAuditPath);

    expect(() => {
      saveAuditRecord({
        run_id: fixedRunId,
        event_id: fixedEventId,
        result: 'SUCCESS',
        operator: 'tampered_admin'
      }, testAuditPath);
    }).toThrow(/Audit Integrity Error.*ซ้ำ/);
  });

  it('7. P1 End-to-End Audit Failure Safety: ตรวจสอบความพร้อมของ Audit Storage ก่อนเริ่ม Migration (ห้ามเริ่มหาก Audit เสียหาย)', async () => {
    // เขียนไฟล์ Audit เสียหายไว้ล่วงหน้า
    fs.writeFileSync(testAuditPath, 'CORRUPTED_NON_JSON_CONTENT', 'utf-8');

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
        auditPath: testAuditPath
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).not.toBeNull();
    expect(caught.exitCode).toBe(1);
    expect(caught.message).toContain('audit_storage_readiness');
    expect(caught.message).toContain('Audit Storage Readiness Error');
  });

  it('8. P1 Post-Migration Failure Reality Recording: บันทึกสถานะ FAILED_POST_APPLY_UNVERIFIED และ database_mutated=true', async () => {
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
    expect(caught.message).toContain('post_migration_verification');

    // ตรวจสอบว่า Audit Record บันทึกสถานะตามความเป็นจริง
    const records = JSON.parse(fs.readFileSync(testAuditPath, 'utf-8'));
    const failureRecord = records[0];
    expect(failureRecord.result).toBe('FAILED_POST_APPLY_UNVERIFIED');
    expect(failureRecord.database_mutated).toBe(true);
    expect(failureRecord.rollback_status).toBe('NOT_PERFORMED');
  });

  it('9. P0 Remote Restore Evidence: ระงับการรัน Remote หากไม่มีหลักฐาน Restore Drill ที่ตรวจสอบได้ หรือหลักฐานไม่ตรงเป้าหมาย', async () => {
    // 9.1 ไม่มีหลักฐาน Restore Drill
    let caughtNoEvidence = null;
    try {
      await runSafeMigrationWorkflow([
        '--remote',
        '--database', 'DB',
        '--backup-ref', 'SNAP-20261102-001',
        '--confirm-migration'
      ], {
        mockDb: cleanMockDb,
        isTestRunner: true,
        isTestHarness: true,
        auditPath: testAuditPath
      });
    } catch (err) {
      caughtNoEvidence = err;
    }

    expect(caughtNoEvidence).not.toBeNull();
    expect(caughtNoEvidence.exitCode).toBe(1);
    expect(caughtNoEvidence.message).toContain('restore_verification');
    expect(caughtNoEvidence.message).toContain('ไม่พบหลักฐานการซักซ้อมกู้คืนจริง');

    // 9.2 มีหลักฐานแต่ Database ID ไม่ตรงเป้าหมาย
    let caughtMismatched = null;
    try {
      await runSafeMigrationWorkflow([
        '--remote',
        '--database', 'DB',
        '--backup-ref', 'SNAP-20261102-001',
        '--confirm-migration'
      ], {
        mockDb: cleanMockDb,
        isTestRunner: true,
        isTestHarness: true,
        auditPath: testAuditPath,
        verifiedRestoreDrill: generateTrustedDrillEvidence({
          issuer: 'vcc-automated-restore-drill-service',
          database_id: 'WRONG-DATABASE-UUID',
          environment: 'production',
          recovery_point: 'SNAP-20261102-001',
          drill_status: 'SUCCESS',
          integrity_check: 'ok',
          tested_at: new Date().toISOString()
        })
      });
    } catch (err) {
      caughtMismatched = err;
    }

    expect(caughtMismatched).not.toBeNull();
    expect(caughtMismatched.exitCode).toBe(1);
    expect(caughtMismatched.message).toContain('หลักฐาน Restore Drill ไม่ตรงกับเป้าหมาย');
  });

  it('10. P0 Remote Restore Evidence: ผ่านการตรวจสอบเมื่อมีหลักฐาน Restore Drill ที่ถูกต้อง ครบถ้วน ลายเซ็นสมบูรณ์ และตรงกับเป้าหมาย', async () => {
    const rawDrill = {
      issuer: 'vcc-automated-restore-drill-service',
      database_id: '05a8bae0-70de-4bfc-bc74-4a8971b307e0',
      environment: 'production',
      recovery_point: 'SNAP-20261102-VALID',
      drill_status: 'SUCCESS',
      integrity_check: 'ok',
      tested_at: new Date().toISOString()
    };
    const validDrillEvidence = generateTrustedDrillEvidence(rawDrill);

    const mockValidDb = {
      prepare: (sql) => ({
        first: async () => {
          if (sql.includes('is_alive')) return { is_alive: 1 };
          if (sql.includes('sqlite_master')) return { name: 'valid_item' };
          if (sql.includes('effective_status')) return { cnt: 0 };
          return { is_alive: 1, 1: 1, total: 0, approved_count: 0, current_count: 0, cnt: 0 };
        },
        all: async () => []
      })
    };

    const result = await runSafeMigrationWorkflow([
      '--remote',
      '--database', 'DB',
      '--backup-ref', 'SNAP-20261102-VALID',
      '--confirm-migration'
    ], {
      mockDb: mockValidDb,
      isTestRunner: true,
      isTestHarness: true,
      auditPath: testAuditPath,
      mockPlanResult: { status: 0, stdout: '0033_vcc_plan_revision_control.sql' },
      mockApplyResult: { status: 0, stdout: 'Applied' },
      verifiedRestoreDrill: validDrillEvidence
    });

    expect(result.result).toBe('SUCCESS');
    expect(result.backup_reference.restore_tested).toBe(true);
    expect(result.backup_reference.drill_evidence.recovery_point).toBe('SNAP-20261102-VALID');
    expect(result.backup_reference.drill_evidence.issuer).toBe('vcc-automated-restore-drill-service');
    expect(result.backup_reference.drill_evidence.signature).toBeTruthy();
  });

  it('10.1 P0 Remote Restore Evidence: ปฏิเสธหลักฐานที่ไม่มีลายเซ็น ลายเซ็นผิด หรือสร้างขึ้นเองโดยไม่ผ่านระบบที่เชื่อถือได้ (Fail-Closed)', async () => {
    const mockValidDb = {
      prepare: () => ({
        first: async () => ({ is_alive: 1 }),
        all: async () => []
      })
    };

    // Case A: Unsigned / Self-created evidence (no signature field)
    const unsignedEvidence = {
      database_id: '05a8bae0-70de-4bfc-bc74-4a8971b307e0',
      environment: 'production',
      recovery_point: 'SNAP-20261102-VALID',
      drill_status: 'SUCCESS',
      integrity_check: 'ok',
      tested_at: new Date().toISOString()
    };

    let caughtUnsigned = null;
    try {
      await runSafeMigrationWorkflow([
        '--remote',
        '--database', 'DB',
        '--backup-ref', 'SNAP-20261102-VALID',
        '--confirm-migration'
      ], {
        mockDb: mockValidDb,
        isTestRunner: true,
        isTestHarness: true,
        auditPath: testAuditPath,
        verifiedRestoreDrill: unsignedEvidence
      });
    } catch (err) {
      caughtUnsigned = err;
    }

    expect(caughtUnsigned).not.toBeNull();
    expect(caughtUnsigned.message).toContain('ไม่พบลายเซ็นดิจิทัล');

    // Case B: Tampered / Modified payload with forged signature
    const validEvidence = generateTrustedDrillEvidence({
      issuer: 'vcc-automated-restore-drill-service',
      database_id: '05a8bae0-70de-4bfc-bc74-4a8971b307e0',
      environment: 'production',
      recovery_point: 'SNAP-20261102-VALID',
      drill_status: 'SUCCESS',
      integrity_check: 'ok',
      tested_at: new Date().toISOString()
    });

    const tamperedEvidence = {
      ...validEvidence,
      recovery_point: 'SNAP-FORGED-POINT' // Tamper recovery point after signing!
    };

    let caughtTampered = null;
    try {
      await runSafeMigrationWorkflow([
        '--remote',
        '--database', 'DB',
        '--backup-ref', 'SNAP-FORGED-POINT',
        '--confirm-migration'
      ], {
        mockDb: mockValidDb,
        isTestRunner: true,
        isTestHarness: true,
        auditPath: testAuditPath,
        verifiedRestoreDrill: tamperedEvidence
      });
    } catch (err) {
      caughtTampered = err;
    }

    expect(caughtTampered).not.toBeNull();
    expect(caughtTampered.message).toContain('ลายเซ็นดิจิทัล (HMAC-SHA256) ไม่ตรงกับข้อมูลหลักฐาน');
  });

  it('11. P0 Remote Restore Evidence: แฟล็ก --remote-restore-verified บน CLI ถูกปฏิเสธด้วย SECURITY VIOLATION', () => {
    const proc = spawnSync(process.execPath, [
      safeMigrateScript,
      '--remote',
      '--database', 'DB',
      '--remote-restore-verified'
    ], { cwd: apiDir, encoding: 'utf-8' });

    expect(proc.status).toBe(1);
    expect(proc.stderr).toContain('SECURITY VIOLATION');
    expect(proc.stderr).toContain('ไม่อนุญาตให้ใช้แฟล็ก --remote-restore-verified');
  });

  it('12. P1.2 Production Safety: แฟล็กจำลอง (--simulate-*) บน CLI ถูกปฏิเสธด้วย SECURITY VIOLATION', () => {
    const proc = spawnSync(process.execPath, [
      safeMigrateScript,
      '--local',
      '--simulate-apply-failure'
    ], { cwd: apiDir, encoding: 'utf-8' });

    expect(proc.status).toBe(1);
    expect(proc.stderr).toContain('SECURITY VIOLATION');
    expect(proc.stderr).toContain('ไม่อนุญาตให้ใช้แฟล็กจำลองความล้มเหลว (--simulate-*) ในคำสั่งจริง');
  });

  it('13. P0.3 & P1.2 Operator Confirmation Gate: CI=true ไม่สามารถอนุมัติ Production Migration แทนคนได้', async () => {
    let caught = null;
    try {
      await runSafeMigrationWorkflow([
        '--local',
        '--database', 'DB'
        // deliberate omission of --confirm-migration
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
    expect(caught.message).toContain('CI ไม่สามารถอนุมัติแทนได้');
  });

  it('14. P1.2 Raw Migration Guard: ป้องกันการ Bypass รัน Raw Migration ใน Remote และ Production', () => {
    const procRemote = spawnSync(process.execPath, [rawMigrateScript, '--remote'], {
      cwd: apiDir,
      encoding: 'utf-8'
    });
    expect(procRemote.status).toBe(1);
    const outRemote = procRemote.stderr || procRemote.stdout;
    expect(outRemote).toContain('SECURITY VIOLATION');
    expect(outRemote).toContain('ห้ามรัน Raw Migration บน Remote หรือ Production เด็ดขาด');

    const procProd = spawnSync(process.execPath, [rawMigrateScript, '--env', 'production'], {
      cwd: apiDir,
      encoding: 'utf-8'
    });
    expect(procProd.status).toBe(1);
    const outProd = procProd.stderr || procProd.stdout;
    expect(outProd).toContain('SECURITY VIOLATION');
    expect(outProd).toContain('ห้ามรัน Raw Migration บน Remote หรือ Production เด็ดขาด');
  });

  it('15. P0.4 Real Concurrent Backup: VACUUM INTO ทำงานควบคู่กับ Separate OS Process Writer ใน WAL Mode โดยไม่เกิด Corruption', async () => {
    const tempDir = path.resolve(apiDir, `.wrangler/test-wal-concurrent-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const sourceDb = path.resolve(tempDir, 'source.sqlite');
    const backupDb = path.resolve(tempDir, 'backup.sqlite');
    const stopSignalFile = path.resolve(tempDir, 'stop.signal');

    // Initialize source database in WAL mode with initial dataset
    const initDb = new DatabaseSync(sourceDb);
    initDb.exec('PRAGMA journal_mode = WAL;');
    initDb.exec('CREATE TABLE metrics (id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT, created_at TEXT);');
    for (let i = 0; i < 50; i++) {
      initDb.exec(`INSERT INTO metrics (payload, created_at) VALUES ('initial-record-${i}', '${new Date().toISOString()}');`);
    }
    initDb.close();

    // Spawn a REAL separate OS process writer that writes transactions continuously in WAL mode
    const writerScript = `
      import { DatabaseSync } from 'node:sqlite';
      import fs from 'node:fs';

      const dbPath = process.argv[2];
      const stopSignal = process.argv[3];
      const db = new DatabaseSync(dbPath);
      db.exec('PRAGMA busy_timeout = 5000;');

      let count = 0;
      while (!fs.existsSync(stopSignal) && count < 200) {
        try {
          db.exec('BEGIN IMMEDIATE;');
          db.exec("INSERT INTO metrics (payload, created_at) VALUES ('concurrent-write-" + count + "', '" + new Date().toISOString() + "');");
          db.exec('COMMIT;');
          count++;
        } catch (e) {
          try { db.exec('ROLLBACK;'); } catch {}
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
      }
      db.close();
      process.exit(0);
    `;

    const writerFile = path.resolve(tempDir, 'writer.mjs');
    fs.writeFileSync(writerFile, writerScript, 'utf-8');

    const writerProcess = spawn(process.execPath, [writerFile, sourceDb, stopSignalFile], {
      stdio: 'ignore'
    });

    // Wait a brief moment for the writer process to be actively inserting
    await new Promise((r) => setTimeout(r, 60));

    // Execute VACUUM INTO concurrently while separate OS process is writing
    expect(() => {
      createConsistentSqliteBackup(sourceDb, backupDb);
    }).not.toThrow();

    // Signal writer process to stop and wait for it
    fs.writeFileSync(stopSignalFile, 'STOP', 'utf-8');
    await new Promise((resolve) => {
      writerProcess.on('exit', resolve);
      setTimeout(() => {
        try { writerProcess.kill(); } catch {}
        resolve();
      }, 5000);
    });

    // Deep SQLite Restore Verification on the concurrent backup
    const integrityResult = verifySqliteBackupIntegrity(backupDb);
    expect(integrityResult.integrity).toBe('ok');
    expect(integrityResult.tableCount).toBeGreaterThanOrEqual(1);

    // Verify data inside backup is readable, integral, and matches snapshot consistency
    const verifyDb = new DatabaseSync(backupDb, { readOnly: true });
    const countRow = verifyDb.prepare('SELECT count(*) as count FROM metrics').all();
    expect(countRow[0].count).toBeGreaterThanOrEqual(50);
    verifyDb.close();

    // Cleanup
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  it('16. P0.5 Stale Lock Safety: ไม่ทำลาย Lock หาก Process เจ้าของยังคงทำงานอยู่จริง (isProcessAlive)', () => {
    const lockDir = `${testAuditPath}.lock`;
    const ownerFile = path.resolve(lockDir, 'owner.json');
    fs.mkdirSync(lockDir, { recursive: true });

    // Set lock owner to CURRENT PROCESS PID (which is definitely running!) and set mtime to 60s ago
    fs.writeFileSync(ownerFile, JSON.stringify({
      pid: process.pid,
      created_at: Date.now() - 60000
    }), 'utf-8');

    // Also set mtime of directory to 60s ago
    const pastTime = (Date.now() - 60000) / 1000;
    fs.utimesSync(lockDir, pastTime, pastTime);

    // Try to acquire lock with short timeout (150ms)
    // Because owner process (process.pid) is STILL ALIVE, the lock MUST NOT be broken!
    let caughtLockErr = null;
    try {
      withAuditLock(testAuditPath, () => {
        return 'ACQUIRED';
      }, 150);
    } catch (err) {
      caughtLockErr = err;
    }

    expect(caughtLockErr).not.toBeNull();
    expect(caughtLockErr.message).toContain('ไม่สามารถขอรับ Lock');
    // Lock directory still exists because it was NOT destroyed
    expect(fs.existsSync(lockDir)).toBe(true);

    // Cleanup
    try {
      if (fs.existsSync(ownerFile)) fs.unlinkSync(ownerFile);
      fs.rmSync(lockDir, { recursive: true, force: true });
    } catch {}
  });

  it('17. P0.5 Partial Apply Failure: บันทึก FAILED_PARTIAL_APPLY และ database_mutated = true เมื่อเกิดความล้มเหลวระหว่างทาง', async () => {
    let migrationCalls = 0;
    const mockDbWithMigrations = {
      prepare: (sql) => ({
        first: async () => {
          if (sql.includes('is_alive')) return { is_alive: 1 };
          if (sql.includes('sqlite_master')) return { name: 'vcc_annual_plans' };
          if (sql.includes('d1_migrations')) {
            migrationCalls++;
            return { count: migrationCalls === 1 ? 3 : 5 };
          }
          return { is_alive: 1, 1: 1, total: 0, approved_count: 0, current_count: 0, cnt: 0 };
        },
        all: async () => []
      })
    };

    let caught = null;
    try {
      await runSafeMigrationWorkflow([
        '--local',
        '--database', 'DB',
        '--confirm-migration'
      ], {
        mockDb: mockDbWithMigrations,
        isTestRunner: true,
        isTestHarness: true,
        auditPath: testAuditPath,
        mockPlanResult: { status: 0, stdout: '0033_vcc_plan_revision_control.sql\n0034_vcc_plan_historical.sql' },
        mockApplyResult: { status: 1, stderr: 'D1 error at migration 0034: constraint failed' }
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).not.toBeNull();
    expect(caught.auditRecord.result).toBe('FAILED_PARTIAL_APPLY');
    expect(caught.auditRecord.database_mutated).toBe(true);
    expect(caught.auditRecord.rollback_status).toBe('NOT_PERFORMED');
    expect(caught.auditRecord.failure_evidence.details.initial_migrations).toBe(3);
    expect(caught.auditRecord.failure_evidence.details.post_failure_migrations).toBe(5);

    // Verify stored audit file reflects this
    const stored = JSON.parse(fs.readFileSync(testAuditPath, 'utf-8'));
    const finalRecord = stored[stored.length - 1];
    expect(finalRecord.result).toBe('FAILED_PARTIAL_APPLY');
    expect(finalRecord.database_mutated).toBe(true);
    expect(finalRecord.rollback_status).toBe('NOT_PERFORMED');
  });
});
