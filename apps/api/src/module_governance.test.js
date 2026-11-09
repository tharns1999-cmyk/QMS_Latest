import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import { sign } from 'hono/jwt';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import app from './index.js';
import { bootstrapModuleAdministrator } from '../scripts/module-admin-local.js';
import { runVccNotificationSweep } from './vccNotifications.js';

describe('Dynamic module governance: real D1, central RBAC and existing VCC workflows', () => {
  let proxy, env;
  const tokens = {};
  const actor = { platform: 'GOV-PLATFORM', manager: 'GOV-MANAGER', dcc: 'GOV-DCC', en: 'GOV-EN', reviewer: 'GOV-PD', approver: 'GOV-MGT', other: 'GOV-OTHER' };
  const call = async (method, path, who = 'manager', body) => {
    const res = await app.request(path, { method, headers: { Authorization: `Bearer ${tokens[who] || ''}`, 'Content-Type': 'application/json' }, ...(body && { body: JSON.stringify(body) }) }, env);
    return { status: res.status, body: await res.json() };
  };
  const version = async () => (await env.DB.prepare("SELECT version FROM module_configuration WHERE module_id='vcc'").first()).version;
  const status = async (state) => call('PUT', '/api/module-governance/vcc/status', 'manager', { status: state, version: await version(), reason: '[ข้อมูลทดสอบ] เปลี่ยนสถานะ', maintenance_message: state === 'MAINTENANCE' ? 'กำลังปรับปรุง VCC' : '' });
  const profile = { document_code: 'TEST-FM-EN', revision: '01', reviewer_dept: 'PD', approver_dept: 'MGT', min_preparer_level: 4, required_reviewer_level: 5,
    required_approver_level: 6, assigned_reviewer_id: actor.reviewer, assigned_approver_id: actor.approver };
  let planId, assetId, workOrderId, originalDueDate;

  beforeAll(async () => {
    const testPath = resolve('.wrangler/governance-test');
    if (!testPath.startsWith(resolve('.wrangler') + sep) || !testPath.endsWith(`${sep}governance-test`)) throw new Error('Invalid isolated test database path');
    rmSync(testPath, { recursive:true, force:true });
    execFileSync(process.execPath, [resolve('node_modules/wrangler/bin/wrangler.js'),'d1','migrations','apply','DB','--local','--persist-to',testPath], {stdio:'pipe',env:{...process.env,CI:'true'}});
    proxy = await getPlatformProxy({ persist: { path: `${testPath}/v3` } });
    env = { ...proxy.env, JWT_SECRET: 'governance-test-secret' };
    await env.DB.prepare("UPDATE settings SET value='0' WHERE key IN ('two_factor_min_level','two_factor_for_dcc')").run();
    for (const [who, id] of Object.entries(actor)) {
      const department = who === 'en' ? 'EN' : who === 'reviewer' ? 'PD' : who === 'approver' ? 'MGT' : who === 'other' ? 'WH' : 'DC';
      const level = who === 'reviewer' ? 5 : who === 'approver' ? 6 : 4;
      await env.DB.prepare(`INSERT INTO users(id,name,email,password_hash,role,approval_level,primary_department,departments,is_dcc,status)
        VALUES(?,?,?,'test-only','USER',?,?,?,?, 'ACTIVE')`).bind(id, `[ข้อมูลทดสอบ] ${who}`, `${id}@test.local`, level, department, JSON.stringify([department]), Number(['platform','manager','dcc'].includes(who))).run();
      tokens[who] = await sign({ sub: id, iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600 }, env.JWT_SECRET, 'HS256');
    }
    await env.DB.prepare("INSERT INTO settings(key,value) VALUES('vcc_asset_types','[\"TEST\"]') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
    expect(await bootstrapModuleAdministrator(env.DB, actor.platform, '[ข้อมูลทดสอบ] bootstrap')).toEqual({alreadyAssigned:false});
    expect(await bootstrapModuleAdministrator(env.DB, actor.platform, '[ข้อมูลทดสอบ] bootstrap')).toEqual({alreadyAssigned:true});
    await expect(bootstrapModuleAdministrator(env.DB, actor.manager, 'test')).rejects.toThrow(/already exists/);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO module_permission_grants(user_id,permission,module_id) VALUES(?,'MODULE_MANAGE','vcc')").bind(actor.manager),
      env.DB.prepare(`INSERT INTO documents(id,doc_code,revision,name,doc_type,department,status,effective_date) VALUES('GOV-FORM','TEST-FM-EN','01','[ข้อมูลทดสอบ] แบบฟอร์ม EN','FM','EN','EFFECTIVE','2020-01-01')`)
    ]);
  }, 120000);
  afterAll(async () => { await status('ACTIVE'); await proxy?.dispose(); });

  it('requires a live session and rejects forged permission attributes', async () => {
    expect((await call('GET','/api/modules','missing')).status).toBe(401);
    expect((await call('PUT','/api/module-governance/vcc/status','dcc',{ status:'DISABLED',version:await version(),reason:'test',permissions:['MODULE_MANAGE'],isPlatformAdmin:true })).status).toBe(403);
    expect((await call('GET','/api/module-governance/vcc','en')).status).toBe(403);
  });
  it('shows DCC unchanged and reports incomplete legacy form mappings honestly', async () => {
    const modules = await call('GET','/api/modules','dcc');
    expect(modules.body.modules.find((m)=>m.moduleId==='dcc')).toMatchObject({status:'ACTIVE',allowed:true,canManage:false});
    const config = await call('GET','/api/module-governance/vcc');
    expect(config.status).toBe(200);
    expect(config.body.readiness.QC.status).toBe('CONFIGURATION_INCOMPLETE');
    expect(config.body.departments.find((d)=>d.code==='EN').enabled).toBe(0);
  });
  it('cannot enable an incomplete department or invent a controlled form mapping', async () => {
    expect((await call('PUT','/api/module-governance/vcc/departments/EN','manager',{ enabled:true,version:await version(),reason:'test' })).status).toBe(422);
    const res = await call('PUT','/api/module-governance/vcc/profiles/EN','manager',{...profile,document_code:'MISSING',version:await version(),reason:'test'});
    expect(res.status).toBe(422); expect(res.body.code).toBe('CONFIGURATION_INCOMPLETE');
  });
  it('rejects absent, inactive and underqualified assignees, wrong departments and SoD', async () => {
    for (const extra of [{assigned_reviewer_id:'MISSING'},{assigned_reviewer_id:actor.en},{reviewer_dept:'WH'},{assigned_approver_id:actor.reviewer,approver_dept:'PD'}, {required_reviewer_level:3}]) {
      expect((await call('PUT','/api/module-governance/vcc/profiles/EN','manager',{...profile,...extra,version:await version(),reason:'test'})).status).toBe(422);
    }
    await env.DB.prepare("UPDATE users SET status='INACTIVE' WHERE id=?").bind(actor.reviewer).run();
    expect((await call('PUT','/api/module-governance/vcc/profiles/EN','manager',{...profile,version:await version(),reason:'test'})).status).toBe(422);
    await env.DB.prepare("UPDATE users SET status='ACTIVE' WHERE id=?").bind(actor.reviewer).run();
  });
  it('configures EN from master data and enables it without department-specific source changes', async () => {
    expect((await call('PUT','/api/module-governance/vcc/profiles/EN','manager',{...profile,version:await version(),reason:'[ข้อมูลทดสอบ] ตั้งค่า EN'})).status).toBe(200);
    expect((await call('PUT','/api/module-governance/vcc/departments/EN','manager',{enabled:true,version:await version(),reason:'[ข้อมูลทดสอบ] เปิด EN'})).status).toBe(200);
    const access = (await call('GET','/api/modules','en')).body.modules.find((m)=>m.moduleId==='vcc');
    expect(access).toMatchObject({allowed:true,canEnter:true});
    expect((await call('GET','/api/vcc/assets?status=ACTIVE','en')).status).toBe(200);
  });
  it('EN creates its own asset and mapped plan, while cross-department creation fails', async () => {
    const asset=await call('POST','/api/vcc/assets','en',{asset_code:'GOV-EN-01',name:'[ข้อมูลทดสอบ] EN',asset_type:'TEST',department:'EN'});
    expect(asset.status,JSON.stringify(asset.body)).toBe(201); assetId=asset.body.asset.id;
    const plan=await call('POST','/api/vcc/plans','en',{plan_year:2031,department:'EN',document_code:'FORGED-CODE'});
    expect(plan.status).toBe(201); planId=plan.body.plan.id;
    expect(plan.body.plan.document_code).toBe('TEST-FM-EN');
    expect((await call('POST','/api/vcc/plans','en',{plan_year:2031,department:'QC'})).status).toBe(403);
  });
  it('preserves QC/LB access and isolates external assignees to their assigned plan', async () => {
    const item=await call('POST',`/api/vcc/plans/${planId}/items`,'en',{asset_id:assetId,provider_name:'[ข้อมูลทดสอบ] ภายใน',responsible_dept:'EN',planned_months:[1],acceptance_criteria:'[ข้อมูลทดสอบ] ตามข้อกำหนด'});
    expect(item.status,JSON.stringify(item.body)).toBe(201);
    const submit=await call('POST',`/api/vcc/plans/${planId}/submit`,'en',{});
    expect(submit.status,JSON.stringify(submit.body)).toBe(200);
    const tasks=await call('GET','/api/vcc/tasks','reviewer');
    expect(tasks.status).toBe(200); expect(tasks.body.tasks.some((t)=>t.planId===planId)).toBe(true);
    expect((await call('GET',`/api/vcc/plans/${planId}`,'reviewer')).status).toBe(200);
    expect((await call('GET',`/api/vcc/assets/${assetId}`,'reviewer')).status).toBe(403);
    expect((await call('GET',`/api/vcc/plans/${planId}`,'other')).status).toBe(403);
    expect((await call('POST',`/api/vcc/plans/${planId}/review`,'en',{})).status).toBe(403);
    expect((await call('POST',`/api/vcc/plans/${planId}/review`,'reviewer',{})).status).toBe(200);
    const approved=await call('POST',`/api/vcc/plans/${planId}/approve`,'approver',{});
    expect(approved.status,JSON.stringify(approved.body)).toBe(200);
    const order=await env.DB.prepare('SELECT id,due_date FROM vcc_work_orders WHERE plan_id=?').bind(planId).first();
    expect(order).toBeTruthy();workOrderId=order.id;originalDueDate=order.due_date;
  });
  it('requires reasons and rejects stale configuration without an orphan audit row', async () => {
    expect((await call('PUT','/api/module-governance/vcc/status','manager',{status:'READ_ONLY',version:await version()})).status).toBe(400);
    const old=await version(); expect((await status('READ_ONLY')).status).toBe(200);
    const count=()=>env.DB.prepare("SELECT count(*) AS n FROM audit_log WHERE action='MODULE_STATUS_CHANGED'").first();
    const before=await count();
    expect((await call('PUT','/api/module-governance/vcc/status','manager',{status:'ACTIVE',version:old,reason:'stale'})).status).toBe(409);
    expect(await count()).toEqual(before);
  });
  it('READ_ONLY permits reads and rejects direct writes and approvals', async () => {
    expect((await call('GET',`/api/vcc/assets/${assetId}`,'en')).status).toBe(200);
    for (const path of ['/api/vcc/assets',`/api/vcc/plans/${planId}/approve`,'/api/vcc/notifications/sweep']) expect((await call('POST',path,'manager',{})).status).toBe(403);
    expect((await call('PUT',`/api/vcc/assets/${assetId}`,'en',{name:'race'})).status).toBe(403);
  });
  it('MAINTENANCE blocks ordinary routes and in-flight batches but preserves tracking and authorized alerts', async () => {
    expect((await status('MAINTENANCE')).status).toBe(200);
    expect((await call('GET','/api/vcc/assets','en')).status).toBe(503);
    expect((await call('POST',`/api/vcc/plans/${planId}/approve`,'approver',{})).status).toBe(503);
    const before=await env.DB.prepare('SELECT name FROM vcc_assets WHERE id=?').bind(assetId).first();
    expect((await call('PUT',`/api/vcc/assets/${assetId}`,'en',{name:'partial'})).status).toBe(503);
    expect(await env.DB.prepare('SELECT name FROM vcc_assets WHERE id=?').bind(assetId).first()).toEqual(before);
    await runVccNotificationSweep(env.DB,{nowDate:'2031-12-01'});
    const first=await env.DB.prepare('SELECT count(*) n FROM vcc_notifications').first();
    expect(first.n).toBeGreaterThan(0);
    expect((await env.DB.prepare('SELECT due_date FROM vcc_work_orders WHERE id=?').bind(workOrderId).first()).due_date).toBe(originalDueDate);
    await runVccNotificationSweep(env.DB,{nowDate:'2031-12-01'});
    expect(await env.DB.prepare('SELECT count(*) n FROM vcc_notifications').first()).toEqual(first);
    expect((await call('GET','/api/module-governance/vcc/alerts')).status).toBe(200);
    expect((await call('GET','/api/module-governance/vcc/alerts','dcc')).status).toBe(403);
  });
  it('DISABLED preserves records, and restoring ACTIVE restores access', async () => {
    expect((await status('DISABLED')).status).toBe(200);
    expect((await call('GET','/api/vcc/assets','en')).status).toBe(503);
    expect(await env.DB.prepare('SELECT id FROM vcc_annual_plans WHERE id=?').bind(planId).first()).toBeTruthy();
    expect((await status('ACTIVE')).status).toBe(200);
    expect((await call('GET',`/api/vcc/assets/${assetId}`,'en')).status).toBe(200);
  });
  it('department disable blocks new registrations/plans but keeps existing work and history', async () => {
    const impact=await call('GET','/api/module-governance/vcc/impact?department=EN'); expect(impact.status).toBe(200); expect(impact.body.plans.length).toBeGreaterThan(0);
    expect((await call('PUT','/api/module-governance/vcc/departments/EN','manager',{enabled:false,version:await version(),reason:'[ข้อมูลทดสอบ] หยุดรับงานใหม่'})).status).toBe(200);
    expect((await call('POST','/api/vcc/assets','en',{asset_code:'GOV-EN-02',name:'new',asset_type:'TEST',department:'EN'})).status).toBe(403);
    expect((await call('POST','/api/vcc/plans','en',{plan_year:2032,department:'EN'})).status).toBe(403);
    expect((await call('GET',`/api/vcc/assets/${assetId}`,'en')).status).toBe(200);
    expect((await call('GET',`/api/vcc/plans/${planId}`,'reviewer')).status).toBe(200);
    const recorded=await call('POST',`/api/vcc/work-orders/${workOrderId}/submit-result`,'en',{result_status:'PASS',performed_at:'2026-11-01',certificate_no:'[ข้อมูลทดสอบ] EVIDENCE',acceptance_criteria:'[ข้อมูลทดสอบ] ผ่านตามข้อกำหนด'});
    expect(recorded.status,JSON.stringify(recorded.body)).toBe(200);
    const closed=await call('POST',`/api/vcc/work-orders/${workOrderId}/approve`,'approver',{});
    expect(closed.status,JSON.stringify(closed.body)).toBe(200);
    expect((await env.DB.prepare('SELECT status,due_date FROM vcc_work_orders WHERE id=?').bind(workOrderId).first())).toEqual({status:'CLOSED',due_date:originalDueDate});
  });
  it('configuration audit records contain the real actor, reason and before/after', async () => {
    const result=await call('GET','/api/module-governance/vcc/history'); expect(result.status).toBe(200);
    const row=result.body.history.find((r)=>r.action==='MODULE_DEPARTMENT_CHANGED'); const details=JSON.parse(row.details);
    expect(row.actor_id).toBe(actor.manager); expect(details.reason).toBeTruthy(); expect(details.before).toBeTruthy(); expect(details.after).toEqual({enabled:false});
  });
  it('only platform administration can assign/revoke module managers; grants are live and audited', async () => {
    const grant={user_id:actor.dcc,permission:'MODULE_MANAGE',module_id:'vcc',reason:'[ข้อมูลทดสอบ] มอบหมาย'};
    expect((await call('POST','/api/module-governance/permissions','manager',grant)).status).toBe(403);
    expect((await call('POST','/api/module-governance/permissions','platform',grant)).status).toBe(200);
    expect((await call('GET','/api/module-governance/vcc','dcc')).status).toBe(200);
    expect((await call('DELETE','/api/module-governance/permissions','platform',grant)).status).toBe(200);
    expect((await call('GET','/api/module-governance/vcc','dcc')).status).toBe(403);
    expect((await call('DELETE','/api/module-governance/permissions','platform',{...grant,user_id:actor.platform,permission:'PLATFORM_ADMIN',module_id:'*'})).status).toBe(409);
  });
  it('ordinary DCC cannot take over a governance administrator through user settings or password/2FA resets', async () => {
    expect((await call('PATCH',`/api/users/${actor.platform}`,'dcc',{email:'takeover@test.local'})).status).toBe(403);
    expect((await call('POST',`/api/users/${actor.platform}/reset-password`,'dcc',{})).status).toBe(403);
    expect((await call('POST',`/api/users/${actor.platform}/two-factor/reset`,'dcc',{})).status).toBe(403);
  });
  it('protects DCC controls and rejects unknown/inactive departments', async () => {
    const body={status:'DISABLED',reason:'test',version:await version()};
    expect((await call('PUT','/api/module-governance/dcc/status','manager',body)).status).toBe(403);
    expect((await call('PUT','/api/module-governance/dcc/status','platform',body)).status).toBe(409);
    expect((await call('PUT','/api/module-governance/vcc/departments/UNKNOWN','manager',{enabled:false,reason:'test',version:await version()})).status).toBe(404);
    expect((await call('GET','/api/documents?status=EFFECTIVE','en')).status).toBe(200);
  });
});
