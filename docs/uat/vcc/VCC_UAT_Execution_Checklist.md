# รายการตรวจสอบความพร้อมการทดสอบระบบ VCC (VCC UAT Execution Checklist)

เอกสารฉบับนี้ใช้สำหรับกำกับและตรวจสอบความพร้อมของสภาพแวดล้อม ข้อมูล และขั้นตอนก่อน ระหว่าง และหลังการทดสอบรับมอบระบบ (UAT) และการประเมิน Audit Readiness ของระบบ VCC

---

## ข้อควรระวังและแนวทางปฏิบัติด้านความปลอดภัยของฐานข้อมูล (Database Safety Policy)

> [!CAUTION]
> **กฎเหล็กด้านความปลอดภัยของข้อมูล:**
> 1. **ห้ามล้างหรือลบฐานข้อมูล Localhost โดยไม่ตรวจสอบ:** ปัจจุบันฐานข้อมูลในเครื่องมีข้อมูลประวัติการทำงาน (Audit Log, เครื่องมือวัด, ใบสั่งงาน และแผนประจำปี) ห้ามลบโฟลเดอร์ฐานข้อมูลโดยเด็ดขาดหากไม่ได้รับอนุมัติจากผู้ใช้
> 2. **ห้ามใช้ Wildcard เป็นชื่อไฟล์ปลายทางในการ Restore:** การระบุปลายทางเป็น `*.sqlite` ในคำสั่ง `Copy-Item` จะสร้างไฟล์ชื่อผิดพลาดหรือทำให้ฐานข้อมูลเสียหาย ต้องระบุชื่อไฟล์เป้าหมายจริงเท่านั้น และต้องลบไฟล์ `-wal` / `-shm` เก่าออกเพื่อป้องกันข้อมูลค้าง
> 3. **คำสั่ง `db:seed:local` ไม่ใช่คำสั่ง Reset หรือ Restore:** ทำหน้าที่เพียงเพิ่มข้อมูลผู้ใช้จำลอง (`INSERT OR IGNORE`) เท่านั้น

### 1. การตรวจสอบข้อมูลสำคัญก่อนดำเนินการใด ๆ (Data Inspection)
```powershell
# ตรวจสอบจำนวนข้อมูลปัจจุบันในเครื่องก่อนดำเนินการ
node -e "const { DatabaseSync } = require('node:sqlite'); const fs = require('fs'); const dbFile = (fs.readdirSync('apps/api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject').find(f => /^[0-9a-f]{64}\.sqlite$/.test(f))); if (!dbFile) { console.log('No database file found.'); process.exit(0); } const db = new DatabaseSync('apps/api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/' + dbFile); console.log({ users: db.prepare('SELECT count(*) as c FROM users').get().c, assets: db.prepare('SELECT count(*) as c FROM vcc_assets').get().c, work_orders: db.prepare('SELECT count(*) as c FROM vcc_work_orders').get().c, audit_log: db.prepare('SELECT count(*) as c FROM audit_log').get().c });"
```

### 2. ขั้นตอนการสำรองฐานข้อมูลก่อนเริ่มทดสอบแบบตรวจสอบได้ (Verifiable Snapshot Backup)
```powershell
# 1. สร้างโฟลเดอร์สำรองข้อมูล
$backupDir = "apps/api/.wrangler/backup"
New-Item -ItemType Directory -Path $backupDir -Force

# 2. ทำการสำรองข้อมูลแบบ Atomic ด้วย VACUUM INTO (ป้องกันปัญหา WAL mode)
node -e "const { DatabaseSync } = require('node:sqlite'); const fs = require('fs'); const crypto = require('crypto'); const dbFile = fs.readdirSync('apps/api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject').find(f => /^[0-9a-f]{64}\.sqlite$/.test(f)); const src = 'apps/api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/' + dbFile; const dest = 'apps/api/.wrangler/backup/pre_uat_backup.sqlite'; if (fs.existsSync(dest)) fs.unlinkSync(dest); const db = new DatabaseSync(src); db.exec('VACUUM INTO \'' + dest + '\''); db.close(); const backupDb = new DatabaseSync(dest); const integrity = backupDb.prepare('PRAGMA integrity_check').get(); backupDb.close(); const hash = crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex'); console.log('Backup created successfully. SHA-256:', hash, 'Integrity:', integrity.integrity_check);"
```

### 3. ขั้นตอนการฟื้นฟูข้อมูลที่ปลอดภัยและไร้ Wildcard (Safe Restore Procedure)
```powershell
# 1. หยุดการทำงานของ Worker (dev:api) ก่อนดำเนินการเสมอ
# 2. ค้นหาตำแหน่งไฟล์ฐานข้อมูล SQLite ตัวจริง
$targetFile = (Get-ChildItem -Path "apps/api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject" -Filter "*[0-9a-f].sqlite" | Select-Object -First 1).FullName

if ($targetFile) {
    # 3. ลบไฟล์ Journal และ WAL ชั่วคราวที่อาจค้างอยู่
    Remove-Item -Path "$targetFile-wal", "$targetFile-shm" -ErrorAction SilentlyContinue

    # 4. คัดลอกไฟล์สำรองไปยังชื่อไฟล์ปลายทางตัวจริงโดยตรง (ห้ามใช้ Wildcard)
    Copy-Item -Path "apps/api/.wrangler/backup/pre_uat_backup.sqlite" -Destination $targetFile -Force
    Write-Host "Restored successfully to $targetFile"
} else {
    Write-Error "Target SQLite file not found."
}
```

### 4. ขั้นตอนการเริ่มระบบใหม่แบบสะอาด (เฉพาะเมื่อได้รับอนุมัติจากผู้ใช้เท่านั้น)
```powershell
# ข้อควรระวัง: ต้องได้รับอนุมัติให้ล้างข้อมูลและทำการ Backup ตามข้อ 2 เรียบร้อยแล้วเท่านั้น
# Remove-Item -Recurse -Force apps/api/.wrangler/state/v3/d1
# pnpm --dir apps/api run db:migrate:local
# pnpm --dir apps/api run db:seed:local
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
