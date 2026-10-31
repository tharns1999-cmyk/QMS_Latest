import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';

describe('VCC Phase 1: Asset Register', () => {
  let proxy;
  let env;
  const tokens = {};
  const PASSWORD = 'vcc-pass-123456';
  let initialTypes = [];

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
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('VCCQ', 'ควบคุมคุณภาพ VCC', 'ACTIVE'), ('VCCS', 'คลังสินค้า VCC', 'ACTIVE'), ('VCCX', 'แผนกปิดแล้ว', 'INACTIVE')"),
      ...[['VCC-DCC', 1], ['VCC-USER', 0]].map(([id, dcc]) =>
        env.DB.prepare(
          `INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
           VALUES (?, ?, ?, ?, 'USER', 4, 'VCCQ', '["VCCQ"]', ?)`
        ).bind(id, id, `${id}@vcc.local`, hash, dcc)
      )
    ]);
    for (const id of ['VCC-DCC', 'VCC-USER']) {
      const res = await app.request(
        '/api/auth/login',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${id}@vcc.local`, password: PASSWORD }) },
        env
      );
      tokens[id] = (await res.json()).token;
    }
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'vcc_asset_types'").first();
    initialTypes = row ? JSON.parse(row.value) : [];
  });

  afterAll(async () => {
    if (initialTypes.length) {
      await env.DB.prepare("UPDATE settings SET value = ? WHERE key = 'vcc_asset_types'").bind(JSON.stringify(initialTypes)).run();
    }
    await proxy?.dispose();
  });

  it('rejects non-DCC users on every VCC endpoint with 403', async () => {
    expect((await call('GET', '/api/vcc/assets', 'VCC-USER')).status).toBe(403);
    expect((await call('GET', '/api/vcc/assets/any-id', 'VCC-USER')).status).toBe(403);
    expect((await call('POST', '/api/vcc/assets', 'VCC-USER', { asset_code: 'ST999', name: 'x', asset_type: 'เทอร์โมมิเตอร์', department: 'VCCQ' })).status).toBe(403);
    expect((await call('PUT', '/api/vcc/assets/any-id', 'VCC-USER', { name: 'y' })).status).toBe(403);
    expect((await call('POST', '/api/vcc/assets/any-id/retire', 'VCC-USER', { reason: 'ชำรุด' })).status).toBe(403);
    expect((await call('POST', '/api/vcc/assets/any-id/reactivate', 'VCC-USER', { reason: 'ซ่อมแล้ว' })).status).toBe(403);
    expect((await call('GET', '/api/vcc/asset-types', 'VCC-USER')).status).toBe(403);
    expect((await call('PUT', '/api/vcc/asset-types', 'VCC-USER', { assetTypes: ['เทอร์โมมิเตอร์'] })).status).toBe(403);
  });

  it('creates an asset, refuses duplicate asset_code (case-insensitive) and bad departments, and logs VCC_ASSET_CREATED with asset_id', async () => {
    const created = await call('POST', '/api/vcc/assets', 'VCC-DCC', {
      asset_code: 'st002',
      name: '[ข้อมูลทดสอบ] เทอร์โมมิเตอร์ ST002',
      asset_type: 'เทอร์โมมิเตอร์',
      serial_no: 'SN-40717388',
      model: 'Testo 176T4',
      location: 'ห้องปฏิบัติการ QC',
      department: 'VCCQ'
    });
    expect(created.status).toBe(201);
    expect(created.body.asset).toMatchObject({
      asset_code: 'ST002',
      name: '[ข้อมูลทดสอบ] เทอร์โมมิเตอร์ ST002',
      asset_type: 'เทอร์โมมิเตอร์',
      serial_no: 'SN-40717388',
      model: 'Testo 176T4',
      location: 'ห้องปฏิบัติการ QC',
      department: 'VCCQ',
      status: 'ACTIVE',
      is_group: 0,
      parent_id: null
    });

    // Duplicate asset_code (both exact and lowercase) must be rejected with 409
    expect((await call('POST', '/api/vcc/assets', 'VCC-DCC', {
      asset_code: 'ST002',
      name: 'ซ้ำ',
      asset_type: 'เทอร์โมมิเตอร์',
      department: 'VCCQ'
    })).status).toBe(409);

    expect((await call('POST', '/api/vcc/assets', 'VCC-DCC', {
      asset_code: 'st002',
      name: 'ซ้ำตัวพิมพ์เล็ก',
      asset_type: 'เทอร์โมมิเตอร์',
      department: 'VCCQ'
    })).status).toBe(409);

    // Unknown or inactive department from master data is rejected
    expect((await call('POST', '/api/vcc/assets', 'VCC-DCC', {
      asset_code: 'ST003',
      name: 'แผนกไม่มี',
      asset_type: 'เทอร์โมมิเตอร์',
      department: 'NOPE'
    })).status).toBe(400);

    expect((await call('POST', '/api/vcc/assets', 'VCC-DCC', {
      asset_code: 'ST003',
      name: 'แผนกปิดแล้ว',
      asset_type: 'เทอร์โมมิเตอร์',
      department: 'VCCX'
    })).status).toBe(400);

    // Check audit_log contains asset_id
    const assetId = created.body.asset.id;
    const logRow = await env.DB.prepare(
      "SELECT action, details FROM audit_log WHERE action = 'VCC_ASSET_CREATED' AND json_extract(details, '$.asset_id') = ?"
    ).bind(assetId).first();
    expect(logRow).toBeTruthy();
    expect(JSON.parse(logRow.details)).toMatchObject({ asset_id: assetId, asset_code: 'ST002', department: 'VCCQ' });
  });

  it('enforces flat instrument model: blocks Logical Group & parent_id creation, supports Composite Set details, hides legacy groups by default, and allows independent legacy child reactivation', async () => {
    // 1. Creating a Logical Group via operational API is forbidden (400)
    const blockedGroup = await call('POST', '/api/vcc/assets', 'VCC-DCC', {
      asset_code: 'GRP-SCALE-NEW',
      name: '[ข้อมูลทดสอบ] กลุ่มเครื่องชั่งใหม่',
      asset_type: 'เครื่องชั่ง',
      department: 'VCCS',
      is_group: true
    });
    expect(blockedGroup.status).toBe(400);

    // 2. Creating an instrument with parent_id is forbidden (400)
    const blockedChild = await call('POST', '/api/vcc/assets', 'VCC-DCC', {
      asset_code: 'SC-CHILD-NEW',
      name: '[ข้อมูลทดสอบ] เครื่องชั่งลูก',
      asset_type: 'เครื่องชั่ง',
      department: 'VCCS',
      parent_id: 'some-parent-id'
    });
    expect(blockedChild.status).toBe(400);

    // 3. Creating a Physical Composite Set (1 Calibratable Unit with composite_details) succeeds with is_group = 0
    const compositeRes = await call('POST', '/api/vcc/assets', 'VCC-DCC', {
      asset_code: 'SW001-SET',
      name: '[ข้อมูลทดสอบ] ชุดตุ้มน้ำหนักมาตรฐาน',
      asset_type: 'ตุ้มน้ำหนักมาตรฐาน',
      model: 'Class E2',
      location: 'ห้อง Lab QC',
      department: 'VCCQ',
      group_nature: 'COMPOSITE_SET',
      composite_details: '100 mg, 200 mg, 500 mg, 1 g - 500 g รวม 12 ชิ้น'
    });
    expect(compositeRes.status).toBe(201);
    expect(compositeRes.body.asset).toMatchObject({
      asset_code: 'SW001-SET',
      is_group: 0,
      group_nature: 'COMPOSITE_SET',
      parent_id: null,
      composite_details: '100 mg, 200 mg, 500 mg, 1 g - 500 g รวม 12 ชิ้น'
    });

    // 4. Cannot convert a flat instrument into a Logical Group or assign parent_id via PUT
    const convertBlocked = await call('PUT', `/api/vcc/assets/${compositeRes.body.asset.id}`, 'VCC-DCC', {
      is_group: true,
      group_nature: 'LOGICAL_GROUP'
    });
    expect(convertBlocked.status).toBe(400);

    const attachParentBlocked = await call('PUT', `/api/vcc/assets/${compositeRes.body.asset.id}`, 'VCC-DCC', {
      parent_id: 'legacy-grp-1'
    });
    expect(attachParentBlocked.status).toBe(400);

    // 5. Legacy DB Logical Group + legacy child record: excluded from default GET /api/vcc/assets, preserved for traceability, and child operates independently
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO vcc_assets (id, asset_code, name, asset_type, department, is_group, group_nature, parent_id, status, created_by, updated_by)
         VALUES ('legacy-grp-scale', 'GRP-SCALE', '[ข้อมูลทดสอบ] กลุ่มเครื่องชั่งเดิม', 'เครื่องชั่ง', 'VCCS', 1, 'LOGICAL_GROUP', NULL, 'RETIRED', 'VCC-DCC', 'VCC-DCC')`
      ),
      env.DB.prepare(
        `INSERT INTO vcc_assets (id, asset_code, name, asset_type, department, is_group, group_nature, parent_id, status, retired_reason, created_by, updated_by)
         VALUES ('legacy-sc-001', 'SC-001', '[ข้อมูลทดสอบ] เครื่องชั่งดิจิทัล 1', 'เครื่องชั่ง', 'VCCS', 0, 'LOGICAL_GROUP', 'legacy-grp-scale', 'RETIRED', 'ทดสอบปลดระวาง', 'VCC-DCC', 'VCC-DCC')`
      )
    ]);

    // Legacy child can be reactivated independently even while legacy parent group is RETIRED!
    expect((await call('POST', '/api/vcc/assets/legacy-sc-001/reactivate', 'VCC-DCC', { reason: '   ' })).status).toBe(400);
    const reactivateChildOk = await call('POST', '/api/vcc/assets/legacy-sc-001/reactivate', 'VCC-DCC', {
      reason: 'ซ่อมและสอบเทียบผ่านแล้ว ใช้งานเป็นเครื่องมืออิสระ'
    });
    expect(reactivateChildOk.status).toBe(200);
    expect(reactivateChildOk.body.asset.status).toBe('ACTIVE');

    // Default operational list includes SC-001 & SW001-SET, and excludes Logical Groups even if ACTIVE
    await env.DB.prepare("UPDATE vcc_assets SET status = 'ACTIVE' WHERE id = 'legacy-grp-scale'").run();
    const listRes = await call('GET', '/api/vcc/assets?status=ACTIVE', 'VCC-DCC');
    expect(listRes.status).toBe(200);
    const listedCodes = listRes.body.assets.map((a) => a.asset_code);
    expect(listedCodes).toContain('SC-001');
    expect(listedCodes).toContain('SW001-SET');
    expect(listedCodes).not.toContain('GRP-SCALE');

    // Legacy group record still exists in DB for historical FK / audit traceability via GET /api/vcc/assets/:id
    const detailLegacyGrp = await call('GET', '/api/vcc/assets/legacy-grp-scale', 'VCC-DCC');
    expect(detailLegacyGrp.status).toBe(200);
    expect(detailLegacyGrp.body.asset.asset_code).toBe('GRP-SCALE');

    // Legacy child can be edited cleanly without failing legacy parent checks
    const editChildOk = await call('PUT', '/api/vcc/assets/legacy-sc-001', 'VCC-DCC', {
      location: 'จุดรับวัตถุดิบ อาคาร 2'
    });
    expect(editChildOk.status).toBe(200);
    expect(editChildOk.body.asset.location).toBe('จุดรับวัตถุดิบ อาคาร 2');
  });

  it('keeps ACTIVE and RETIRED separated in list queries, edits assets, and returns full VCC_ASSET_* audit history', async () => {
    const created = await call('POST', '/api/vcc/assets', 'VCC-DCC', {
      asset_code: 'TC001',
      name: '[ข้อมูลทดสอบ] Temperature Controller TC001',
      asset_type: 'Temperature Controller',
      model: 'Dixell XR120C',
      location: 'ห้องเย็น F1',
      department: 'VCCQ'
    });
    const id = created.body.asset.id;

    // Edit asset
    const updated = await call('PUT', `/api/vcc/assets/${id}`, 'VCC-DCC', {
      location: 'ห้องเย็น F1 (ย้ายจุด)',
      serial_no: 'DX-001'
    });
    expect(updated.status).toBe(200);
    expect(updated.body.asset).toMatchObject({ location: 'ห้องเย็น F1 (ย้ายจุด)', serial_no: 'DX-001' });

    // Retire asset
    await call('POST', `/api/vcc/assets/${id}/retire`, 'VCC-DCC', { reason: 'เปลี่ยนรุ่นใหม่' });

    // ACTIVE list never contains RETIRED asset, RETIRED list never contains ACTIVE asset
    const activeList = await call('GET', '/api/vcc/assets?status=ACTIVE', 'VCC-DCC');
    expect(activeList.body.assets.every((a) => a.status === 'ACTIVE')).toBe(true);
    expect(activeList.body.assets.find((a) => a.id === id)).toBeUndefined();

    const retiredList = await call('GET', '/api/vcc/assets?status=RETIRED', 'VCC-DCC');
    expect(retiredList.body.assets.every((a) => a.status === 'RETIRED')).toBe(true);
    expect(retiredList.body.assets.find((a) => a.id === id)).toBeTruthy();

    // Invalid status parameter rejected
    expect((await call('GET', '/api/vcc/assets?status=MIXED', 'VCC-DCC')).status).toBe(400);

    // Reactivate asset
    await call('POST', `/api/vcc/assets/${id}/reactivate`, 'VCC-DCC', { reason: 'นำกลับมาใช้สำรอง' });

    // Detail endpoint returns all 4 VCC_ASSET_* history actions with asset_id
    const detail = await call('GET', `/api/vcc/assets/${id}`, 'VCC-DCC');
    expect(detail.status).toBe(200);
    const actions = detail.body.history.map((h) => h.action);
    expect(actions).toEqual([
      'VCC_ASSET_REACTIVATED',
      'VCC_ASSET_RETIRED',
      'VCC_ASSET_UPDATED',
      'VCC_ASSET_CREATED'
    ]);
    for (const entry of detail.body.history) {
      expect(entry.details.asset_id).toBe(id);
    }
  });

  it('seeds default asset types via migration, lets DCC edit them, and removing a type does not break existing assets using it', async () => {
    const getTypes = await call('GET', '/api/vcc/asset-types', 'VCC-DCC');
    expect(getTypes.status).toBe(200);
    expect(getTypes.body.assetTypes).toEqual(
      expect.arrayContaining(['เทอร์โมมิเตอร์', 'เครื่องชั่ง', 'ตุ้มน้ำหนักมาตรฐาน', 'Temperature Controller'])
    );

    // Create an asset using 'นาฬิกาจับเวลา'
    const timer = await call('POST', '/api/vcc/assets', 'VCC-DCC', {
      asset_code: 'TM-001',
      name: '[ข้อมูลทดสอบ] นาฬิกาจับเวลา 1',
      asset_type: 'นาฬิกาจับเวลา',
      department: 'VCCQ'
    });
    expect(timer.status).toBe(201);
    const timerId = timer.body.asset.id;

    // Remove 'นาฬิกาจับเวลา' from settings
    const reducedTypes = getTypes.body.assetTypes.filter((t) => t !== 'นาฬิกาจับเวลา');
    const saveRes = await call('PUT', '/api/vcc/asset-types', 'VCC-DCC', { assetTypes: reducedTypes });
    expect(saveRes.status).toBe(200);
    expect(saveRes.body.assetTypes).not.toContain('นาฬิกาจับเวลา');

    // Existing asset using 'นาฬิกาจับเวลา' still loads and can still be edited without breaking
    const editExisting = await call('PUT', `/api/vcc/assets/${timerId}`, 'VCC-DCC', {
      location: 'โต๊ะตรวจ QC 2'
    });
    expect(editExisting.status).toBe(200);
    expect(editExisting.body.asset).toMatchObject({
      asset_type: 'นาฬิกาจับเวลา',
      location: 'โต๊ะตรวจ QC 2'
    });
  });
});

