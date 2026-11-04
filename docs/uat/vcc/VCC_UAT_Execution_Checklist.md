# รายการตรวจสอบความพร้อมการทดสอบระบบ VCC (VCC UAT Execution Checklist)

เอกสารฉบับนี้ใช้สำหรับกำกับและตรวจสอบความพร้อมของสภาพแวดล้อม ข้อมูล และขั้นตอนก่อน ระหว่าง และหลังการทดสอบรับมอบระบบ (UAT) และการประเมิน Audit Readiness ของระบบ VCC

---

## ข้อควรระวังและแนวทางปฏิบัติด้านความปลอดภัยของฐานข้อมูล (Database Safety Policy)

> [!WARNING]
> คำสั่ง `pnpm --dir apps/api run db:seed:local` ทำหน้าที่เพียงเพิ่มข้อมูลผู้ใช้และเครื่องมือจำลอง (`INSERT OR IGNORE`) และตั้งค่า Guard ป้องกัน **ไม่ใช่คำสั่ง Reset หรือ Restore ฐานข้อมูล** หากต้องการเริ่มระบบใหม่ที่สะอาดสมบูรณ์ หรือย้อนกลับสถานะข้อมูล ให้ปฏิบัติตามคำสั่งด้านล่างนี้เท่านั้น

### 1. ขั้นตอนเริ่มระบบใหม่แบบสะอาดสมบูรณ์ (Clean Fresh Setup)
```powershell
# 1. หยุดการทำงานของ dev / dev:api ก่อนดำเนินการ
# 2. ลบพื้นที่เก็บข้อมูลจำลองของ Miniflare D1
Remove-Item -Recurse -Force apps/api/.wrangler/state/v3/d1

# 3. รันโครงสร้าง Migration ล่าสุดทั้งหมด (0001–0039)
pnpm --dir apps/api run db:migrate:local

# 4. บันทึกข้อมูลตั้งต้นและบัญชีทดสอบจำลอง
pnpm --dir apps/api run db:seed:local
```

### 2. ขั้นตอนการสำรองฐานข้อมูลก่อนเริ่มทดสอบ (Pre-UAT Snapshot Backup)
```powershell
$backupDir = "apps/api/.wrangler/backup"
New-Item -ItemType Directory -Path $backupDir -Force
Copy-Item "apps/api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite" -Destination "$backupDir/pre_uat_backup.sqlite"
```

### 3. ขั้นตอนการฟื้นฟูข้อมูลกลับสู่จุดเริ่มต้น (Restore Procedure)
```powershell
# ปิด Worker dev:api ก่อน แล้วคัดลอกไฟล์สำรองกลับมาทับ
Copy-Item "apps/api/.wrangler/backup/pre_uat_backup.sqlite" -Destination "apps/api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite" -Force
```

---

## ระยะที่ 1: การตรวจสอบความพร้อมก่อนเริ่มการทดสอบ (Pre-Execution Readiness Checklist)

> **สถานะปัจจุบัน**: ทุกรายการอยู่ในสถานะ **`PENDING PREFLIGHT VERIFICATION`** (ต้องรันคำสั่งตรวจสอบจริงก่อนเริ่มคลิกทดสอบ UAT)

| ลำดับ | รายการตรวจสอบ (Checklist Item) | วิธีการและคำสั่งตรวจสอบจริง (CLI Command / Action) | เกณฑ์การยอมรับ (Acceptance Criteria) | ผู้รับผิดชอบ | สถานะการตรวจสอบ |
| :---: | :--- | :--- | :--- | :---: | :---: |
| 1.1 | **สถานะฐานข้อมูลและ Migrations** | `ls apps/api/migrations`<br/>และตรวจสอบโครงสร้าง D1 | ไฟล์ Migration ลำดับ 0001–0039 ครบถ้วน ถูกนำไปใช้อย่างสมบูรณ์ ไม่มี Migration ค้าง | Tech Lead | `[ ] PENDING` |
| 1.2 | **ความสะอาดของฐานข้อมูล (Clean State)** | ปฏิบัติตามขั้นตอนข้อ 1 (Clean Fresh Setup) | ล้าง state เดิม, รัน migration 0001–0039 และ seed ข้อมูลใหม่เรียบร้อย | Backend Coder | `[ ] PENDING` |
| 1.3 | **ข้อมูลทดสอบจำลอง (Seed Data)** | `pnpm --dir apps/api run db:seed:local` | ข้อมูลผู้ใช้จำลอง (`dc4`, `qc2`, `qc4`, `qc6`, `mg6`, `qa4`) และเครื่องมือวัดติดป้าย `[ข้อมูลทดสอบ]` ครบถ้วน | QA Tester | `[ ] PENDING` |
| 1.4 | **การสำรองฐานข้อมูล (Pre-UAT Backup)** | ปฏิบัติตามขั้นตอนข้อ 2 (Snapshot Backup) | มีไฟล์ `apps/api/.wrangler/backup/pre_uat_backup.sqlite` ที่สมบูรณ์พร้อมกู้คืน | Backend Coder | `[ ] PENDING` |
| 1.5 | **ระบบจัดเก็บไฟล์จำลอง (R2 Storage)** | ตรวจสอบ Binding `FILES` ใน Worker Localhost | รองรับการอัปโหลดและดาวน์โหลดไฟล์จำลองในโหมด Miniflare Local Storage | Backend Coder | `[ ] PENDING` |
| 1.6 | **กลไกพิทักษ์ประวัติ (Audit Log Guard)** | ทดสอบคำสั่ง SQL: `DELETE FROM audit_log;` | SQLite ปฏิเสธคำสั่งอย่างเด็ดขาดด้วยข้อความ Error (Append-Only Enforced) | Security Auditor | `[ ] PENDING` |
| 1.7 | **ไฟล์หลักฐานจำลอง (PDF Fixture)** | `Get-FileHash docs/uat/vcc/fixtures/sample_calibration_cert.pdf -Algorithm SHA256` | ไฟล์มีอยู่จริง ขนาด ~1 KB และ Hash ตรงกับ `f3b6026cad...` | QA Tester | `[ ] PENDING` |
| 1.8 | **การแยกระบบทดสอบออกจาก Production** | ตรวจสอบ Browser URL (`:5173`) และ API Port (`:8787`) | ชี้ไปยัง `127.0.0.1` เท่านั้น ไร้ Flag `--remote` และไม่แตะ Cloudflare จริง | Orchestrator | `[ ] PENDING` |
| 1.9 | **การตั้งค่า .gitignore ของหลักฐาน UAT** | `git check-ignore -v docs/uat/vcc/evidence/screenshots/sample.png` | คืนค่าสถานะ Ignored ไม่นำ screenshots/pdf เข้าสู Git Working Tree | Security Auditor | `[ ] PENDING` |
| 1.10 | **การทำงานของ Web Frontend & API** | รัน `pnpm run dev` และ `pnpm run dev:api` | หน้าเว็บโหลดสมบูรณ์ ไร้ Console Error, API ตอบสนอง `/api/vcc/*` ถูกต้อง | Frontend Coder | `[ ] PENDING` |

---

## ระยะที่ 2: การตรวจสอบระหว่างดำเนินการทดสอบ (During-Execution Checks)

| ลำดับ | รายการตรวจสอบ (Checklist Item) | วิธีการตรวจสอบ | เกณฑ์การยอมรับ (Acceptance Criteria) | ผู้รับผิดชอบ | สถานะ |
| :---: | :--- | :--- | :--- | :---: | :---: |
| 2.1 | **การปฏิบัติตามกรณีทดสอบ** | รันตามขั้นตอนใน `VCC_UAT_Test_Cases.md` | ดำเนินการทดสอบครบทั้ง 8 Scenarios (VCC-UAT-001 ถึง VCC-UAT-008) | UAT Team | `[ ] NOT RUN` |
| 2.2 | **ลำดับการทดสอบเครื่องมือมีปัญหา (UAT-005)** | บันทึกผล FAIL ใน TC001 ก่อนทดสอบบล็อกสิทธิ์ | บันทึกผล FAIL -> สกัดกั้นตนเอง (403) -> ผู้จัดการปิดงาน -> เครื่องมือเปลี่ยนเป็น `ON_HOLD` ทันที | UAT Team | `[ ] NOT RUN` |
| 2.3 | **การทดสอบความปลอดภัยเชิงลบ (Negative Tests)** | ทดสอบกรณี SEC-NEG-01 ถึง SEC-NEG-06 | ระบบต้องปฏิเสธ (400 หรือ 403) ตรงตามข้อความที่ระบุไว้ในตารางความปลอดภัย | Security Auditor | `[ ] NOT RUN` |
| 2.4 | **การบันทึกภาพหลักฐาน (Evidence Capture)** | บันทึกภาพหน้าจอและเอกสาร PDF ตามนโยบาย | บันทึกไฟล์ตามรูปแบบ `VCC-UAT-<ID>_<PERSONA>_<YYYYMMDD>_<STEP>.png` ครบทุกขั้นตอน | UAT Team | `[ ] NOT RUN` |
| 2.5 | **การตรวจจับและบันทึก Defect** | บันทึกข้อบกพร่องลงใน `VCC_UAT_Defect_Log.md` | ระบุระดับความรุนแรง (Blocker, Critical, Major, Minor) ตามความเป็นจริง | QA Tester | `[ ] NOT RUN` |
| 2.6 | **การทดสอบบนอุปกรณ์พกพา (Mobile Ergonomics)** | ทดสอบผ่านเบราว์เซอร์โหมดมือถือ (< 640px) | ปุ่มสัมผัส >= 44×44px, ฟอร์มไม่ล้นจอ, ป้องกัน Dirty Form ทำงานถูกต้อง | Frontend Coder | `[ ] NOT RUN` |

---

## ระยะที่ 3: การตรวจสอบและสรุปผลหลังการทดสอบ (Post-Execution Verification)

| ลำดับ | รายการตรวจสอบ (Checklist Item) | วิธีการตรวจสอบ | เกณฑ์การยอมรับ (Acceptance Criteria) | ผู้รับผิดชอบ | สถานะ |
| :---: | :--- | :--- | :--- | :---: | :---: |
| 3.1 | **ความสมบูรณ์ของ Audit Trail** | รันคำสั่ง SQL ตรวจสอบประวัติการบันทึก | มีการบันทึก Audit Log ของทุกกิจกรรมสำคัญ (`VCC_ASSET_*`, `VCC_PLAN_*`, `VCC_WO_*`) | Security Auditor | `[ ] NOT RUN` |
| 3.2 | **การประเมินข้อบกพร่อง (Defect Triage)** | ตรวจสอบรายการ Defect คงค้าง | ข้อบกพร่องระดับ **Blocker = 0** และ **Critical = 0** | Orchestrator | `[ ] NOT RUN` |
| 3.3 | **การตรวจรับรองเอกสาร Digital Record** | ตรวจสอบเอกสารผลการสอบเทียบดิจิทัล | แสดงผลครบถ้วน รองรับการพิมพ์ A4 หลายหน้าโดยไม่มีข้อมูลสูญหาย | Lead Auditor | `[ ] NOT RUN` |
| 3.4 | **ความครบถ้วนของไฟล์หลักฐาน (Integrity)** | ตรวจสอบ SHA-256 และการตั้งชื่อไฟล์หลักฐาน | ไฟล์หลักฐานครบถ้วน มี Hash ตรวจสอบได้ และไม่มี PII/Password ในหลักฐาน | QA Tester | `[ ] NOT RUN` |
| 3.5 | **การจัดทำรายงานสรุปและลงนามจริง** | กรอกข้อมูลใน `VCC_UAT_Summary_and_Signoff.md` | ผู้แทนฝ่าย DCC, QC/QA และ QMR ลงนามจริงรับทราบผลการทดสอบ | UAT Lead | `[ ] NOT RUN` |
