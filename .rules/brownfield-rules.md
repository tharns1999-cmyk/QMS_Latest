# กฎเหล็กการพัฒนาโปรเจกต์เดิม (Brownfield Engineering Rules)

เอกสารนี้ระบุกฎเหล็กและข้อปฏิบัติสำคัญที่สุดสำหรับการพัฒนาและดูแลรักษาโปรเจกต์ **QMS Portal** ที่มีโค้ดและการทำงานเดิมอยู่แล้ว ห้ามละเลยหรือฝ่าฝืนกฎเหล่านี้โดยเด็ดขาด:

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
  * ฟิลด์ฐานข้อมูล / Store Mock Data: ยึดตามแบบแผนเดิม เช่น `document_id`, `issue_number`, `actor_user_id`
- สไตล์การเขียนโค้ด การเว้นวรรค และ Pattern การจัดการ State/Error ต้องกลมกลืนกับไฟล์เดิมที่อยู่ในโฟลเดอร์เดียวกัน

### 1.3 ห้ามอัปเดตเวอร์ชันไลบรารีตามใจชอบถ้าไม่ได้รับอนุญาต
- ห้ามรันคำสั่ง `npm update`, `npm install <package>@latest` หรือเปลี่ยนเวอร์ชันใน `package.json` / `backend/package.json` โดยพลการ
- การเพิ่ม Library ใหม่ต้องได้รับการอนุมัติอย่างชัดเจน และต้องตรวจสอบความเข้ากันได้กับ Node.js / React 19 / Vite ก่อนเสมอ

### 1.4 ตรวจสอบไฟล์เดิมก่อนเริ่มเขียนโค้ดใหม่เสมอ
- ก่อนลงมือเขียนหรือแก้ไขโค้ด ต้องอ่านและทำความเข้าใจไฟล์เดิม ฟังก์ชันที่เกี่ยวข้อง และโครงสร้าง State เสมอ
- ตรวจสอบว่ามี Utility หรือ Service เดิมที่สามารถเรียกใช้งานซ้ำได้หรือไม่ เช่น:
  * PDF Stamping: `UniversalWatermarkService.js`, `pdfStamper.js`
  * Access Control: `accessControl.js`, `permissionHelper.js`, `rbac.js`
  * Date Formatter: `dateFormatter.js`
  * Store State: `useStore.js`

---

## 2. กฎการตรวจสอบคุณภาพและความสมบูรณ์ (Verification & Integrity)

1. **CLI-First Verification**:
   - เมื่อแก้ไขโค้ดเสร็จแล้ว ต้องตรวจสอบด้วยคำสั่งใน Terminal เสมอ:
     * Linter: `npm run lint` (ต้องไม่มี Error)
     * Unit Tests: `npm run test`
     * Production Build: `npm run build`
2. **รักษาความเข้ากันได้ของข้อมูล (Backward Compatibility)**:
   - ห้ามทำลายโครงสร้างข้อมูลใน `localStorage` (`qms-enterprise-storage`, `qms-storage-vault`) และ IndexedDB
   - การเปลี่ยนแปลง Database ต้องเขียน Migration ทั้งไฟล์ `_up.sql` และ `_down.sql` ใน `database/migrations/`
3. **UI/UX Design Compliance**:
   - ปฏิบัติตามแนวทางใน `DESIGN.md`: ฟอนต์ Inter, ระบบสี Trust Indigo (`#0056b3`), Active Indigo (`#4f46e5`), ขอบมนนุ่มนวล ไม่สร้าง UI สไตล์ Legacy Enterprise ที่รกและหนาทึบ
