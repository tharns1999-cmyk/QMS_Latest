import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const api='http://127.0.0.1:8788';
const artifactDir=process.env.QMS_GOVERNANCE_ARTIFACT_DIR || join(tmpdir(),'qms-governance-review');
const token=(who)=>{
  const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const payload=Buffer.from(JSON.stringify({sub:`GOV-${who}`,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
  return `${header}.${payload}.${createHmac('sha256','governance-test-secret').update(`${header}.${payload}`).digest('base64url')}`;
};
const request=async(method,path,who='PLATFORM',body)=>{
  const res=await fetch(api+path,{method,headers:{Authorization:`Bearer ${token(who)}`,'Content-Type':'application/json'},...(body&&{body:JSON.stringify(body)})});
  return {status:res.status,body:await res.json()};
};
const session=async(page,who)=>page.addInitScript((value)=>sessionStorage.setItem('qms-api-token',value),token(who));
const confirm=async(page,reason)=>{
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button',{name:'ยืนยันการเปลี่ยนแปลง'})).toBeDisabled();
  await dialog.getByLabel('เหตุผลในการเปลี่ยนแปลง').fill(reason);
  await dialog.getByRole('button',{name:'ยืนยันการเปลี่ยนแปลง'}).click();await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'โหลดข้อมูลล่าสุด'})).toBeEnabled();
};
const changeStatus=async(page,status)=>{
  await page.getByRole('combobox',{name:'เปลี่ยนสถานะ',exact:true}).selectOption(status);
  await page.getByLabel('ข้อความแจ้งผู้ใช้งาน').fill(status==='MAINTENANCE'?'[ข้อมูลทดสอบ] กำลังปรับปรุง VCC':'');
  await page.getByRole('button',{name:'ตรวจผลกระทบ',exact:true}).click();
  await confirm(page,`[ข้อมูลทดสอบ] browser เปลี่ยนเป็น ${status}`);
  await expect(page.getByRole('combobox',{name:'เปลี่ยนสถานะ',exact:true})).toHaveValue(status);
};

test.beforeAll(async()=>{
  const me=await request('GET','/api/auth/me');
  // Refuse to run mutation tests against the developer's actual local data.
  expect(me.status).toBe(200);expect(me.body.user.id).toBe('GOV-PLATFORM');expect(me.body.user.name).toContain('[ข้อมูลทดสอบ]');
  let config=await request('GET','/api/module-governance/vcc');expect(config.body.forms.some((f)=>f.doc_code==='TEST-FM-EN')).toBe(true);
  if(config.body.module.status!=='ACTIVE') await request('PUT','/api/module-governance/vcc/status','PLATFORM',{status:'ACTIVE',maintenance_message:'',version:config.body.module.version,reason:'[ข้อมูลทดสอบ] เตรียมสถานะเริ่มต้น'});
  config=await request('GET','/api/module-governance/vcc');
  if(config.body.departments.find((d)=>d.code==='EN').enabled) await request('PUT','/api/module-governance/vcc/departments/EN','PLATFORM',{enabled:false,version:config.body.module.version,reason:'[ข้อมูลทดสอบ] เตรียมแผนกเริ่มต้น'});
  await mkdir(artifactDir,{recursive:true});
});

test('real browser/API: dynamic EN, impact/reasons, module modes, critical alerts and retained work',async({page,browser})=>{
  await session(page,'PLATFORM');await page.goto('/portal');await page.getByRole('button',{name:'จัดการระบบย่อย',exact:true}).click();
  await expect(page.getByRole('heading',{name:'จัดการระบบย่อย',exact:true})).toBeVisible();
  await page.getByLabel('แสดงแผนก').selectOption('disabled');
  const enRow=page.getByRole('listitem').filter({has:page.getByRole('heading',{name:/^EN ·/})});
  await enRow.getByRole('button',{name:'ตั้งค่า EN',exact:true}).click();
  await expect(page.getByLabel('แบบฟอร์มควบคุมที่มีผลบังคับใช้')).toHaveValue('GOV-FORM');
  await expect(page.getByLabel('ชื่อผู้ทบทวน')).toHaveValue('GOV-PD');
  await page.getByRole('button',{name:'ตรวจสอบและบันทึกค่าของแผนก'}).click();await confirm(page,'[ข้อมูลทดสอบ] ตรวจ profile EN');
  await enRow.getByRole('button',{name:'เปิดรับงานใหม่',exact:true}).click();await confirm(page,'[ข้อมูลทดสอบ] เปิด EN');
  expect((await request('GET','/api/modules','EN')).body.modules.find((m)=>m.moduleId==='vcc').canEnter).toBe(true);
  const existing=await request('GET','/api/vcc/plans?status=DRAFT','EN');
  const planYear=Array.from({length:60},(_,i)=>2032+i).find((year)=>!existing.body.plans.some((p)=>p.plan_year===year));
  const created=await request('POST','/api/vcc/plans','EN',{plan_year:planYear,department:'EN'});expect(created.status,JSON.stringify(created.body)).toBe(201);
  const enContext=await browser.newContext();const enPage=await enContext.newPage();await session(enPage,'EN');await enPage.goto('http://127.0.0.1:5177/vcc/assets');await expect(enPage.getByRole('button',{name:'เพิ่มเครื่องมือ',exact:true})).toBeVisible();
  await changeStatus(page,'READ_ONLY');
  expect((await request('POST','/api/vcc/assets','EN',{})).status).toBe(403);
  await enPage.reload();await expect(enPage.getByText(/VCC เปิดให้อ่านอย่างเดียว/)).toBeVisible();await expect(enPage.getByRole('button',{name:'เพิ่มเครื่องมือ',exact:true})).toHaveCount(0);
  await changeStatus(page,'MAINTENANCE');
  expect((await request('POST','/api/vcc/plans/unknown/approve','MGT',{})).status).toBe(503);
  expect((await request('GET','/api/documents?status=EFFECTIVE','PLATFORM')).status).toBe(200);
  await enPage.reload();await expect(enPage.getByText('[ข้อมูลทดสอบ] กำลังปรับปรุง VCC')).toBeVisible();
  await page.getByRole('tab',{name:/การแจ้งเตือนค้าง/}).click();await expect(page.getByRole('heading',{name:'ติดตามกำหนดระหว่างปรับปรุงระบบ'})).toBeVisible();
  await page.screenshot({path:join(artifactDir,'after-maintenance-alerts.png'),fullPage:true});
  await changeStatus(page,'DISABLED');expect((await request('GET',`/api/vcc/plans/${created.body.plan.id}`,'EN')).status).toBe(503);
  await changeStatus(page,'ACTIVE');await page.getByRole('tab',{name:'แผนกและแบบฟอร์ม'}).click();await page.getByLabel('แสดงแผนก').selectOption('enabled');
  await enRow.getByRole('button',{name:'ปิดรับงานใหม่',exact:true}).click();await confirm(page,'[ข้อมูลทดสอบ] หยุดรับงานใหม่ EN');
  expect((await request('POST','/api/vcc/plans','EN',{plan_year:planYear+1,department:'EN'})).status).toBe(403);
  expect((await request('GET',`/api/vcc/plans/${created.body.plan.id}`,'EN')).status).toBe(200);
  await page.screenshot({path:join(artifactDir,'after-module-governance-desktop.png'),fullPage:true});
  await page.setViewportSize({width:768,height:1024});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:join(artifactDir,'after-module-governance-tablet.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:join(artifactDir,'after-module-governance-mobile.png'),fullPage:true});
  await enContext.close();
});

test('real browser/API: ordinary DCC is denied, delegated access is revocable, and confirmation supports Escape',async({page,browser})=>{
  await session(page,'PLATFORM');await page.goto('/admin/modules');await page.getByRole('tab',{name:'ผู้ดูแลที่ได้รับมอบหมาย'}).click();
  const otherContext=await browser.newContext();const other=await otherContext.newPage();await session(other,'DCC');await other.goto('http://127.0.0.1:5177/admin/modules');await expect(other).toHaveURL(/\/portal$/);
  expect((await request('PUT','/api/module-governance/vcc/status','DCC',{status:'DISABLED',version:0,reason:'forged',isPlatformAdmin:true})).status).toBe(403);
  await page.getByLabel('บัญชีผู้ใช้งาน').selectOption('GOV-DCC');await page.getByRole('button',{name:'มอบหมายสิทธิ์',exact:true}).click();
  await expect(page.getByLabel('เหตุผลในการเปลี่ยนแปลง')).toBeFocused();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await request('GET','/api/module-governance/vcc','DCC')).status).toBe(403);
  await page.getByRole('button',{name:'มอบหมายสิทธิ์',exact:true}).click();await confirm(page,'[ข้อมูลทดสอบ] มอบหมายผู้ดูแล VCC');
  await other.goto('http://127.0.0.1:5177/admin/modules');await expect(other.getByRole('heading',{name:'จัดการระบบย่อย',exact:true})).toBeVisible();
  const grant=page.getByRole('listitem').filter({hasText:'[ข้อมูลทดสอบ] dcc'});await grant.getByRole('button',{name:'ถอนสิทธิ์'}).click();await confirm(page,'[ข้อมูลทดสอบ] ถอนสิทธิ์');
  await other.reload();await expect(other).toHaveURL(/\/portal$/);
  expect((await request('POST','/api/users/GOV-PLATFORM/reset-password','DCC',{})).status).toBe(403);
  await otherContext.close();
});
