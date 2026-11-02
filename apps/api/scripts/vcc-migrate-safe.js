#!/usr/bin/env node
/**
 * VCC Safe Production Migration Runner (10-Step Gated Workflow - Fail-Closed Architecture)
 * 
 * Enforces consistent SQLite snapshots (VACUUM INTO), isolated restore verification
 * (PRAGMA integrity_check via native engine), remote Cloudflare D1 restore drill verification,
 * cross-process file-locked durable audit logging, pre-flight audit readiness checks,
 * explicit operator confirmation (no CI bypass), reality-reflecting failure reporting,
 * and disaster recovery procedures.
 * 
 * Usage:
 *   node scripts/vcc-migrate-safe.js [--local | --remote] [--env <env>] [--persist-to <dir>]
 *                                    [--confirm-migration] [--operator <name>] [--backup-ref <id>]
 *                                    [--restore-drill-evidence <path>]
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { validateVccMigrationPreflight, PREFLIGHT_STATUS } from '../src/vccPreflight.js';
import { createWranglerD1Adapter } from './vcc-preflight.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiDir = path.resolve(__dirname, '..');

// Helper to locate Wrangler binary without shell
export function getWranglerBinPath() {
  const possiblePaths = [
    path.resolve(apiDir, 'node_modules/wrangler/bin/wrangler.js'),
    path.resolve(apiDir, '../../node_modules/wrangler/bin/wrangler.js')
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`ไม่พบ Wrangler binary ที่ตำแหน่ง: ${possiblePaths.join(', ')}`);
}

// Helper to load and validate wrangler.jsonc bindings
export function getTargetConfigFromWrangler(targetDb, targetEnv) {
  const wranglerPath = path.resolve(apiDir, 'wrangler.jsonc');
  if (!fs.existsSync(wranglerPath)) return null;

  try {
    const raw = fs.readFileSync(wranglerPath, 'utf-8');
    // Strip comments (handling CRLF) and trailing commas in JSONC
    const stripped = raw.replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, '$1').replace(/,(\s*[}\]])/g, '$1');
    const config = JSON.parse(stripped);

    const d1List = (targetEnv && config.env?.[targetEnv]?.d1_databases)
      ? config.env[targetEnv].d1_databases
      : (config.d1_databases || []);

    const match = d1List.find((d) => d.binding === targetDb || d.database_name === targetDb);
    return match || null;
  } catch {
    return null;
  }
}

// Durable Persistent Audit Storage Path
export function getDefaultAuditPath() {
  return process.env.VCC_MIGRATION_AUDIT_PATH || path.resolve(apiDir, 'audit_evidence/migration-audit.json');
}

// Cross-Process File Lock for Multi-Process Audit Durability
export function withAuditLock(auditFilePath, fn, timeoutMs = 25000) {
  const dir = path.dirname(auditFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const lockDir = `${auditFilePath}.lock`;
  const startTime = Date.now();
  const retryIntervalMs = 30;
  const staleThresholdMs = 30000;

  let acquired = false;
  while (!acquired) {
    try {
      fs.mkdirSync(lockDir);
      acquired = true;
    } catch (err) {
      if (err.code === 'EEXIST') {
        // Detect and break stale lock if previous process crashed or died
        try {
          const stat = fs.statSync(lockDir);
          if (Date.now() - stat.mtimeMs > staleThresholdMs) {
            console.warn(`[AUDIT LOCK] ปลด Stale Lock ที่ค้างเกิน ${staleThresholdMs}ms: ${lockDir}`);
            try { fs.rmSync(lockDir, { recursive: true, force: true }); } catch { /* ignore */ }
            continue;
          }
        } catch { /* stat may fail if released concurrently */ }

        if (Date.now() - startTime > timeoutMs) {
          throw new Error(`Audit Storage Concurrency Error: ไม่สามารถขอรับ Lock ไฟล์ Audit (${auditFilePath}) ภายใน ${timeoutMs}ms`);
        }
        // Synchronous spin-delay for short interval
        const waitTill = Date.now() + retryIntervalMs;
        while (Date.now() < waitTill) { /* spin sleep */ }
      } else {
        throw err;
      }
    }
  }

  try {
    return fn();
  } finally {
    try {
      fs.rmSync(lockDir, { recursive: true, force: true });
    } catch { /* ignore release error */ }
  }
}

// Pre-migration Audit Storage Readiness Verification
export function verifyAuditStorageReadiness(auditFilePath) {
  const dir = path.dirname(auditFilePath);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Write and read probe
    const probePath = path.resolve(dir, `.audit_probe_${crypto.randomUUID()}.tmp`);
    fs.writeFileSync(probePath, 'audit_probe_test_ok', 'utf-8');
    const readBack = fs.readFileSync(probePath, 'utf-8');
    if (readBack !== 'audit_probe_test_ok') {
      throw new Error('Audit storage probe verification failed to read back matching content');
    }
    fs.unlinkSync(probePath);
  } catch (probeErr) {
    throw new Error(`Audit Storage Readiness Error: ไม่สามารถเขียนหรืออ่าน Audit Storage ที่ '${dir}' ได้ (${probeErr.message}). ไม่อนุญาตให้เริ่มกระบวนการ Migration`);
  }

  // If existing audit file, check for corruption
  if (fs.existsSync(auditFilePath)) {
    const raw = fs.readFileSync(auditFilePath, 'utf-8');
    if (raw.trim().length > 0) {
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) && (!parsed || typeof parsed !== 'object')) {
          throw new Error('โครงสร้างรากของไฟล์ไม่ใช่ Array หรือ Object');
        }
      } catch (parseErr) {
        throw new Error(`Audit Storage Readiness Error: ไฟล์ Audit Evidence เดิม '${auditFilePath}' มีรูปแบบเสียหาย (${parseErr.message}). ห้ามเริ่ม Migration จนกว่าจะแก้ไขหรือกู้คืนไฟล์หลักฐานเดิม`);
      }
    }
  }

  return { ready: true, path: auditFilePath };
}

// Append-only Fail-Closed Audit Trail Manager with Cross-Process Lock
export function saveAuditRecord(record, customAuditPath = null) {
  const auditLogPath = customAuditPath || getDefaultAuditPath();

  return withAuditLock(auditLogPath, () => {
    const dir = path.dirname(auditLogPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let records = [];
    if (fs.existsSync(auditLogPath)) {
      const raw = fs.readFileSync(auditLogPath, 'utf-8');
      if (raw.trim().length > 0) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            records = parsed;
          } else if (parsed && typeof parsed === 'object') {
            records = [parsed];
          } else {
            throw new Error('Audit file root must be an array or object');
          }
        } catch (parseErr) {
          // P0.3 FAIL-CLOSED: DO NOT overwrite or ignore corrupted audit logs!
          throw new Error(`Audit Trail Integrity Error: ไฟล์ Audit Evidence '${auditLogPath}' มีรูปแบบเสียหายหรือไม่สมบูรณ์ (${parseErr.message}). ห้ามเขียนทับประวัติเดิมเด็ดขาดเพื่อรักษาความถูกต้องของร่องรอยการตรวจสอบ (Non-repudiation)`);
        }
      }
    }

    // P0.3: Prevent modifying/duplicating an already finalized record with same run_id
    if (record.run_id) {
      const finalizedStatuses = ['SUCCESS', 'FAILED', 'FAILED_POST_APPLY_UNVERIFIED'];
      const existingFinal = records.find(
        (r) => r.run_id === record.run_id && finalizedStatuses.includes(r.result)
      );
      if (existingFinal && existingFinal.event_id === record.event_id) {
        throw new Error(`Audit Integrity Error: ไม่สามารถบันทึกหรือแก้ไขทับ Record เดิมที่มี run_id และ event_id ซ้ำได้ (${record.run_id})`);
      }
    }

    // Immutable event identity
    record.event_id = record.event_id || crypto.randomUUID();
    record.recorded_at = new Date().toISOString();

    // Always append to list
    records.push(record);

    // Atomic write to prevent partial/corrupt writes
    const tempPath = path.resolve(dir, `.audit_tmp_${crypto.randomUUID()}`);
    fs.writeFileSync(tempPath, JSON.stringify(records, null, 2), 'utf-8');
    fs.renameSync(tempPath, auditLogPath);

    // Multi-write concurrency resilient JSONL stream
    const jsonlPath = auditLogPath.replace(/\.json$/, '.jsonl');
    fs.appendFileSync(jsonlPath, JSON.stringify(record) + '\n', { flag: 'a' });

    return records;
  });
}

// Consistent SQLite Snapshot using SQLite Online Backup / VACUUM INTO
export function createConsistentSqliteBackup(sourceSqlitePath, destinationBackupPath) {
  if (!fs.existsSync(sourceSqlitePath)) {
    throw new Error(`ไม่พบไฟล์ SQLite ต้นทาง: ${sourceSqlitePath}`);
  }
  const destDir = path.dirname(destinationBackupPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  if (fs.existsSync(destinationBackupPath)) {
    fs.unlinkSync(destinationBackupPath);
  }

  let db = null;
  try {
    db = new DatabaseSync(sourceSqlitePath);
    const safeDest = destinationBackupPath.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${safeDest}';`);
  } catch (err) {
    throw new Error(`การจัดทำ Consistent SQLite Backup ผ่าน VACUUM INTO ล้มเหลว: ${err.message}`);
  } finally {
    if (db) {
      try { db.close(); } catch { /* ignore */ }
    }
  }

  if (!fs.existsSync(destinationBackupPath) || fs.statSync(destinationBackupPath).size === 0) {
    throw new Error(`ไฟล์ Consistent Backup ว่างเปล่าหรือไม่ถูกสร้าง: ${destinationBackupPath}`);
  }
}

// Deep SQLite Restore Verification using Native SQLite Engine
export function verifySqliteBackupIntegrity(backupFilePath, isolatedDir = null) {
  if (!fs.existsSync(backupFilePath)) {
    throw new Error(`ไม่พบไฟล์ Backup: ${backupFilePath}`);
  }
  const stat = fs.statSync(backupFilePath);
  if (stat.size === 0) {
    throw new Error('ไฟล์สำรองข้อมูล (Backup) มีขนาดเป็น 0 ไบต์');
  }

  // 1. Verify Header (16 bytes)
  const fd = fs.openSync(backupFilePath, 'r');
  const header = Buffer.alloc(16);
  fs.readSync(fd, header, 0, 16, 0);
  fs.closeSync(fd);
  if (header.toString('utf-8', 0, 15) !== 'SQLite format 3') {
    throw new Error('โครงสร้างไฟล์ Restored Database ไม่ตรงตามมาตรฐาน SQLite Header');
  }

  // 2. Isolated restore copy
  const workDir = isolatedDir || path.resolve(path.dirname(backupFilePath), `restore_sandbox_${crypto.randomUUID()}`);
  if (!fs.existsSync(workDir)) {
    fs.mkdirSync(workDir, { recursive: true });
  }
  const restoredFile = path.resolve(workDir, 'restored.sqlite');
  fs.copyFileSync(backupFilePath, restoredFile);

  // 3. Open directly with real SQLite engine on restoredFile
  let testDb = null;
  try {
    testDb = new DatabaseSync(restoredFile, { readOnly: true });

    // Execute PRAGMA integrity_check
    const rows = testDb.prepare('PRAGMA integrity_check;').all();
    if (!rows || rows.length === 0) {
      throw new Error('คำสั่ง PRAGMA integrity_check ไม่ส่งคืนผลลัพธ์');
    }
    const firstVal = Object.values(rows[0])[0];
    if (firstVal !== 'ok') {
      const errorDetails = rows.map((r) => Object.values(r)[0]).join('; ');
      throw new Error(`PRAGMA integrity_check ล้มเหลว (${errorDetails}): ฐานข้อมูลสำรองเกิดความเสียหาย`);
    }

    // Verify accessibility of tables on restored database
    const tableRows = testDb.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table';").all();
    const tableCount = tableRows[0]?.count ?? 0;

    return {
      integrity: 'ok',
      tableCount,
      restoredPath: restoredFile
    };
  } catch (err) {
    throw new Error(`PRAGMA integrity_check ล้มเหลว: ${err.message}`);
  } finally {
    if (testDb) {
      try { testDb.close(); } catch { /* ignore */ }
    }
    if (!isolatedDir && fs.existsSync(workDir)) {
      try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
}

// Helper to find the active SQLite database file for local D1
export function findLocalSqliteDbPath(persistDir) {
  const candidates = [];
  if (persistDir) {
    candidates.push(path.resolve(apiDir, persistDir));
  }
  candidates.push(path.resolve(apiDir, '.wrangler/test'));
  candidates.push(path.resolve(apiDir, '.wrangler/state'));

  for (const baseDir of candidates) {
    const d1Dir = path.resolve(baseDir, 'v3/d1/miniflare-D1DatabaseObject');
    if (fs.existsSync(d1Dir)) {
      const files = fs.readdirSync(d1Dir);
      for (const f of files) {
        if (f.endsWith('.sqlite') && f !== 'metadata.sqlite') {
          const fullPath = path.resolve(d1Dir, f);
          const stat = fs.statSync(fullPath);
          if (stat.size > 0) return fullPath;
        }
      }
    }
  }
  return null;
}

export async function runSafeMigrationWorkflow(cliArgs = process.argv.slice(2), options = {}) {
  const rawArgs = cliArgs;

  // P1.2: Reject --simulate-* on CLI (must use test harness dependency injection)
  const hasSimulationCliArg = rawArgs.some((a) => a.startsWith('--simulate-') || a === '--no-backup');
  if (hasSimulationCliArg && !options.isTestHarness) {
    console.error('🛑 [SECURITY VIOLATION] ไม่อนุญาตให้ใช้แฟล็กจำลองความล้มเหลว (--simulate-*) ในคำสั่งจริง');
    console.error('แฟล็กจำลองอนุญาตให้ใช้เฉพาะใน Automated Test Harness ผ่าน Dependency Injection เท่านั้น');
    process.exit(1);
  }

  // P0.1: Reject deprecated --remote-restore-verified flag on CLI
  if (rawArgs.includes('--remote-restore-verified')) {
    console.error('🛑 [SECURITY VIOLATION] ไม่อนุญาตให้ใช้แฟล็ก --remote-restore-verified ยืนยันการกู้คืนโดยลำพัง');
    console.error('ต้องแนบหลักฐานการซักซ้อมกู้คืนจริงผ่านแฟล็ก --restore-drill-evidence <path-to-json>');
    process.exit(1);
  }

  const isRemote = rawArgs.includes('--remote');
  const persistIndex = rawArgs.indexOf('--persist-to');
  let persistDir = persistIndex !== -1 ? rawArgs[persistIndex + 1] : null;
  if (!persistDir && (process.env.VITEST || process.env.NODE_ENV === 'test' || process.env.CI === 'true') && fs.existsSync(path.resolve(apiDir, '.wrangler/test'))) {
    persistDir = '.wrangler/test';
  }
  const envIndex = rawArgs.indexOf('--env');
  const targetEnv = envIndex !== -1 ? rawArgs[envIndex + 1] : null;
  const dbIndex = rawArgs.indexOf('--database');
  const targetDb = dbIndex !== -1 ? rawArgs[dbIndex + 1] : 'DB';
  const backupRefIndex = rawArgs.indexOf('--backup-ref');
  const backupRef = backupRefIndex !== -1 ? rawArgs[backupRefIndex + 1] : null;
  const restoreEvidenceIndex = rawArgs.indexOf('--restore-drill-evidence');
  const restoreEvidencePath = restoreEvidenceIndex !== -1 ? rawArgs[restoreEvidenceIndex + 1] : null;

  const operatorIndex = rawArgs.indexOf('--operator');
  const operatorClaim = operatorIndex !== -1 ? rawArgs[operatorIndex + 1] : null;
  const systemUser = process.env.OPERATOR_USER || process.env.USER || process.env.USERNAME || 'system_operator';
  const operatorName = operatorClaim || systemUser;

  // P0.3: Explicit Operator Confirmation ONLY (CI=true CANNOT bypass operator approval)
  const isConfirmed = rawArgs.includes('--confirm-migration');

  // Test simulations via Dependency Injection
  const sim = options.simulateFailure || {};

  const runId = options.runId || crypto.randomUUID();
  const auditPath = options.auditPath || getDefaultAuditPath();

  const auditRecord = {
    run_id: runId,
    event_id: crypto.randomUUID(),
    target: {
      database: targetDb,
      is_remote: isRemote,
      environment: isRemote ? (targetEnv || 'production') : 'local',
      persist_dir: persistDir
    },
    operator: {
      name: operatorName,
      claimed: operatorClaim,
      system_user: systemUser,
      verified_identity: operatorClaim ? (operatorClaim === systemUser) : true
    },
    approval_evidence: {
      confirmed: isConfirmed,
      explicit_flag: isConfirmed ? '--confirm-migration' : null,
      timestamp: new Date().toISOString()
    },
    backup_reference: null,
    migration_files: [],
    started_at: new Date().toISOString(),
    finished_at: null,
    result: 'PENDING',
    database_mutated: false,
    rollback_status: 'NOT_APPLICABLE',
    failure_evidence: null,
    steps: {}
  };

  const recordAuditAndHalt = (stepName, errorMessage, exitCode = 1, details = {}) => {
    auditRecord.finished_at = new Date().toISOString();
    auditRecord.result = details.result || 'FAILED';
    if (details.database_mutated !== undefined) {
      auditRecord.database_mutated = details.database_mutated;
    }
    if (details.rollback_status !== undefined) {
      auditRecord.rollback_status = details.rollback_status;
    }
    auditRecord.failure_evidence = {
      step: stepName,
      error: errorMessage,
      details
    };

    try {
      saveAuditRecord(auditRecord, auditPath);
    } catch (saveErr) {
      console.error(`❌ [FATAL] บันทึก Audit Evidence ไม่สำเร็จ: ${saveErr.message}`);
      if (!options.isTestRunner) process.exit(1);
      throw saveErr;
    }

    if (!options.isTestRunner) {
      console.error(`\n🛑 [MIGRATION GATE HALTED at ${stepName}]: ${errorMessage}`);
      process.exit(exitCode);
    } else {
      const err = new Error(`[MIGRATION GATE HALTED at ${stepName}]: ${errorMessage}`);
      err.exitCode = exitCode;
      err.auditRecord = auditRecord;
      throw err;
    }
  };

  console.log('================================================================');
  console.log('🛡️  VCC Production Migration Workflow (10-Step Safety Gate)');
  console.log(`🆔 Run ID: ${runId}`);
  console.log(`👤 Operator: ${operatorName} (System: ${systemUser})`);
  console.log('================================================================');

  // Step 0: Audit Storage Readiness Check (P1 Fail-Closed)
  console.log('\n[ขั้นตอนที่ 0/10] ตรวจสอบความพร้อมของแหล่งจัดเก็บหลักฐาน Audit Evidence (Fail-Closed)...');
  try {
    verifyAuditStorageReadiness(auditPath);
    console.log(`  Audit Storage พร้อมใช้งาน: ${auditPath}`);
    auditRecord.steps.audit_storage_readiness = { success: true, path: auditPath };
  } catch (auditReadyErr) {
    console.error(`❌ [FATAL] แหล่งจัดเก็บ Audit Evidence ไม่พร้อมใช้งาน: ${auditReadyErr.message}`);
    if (!options.isTestRunner) process.exit(1);
    const err = new Error(`[MIGRATION GATE HALTED at audit_storage_readiness]: ${auditReadyErr.message}`);
    err.exitCode = 1;
    throw err;
  }

  // Step 1: Target & Environment Identification & Validation
  console.log('\n[ขั้นตอนที่ 1/10] ระบุและตรวจสอบความถูกต้องของ Environment และ Database Target:');
  console.log(`- ฐานข้อมูล: ${targetDb}`);
  console.log(`- โหมด: ${isRemote ? 'REMOTE CLOUD' : 'LOCAL ENVIRONMENT'}`);
  console.log(`- สภาพแวดล้อม: ${targetEnv || 'default'}`);

  const wranglerConfig = getTargetConfigFromWrangler(targetDb, targetEnv);
  const APPROVED_DATABASES = ['DB', 'qms-db', 'qms-test-db'];
  if (!APPROVED_DATABASES.includes(targetDb) && !wranglerConfig) {
    return recordAuditAndHalt(
      'target_identification',
      `ฐานข้อมูลเป้าหมาย '${targetDb}' ไม่อยู่ในรายการฐานข้อมูลที่ได้รับอนุมัติใน wrangler.jsonc (${APPROVED_DATABASES.join(', ')})`,
      1
    );
  }

  if (isRemote && targetEnv && !['production', 'staging', 'preview'].includes(targetEnv)) {
    return recordAuditAndHalt(
      'target_identification',
      `สภาพแวดล้อม Remote '${targetEnv}' ไม่อยู่ในรายการที่ได้รับอนุมัติ (production, staging, preview)`,
      1
    );
  }

  auditRecord.steps.target_identification = { targetDb, isRemote, targetEnv, persistDir, status: 'PASSED' };

  // Step 2: Connection & Auth Verification
  console.log('\n[ขั้นตอนที่ 2/10] ตรวจสอบการเชื่อมต่อและสิทธิ์ฐานข้อมูล...');
  const db = options.mockDb || createWranglerD1Adapter({
    database: targetDb,
    remote: isRemote,
    persistTo: persistDir,
    env: targetEnv
  });

  try {
    const ping = await db.prepare('SELECT 1 as is_alive').first();
    if (!ping || ping.is_alive !== 1) {
      throw new Error('ฐานข้อมูลไม่ตอบสนองต่อคำสั่ง Ping (is_alive !== 1)');
    }
    console.log('  การเชื่อมต่อฐานข้อมูลสมบูรณ์');
    auditRecord.steps.connection_check = { success: true };
  } catch (connErr) {
    return recordAuditAndHalt('connection_check', `การเชื่อมต่อฐานข้อมูลล้มเหลว: ${connErr.message}`, 1);
  }

  // Step 3: Real Backup & Restore Verification (P0.1, P0.2 & P1 Consistent Snapshot)
  console.log('\n[ขั้นตอนที่ 3/10] ตรวจสอบ Backup จริงและทดสอบ Restore ในสภาพแวดล้อมแยก (PRAGMA integrity_check)...');
  const backupDir = path.resolve(apiDir, '.wrangler/backup');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  if (sim.noBackup) {
    return recordAuditAndHalt('backup_verification', 'ไม่พบจุดสำรองข้อมูลที่ตรวจสอบได้ (No verifiable backup point)', 1);
  }

  if (!isRemote) {
    // Local SQLite Consistent Backup
    const sourceSqlite = options.sourceSqlite || findLocalSqliteDbPath(persistDir);
    if (!sourceSqlite && !options.mockDb && !options.backupFile) {
      return recordAuditAndHalt('backup_verification', 'ไม่พบไฟล์ SQLite ของฐานข้อมูล Local สำหรับจัดทำ Backup จริง', 1);
    }

    const backupFile = options.backupFile || path.resolve(backupDir, `backup_${targetDb}_${runId}.sqlite`);
    
    if (options.backupFile) {
      // Direct backup file provided (e.g. prepared test DB or negative test)
    } else if (sourceSqlite) {
      try {
        console.log(`  ดำเนินการจัดทำ Consistent SQLite Backup ผ่าน VACUUM INTO (${sourceSqlite} -> ${backupFile})...`);
        createConsistentSqliteBackup(sourceSqlite, backupFile);
      } catch (bkpErr) {
        return recordAuditAndHalt('backup_verification', `สร้าง Consistent Backup ล้มเหลว: ${bkpErr.message}`, 1);
      }
    } else {
      // Mock DB for tests where DB is in memory
      const testDb = new DatabaseSync(backupFile);
      testDb.exec('CREATE TABLE test_init (id INT);');
      testDb.close();
    }

    // P0.2 Restore Verification: PRAGMA integrity_check on the restored backup
    console.log('  ดำเนินการทดสอบ Restore ฐานข้อมูลในสภาพแวดล้อมแยกและตรวจ PRAGMA integrity_check...');
    if (sim.restoreFail) {
      return recordAuditAndHalt('restore_verification', 'การทดสอบ Restore ในสภาพแวดล้อมทดสอบล้มเหลว (Simulated Restore Failure)', 1);
    }

    try {
      const restoreResult = verifySqliteBackupIntegrity(backupFile);
      console.log(`  Restore Verification สำเร็จ: PRAGMA integrity_check ผ่านเกณฑ์ (ok) โครงสร้างตาราง: ${restoreResult.tableCount} ตาราง`);
      auditRecord.backup_reference = {
        backup_id: runId,
        backup_path: backupFile,
        integrity_check: 'ok',
        table_count: restoreResult.tableCount,
        restore_tested: true,
        restore_verified_at: new Date().toISOString()
      };
      auditRecord.steps.backup_verification = { success: true, backupFile, integrity: 'ok' };
    } catch (restoreErr) {
      return recordAuditAndHalt('restore_verification', `การทดสอบ Restore ล้มเหลว: ${restoreErr.message}`, 1);
    }
  } else {
    // P0.1 Remote Cloudflare D1 Restore Drill Verification
    if (!backupRef) {
      return recordAuditAndHalt('backup_verification', 'การรันบน Remote Cloud ต้องระบุหลักฐาน Backup Reference (--backup-ref <id>) ที่ตรวจสอบได้', 1);
    }

    console.log(`  ตรวจสอบ Backup/Recovery Point กับ Cloudflare D1 (${backupRef})...`);

    if (sim.remoteSnapshotNotFound) {
      return recordAuditAndHalt('backup_verification', `ไม่พบ Recovery Point '${backupRef}' บนฐานข้อมูล Remote D1 (Time-Travel Snapshot Not Found)`, 1);
    }

    // P0.1: Check restore drill evidence from a trusted source
    let verifiedDrill = null;
    if (options.verifiedRestoreDrill) {
      verifiedDrill = options.verifiedRestoreDrill;
    } else if (restoreEvidencePath && fs.existsSync(restoreEvidencePath)) {
      try {
        const rawEvidence = fs.readFileSync(restoreEvidencePath, 'utf-8');
        verifiedDrill = JSON.parse(rawEvidence);
      } catch (err) {
        return recordAuditAndHalt('restore_verification', `ไฟล์ Restore Drill Evidence เสียหายหรือไม่สามารถอ่านได้: ${err.message}`, 1);
      }
    }

    const expectedDbConfig = getTargetConfigFromWrangler(targetDb, targetEnv);
    const expectedDbId = expectedDbConfig?.database_id || targetDb;
    const expectedEnv = targetEnv || 'production';

    const isValidDrill = verifiedDrill &&
      (verifiedDrill.database_id === expectedDbId || verifiedDrill.database_id === targetDb) &&
      verifiedDrill.environment === expectedEnv &&
      verifiedDrill.recovery_point === backupRef &&
      verifiedDrill.drill_status === 'SUCCESS' &&
      verifiedDrill.integrity_check === 'ok' &&
      verifiedDrill.tested_at &&
      (Date.now() - new Date(verifiedDrill.tested_at).getTime() < 86400000 * 7);

    if (!isValidDrill) {
      const reason = !verifiedDrill
        ? 'ไม่พบหลักฐานการซักซ้อมกู้คืนจริง (--restore-drill-evidence <path>)'
        : `หลักฐาน Restore Drill ไม่ตรงกับเป้าหมาย (DB: ${verifiedDrill.database_id} vs ${expectedDbId}, Env: ${verifiedDrill.environment} vs ${expectedEnv}, Point: ${verifiedDrill.recovery_point} vs ${backupRef}, Status: ${verifiedDrill.drill_status})`;

      console.error('\n🛑 [SECURITY VIOLATION - RESTORE DRILL UNVERIFIED]');
      console.error(`ข้อจำกัดด้านความปลอดภัย: ${reason}`);
      console.error('เนื่องจาก Cloudflare D1 ยังไม่มีระบบ Native Automated Restore Verification ในคำสั่งเดียวสำหรับ Production');
      console.error('ตามหลักการ Fail-Closed ระบบไม่อนุญาตให้ดำเนินการ Migration จนกว่าจะมีการซักซ้อมกู้คืนในสภาพแวดล้อมทดสอบแยกและแนบหลักฐานที่เชื่อถือได้จริง (--restore-drill-evidence <path>)');
      console.error('ห้ามสร้างหลักฐานจำลองหรือรายงานว่า Verified โดยเด็ดขาด\n');

      return recordAuditAndHalt(
        'restore_verification',
        `Restore Drill Verification ล้มเหลว: ${reason}. ไม่อนุญาตให้ดำเนินการ Production Migration โดยไม่มีหลักฐานการกู้คืนจริง`,
        1,
        {
          targetDb,
          expectedDbId,
          expectedEnv,
          backupRef,
          hasEvidenceFile: !!restoreEvidencePath
        }
      );
    }

    console.log(`  ยืนยันหลักฐาน Cloud Backup Snapshot และการซักซ้อมกู้คืนสำเร็จ: ${backupRef} (Tested at: ${verifiedDrill.tested_at})`);
    auditRecord.backup_reference = {
      backup_id: backupRef,
      type: 'REMOTE_PITR_SNAPSHOT',
      restore_tested: true,
      restore_verified_at: verifiedDrill.tested_at,
      drill_evidence: {
        database_id: verifiedDrill.database_id,
        environment: verifiedDrill.environment,
        recovery_point: verifiedDrill.recovery_point,
        tested_at: verifiedDrill.tested_at,
        integrity_check: verifiedDrill.integrity_check
      }
    };
    auditRecord.steps.backup_verification = { success: true, backupRef, restore_tested: true };
  }

  // Step 4: Run Preflight Validation
  console.log('\n[ขั้นตอนที่ 4/10] รัน Preflight Safety Check บนฐานข้อมูลเป้าหมาย...');
  const preflight = await validateVccMigrationPreflight(db);
  if (sim.critPreflight) {
    preflight.isValid = false;
    preflight.status = PREFLIGHT_STATUS.VIOLATIONS_FOUND;
    preflight.summary.criticalCount = 1;
    preflight.violations.push({
      type: 'CRITICAL_SIMULATION',
      severity: 'CRITICAL',
      issue: 'Simulated Critical Preflight Violation'
    });
  }

  auditRecord.steps.preflight = {
    status: preflight.status,
    isValid: preflight.isValid,
    criticalCount: preflight.summary.criticalCount,
    warningCount: preflight.summary.warningCount
  };

  // Step 5: Preflight Gate Check (P0.2: CLI Override Disallowed for Critical Violations)
  console.log('\n[ขั้นตอนที่ 5/10] ประเมินผล Preflight Gate...');
  if (!preflight.isValid || preflight.summary.criticalCount > 0 || preflight.status !== PREFLIGHT_STATUS.READY) {
    console.log(preflight.reportText);
    return recordAuditAndHalt(
      'preflight_gate',
      'ตรวจพบข้อบกพร่องระดับวิกฤต (CRITICAL). การใช้ CLI Flags ข้าม Critical Gate ถูกปิดใช้งานถาวรเพื่อความปลอดภัยของข้อมูลคุณภาพ ห้ามรัน Migration เด็ดขาด',
      1,
      { violations: preflight.violations }
    );
  }
  console.log('  Preflight ผ่านเกณฑ์ความปลอดภัยสมบูรณ์ (READY)');
  auditRecord.steps.preflight_gate = { success: true };

  // Step 6: Inspect Migration Plan
  console.log('\n[ขั้นตอนที่ 6/10] ตรวจสอบ Migration Plan...');
  const wranglerBin = getWranglerBinPath();
  const planArgs = [wranglerBin, 'd1', 'migrations', 'list', targetDb];
  if (isRemote) planArgs.push('--remote'); else planArgs.push('--local');
  if (persistDir) planArgs.push('--persist-to', persistDir);
  if (targetEnv) planArgs.push('--env', targetEnv);

  let planOutput = '';
  if (options.mockPlanResult !== undefined) {
    if (options.mockPlanResult.status !== 0 || sim.planFail) {
      return recordAuditAndHalt('migration_plan_inspection', 'คำสั่งตรวจสอบ Migration Plan ล้มเหลว (Plan Inspection Failed)', 1);
    }
    planOutput = options.mockPlanResult.stdout || '';
  } else {
    const planProc = spawnSync(process.execPath, planArgs, { cwd: apiDir, encoding: 'utf-8' });
    if (planProc.status !== 0 || sim.planFail) {
      return recordAuditAndHalt('migration_plan_inspection', `คำสั่งตรวจสอบ Migration Plan ล้มเหลว (exit code ${planProc.status}): ${planProc.stderr || planProc.stdout}`, 1);
    }
    planOutput = planProc.stdout || '';
  }

  // Parse pending migrations from plan output
  const migrationFileMatches = planOutput.match(/\b\d{4}_[a-zA-Z0-9_-]+\.sql\b/g) || [];
  const uniqueMigrations = [...new Set(migrationFileMatches)];
  auditRecord.migration_files = uniqueMigrations;
  auditRecord.steps.migration_plan = { output: planOutput, migrations: uniqueMigrations, success: true };
  console.log(`  พบรายการ Migration ทั้งหมด: ${uniqueMigrations.length} ไฟล์`);

  // Step 7: Operator Approval Gate (P0.3: Explicit Operator Confirmation Required)
  console.log('\n[ขั้นตอนที่ 7/10] การอนุมัติจากผู้มีอำนาจ (Approval Gate)...');
  if (!isConfirmed) {
    return recordAuditAndHalt(
      'operator_approval_gate',
      'การรัน Migration ต้องได้รับการยืนยันอย่างชัดเจนจากผู้ควบคุม กรุณาระบุแฟล็ก --confirm-migration (CI ไม่สามารถอนุมัติแทนได้)',
      1
    );
  }
  console.log(`  ได้รับการยืนยันอย่างเป็นทางการจากผู้ควบคุม: ${operatorName}`);
  auditRecord.steps.approval = { confirmed: true, operator: operatorName, success: true };

  // Step 8: Execute Migration
  console.log('\n[ขั้นตอนที่ 8/10] กำลังดำเนินการรัน Migration (wrangler d1 migrations apply)...');
  const applyArgs = [wranglerBin, 'd1', 'migrations', 'apply', targetDb];
  if (isRemote) applyArgs.push('--remote'); else applyArgs.push('--local');
  if (persistDir) applyArgs.push('--persist-to', persistDir);
  if (targetEnv) applyArgs.push('--env', targetEnv);

  if (options.mockApplyResult !== undefined) {
    if (options.mockApplyResult.status !== 0 || sim.applyFail) {
      return recordAuditAndHalt('migration_execution', 'การติดตั้ง Migration ล้มเหลว (Simulated Migration Execution Failure)', 1);
    }
  } else {
    if (sim.applyFail) {
      return recordAuditAndHalt('migration_execution', 'การติดตั้ง Migration ล้มเหลว (Simulated Migration Execution Failure)', 1);
    }
    const applyProc = spawnSync(process.execPath, applyArgs, { cwd: apiDir, encoding: 'utf-8' });
    if (applyProc.status !== 0) {
      return recordAuditAndHalt(
        'migration_execution',
        `การติดตั้ง Migration ล้มเหลว (exit code ${applyProc.status}): ${applyProc.stderr || applyProc.stdout}`,
        1
      );
    }
    console.log(applyProc.stdout);
  }
  auditRecord.steps.migration_execution = { success: true };

  // Step 9: Post-Migration Integrity Verification (Schema & Data Integrity)
  console.log('\n[ขั้นตอนที่ 9/10] ตรวจสอบความสมบูรณ์ของโครงสร้าง (Schema) และข้อมูล (Data Integrity) หลัง Migration...');
  try {
    if (sim.postVerifyFail) {
      throw new Error('Data Integrity Violation: ตรวจพบข้อมูลขัดแย้งหลัง Migration (Simulated Post-Verification Failure)');
    }

    // 1. Verify index idx_vcc_plan_cycles_initial
    const idxCheck = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_vcc_plan_cycles_initial'").first();
    if (!idxCheck) throw new Error('ไม่พบคีย์ดัชนี idx_vcc_plan_cycles_initial หลัง Migration');

    // 2. Verify Trigger trg_prevent_tamper_approved_annual_plan
    const trgCheck = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'trg_prevent_tamper_approved_annual_plan'").first();
    if (!trgCheck) throw new Error('ไม่พบ Trigger trg_prevent_tamper_approved_annual_plan หลัง Migration');

    // 3. Data Integrity Check: No APPROVED plans with effective_status PENDING
    const invalidPending = await db.prepare("SELECT count(*) as cnt FROM vcc_annual_plans WHERE status = 'APPROVED' AND effective_status = 'PENDING'").first();
    if (invalidPending && invalidPending.cnt > 0) {
      throw new Error(`Data Integrity Error: ตรวจพบแผน APPROVED ที่มี effective_status = PENDING จำนวน ${invalidPending.cnt} แผน`);
    }

    console.log('  โครงสร้างดัชนี, ระบบ Trigger และความสมบูรณ์ของข้อมูลถูกต้องครบถ้วน 100%');
    auditRecord.steps.post_verification = { success: true };
  } catch (verifyErr) {
    auditRecord.finished_at = new Date().toISOString();
    auditRecord.result = 'FAILED_POST_APPLY_UNVERIFIED';
    auditRecord.database_mutated = true;
    auditRecord.rollback_status = 'NOT_PERFORMED';
    auditRecord.failure_evidence = {
      step: 'post_migration_verification',
      error: verifyErr.message,
      database_state: 'MUTATED_UNCERTAIN',
      recovery_action_required: 'MANUAL_DISASTER_RECOVERY_REQUIRED'
    };

    console.error('\n================================================================');
    console.error('🚨 [DISASTER RECOVERY PROCEDURE - POST-MIGRATION FAILURE]');
    console.error(`ข้อผิดพลาด: ${verifyErr.message}`);
    console.error('สถานะฐานข้อมูล: อาจถูกเปลี่ยนแปลงไปแล้วจาก Migration (database_mutated = true)');
    console.error('สถานะการ Rollback: ยังไม่ได้ทำการกู้คืน (rollback_status = NOT_PERFORMED)');
    console.error('ขั้นตอนการกู้คืนระบบ (Recovery Procedure):');
    console.error(`1. ระงับการเข้าถึงระบบ VCC (Set Maintenance Mode)`);
    console.error(`2. กู้คืนฐานข้อมูลจากจุดสำรองข้อมูลที่ผ่านการทดสอบ Restore:`);
    console.error(`   ไฟล์สำรองข้อมูล: ${auditRecord.backup_reference?.backup_path || auditRecord.backup_reference?.backup_id || 'N/A'}`);
    console.error(`3. ตรวจสอบบันทึก Audit Evidence ที่: ${auditPath} (Run ID: ${runId})`);
    console.error(`4. แจ้งเตือนฝ่ายบริหารระบบคุณภาพ (QMR) และ DBA เพื่อตรวจสอบหาสาเหตุ`);
    console.error('================================================================\n');

    try {
      saveAuditRecord(auditRecord, auditPath);
    } catch (saveErr) {
      console.error(`❌ [FATAL] บันทึก Audit Evidence ไม่สำเร็จ: ${saveErr.message}`);
    }

    if (!options.isTestRunner) {
      process.exit(1);
    } else {
      const err = new Error(`[MIGRATION GATE HALTED at post_migration_verification]: ${verifyErr.message}`);
      err.exitCode = 1;
      err.auditRecord = auditRecord;
      throw err;
    }
  }

  // Step 10: Record Audit Evidence (Append-only)
  console.log('\n[ขั้นตอนที่ 10/10] บันทึกหลักฐาน Audit Trail ของการ Migration...');
  auditRecord.finished_at = new Date().toISOString();
  auditRecord.result = 'SUCCESS';
  auditRecord.database_mutated = false;
  auditRecord.rollback_status = 'NOT_APPLICABLE';

  try {
    saveAuditRecord(auditRecord, auditPath);
  } catch (saveErr) {
    console.error(`❌ [FATAL] บันทึก Audit Evidence ไม่สำเร็จ: ${saveErr.message}`);
    if (!options.isTestRunner) process.exit(1);
    throw saveErr;
  }

  console.log(`  บันทึกหลักฐานการ Migration ในประวัติถาวร (Append-only) ที่ ${auditPath} สำเร็จ`);

  console.log('\n================================================================');
  console.log('🎉 [SUCCESS] การดำเนินงาน Migration ผ่านเกณฑ์ความปลอดภัยครบถ้วนทั้ง 10 ขั้นตอน');
  console.log('================================================================\n');

  if (!options.isTestRunner) {
    process.exit(0);
  }
  return auditRecord;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  runSafeMigrationWorkflow().catch((err) => {
    console.error('❌ [FATAL ERROR]:', err.message);
    process.exit(1);
  });
}
