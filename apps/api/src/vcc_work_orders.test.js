import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';

describe('VCC Phase 3: Work Orders, Execution, Review, Close & Hold/NC Control', () => {
  let proxy;
  let env;
  const tokens = {};
  const PASSWORD = 'vcc-wo-pass-123456';

  const call = async (method, path, who, body) => {
    const res = await app.request(
      path,
      {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[who]}` },
        body: body && JSON.stringify(body)
      },
      env
    );
    return { status: res.status, body: await res.json() };
  };

  beforeAll(async () => {
    proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
    env = { ...proxy.env, JWT_SECRET: 'test-secret' };
    const hash = await hashPassword(PASSWORD);
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('VWOQC', 'ควบคุมคุณภาพ WO', 'ACTIVE')"),
      ...[
        ['VWO-DCC', 4, 1],
        ['VWO-L2', 2, 0],
        ['VWO-REV4', 4, 1],
        ['VWO-APP6', 6, 1]
      ].map(([id, level, dcc]) =>
        env.DB.prepare(
          `INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
           VALUES (?, ?, ?, ?, 'USER', ?, 'VWOQC', '["VWOQC"]', ?)`
        ).bind(id, id, `${id}@vccwo.local`, hash, level, dcc)
      )
    ]);

    for (const id of ['VWO-DCC', 'VWO-L2', 'VWO-REV4', 'VWO-APP6']) {
      const res = await app.request(
        '/api/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: `${id}@vccwo.local`, password: PASSWORD })
        },
        env
      );
      tokens[id] = (await res.json()).token;
    }
  });

  afterAll(async () => {
    await proxy?.dispose();
  });

  it('blocks non-DCC users from all work order endpoints', async () => {
    expect((await call('GET', '/api/vcc/work-orders', 'VWO-L2')).status).toBe(403);
    expect((await call('POST', '/api/vcc/work-orders', 'VWO-L2', {})).status).toBe(403);
  });

  it('creates work orders from APPROVED plan (requiring child asset for groups and preventing duplicates) and updates plan Act. row only after reviewer closes the work order', async () => {
    // 1. Register group + child + standalone asset
    const grp = await call('POST', '/api/vcc/assets', 'VWO-DCC', {
      asset_code: 'GRP-WO-SCALE',
      name: '[ข้อมูลทดสอบ] กลุ่มเครื่องชั่ง WO',
      asset_type: 'เครื่องชั่ง',
      department: 'VWOQC',
      is_group: true
    });
    const child = await call('POST', '/api/vcc/assets', 'VWO-DCC', {
      asset_code: 'SC-WO-01',
      name: '[ข้อมูลทดสอบ] เครื่องชั่งรายตัว 01',
      asset_type: 'เครื่องชั่ง',
      department: 'VWOQC',
      is_group: false,
      parent_id: grp.body.asset.id
    });
    const standalone = await call('POST', '/api/vcc/assets', 'VWO-DCC', {
      asset_code: 'TM-WO-01',
      name: '[ข้อมูลทดสอบ] เทอร์โมมิเตอร์ 01',
      asset_type: 'เทอร์โมมิเตอร์',
      department: 'VWOQC',
      is_group: false
    });

    // 2. Create 2026 plan and add both items
    const planRes = await call('POST', '/api/vcc/plans', 'VWO-DCC', {
      plan_year: 2026,
      department: 'VWOQC',
      title: '[ข้อมูลทดสอบ] แผนปี 2026 WO'
    });
    const planId = planRes.body.plan.id;

    const grpItemRes = await call('POST', `/api/vcc/plans/${planId}/items`, 'VWO-DCC', {
      asset_id: grp.body.asset.id,
      provider_name: 'ทวนสอบภายใน',
      planned_months: [3],
      responsible_dept: 'VWOQC'
    });
    const tmItemRes = await call('POST', `/api/vcc/plans/${planId}/items`, 'VWO-DCC', {
      asset_id: standalone.body.asset.id,
      provider_name: 'ห้องปฏิบัติการภายนอก',
      planned_months: [3],
      responsible_dept: 'VWOQC'
    });

    // 3. Cannot create work order from DRAFT plan
    const draftWo = await call('POST', '/api/vcc/work-orders', 'VWO-DCC', {
      plan_id: planId,
      plan_item_id: tmItemRes.body.item.id,
      planned_month: 3
    });
    expect(draftWo.status).toBe(409);

    // 4. Approve the plan (Submit -> Review -> Approve)
    await call('POST', `/api/vcc/plans/${planId}/submit`, 'VWO-DCC');
    await call('POST', `/api/vcc/plans/${planId}/review`, 'VWO-REV4');
    await call('POST', `/api/vcc/plans/${planId}/approve`, 'VWO-APP6');

    // 5. Group item without child_asset_id is blocked
    const grpBlocked = await call('POST', '/api/vcc/work-orders', 'VWO-DCC', {
      plan_id: planId,
      plan_item_id: grpItemRes.body.item.id,
      planned_month: 3
    });
    expect(grpBlocked.status).toBe(400);
    expect(grpBlocked.body.error).toMatch(/แยกรหัสเครื่องมือรายตัว/);

    // 6. Group item with child_asset_id succeeds, and duplicate is blocked
    const grpWo = await call('POST', '/api/vcc/work-orders', 'VWO-DCC', {
      plan_id: planId,
      plan_item_id: grpItemRes.body.item.id,
      planned_month: 3,
      child_asset_id: child.body.asset.id
    });
    expect(grpWo.status).toBe(201);
    expect(grpWo.body.workOrder.asset_code).toBe('SC-WO-01');
    expect(grpWo.body.workOrder.due_date).toBe('2026-03-31');

    const dupWo = await call('POST', '/api/vcc/work-orders', 'VWO-DCC', {
      plan_id: planId,
      plan_item_id: grpItemRes.body.item.id,
      planned_month: 3,
      child_asset_id: child.body.asset.id
    });
    expect(dupWo.status).toBe(409);

    // 7. Reschedule preserves original_due_date and requires reason
    const woId = grpWo.body.workOrder.id;
    expect((await call('POST', `/api/vcc/work-orders/${woId}/reschedule`, 'VWO-DCC', { new_due_date: '2026-04-10', reason: '' })).status).toBe(400);
    const resched = await call('POST', `/api/vcc/work-orders/${woId}/reschedule`, 'VWO-DCC', {
      new_due_date: '2026-04-10',
      reason: 'รอห้องแล็บยืนยันคิว'
    });
    expect(resched.status).toBe(200);
    expect(resched.body.workOrder.due_date).toBe('2026-04-10');
    expect(resched.body.workOrder.original_due_date).toBe('2026-03-31');

    // 8. Submit result requires certificate_no & acceptance_criteria, and moves to PENDING_REVIEW (not CLOSED)
    expect(
      (await call('POST', `/api/vcc/work-orders/${woId}/submit-result`, 'VWO-DCC', {
        performed_at: '2026-03-25',
        result_status: 'PASS',
        certificate_no: '',
        acceptance_criteria: '± 1.0 g'
      })).status
    ).toBe(400);

    const submitted = await call('POST', `/api/vcc/work-orders/${woId}/submit-result`, 'VWO-DCC', {
      performed_at: '2026-03-25',
      result_status: 'PASS',
      certificate_no: 'CERT-2026-001',
      acceptance_criteria: '± 1.0 g ตามพิกัดเครื่องชั่ง'
    });
    expect(submitted.status).toBe(200);
    expect(submitted.body.workOrder.status).toBe('PENDING_REVIEW');

    // Performer cannot approve own work order
    expect((await call('POST', `/api/vcc/work-orders/${woId}/approve`, 'VWO-DCC')).status).toBe(403);

    // Reviewer approves -> status becomes CLOSED and plan item Act. row updates
    const approved = await call('POST', `/api/vcc/work-orders/${woId}/approve`, 'VWO-REV4', {
      comment: 'ตรวจใบรับรองครบถ้วน'
    });
    expect(approved.status).toBe(200);
    expect(approved.body.workOrder.status).toBe('CLOSED');

    const planDetail = await call('GET', `/api/vcc/plans/${planId}`, 'VWO-DCC');
    const updatedGrpItem = planDetail.body.items.find((i) => i.id === grpItemRes.body.item.id);
    expect(updatedGrpItem.actual_months).toEqual([3]);
    expect(updatedGrpItem.has_evidence).toBe(true);
    expect(updatedGrpItem.completion_status).toBe('COMPLETED');
  });

  it('triggers ON_HOLD (nc_status = OPEN) on FAIL, does not auto-release on close, and requires L5+ approver with impact assessment to release hold', async () => {
    const asset = await call('POST', '/api/vcc/assets', 'VWO-DCC', {
      asset_code: 'VN-FAIL-01',
      name: '[ข้อมูลทดสอบ] เวอร์เนียร์ทดสอบไม่ผ่าน',
      asset_type: 'เวอร์เนียร์คาลิปเปอร์',
      department: 'VWOQC',
      is_group: false
    });

    // Ad-hoc work order
    const woRes = await call('POST', '/api/vcc/work-orders', 'VWO-DCC', {
      asset_id: asset.body.asset.id,
      provider_name: 'ห้องปฏิบัติการภายนอก',
      due_date: '2026-05-31'
    });
    expect(woRes.status).toBe(201);
    const woId = woRes.body.workOrder.id;

    // Submit FAIL -> immediately sets nc_status = OPEN
    const failSubmit = await call('POST', `/api/vcc/work-orders/${woId}/submit-result`, 'VWO-DCC', {
      performed_at: '2026-05-20',
      result_status: 'FAIL',
      certificate_no: 'CERT-FAIL-99',
      acceptance_criteria: '± 0.02 mm',
      result_remarks: 'ค่าคลาดเคลื่อน +0.08 mm เกินเกณฑ์'
    });
    expect(failSubmit.status).toBe(200);
    expect(failSubmit.body.workOrder.nc_status).toBe('OPEN');

    // Even after Reviewer closes the work order administratively, nc_status remains OPEN
    const closedWo = await call('POST', `/api/vcc/work-orders/${woId}/approve`, 'VWO-REV4', {
      comment: 'รับทราบผลไม่ผ่าน กักเครื่องมือไว้ก่อน'
    });
    expect(closedWo.status).toBe(200);
    expect(closedWo.body.workOrder.status).toBe('CLOSED');
    expect(closedWo.body.workOrder.nc_status).toBe('OPEN');

    // Cannot open a new work order on a held asset
    const blockedNewWo = await call('POST', '/api/vcc/work-orders', 'VWO-DCC', {
      asset_id: asset.body.asset.id,
      provider_name: 'ห้องปฏิบัติการภายนอก',
      due_date: '2026-06-30'
    });
    expect(blockedNewWo.status).toBe(409);
    expect(blockedNewWo.body.error).toMatch(/ON_HOLD/);

    // Reviewer L4 cannot release hold (needs L5+ according to FM approval_matrix)
    expect(
      (await call('POST', `/api/vcc/work-orders/${woId}/release-hold`, 'VWO-REV4', {
        impact_assessment: 'ปรับตั้งและสอบเทียบซ้ำผ่านแล้ว'
      })).status
    ).toBe(403);

    // Approver L6 without impact_assessment is rejected
    expect(
      (await call('POST', `/api/vcc/work-orders/${woId}/release-hold`, 'VWO-APP6', {
        impact_assessment: ''
      })).status
    ).toBe(400);

    // Approver L6 with impact_assessment releases hold
    const released = await call('POST', `/api/vcc/work-orders/${woId}/release-hold`, 'VWO-APP6', {
      impact_assessment: 'ตรวจสอบย้อนหลังผลิตภัณฑ์ไม่พบผลกระทบ และปรับตั้งสอบเทียบซ้ำผ่านแล้ว'
    });
    expect(released.status).toBe(200);
    expect(released.body.workOrder.nc_status).toBe('RELEASED');
  });
});

