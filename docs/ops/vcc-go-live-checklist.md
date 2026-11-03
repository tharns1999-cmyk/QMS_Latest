# VCC Go-Live Migration Checklist & Validation Guide

เอกสารตรวจสอบขั้นตอนการนำระบบ VCC ขึ้นใช้งานจริงบน Production อย่างปลอดภัย (Zero-Downtime & High Data Integrity)

> [!CAUTION]
> **ข้อห้ามเด็ดขาด**: ห้ามรันคำสั่งแก้ไขข้อมูล (`UPDATE`, `DELETE`, `ALTER`) ตรงกับฐานข้อมูล Production นอกเหนือจากขั้นตอน Migration ปกติผ่านสคริปต์ที่ผ่านการทดสอบแล้ว

---

## 1. การเตรียมการก่อนนำขึ้นระบบจริง (Pre-Deployment)

- [ ] **สำรองข้อมูล Production D1 ล่าสุด:**
  ```bash
  npx wrangler d1 export DB --remote --env production --output backup-before-vcc-golive.sql
  ```
- [ ] **ตรวจสอบไฟล์ Migration ล่าสุด:**
  ตรวจสอบว่าไฟล์ใน `apps/api/migrations` เรียงตามลำดับจนถึง `0039_vcc_asset_hold_started_at.sql`
- [ ] **ตรวจสอบ Preflight Script:**
  ```bash
  cd apps/api && pnpm run db:preflight
  ```
  ยืนยันว่าไม่มีคำสั่งที่ไม่ปลอดภัย เช่น `DROP TABLE`, `ALTER TABLE ... NOT NULL` ที่ไม่มี DEFAULT

---

## 2. ขั้นตอนการรัน Migration (Execution Phase)

- [ ] **รัน Migration ผ่าน Safe Runner:**
  ```bash
  cd apps/api && pnpm run db:migrate:production
  ```
  สคริปต์ `vcc-migrate-safe.js` จะตรวจสอบตาราง `d1_migrations` เพื่อรันเฉพาะ Migration ที่ยังไม่ได้ทำงานแบบ Idempotent

---

## 3. การตรวจสอบความถูกต้องของ Migration 0039 (Post-Migration Verification)

Migration 0039 ทำการเพิ่มคอลัมน์ `hold_started_at` และย้อนข้อมูล (Backfill) สำหรับเครื่องมือที่อยู่ในสถานะ `ON_HOLD`

รันเฉพาะคำสั่ง **Read-Only (SELECT)** เพื่อยืนยันความสมบูรณ์:

### 3.1 ตรวจสอบว่าคอลัมน์ใหม่ถูกสร้างเรียบร้อย
```sql
SELECT name, type, "notnull", dflt_value 
FROM pragma_table_info('vcc_assets') 
WHERE name = 'hold_started_at';
```
*เกณฑ์ยอมรับ:* พบแถว `hold_started_at` ชนิด `TEXT` และ `notnull = 0`

### 3.2 ตรวจสอบผลการ Backfill ของเครื่องมือที่ ON_HOLD
```sql
-- ต้องไม่มีเครื่องมือ ON_HOLD ที่ hold_started_at ยังเป็น NULL
SELECT COUNT(*) AS unbacked_on_hold_count
FROM vcc_assets
WHERE status = 'ON_HOLD' AND hold_started_at IS NULL;
```
*เกณฑ์ยอมรับ:* ผลลัพธ์ต้องได้ `unbacked_on_hold_count = 0`

### 3.3 ตรวจสอบความถูกต้องของวันที่ Backfill เทียบกับใบงาน FAIL
```sql
SELECT 
  a.id, 
  a.asset_code, 
  a.status, 
  a.hold_started_at,
  (SELECT MIN(w.performed_at) FROM vcc_work_orders w 
   WHERE w.asset_id = a.id AND w.result_status = 'FAIL' AND w.nc_status = 'OPEN') AS fail_work_order_date,
  a.updated_at AS fallback_asset_update_date
FROM vcc_assets a
WHERE a.status = 'ON_HOLD'
LIMIT 10;
```
*เกณฑ์ยอมรับ:* วันที่ `hold_started_at` ต้องตรงกับ `fail_work_order_date` หากมีใบสั่งงานผล FAIL หรือตรงกับ `fallback_asset_update_date`

---

## 4. การตรวจสอบระบบเว็บ Production (Web Client Verification)

- [ ] **สร้าง Production Web Build ด้วย URL จริง:**
  ```bash
  cd apps/web
  VITE_API_URL=https://<api-production-domain> pnpm run build:production
  ```
  *คำเตือน:* ห้ามใช้ `pnpm run build` ธรรมดา เพราะคำสั่ง `build:production` มี Gate ตรวจสอบ HTTPS URL ป้องกันการเผลอขึ้นระบบในโหมด Mock Data
- [ ] **Deploy Web:**
  ```bash
  npx wrangler deploy
  ```
- [ ] **ตรวจสอบหน้าเว็บจริงหลัง Deploy:**
  - เข้าหน้าเว็บ จะต้อง**ไม่ปรากฏ**ป้ายสีเหลือง `โหมดข้อมูลจำลอง (DEMO MODE)` ที่ด้านบนสุด
  - เข้าสู่ระบบด้วยบัญชีแผนก `DC`, `QC`, `QA`, `MGT`, และ `LB` เพื่อยืนยันว่าเข้าใช้งาน VCC ได้
  - ลองเข้าด้วยบัญชีแผนกอื่น (เช่น `PD`, `WH`) จะต้องแสดงข้อความปฏิเสธสิทธิ์และไม่สามารถเข้า VCC ได้

---

## 5. แผนการถอยกลับฉุกเฉิน (Rollback Contingency Plan)

หากพบข้อผิดพลาดร้ายแรง:
1. การเพิ่มคอลัมน์ `hold_started_at` เป็น Nullable จึงไม่กระทบต่อฟังก์ชันเดิมของระบบ
2. หากจำเป็นต้องย้อนคืนข้อมูลฐานข้อมูล ให้ใช้นำเข้าไฟล์สำรองที่ส่งออกไว้ในขั้นตอนที่ 1:
   ```bash
   npx wrangler d1 execute DB --remote --env production --file backup-before-vcc-golive.sql
   ```
