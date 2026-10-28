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

  it('enforces 1-level group hierarchy, blocks changing is_group when children exist, and blocks retiring a group with ACTIVE children', async () => {
    // 1. Create parent group
    const groupRes = await call('POST', '/api/vcc/assets', 'VCC-DCC', {
      asset_code: 'GRP-SCALE',
      name: '[ข้อมูลทดสอบ] กลุ่มเครื่องชั่ง',
      asset_type: 'เครื่องชั่ง',
      location: 'คลังสินค้า Store',
      department: 'VCCS',
      is_group: true
    });
    expect(groupRes.status).toBe(201);
    const groupId = groupRes.body.asset.id;
    expect(groupRes.body.asset.is_group).toBe(1);

    // 2. Group inside another group is forbidden (1 level only)
    const nestedGroup = await call('POST', '/api/vcc/assets', 'VCC-DCC', {
      asset_code: 'GRP-SUB',
      name: 'กลุ่มย่อยซ้อน',
      asset_type: 'เครื่องชั่ง',
      department: 'VCCS',
      is_group: true,
      parent_id: groupId
    });
    expect(nestedGroup.status).toBe(400);

    // 3. Create child asset under group
    const childRes = await call('POST', '/api/vcc/assets', 'VCC-DCC', {
      asset_code: 'SC-001',
      name: '[ข้อมูลทดสอบ] เครื่องชั่งดิจิทัล 1',
      asset_type: 'เครื่องชั่ง',
      serial_no: '',
      model: 'Mettler',
      location: 'จุดรับวัตถุดิบ',
      department: 'VCCS',
      parent_id: groupId
    });
    expect(childRes.status).toBe(201);
    const childId = childRes.body.asset.id;
    expect(childRes.body.asset.parent_id).toBe(groupId);

    // 4. Child under a non-group asset is forbidden (1 level only)
    const grandChild = await call('POST', '/api/vcc/assets', 'VCC-DCC', {
      asset_code: 'SC-001-A',
      name: 'ลูกซ้อนลูก',
      asset_type: 'เครื่องชั่ง',
      department: 'VCCS',
      parent_id: childId
    });
    expect(grandChild.status).toBe(400);

    // 5. Cannot change is_group of parent while it has children
    const changeIsGroup = await call('PUT', `/api/vcc/assets/${groupId}`, 'VCC-DCC', {
      is_group: false
    });
    expect(changeIsGroup.status).toBe(409);

    // 6. Cannot retire parent group while child is ACTIVE
    const retireGroupBlocked = await call('POST', `/api/vcc/assets/${groupId}/retire`, 'VCC-DCC', {
      reason: 'จะปลดกลุ่มแต่ลูกยังใช้งานอยู่'
    });
    expect(retireGroupBlocked.status).toBe(409);

    // 7. Retire child requires reason, then parent group can be retired
    expect((await call('POST', `/api/vcc/assets/${childId}/retire`, 'VCC-DCC', { reason: '   ' })).status).toBe(400);
    const retireChild = await call('POST', `/api/vcc/assets/${childId}/retire`, 'VCC-DCC', {
      reason: 'เครื่องชั่งชำรุด ส่งจำหน่าย'
    });
    expect(retireChild.status).toBe(200);
    expect(retireChild.body.asset.status).toBe('RETIRED');

    const retireGroupOk = await call('POST', `/api/vcc/assets/${groupId}/retire`, 'VCC-DCC', {
      reason: 'ปลดกลุ่มเครื่องชั่งเดิม'
    });
    expect(retireGroupOk.status).toBe(200);
    expect(retireGroupOk.body.asset.status).toBe('RETIRED');

    // 8. Cannot add a new child into a RETIRED group
    const childIntoRetired = await call('POST', '/api/vcc/assets', 'VCC-DCC', {
      asset_code: 'SC-002',
      name: 'เครื่องชั่งใหม่',
      asset_type: 'เครื่องชั่ง',
      department: 'VCCS',
      parent_id: groupId
    });
    expect(childIntoRetired.status).toBe(400);

    // 9. Cannot reactivate child while parent group is still RETIRED
    const reactivateChildBlocked = await call('POST', `/api/vcc/assets/${childId}/reactivate`, 'VCC-DCC', {
      reason: 'ซ่อมเสร็จแล้ว'
    });
    expect(reactivateChildBlocked.status).toBe(409);

    // 10. Reactivate parent group (requires reason), then reactivate child
    expect((await call('POST', `/api/vcc/assets/${groupId}/reactivate`, 'VCC-DCC', {})).status).toBe(400);
    const reactivateGroup = await call('POST', `/api/vcc/assets/${groupId}/reactivate`, 'VCC-DCC', {
      reason: 'เปิดใช้งานกลุ่มเครื่องชั่งอีกครั้ง'
    });
    expect(reactivateGroup.status).toBe(200);
    expect(reactivateGroup.body.asset.status).toBe('ACTIVE');

    const reactivateChildOk = await call('POST', `/api/vcc/assets/${childId}/reactivate`, 'VCC-DCC', {
      reason: 'ซ่อมและสอบเทียบผ่านแล้ว'
    });
    expect(reactivateChildOk.status).toBe(200);
    expect(reactivateChildOk.body.asset.status).toBe('ACTIVE');
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

