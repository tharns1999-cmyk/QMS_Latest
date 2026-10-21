import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';

describe('controlled copy requests', () => {
  let proxy;
  let env;
  const tokens = {};
  const request = async (method, path, who, body) => {
    const res = await app.request(path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[who]}` }, body: body && JSON.stringify(body) }, env);
    return { status: res.status, body: await res.json() };
  };
  const post = (path, who, body = {}) => request('POST', path, who, body);
  const PDF = new TextEncoder().encode('%PDF-1.4 test');
  // Departments QCA (owner) and QCB (holds a copy) are this file's own; other test files share the local D1.
  const publish = async (body) => {
    const { dar } = (await post('/api/dars', 'Q-REQ', { reason: 'ทดสอบ', reviewer_id: 'Q-HOD', approver_id: 'Q-APP', ...body })).body;
    if (body.type !== 'OBSOLETE') await app.request(`/api/dars/${dar.id}/file`, { method: 'PUT', headers: { 'Content-Type': 'application/pdf', Authorization: `Bearer ${tokens['Q-REQ']}` }, body: PDF }, env);
    await post(`/api/dars/${dar.id}/decision`, 'Q-HOD', { decision: 'APPROVE' });
    return (await post(`/api/dars/${dar.id}/decision`, 'Q-APP', { decision: 'APPROVE' })).body.dar;
  };
  const copies = async (who, code) => (await request('GET', '/api/controlled-copies', who)).body.copies.filter((c) => c.doc_code === code);
  const dist = [{ department: 'QCA', location_id: 'QCA-OFFICE', location_name: 'QCA Office' }, { department: 'QCB', location_name: 'คลัง B1' }, { department: 'QCB', location_name: 'คลัง B2' }];
  // A document with copies 01 (QCA), 02 and 03 (QCB) that are dispatched and received, so they are in the field.
  const inField = async (access_scope = 'GENERAL') => {
    const dar = await publish({ type: 'NEW', doc_type: 'SD', department: 'QCA', name: 'สำเนาเพิ่ม', access_scope, distributions: dist });
    for (const c of await copies('Q-DCC', dar.doc_code)) {
      await post(`/api/controlled-copies/${c.id}/dispatch`, 'Q-DCC');
      await post(`/api/controlled-copies/${c.id}/receive`, c.department === 'QCA' ? 'Q-HOD' : 'Q-BHEAD');
    }
    const byNo = Object.fromEntries((await copies('Q-DCC', dar.doc_code)).map((c) => [c.copy_no, c]));
    return { code: dar.doc_code, documentId: dar.document_id, byNo };
  };

  beforeAll(async () => {
    proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
    env = { ...proxy.env, JWT_SECRET: 'test-secret' };
    const hash = await hashPassword('cr-pass');
    const users = [['Q-REQ', 'QCA', 2, 0], ['Q-HOD', 'QCA', 4, 0], ['Q-APP', 'QCA', 5, 0], ['Q-DCC', 'DC', 4, 1], ['Q-BHEAD', 'QCB', 4, 0], ['Q-BSTAFF', 'QCB', 2, 0], ['Q-OTHER', 'QCZ', 2, 0]];
    await env.DB.batch(users.map(([id, dept, level, dcc]) => env.DB.prepare(`INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
      VALUES (?, ?, ?, ?, 'USER', ?, ?, ?, ?)`).bind(id, id, `${id}@test.local`, hash, level, dept, JSON.stringify([dept]), dcc)));
    for (const [id] of users) {
      const res = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${id}@test.local`, password: 'cr-pass' }) }, env);
      tokens[id] = (await res.json()).token;
    }
  });

  afterAll(() => proxy?.dispose());

  it('an extra copy gets the next number and goes through DCC like any other', async () => {
    const { code, documentId } = await inField();
    const url = `/api/documents/${documentId}/additional-copies`;
    const place = { department: 'QCB', location_name: 'คลัง B3' };
    expect((await post(url, 'Q-OTHER', { reason: 'ต้องใช้', locations: [place] })).status).toBe(403); // not the owner, and not its place
    const hidden = await inField('DEPT');
    expect((await post(`/api/documents/${hidden.documentId}/additional-copies`, 'Q-BHEAD', { reason: 'ต้องใช้', locations: [place] })).status).toBe(404); // a department-only document is hidden from others
    expect((await post(url, 'Q-BSTAFF', { reason: 'ต้องใช้', locations: [{ department: 'QCZ', location_name: 'x' }] })).status).toBe(403); // asked for a place it does not belong to
    expect((await post(url, 'Q-BHEAD', { reason: '', locations: [place] })).status).toBe(400);
    expect((await post(url, 'Q-BHEAD', { reason: 'ต้องใช้', locations: [] })).status).toBe(400);

    const { status, body } = await post(url, 'Q-BHEAD', { reason: 'ขยายไลน์', locations: [place, { department: 'QCB', location_name: 'คลัง B4' }] });
    expect(status).toBe(201);
    expect(body.copies.map((c) => [c.copy_no, c.status, c.origin, c.location_name])).toEqual([['04', 'PENDING_ISSUE', 'ADDITIONAL', 'คลัง B3'], ['05', 'PENDING_ISSUE', 'ADDITIONAL', 'คลัง B4']]);
    expect((await post(`/api/controlled-copies/${body.copies[0].id}/dispatch`, 'Q-DCC')).body.copy.status).toBe('DISPATCHED_PENDING_RECEIPT');
    expect((await copies('Q-DCC', code)).length).toBe(5);
  });

  it('a damaged copy goes back to DCC and a replacement with the next issue number waits to be printed', async () => {
    const { code, byNo } = await inField();
    const copy = byNo['02'];
    const url = `/api/controlled-copies/${copy.id}/report`;
    expect((await post(url, 'Q-OTHER', { type: 'DAMAGED', reason: 'ขาด' })).status).toBe(403);
    expect((await post(url, 'Q-BSTAFF', { type: 'BROKEN', reason: 'ขาด' })).status).toBe(400);
    expect((await post(url, 'Q-BSTAFF', { type: 'DAMAGED', reason: '' })).status).toBe(400);
    const { status, body } = await post(url, 'Q-BSTAFF', { type: 'DAMAGED', reason: 'ฉีกขาด' });
    expect(status).toBe(201);
    expect(body.copy).toMatchObject({ status: 'PENDING_RECALL', report_kind: 'DAMAGED' });
    expect(body.replacement).toMatchObject({ copy_no: '02', issue_no: 2, status: 'PENDING_ISSUE', origin: 'REPLACEMENT', replaces_id: copy.id, department: 'QCB', location_name: copy.location_name });
    expect((await post(url, 'Q-BSTAFF', { type: 'DAMAGED', reason: 'ซ้ำ' })).status).toBe(409); // already reported
    // DCC takes the damaged one back with the existing recall step.
    expect((await post(`/api/controlled-copies/${copy.id}/recall`, 'Q-DCC', { note: 'ทำลาย' })).body.copy.status).toBe('RECALLED');
    expect((await copies('Q-DCC', code)).length).toBe(4);
  });

  it('a lost copy is closed as lost, is not recalled, and is replaced; a replacement can be replaced again', async () => {
    const { byNo } = await inField();
    const { body } = await post(`/api/controlled-copies/${byNo['03'].id}/report`, 'Q-BHEAD', { type: 'LOST', reason: 'หาย' });
    expect(body.copy).toMatchObject({ status: 'LOST', report_kind: 'LOST' });
    expect(body.replacement).toMatchObject({ issue_no: 2, status: 'PENDING_ISSUE' });
    const again = await post(`/api/controlled-copies/${body.replacement.id}/report`, 'Q-DCC', { type: 'LOST', reason: 'ไม่ใช่ของเรา' });
    expect(again.status).toBe(409); // it was never received, so it is not in the field
    await post(`/api/controlled-copies/${body.replacement.id}/dispatch`, 'Q-DCC');
    await post(`/api/controlled-copies/${body.replacement.id}/receive`, 'Q-BHEAD');
    const second = await post(`/api/controlled-copies/${body.replacement.id}/report`, 'Q-DCC', { type: 'LOST', reason: 'หายอีก' });
    expect(second.body.replacement).toMatchObject({ copy_no: '03', issue_no: 3 });
  });

  it('a relocation waits for DCC; approval moves the copy, rejection leaves it; Copy 01 never moves', async () => {
    const { byNo } = await inField();
    const url = (c) => `/api/controlled-copies/${c.id}/relocate`;
    expect((await post(url(byNo['01']), 'Q-HOD', { reason: 'ย้าย', new_location_name: 'อื่น' })).status).toBe(400);
    expect((await post(url(byNo['02']), 'Q-OTHER', { reason: 'ย้าย', new_location_name: 'อื่น' })).status).toBe(403);
    expect((await post(url(byNo['02']), 'Q-BHEAD', { reason: 'ย้าย' })).status).toBe(400); // no destination
    const asked = await post(url(byNo['02']), 'Q-BHEAD', { reason: 'ปรับพื้นที่', new_location_name: 'คลัง C1', new_department: 'qca' });
    expect(asked.body.copy).toMatchObject({ status: 'RELOCATION_PENDING_APPROVAL', new_department: 'QCA', new_location_name: 'คลัง C1' });
    expect((await post(url(byNo['02']), 'Q-BHEAD', { reason: 'อีกที', new_location_name: 'x' })).status).toBe(409); // one request at a time
    expect((await post(`/api/controlled-copies/${byNo['02'].id}/decide`, 'Q-BHEAD', { decision: 'APPROVE' })).status).toBe(403); // not DCC
    expect((await post(`/api/controlled-copies/${byNo['02'].id}/decide`, 'Q-DCC', { decision: 'REJECT' })).status).toBe(400); // reason needed
    const moved = (await post(`/api/controlled-copies/${byNo['02'].id}/decide`, 'Q-DCC', { decision: 'APPROVE', note: 'ตรวจแล้ว' })).body.copy;
    expect(moved).toMatchObject({ status: 'ISSUED_ACTIVE', department: 'QCA', location_name: 'คลัง C1', new_location_name: null, decision_note: 'ตรวจแล้ว' });
    expect((await post(`/api/controlled-copies/${byNo['02'].id}/decide`, 'Q-DCC', { decision: 'APPROVE' })).status).toBe(409); // nothing waiting

    await post(url(byNo['03']), 'Q-BHEAD', { reason: 'ย้าย', new_location_name: 'คลัง D' });
    const kept = (await post(`/api/controlled-copies/${byNo['03'].id}/decide`, 'Q-DCC', { decision: 'REJECT', note: 'ยังไม่พร้อม' })).body.copy;
    expect(kept).toMatchObject({ status: 'ISSUED_ACTIVE', department: 'QCB', location_name: 'คลัง B2', new_location_name: null });
  });

  it('a return waits for DCC; approval takes the copy out of service and records how it was handled', async () => {
    const { byNo } = await inField();
    const url = (c) => `/api/controlled-copies/${c.id}/return`;
    expect((await post(url(byNo['01']), 'Q-HOD', { reason: 'คืน' })).status).toBe(400);
    expect((await post(url(byNo['02']), 'Q-BHEAD', { reason: 'คืน', return_date: 'พรุ่งนี้' })).status).toBe(400);
    expect((await post(url(byNo['02']), 'Q-BHEAD', { reason: 'เลิกใช้จุดนี้', return_date: '2999-01-01' })).body.copy).toMatchObject({ status: 'RETURN_PENDING_APPROVAL', return_date: '2999-01-01' });
    const done = (await post(`/api/controlled-copies/${byNo['02'].id}/decide`, 'Q-DCC', { decision: 'APPROVE', disposition: 'DESTROY', witness: 'สมชาย', note: 'ทำลายแล้ว' })).body.copy;
    expect(done).toMatchObject({ status: 'RECALLED', recalled_by: 'Q-DCC', return_date: null });
    expect(done.decision_note).toBe('DESTROY | พยาน: สมชาย | ทำลายแล้ว');
  });

  it('a new revision recalls copies that were waiting on a request, and every step is audited', async () => {
    const { code, documentId, byNo } = await inField();
    await post(`/api/controlled-copies/${byNo['02'].id}/relocate`, 'Q-BHEAD', { reason: 'ย้าย', new_location_name: 'คลัง E' });
    await post(`/api/controlled-copies/${byNo['03'].id}/return`, 'Q-BHEAD', { reason: 'คืน' });
    const rev = await publish({ type: 'REVISION', doc_code: code, department: 'QCA', reason: 'แก้ไข', distributions: [dist[0]] });
    expect(rev.status).toBe('COMPLETED');
    const old = (await copies('Q-DCC', code)).filter((c) => c.revision === '00');
    expect(old.map((c) => [c.copy_no, c.status]).sort()).toEqual([['01', 'PENDING_RECALL'], ['02', 'PENDING_RECALL'], ['03', 'PENDING_RECALL']]);
    const actions = (await env.DB.prepare("SELECT action FROM audit_log WHERE action LIKE 'CC_%' AND json_extract(details, '$.doc_code') = ?").bind(code).all()).results.map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(['CC_RELOCATION_REQUESTED', 'CC_RETURN_REQUESTED']));
    expect(documentId).toBeTruthy();
  });
});
