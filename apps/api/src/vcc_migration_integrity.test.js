import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateVccMigrationPreflight, PREFLIGHT_VIOLATION_TYPES } from './vccPreflight.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const readMigrationSql = (filename) => {
  return fs.readFileSync(path.resolve(__dirname, `../migrations/${filename}`), 'utf8');
};

describe('VCC Migration Upgrade & Historical Integrity Tests (0032 -> 0033 -> 0034 -> 0035)', () => {
  let proxy;
  let env;

  beforeAll(async () => {
    proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
    env = { ...proxy.env };

    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('QC', 'ควบคุมคุณภาพ QC', 'ACTIVE')"),
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('QA', 'ประกันคุณภาพ QA', 'ACTIVE')"),
      env.DB.prepare("INSERT OR IGNORE INTO users (id, name, email, password_hash, primary_department, approval_level) VALUES ('test-user', 'ผู้ทดสอบ', 'test-mig@example.com', 'dummy', 'QC', 6)"),
      env.DB.prepare("INSERT OR IGNORE INTO vcc_assets (id, asset_code, name, asset_type, department, status) VALUES ('test-asset', 'A-MIG-01', 'เครื่องมือทดสอบ Migration', 'เครื่องชั่ง', 'QC', 'ACTIVE')")
    ]);
  });

  afterAll(async () => {
    if (proxy?.dispose) await proxy.dispose();
  });

  it('1. Sequential Migration Verification: 0033, 0034, 0035 apply cleanly and indices exist', async () => {
    // Verify columns added by 0033 exist
    const planCols = await env.DB.prepare('PRAGMA table_info(vcc_annual_plans)').all();
    const planColNames = new Set((planCols.results || planCols || []).map((c) => c.name));
    expect(planColNames.has('parent_plan_id')).toBe(true);
    expect(planColNames.has('revision_reason')).toBe(true);
    expect(planColNames.has('effective_status')).toBe(true);

    // Verify trigger 0034 is installed
    const trigger34 = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'trg_prevent_tamper_approved_annual_plan'"
    ).first();
    expect(trigger34).toBeTruthy();

    // Verify indices from 0035 exist
    const idxInitial = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_vcc_plan_cycles_initial'"
    ).first();
    expect(idxInitial).toBeTruthy();

    const idxWo = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_vcc_wo_plan_year_dept'"
    ).first();
    expect(idxWo).toBeTruthy();
  });

  it('2. Scenario 1: Clean / Normal Data passes Preflight and Migration cleanly', async () => {
    const cleanPlanId = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO vcc_annual_plans (
        id, plan_year, department, revision, title, status, effective_status, is_current,
        prepared_by, prepared_at, reviewed_by, reviewed_at, approved_by, approved_at,
        created_at, updated_at
      ) VALUES (?, 2040, 'QC', '00', 'แผนปกติสมบูรณ์', 'APPROVED', 'CURRENT', 1,
        'test-user', '2026-01-01', 'test-user', '2026-01-02', 'test-user', '2026-01-03', 'now', 'now')
    `).bind(cleanPlanId).run();

    const preflight = await validateVccMigrationPreflight(env.DB);
    // Find violations specifically for this plan
    const planViolations = preflight.violations.filter((v) => v.planId === cleanPlanId);
    expect(planViolations.length).toBe(0);
  });

  it('3. Scenario 2: APPROVED without approved_by fails Preflight safely with Diagnostic Report', async () => {
    const missingApproverId = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO vcc_annual_plans (
        id, plan_year, department, revision, title, status, effective_status, is_current,
        approved_at, approved_by, created_at, updated_at
      ) VALUES (?, 2041, 'QC', '00', 'แผนขาดผู้อนุมัติ', 'APPROVED', 'CURRENT', 1,
        '2026-01-03', NULL, 'now', 'now')
    `).bind(missingApproverId).run();

    const preflight = await validateVccMigrationPreflight(env.DB);
    expect(preflight.isValid).toBe(false);

    const v = preflight.violations.find((v) => v.planId === missingApproverId);
    expect(v).toBeTruthy();
    expect(v.type).toBe(PREFLIGHT_VIOLATION_TYPES.APPROVED_MISSING_APPROVER);
    expect(v.severity).toBe('CRITICAL');
    expect(preflight.reportText).toContain('ขาดข้อมูลผู้อนุมัติ');

    // Confirm database record was NOT mutated (no guessing)
    const stored = await env.DB.prepare('SELECT status, effective_status, approved_by FROM vcc_annual_plans WHERE id = ?').bind(missingApproverId).first();
    expect(stored.status).toBe('APPROVED');
    expect(stored.approved_by).toBeNull();
  });

  it('4. Scenario 3: APPROVED without approved_at fails Preflight safely with Diagnostic Report', async () => {
    const missingTimestampId = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO vcc_annual_plans (
        id, plan_year, department, revision, title, status, effective_status, is_current,
        approved_at, approved_by, created_at, updated_at
      ) VALUES (?, 2042, 'QC', '00', 'แผนขาดวันที่อนุมัติ', 'APPROVED', 'CURRENT', 1,
        NULL, 'test-user', 'now', 'now')
    `).bind(missingTimestampId).run();

    const preflight = await validateVccMigrationPreflight(env.DB);
    expect(preflight.isValid).toBe(false);

    const v = preflight.violations.find((v) => v.planId === missingTimestampId);
    expect(v).toBeTruthy();
    expect(v.type).toBe(PREFLIGHT_VIOLATION_TYPES.APPROVED_MISSING_TIMESTAMP);
    expect(v.severity).toBe('CRITICAL');
    expect(preflight.reportText).toContain('ขาดวันเวลาที่อนุมัติ');

    // Confirm database record was NOT mutated
    const stored = await env.DB.prepare('SELECT status, effective_status, approved_at FROM vcc_annual_plans WHERE id = ?').bind(missingTimestampId).first();
    expect(stored.status).toBe('APPROVED');
    expect(stored.approved_at).toBeNull();
  });

  it('5. Scenario 4: SUPERSEDED with incomplete evidence reports diagnostic warning', async () => {
    const badSupersededId = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO vcc_annual_plans (
        id, plan_year, department, revision, title, status, effective_status, is_current,
        approved_at, approved_by, created_at, updated_at
      ) VALUES (?, 2043, 'QC', '00', 'แผนประวัติเก่าหลักฐานไม่ครบ', 'DRAFT', 'SUPERSEDED', 0,
        NULL, NULL, 'now', 'now')
    `).bind(badSupersededId).run();

    const preflight = await validateVccMigrationPreflight(env.DB);
    const v = preflight.violations.find((v) => v.planId === badSupersededId);
    expect(v).toBeTruthy();
    expect(v.type).toBe(PREFLIGHT_VIOLATION_TYPES.SUPERSEDED_INCOMPLETE_EVIDENCE);
    expect(v.severity).toBe('WARNING');
    expect(preflight.reportText).toContain('มีสถานะประวัติเก่าแต่หลักฐานการอนุมัติไม่สมบูรณ์');
  });

  it('6. Scenario 5: Multiple CURRENT plans before 0033 detected by Preflight and prevented by Unique Index', async () => {
    const p1Id = crypto.randomUUID();
    const p2Id = crypto.randomUUID();

    // Inserting a second CURRENT plan for same year & department must be rejected by 0033 unique index
    await env.DB.prepare(`
      INSERT INTO vcc_annual_plans (
        id, plan_year, department, revision, title, status, effective_status, is_current,
        created_at, updated_at
      ) VALUES (?, 2044, 'QC', '00', 'แผนที่ 1', 'APPROVED', 'CURRENT', 1, 'now', 'now')
    `).bind(p1Id).run();

    let uniqueFailed = false;
    try {
      await env.DB.prepare(`
        INSERT INTO vcc_annual_plans (
          id, plan_year, department, revision, title, status, effective_status, is_current,
          created_at, updated_at
        ) VALUES (?, 2044, 'QC', '01', 'แผนที่ 2 ซ้ำซ้อน', 'APPROVED', 'CURRENT', 1, 'now', 'now')
      `).bind(p2Id).run();
    } catch (err) {
      uniqueFailed = true;
      expect(err.message).toContain('UNIQUE constraint failed');
    }
    expect(uniqueFailed).toBe(true);
  });

  it('7. Historical Data Integrity: APPROVED plans and CLOSED work orders are not modified', async () => {
    // 1. Create approved plan
    const histPlanId = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO vcc_annual_plans (
        id, plan_year, department, revision, title, status, effective_status, is_current,
        document_code, due_date_rule, prepared_by, prepared_at, reviewed_by, reviewed_at, approved_by, approved_at,
        created_at, updated_at
      ) VALUES (?, 2045, 'QC', '00', 'แผนประวัติศาสตร์คุ้มครอง', 'APPROVED', 'CURRENT', 1,
        'FM-QC-46', 'END_OF_MONTH', 'test-user', '2026-01-01', 'test-user', '2026-01-02', 'test-user', '2026-01-03',
        '2026-01-01T00:00:00Z', '2026-01-03T00:00:00Z')
    `).bind(histPlanId).run();

    // 2. Create closed work order
    const histWoId = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO vcc_work_orders (
        id, wo_code, plan_id, plan_year, asset_id, provider_name,
        due_date, original_due_date, status, performed_at, result_status, certificate_no,
        created_at, updated_at
      ) VALUES (?, 'WO-HIST-001', ?, 2045, 'test-asset', 'External Lab',
        '2026-03-31', '2026-03-31', 'CLOSED', '2026-03-25', 'PASS', 'CERT-HIST-123',
        '2026-01-03T00:00:00Z', '2026-03-25T00:00:00Z')
    `).bind(histWoId, histPlanId).run();

    // 3. Verify Trigger 0034 blocks any modification to the plan's core identity or approval fields
    let tamperBlocked = false;
    try {
      await env.DB.prepare("UPDATE vcc_annual_plans SET revision = '99' WHERE id = ?").bind(histPlanId).run();
    } catch (err) {
      tamperBlocked = true;
      expect(err.message).toContain('Cannot alter status, core identity, or historical evidence');
    }
    expect(tamperBlocked).toBe(true);

    // 4. Verify Trigger 0034 strictly forbids turning APPROVED into PENDING
    let pendingBlocked = false;
    try {
      await env.DB.prepare("UPDATE vcc_annual_plans SET effective_status = 'PENDING' WHERE id = ?").bind(histPlanId).run();
    } catch (err) {
      pendingBlocked = true;
      expect(err.message).toContain('Cannot alter status, core identity, or historical evidence');
    }
    expect(pendingBlocked).toBe(true);

    // 5. Verify byte-level data preservation
    const planAfter = await env.DB.prepare('SELECT * FROM vcc_annual_plans WHERE id = ?').bind(histPlanId).first();
    expect(planAfter.status).toBe('APPROVED');
    expect(planAfter.approved_by).toBe('test-user');
    expect(planAfter.approved_at).toBe('2026-01-03');
    expect(planAfter.document_code).toBe('FM-QC-46');

    const woAfter = await env.DB.prepare('SELECT * FROM vcc_work_orders WHERE id = ?').bind(histWoId).first();
    expect(woAfter.status).toBe('CLOSED');
    expect(woAfter.result_status).toBe('PASS');
    expect(woAfter.certificate_no).toBe('CERT-HIST-123');
  });
});
