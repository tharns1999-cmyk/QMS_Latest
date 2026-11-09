import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import { sign } from 'hono/jwt';
import app from './index.js';
import { buildWorkOrderReconciliationStatements } from './vccWorkOrders.js';
import { generatePlanPdfBuffer } from './vccPlans.js';
import { runVccNotificationSweep } from './vccNotifications.js';

describe('VCC audit regressions: controlled records and decisions', () => {
  let proxy;
  let env;
  let sequence = 0;
  const savedSettings = new Map();
  const tokens = {};
  const prefix = 'VCC-AUDIT';
  const users = [
    ['MAKER', 'QC', 4], ['PERFORMER', 'QC', 2], ['REVIEWER', 'QC', 4],
    ['RELEASER', 'QC', 5], ['PD', 'PD', 5], ['APPROVER', 'MGT', 6]
  ];
  const uid = (name) => `${prefix}-${name}`;
  const nextId = () => `${prefix}-${++sequence}`;

  const call = async (method, path, who = 'MAKER', body, extraEnv = {}) => {
    const response = await app.request(path, {
      method,
      headers: { Authorization: `Bearer ${tokens[who]}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    }, { ...env, ...extraEnv });
    const text = await response.text();
    return { status: response.status, body: text.startsWith('{') ? JSON.parse(text) : text, headers: response.headers };
  };

  const asset = async (status = 'ACTIVE') => {
    const id = nextId();
    await env.DB.prepare(`INSERT INTO vcc_assets
      (id, asset_code, name, asset_type, department, status)
      VALUES (?, ?, ?, 'fixture', 'QC', ?)`)
      .bind(id, id, `[ข้อมูลทดสอบ] ${id}`, status).run();
    return id;
  };

  const workOrder = async (assetId, values = {}) => {
    const id = nextId();
    const row = {
      id, wo_code: id, asset_id: assetId, provider_name: 'test laboratory',
      due_date: '2026-01-31', original_due_date: '2026-01-31', status: 'PENDING_REVIEW',
      result_status: 'PASS', performed_at: '2026-01-20', performed_by: uid('PERFORMER'),
      certificate_no: 'TEST-CERTIFICATE', acceptance_criteria: '[ข้อมูลทดสอบ] criteria', ...values
    };
    const keys = Object.keys(row);
    await env.DB.prepare(`INSERT INTO vcc_work_orders (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
      .bind(...Object.values(row)).run();
    return id;
  };

  const plan = async (status = 'PENDING_REVIEW', values = {}) => {
    const id = nextId();
    const row = {
      id, plan_year: 2026, department: 'QC', document_code: 'FM-QC-46', revision: `A${sequence}`,
      title: '[ข้อมูลทดสอบ] audit plan', status, effective_status: 'PENDING', is_current: 0,
      prepared_by: uid('MAKER'), assigned_reviewer_id: uid('PD'), assigned_approver_id: uid('APPROVER'),
      ...(status === 'PENDING_APPROVAL' ? { reviewed_by: uid('PD') } : {}), ...values
    };
    const keys = Object.keys(row);
    await env.DB.prepare(`INSERT INTO vcc_annual_plans (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
      .bind(...Object.values(row)).run();
    return id;
  };

  // Delay two real D1 reads until both callers have the same state; the database and writes stay real.
  const simultaneousReads = (match) => {
    let reads = 0;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    return {
      ...env.DB,
      prepare(sql) {
        const wrap = (statement) => new Proxy(statement, {
          get(target, key) {
            if (key === 'bind') return (...args) => wrap(target.bind(...args));
            if (key === 'first') return async (...args) => {
              const result = await target.first(...args);
              if (match(sql) && reads < 2) {
                if (++reads === 2) release();
                await gate;
              }
              return result;
            };
            return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
          }
        });
        return wrap(env.DB.prepare(sql));
      },
      batch: (...args) => env.DB.batch(...args)
    };
  };

  beforeAll(async () => {
    proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
    env = { ...proxy.env, JWT_SECRET: 'vcc-audit-test-secret' };
    const now = Math.floor(Date.now() / 1000);
    for (const [name, department, level] of users) {
      await env.DB.prepare(`INSERT INTO users
        (id, name, email, password_hash, role, approval_level, primary_department, departments)
        VALUES (?, ?, ?, 'unused-test-hash', 'USER', ?, ?, ?)`)
        .bind(uid(name), `[ข้อมูลทดสอบ] ${name}`, `${uid(name)}@test.invalid`, level, department, JSON.stringify([department])).run();
      tokens[name] = await sign({ sub: uid(name), iat: now, exp: now + 3600 }, env.JWT_SECRET);
    }
    await env.DB.prepare(`INSERT INTO approval_matrix
      (doc_type, name_th, min_requester_level, required_reviewer_level, required_approver_level)
      VALUES ('VCC-AUDIT', '[ข้อมูลทดสอบ] audit matrix', 4, 4, 5)`).run();
    for (const key of ['vcc_plan_settings', 'vcc_work_order_settings']) {
      const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
      savedSettings.set(key, row?.value ?? null);
      await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
        .bind(key, JSON.stringify({ approval_doc_type: 'VCC-AUDIT', due_date_rule: 'END_OF_MONTH' })).run();
    }
  });

  afterAll(async () => {
    if (env) {
      for (const [key, value] of savedSettings) {
        if (value === null) await env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(key).run();
        else await env.DB.prepare('UPDATE settings SET value = ? WHERE key = ?').bind(value, key).run();
      }
      await env.DB.prepare("DELETE FROM approval_matrix WHERE doc_type = 'VCC-AUDIT'").run();
    }
    await proxy?.dispose();
  });

  it('does not reactivate a retired instrument with an open NC', async () => {
    const id = await asset('ON_HOLD');
    await workOrder(id, { result_status: 'FAIL', nc_status: 'OPEN' });
    expect((await call('POST', `/api/vcc/assets/${id}/retire`, 'MAKER', { reason: '[ข้อมูลทดสอบ] retire' })).status).toBe(200);
    expect((await call('POST', `/api/vcc/assets/${id}/reactivate`, 'MAKER', { reason: '[ข้อมูลทดสอบ] return' })).status).toBe(409);
    expect((await env.DB.prepare('SELECT status FROM vcc_assets WHERE id = ?').bind(id).first()).status).toBe('RETIRED');
    const log = await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'VCC_ASSET_REACTIVATED' AND json_extract(details, '$.asset_id') = ?").bind(id).first();
    expect(log.n).toBe(0);
  });

  it('releases an NC without reactivating an instrument that has been retired', async () => {
    const id = await asset('RETIRED');
    const wo = await workOrder(id, { status: 'CLOSED', result_status: 'FAIL', nc_status: 'OPEN' });
    const result = await call('POST', `/api/vcc/work-orders/${wo}/release-hold`, 'RELEASER', {
      release_reason: '[ข้อมูลทดสอบ] removed from use', impact_assessment: '[ข้อมูลทดสอบ] assessed'
    });
    expect(result.status).toBe(200);
    expect((await env.DB.prepare('SELECT status FROM vcc_assets WHERE id = ?').bind(id).first()).status).toBe('RETIRED');
  });

  it('refuses plan reconciliation that would cancel an open NC', async () => {
    const id = await asset('ON_HOLD');
    const base = await plan('PENDING_APPROVAL');
    await env.DB.prepare("UPDATE vcc_annual_plans SET status = 'APPROVED' WHERE id = ?").bind(base).run();
    const next = await plan('PENDING_APPROVAL', { parent_plan_id: base });
    const oldItem = nextId();
    const newItem = nextId();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO vcc_annual_plan_items
        (id, plan_id, asset_id, provider_name, responsible_dept, planned_months)
        VALUES (?, ?, ?, 'test laboratory', 'QC', '[1]')`).bind(oldItem, base, id),
      env.DB.prepare(`INSERT INTO vcc_annual_plan_items
        (id, plan_id, asset_id, provider_name, responsible_dept, planned_months)
        VALUES (?, ?, ?, 'test laboratory', 'QC', '[]')`).bind(newItem, next, id)
    ]);
    const cycle = nextId();
    await env.DB.prepare(`INSERT INTO vcc_plan_cycles
      (id, plan_id, plan_item_id, asset_id, cycle_seq, planned_month, baseline_planned_date, initial_cycle_id)
      VALUES (?, ?, ?, ?, 1, 1, '2026-01-31', ?)`).bind(cycle, base, oldItem, id, cycle).run();
    const wo = await workOrder(id, { plan_id: base, plan_item_id: oldItem, cycle_id: cycle, plan_year: 2026, planned_month: 1, result_status: 'FAIL', nc_status: 'OPEN' });
    const result = await buildWorkOrderReconciliationStatements(env.DB, next, uid('APPROVER'));
    expect(result.error).toBeTruthy();
    expect(result.batchStatements).toEqual([]);
    expect((await env.DB.prepare('SELECT status FROM vcc_work_orders WHERE id = ?').bind(wo).first()).status).toBe('PENDING_REVIEW');
  });

  it('cannot attach a certificate if a reviewer closes the work order during upload', async () => {
    const wo = await workOrder(await asset());
    let uploadedKey;
    const FILES = {
      delete: (key) => env.FILES.delete(key),
      put: async (...args) => {
        uploadedKey = args[0];
        expect((await call('POST', `/api/vcc/work-orders/${wo}/approve`, 'REVIEWER', {})).status).toBe(200);
        return env.FILES.put(...args);
      }
    };
    const response = await app.request(`/api/vcc/work-orders/${wo}/certificate-file?filename=test.pdf&certificate_no=CHANGED`, {
      method: 'PUT', headers: { Authorization: `Bearer ${tokens.PERFORMER}`, 'Content-Type': 'application/pdf' },
      body: '%PDF-1.4\n[fixture]'
    }, { ...env, FILES });
    expect(response.status).toBe(409);
    expect(await env.FILES.head(uploadedKey)).toBeNull();
    const row = await env.DB.prepare('SELECT status, certificate_no, certificate_file_key FROM vcc_work_orders WHERE id = ?').bind(wo).first();
    expect(row).toMatchObject({ status: 'CLOSED', certificate_no: 'TEST-CERTIFICATE', certificate_file_key: null });
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM vcc_work_order_certificates WHERE work_order_id = ?').bind(wo).first()).n).toBe(0);
  });

  it('records exactly one review when two requests read the same pending plan', async () => {
    const id = await plan();
    const DB = simultaneousReads((sql) => sql.includes('FROM vcc_annual_plans p') && sql.includes('WHERE p.id = ?'));
    const responses = await Promise.all([
      call('POST', `/api/vcc/plans/${id}/review`, 'PD', {}, { DB }),
      call('POST', `/api/vcc/plans/${id}/review`, 'PD', {}, { DB })
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'VCC_PLAN_REVIEWED' AND json_extract(details, '$.plan_id') = ?").bind(id).first();
    expect(row.n).toBe(1);
  });

  it('lets an assigned cross-department reviewer return their plan, but no unassigned reviewer', async () => {
    const id = await plan();
    expect((await call('POST', `/api/vcc/plans/${id}/reject`, 'REVIEWER', { reason: '[ข้อมูลทดสอบ] return' })).status).toBe(403);
    expect((await call('POST', `/api/vcc/plans/${id}/reject`, 'PD', { reason: '[ข้อมูลทดสอบ] return' })).status).toBe(200);
  });

  it('validates duplicate-plan lookup and keeps other departments hidden', async () => {
    const id = await plan('DRAFT');
    const found = await call('GET', '/api/vcc/plans/check-duplicate?year=2026&department=QC');
    expect(found.status).toBe(200);
    expect(found.body.exists).toBe(true);
    expect(found.body.existing_plan.department).toBe('QC');
    expect(id).toBeTruthy();
    expect((await call('GET', '/api/vcc/plans/check-duplicate?year=wrong&department=QC')).status).toBe(400);
    expect((await call('GET', '/api/vcc/plans/check-duplicate?year=2026&department=LB')).status).toBe(403);
  });

  it('uses the stricter live matrix when approving a profiled plan', async () => {
    const id = await plan('PENDING_APPROVAL');
    await env.DB.prepare("UPDATE approval_matrix SET required_approver_level = 8 WHERE doc_type = 'VCC-AUDIT'").run();
    try {
      expect((await call('POST', `/api/vcc/plans/${id}/approve`, 'APPROVER', {})).status).toBe(403);
    } finally {
      await env.DB.prepare("UPDATE approval_matrix SET required_approver_level = 5 WHERE doc_type = 'VCC-AUDIT'").run();
    }
  });

  it('keeps form floors and applies higher matrix levels to detail, inbox and assignee candidates', async () => {
    const id = await plan();
    const before = (await call('GET', `/api/vcc/plans/${id}`)).body.thresholds;
    expect(before).toMatchObject({ min_requester_level: 4, required_reviewer_level: 5, required_approver_level: 6 });
    await env.DB.prepare("UPDATE approval_matrix SET required_reviewer_level = 7, required_approver_level = 8 WHERE doc_type = 'VCC-AUDIT'").run();
    try {
      const detail = await call('GET', `/api/vcc/plans/${id}`, 'PD');
      expect(detail.body.thresholds.required_reviewer_level).toBe(7);
      expect((await call('POST', `/api/vcc/plans/${id}/review`, 'PD', {})).status).toBe(403);
      const tasks = (await call('GET', '/api/vcc/tasks', 'PD')).body.tasks;
      expect(tasks.some((task) => task.planId === id && task.actionRequired !== false)).toBe(false);
      const candidates = (await call('GET', '/api/vcc/document-profiles')).body.candidates;
      expect(candidates.qc_reviewers.some((person) => person.id === uid('PD'))).toBe(false);
      expect(candidates.approvers.some((person) => person.id === uid('APPROVER'))).toBe(false);
    } finally {
      await env.DB.prepare("UPDATE approval_matrix SET required_reviewer_level = 4, required_approver_level = 5 WHERE doc_type = 'VCC-AUDIT'").run();
    }
  });

  it('creates an official PDF with Thai names and Thai acceptance criteria', async () => {
    const bytes = await generatePlanPdfBuffer({
      plan_year: 2026, department: 'QC', title: '[ข้อมูลทดสอบ] แผนประจำปี',
      prepared_by_name: 'สมชาย', reviewed_by_name: 'สมศรี', approved_by_name: 'สมบูรณ์'
    }, [{ asset_code: 'THAI-1', asset_name: 'เครื่องชั่ง', acceptance_criteria: '± 0.5 กรัม', planned_months: [1] }], {
      preparer: { name: 'สมชาย' }, reviewer: { name: 'สมศรี' }, approver: { name: 'สมบูรณ์' }
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(5000);
  });

  it('audits official PDF views and downloads, and rejects invalid purposes', async () => {
    const key = `vcc/audit-test/${nextId()}.pdf`;
    await env.FILES.put(key, '%PDF-1.4\n[fixture]', { httpMetadata: { contentType: 'application/pdf' } });
    const id = await plan('PENDING_APPROVAL', { pdf_file_key: key });
    await env.DB.prepare("UPDATE vcc_annual_plans SET status = 'APPROVED' WHERE id = ?").bind(id).run();
    expect((await call('GET', `/api/vcc/plans/${id}/pdf`)).status).toBe(200);
    const download = await call('GET', `/api/vcc/plans/${id}/pdf?purpose=download`);
    expect(download.status).toBe(200);
    expect(download.headers.get('Content-Disposition')).toContain('attachment');
    expect((await call('GET', `/api/vcc/plans/${id}/pdf?purpose=invalid`)).status).toBe(400);
    const logs = await env.DB.prepare("SELECT action FROM audit_log WHERE json_extract(details, '$.plan_id') = ? AND action GLOB 'VCC_PLAN_PDF_*'").bind(id).all();
    expect(logs.results.map((row) => row.action).sort()).toEqual(['VCC_PLAN_PDF_DOWNLOADED', 'VCC_PLAN_PDF_VIEWED']);
  });

  it('keeps closed equipment identity stable after editing the register', async () => {
    const id = await asset();
    const wo = await workOrder(id);
    expect((await call('POST', `/api/vcc/work-orders/${wo}/approve`, 'REVIEWER', {})).status).toBe(200);
    const before = (await call('GET', `/api/vcc/work-orders/${wo}`)).body.workOrder;
    expect((await call('PUT', `/api/vcc/assets/${id}`, 'MAKER', { name: '[ข้อมูลทดสอบ] renamed' })).status).toBe(200);
    const after = (await call('GET', `/api/vcc/work-orders/${wo}`)).body.workOrder;
    expect(after.asset_name).toBe(before.asset_name);
    expect(after.asset_snapshot).toBeTruthy();
    const listed = (await call('GET', '/api/vcc/work-orders?status=CLOSED')).body.workOrders.find((row) => row.id === wo);
    expect(listed.asset_name).toBe(before.asset_name);
    const exported = await call('GET', '/api/vcc/export/work-orders');
    expect(exported.body).toContain(before.asset_name);
    expect(exported.body).not.toContain('[ข้อมูลทดสอบ] renamed');
    await expect(env.DB.prepare("UPDATE vcc_work_orders SET asset_snapshot = '{}' WHERE id = ?").bind(wo).run()).rejects.toThrow(/snapshot/);
  });

  it('does not invent a historical equipment snapshot for legacy closed records', async () => {
    const wo = await workOrder(await asset(), { status: 'CLOSED' });
    const result = await call('GET', `/api/vcc/work-orders/${wo}`);
    expect(result.body.workOrder.is_legacy_without_asset_snapshot).toBe(true);
    expect(result.body.workOrder.asset_snapshot).toBeNull();
  });

  it('requires a server-side rejection reason for amendment requests', async () => {
    const wo = await workOrder(await asset(), { status: 'CLOSED' });
    const request = await call('POST', `/api/vcc/work-orders/${wo}/amendment-requests`, 'MAKER', {
      amendment_reason: '[ข้อมูลทดสอบ] correction', result_remarks: '[ข้อมูลทดสอบ] corrected'
    });
    expect(request.status).toBe(201);
    expect((await call('POST', `/api/vcc/work-orders/${wo}/reject-amendment`, 'REVIEWER', {})).status).toBe(400);
    expect((await call('POST', `/api/vcc/work-orders/${wo}/reject-amendment`, 'REVIEWER', { reason: '   ' })).status).toBe(400);
    expect((await call('POST', `/api/vcc/work-orders/${wo}/reject-amendment`, 'REVIEWER', { reason: '[ข้อมูลทดสอบ] incomplete' })).status).toBe(200);
  });

  it('alerts on overdue OPEN and REJECTED work orders as well as SCHEDULED', async () => {
    for (const status of ['OPEN', 'REJECTED', 'SCHEDULED']) {
      const wo = await workOrder(await asset(), { status, certificate_no: null, result_status: 'PENDING', performed_at: null });
      await runVccNotificationSweep(env.DB, { nowDate: '2026-11-09' });
      const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM vcc_notifications WHERE work_order_id = ? AND notification_type LIKE 'OVERDUE_%' AND status != 'RESOLVED'").bind(wo).first();
      expect(row.n, status).toBe(1);
    }
  });

  it('monitors the latest accepted calibration instead of the longest historical validity', async () => {
    const id = await asset();
    await workOrder(id, { status: 'CLOSED', performed_at: '2025-01-01', certificate_valid_until: '2027-12-31' });
    const latest = await workOrder(id, { status: 'CLOSED', performed_at: '2026-01-01', certificate_valid_until: '2026-10-01' });
    await workOrder(id, { status: 'CANCELLED', performed_at: '2026-02-01', certificate_valid_until: '2029-01-01' });
    await runVccNotificationSweep(env.DB, { nowDate: '2026-11-09' });
    const row = await env.DB.prepare("SELECT * FROM vcc_notifications WHERE asset_id = ? AND notification_type = 'CERT_EXPIRED' AND status != 'RESOLVED'").bind(id).first();
    expect(row?.work_order_id).toBe(latest);
    const dashboard = await call('GET', '/api/vcc/dashboard?year=2026&reference_date=2026-11-09');
    expect(dashboard.body.alerts.some((a) => a.asset_id === id && a.alert_type === 'CERT_EXPIRED')).toBe(true);
  });
});
