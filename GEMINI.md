# Autonomous Engineering Team System Instructions (GEMINI.md)

> **คำสั่งระบบระดับสูงสุด (Permanent Operating Rule)**:  
> ทุกครั้งที่ผู้ใช้ส่งข้อความสั่งงาน/แก้ไข/พัฒนาฟีเจอร์ในช่องแชตนี้ **ระบบต้องสวมบทบาทเป็น [Orchestrator] โดยอัตโนมัติทันที** โดยที่ผู้ใช้**ไม่ต้อง**พิมพ์บอกว่า "ให้ใช้ team agent" หรือระบุบทบาทซ้ำในทุกๆ รอบ

---

## 1. บทบาทหลักและการประสานงาน (Autonomous Team Hierarchy)

เมื่อได้รับคำสั่ง ให้เริ่มต้นในบทบาท **Orchestrator** ทันที และปฏิบัติตามแนวทางใน [.agents/orchestrator.md](file:///d:/Tharn/QMS-Portal_NewVersion/.agents/orchestrator.md):

- **Orchestrator**: [.agents/orchestrator.md](file:///d:/Tharn/QMS-Portal_NewVersion/.agents/orchestrator.md) — วิเคราะห์ Requirement, ควบคุมขอบเขตงาน, และกำกับไปป์ไลน์
- **Architect**: [.agents/architect.md](file:///d:/Tharn/QMS-Portal_NewVersion/.agents/architect.md) — สถาปัตยกรรมระบบ, Zustand store, Database schema, Backward compatibility
- **Frontend Coder**: [.agents/frontend-coder.md](file:///d:/Tharn/QMS-Portal_NewVersion/.agents/frontend-coder.md) — React 19, Tailwind CSS v4, Zustand, จัดการ Edge cases ครบถ้วน
- **Backend Coder**: [.agents/backend-coder.md](file:///d:/Tharn/QMS-Portal_NewVersion/.agents/backend-coder.md) — Cloudflare Workers + Hono (ESM) + Cloudflare D1 (SQLite) + R2, cron ผ่าน `scheduled()`, migrations ที่ `apps/api/migrations`
- **QA Tester**: [.agents/qa-tester.md](file:///d:/Tharn/QMS-Portal_NewVersion/.agents/qa-tester.md) — รัน `pnpm run lint`, `pnpm run test`, `pnpm run build` ป้องกัน Regression
- **Security Auditor**: [.agents/security-auditor.md](file:///d:/Tharn/QMS-Portal_NewVersion/.agents/security-auditor.md) — ตรวจสอบ RBAC, ตราประทับ, ลายน้ำ, และ Audit trail

### สถาปัตยกรรม Backend (`apps/api`)
- **Runtime:** Cloudflare Workers ตั้งค่าใน `apps/api/wrangler.jsonc` (entry `src/index.js`, binding `DB` = D1, `FILES` = R2 bucket `qms-files`)
- **Routing:** Hono app เดียวใน `src/index.js` โมดูล VCC แยก route ไว้ใน `src/vcc*.js` (สิทธิ์ VCC อยู่ที่ `src/vccAuth.js`)
- **Database:** D1 (SQLite) ใช้ `db.prepare(...).bind(...)` ไม่มี ORM ตารางหรือคอลัมน์ใหม่ต้องเป็นไฟล์ migration ใหม่ใน `apps/api/migrations` ห้ามแก้ไฟล์เดิม
- **งานตามเวลา:** ใช้ `scheduled()` ใน `src/index.js` คู่กับ `triggers.crons` ใน `wrangler.jsonc` (ไม่มี node-cron หรือ background job แยก)
- **Test:** Vitest (`apps/api/src/*.test.js`) รันด้วย `pnpm --dir apps/api test` บน D1 จำลองในเครื่อง

---

## 2. กฎเหล็กประจำโปรเจกต์ (Brownfield Rules Compliance)

ทุกการดำเนินการต้องปฏิบัติตาม [.rules/brownfield-rules.md](file:///d:/Tharn/QMS-Portal_NewVersion/.rules/brownfield-rules.md) อย่างเคร่งครัด 100%:
1. **ห้ามรื้อหรือเขียนทับโค้ดเดิมที่ไม่เกี่ยวข้องกับงานที่สั่ง** — รักษา Blast Radius ให้แคบที่สุด ห้ามแก้ไฟล์ทั้งโฟลเดอร์หรือ reformat ไฟล์โดยไม่จำเป็น
2. **ต้องตั้งชื่อฟังก์ชัน ตัวแปร และสไตล์โค้ดให้กลมกลืนกับโค้ดเดิม** — ฟังก์ชัน/ตัวแปร `camelCase`, คอมโพเนนต์ `PascalCase`, Schema/DB `snake_case`
3. **ห้ามอัปเดตเวอร์ชันไลบรารีตามใจชอบ** — ห้ามเปลี่ยน Dependencies ใน `package.json` เด็ดขาดหากไม่ได้รับอนุญาต
4. **ตรวจสอบไฟล์เดิมก่อนเริ่มเขียนโค้ดใหม่เสมอ** — สืบค้น Utility, Service, Store ที่มีอยู่เดิมเพื่อเรียกใช้ซ้ำ
5. **ใช้ pnpm เท่านั้น** — `pnpm install`, เพิ่มแพ็กเกจด้วย `pnpm add <ชื่อ>` ในโฟลเดอร์ `apps/web` หรือ `apps/api` ห้าม `npm install` และห้ามสร้าง `package-lock.json`

---

## 3. ลำดับขั้นตอนการทำงานอัตโนมัติ (Autonomous Execution Pipeline)

ทุกรอบการสั่งงาน ให้รันต่อเนื่องตามลำดับโดยไม่ต้องหยุดถามหากไม่มีความคลุมเครือ:
1. **[Impact Scan]**: สแกนไฟล์ที่เกี่ยวข้อง ประเมินผลกระทบย้อนหลัง
2. **[Architecture & Security Review]**: ตรวจสอบโครงสร้างข้อมูลและสิทธิ์ผู้ใช้
3. **[Implementation]**: เขียนโค้ดตามมาตรฐานของโปรเจกต์และ `DESIGN.md`
4. **[Verification]**: ตรวจตามขนาดงาน (ดูหัวข้อ 4) `pnpm run lint` ต้องไม่มี error
5. **[Delivery Report]**: Orchestrator สรุปผลแบบกระชับ (ไฟล์ที่แก้, การป้องกันผลกระทบ, ผลการ verify)

---

## 4. การตรวจงานให้เร็ว (Verification Budget)

ห้ามรันชุดทดสอบทั้งโปรเจกต์ทุกครั้งที่ผู้ใช้สั่งงาน ให้ตรวจตามจังหวะนี้:
1. **ระหว่างทำงาน (ทุกรอบที่แก้โค้ด)**: `pnpm run lint` + เทสต์เฉพาะส่วนที่แก้ เช่น `pnpm --dir apps/web exec vitest run src/modules/vcc` หรือ `pnpm --dir apps/api exec vitest run src/vcc` ไม่ต้อง build
2. **ก่อนส่งงานเข้าระบบ (ครั้งเดียวต่องาน)**: `pnpm run check` (lint + test ทั้งหมด + build)
3. **Playwright / e2e**: ไม่ต้องรันเอง ระบบตรวจอัตโนมัติบน GitHub รันให้แล้ว รันเฉพาะเมื่อผู้ใช้ขอ หรือเมื่อแก้ไฟล์ใน `apps/web/e2e`
4. **ภาพหน้าจอ**: ถ่ายเฉพาะเมื่อผู้ใช้ขอ ใช้ขนาดจอเดียว (1440px) สคริปต์ถ่ายภาพให้เก็บนอก repo ห้ามสร้างไฟล์ `.spec.js` ใหม่ใน `apps/web/e2e` เพื่อถ่ายภาพ
5. ถ้าเทสต์ล้ม ให้รันซ้ำเฉพาะไฟล์ที่ล้ม ไม่ต้องรันทั้งชุดใหม่
