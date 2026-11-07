# กฎเหล็กการพัฒนาโปรเจกต์เดิม (Brownfield Engineering Rules)

เอกสารนี้ระบุกฎเหล็กและข้อปฏิบัติสำคัญที่สุดสำหรับการพัฒนาและดูแลรักษาโปรเจกต์ **QMS Portal** ที่มีโค้ดและการทำงานเดิมอยู่แล้ว
กติกาหลักของโครงการอยู่ที่ `AGENTS.md` ถ้าเอกสารนี้ขัดกับ `AGENTS.md` ให้ยึด `AGENTS.md`

---

## 1. กฎเหล็ก 4 ประการ (Core Golden Rules)

### 1.1 ห้ามรื้อหรือเขียนทับโค้ดเดิมที่ไม่เกี่ยวข้องกับงานที่สั่ง
- แก้ไขเฉพาะไฟล์, ฟังก์ชัน หรือโมดูลที่เป็นขอบเขตของงานที่ได้รับมอบหมายเท่านั้น
- ห้าม Refactor โค้ดเดิมรอบข้าง ห้ามจัดรูปแบบโค้ดทั้งไฟล์ใหม่ (No full-file reformatting) หรือลบฟังก์ชันที่ไม่ได้สั่งเด็ดขาด
- รักษารัศมีผลกระทบ (Blast Radius) ให้เล็กที่สุดเท่าที่เป็นไปได้

### 1.2 ต้องตั้งชื่อฟังก์ชัน, ตัวแปร, และสไตล์โค้ดให้กลมกลืนกับโค้ดเดิม
- ศึกษาและปฏิบัติตาม Naming Convention เดิมของโปรเจกต์:
  * ฟังก์ชันและตัวแปรทั่วไป: `camelCase` (เช่น `generateStampingPDF`, `hydrateMasterData`)
  * React Components และ Services: `PascalCase` (เช่น `DarDetail.jsx`, `UniversalWatermarkService.js`)
  * ตารางและคอลัมน์ฐานข้อมูล: `snake_case` (เช่น `document_id`, `issue_no`, `actor_id`)
- สไตล์การเขียนโค้ด การเว้นวรรค และ Pattern การจัดการ State/Error ต้องกลมกลืนกับไฟล์เดิมที่อยู่ในโฟลเดอร์เดียวกัน

### 1.3 ห้ามอัปเดตเวอร์ชันไลบรารีตามใจชอบถ้าไม่ได้รับอนุญาต
- ห้ามรันคำสั่ง `pnpm update`, `pnpm add <package>@latest` หรือเปลี่ยนเวอร์ชันใน `apps/web/package.json` / `apps/api/package.json` โดยพลการ
- การเพิ่ม Library ใหม่ต้องได้รับการอนุมัติอย่างชัดเจน และต้องตรวจสอบความเข้ากันได้กับ Cloudflare Workers / React 19 / Vite ก่อนเสมอ

### 1.4 ตรวจสอบไฟล์เดิมก่อนเริ่มเขียนโค้ดใหม่เสมอ
- ก่อนลงมือเขียนหรือแก้ไขโค้ด ต้องอ่านและทำความเข้าใจไฟล์เดิม ฟังก์ชันที่เกี่ยวข้อง และโครงสร้าง State เสมอ
- ตรวจสอบว่ามี Utility หรือ Service เดิมที่สามารถเรียกใช้งานซ้ำได้หรือไม่ เช่น:
  * PDF Stamping: `apps/web/src/modules/dcc/services/UniversalWatermarkService.js`, `apps/web/src/modules/dcc/utils/pdfStamper.js`
  * Access Control (เว็บ): `apps/web/src/modules/dcc/utils/accessControl.js`, `rbac.js`; (API): `apps/api/src/approval.js`, `apps/api/src/vccAuth.js`
  * Date Formatter: `apps/web/src/shared/utils/dateFormatter.js`
  * Store State: `apps/web/src/store/useStore.js`
  * Audit: `audit()` ใน `apps/api/src/index.js`

---

## 2. กฎการตรวจสอบคุณภาพและความสมบูรณ์ (Verification & Integrity)

1. **CLI-First Verification**:
   - ระหว่างทำ: `pnpm run lint` (ต้องไม่มี Error) + เทสต์เฉพาะโฟลเดอร์ที่แก้
   - ก่อนส่งงานครั้งเดียว: `pnpm run check` (lint + test ทั้งหมด + build)
   - โปรเจกต์เป็น JavaScript ไม่มี TypeScript จึงไม่มีขั้นตอน type-check
   - ไม่ต้องรัน Playwright/e2e เอง (ดู GEMINI.md หัวข้อ 4)
2. **รักษาความเข้ากันได้ของข้อมูล (Backward Compatibility)**:
   - ห้ามทำลายโครงสร้างข้อมูลใน `localStorage` (`qms-enterprise-storage`, `qms-storage-vault`, `qms-api-mode-storage`) และ IndexedDB
   - การเปลี่ยนแปลงฐานข้อมูลต้องเป็นไฟล์ migration ใหม่ เลขต่อจากไฟล์ล่าสุดใน `apps/api/migrations/` (ไม่มีไฟล์ `_down.sql`) ห้ามแก้ migration เดิม
   - โฟลเดอร์ `database/migrations/` เป็นของยุค PostgreSQL เดิม ไม่ได้ใช้แล้ว ห้ามเพิ่มไฟล์ที่นั่น
3. **UI/UX Design Compliance**:
   - ปฏิบัติตามแนวทางใน `DESIGN.md`: ฟอนต์ Inter, ระบบสี Trust Indigo (`#0056b3`), Active Indigo (`#4f46e5`), ขอบมนนุ่มนวล ไม่สร้าง UI สไตล์ Legacy Enterprise ที่รกและหนาทึบ
