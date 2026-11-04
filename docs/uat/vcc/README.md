# VCC UAT & Audit Readiness Package

ชุดเอกสารและแนวทางการทดสอบรับมอบระบบ (User Acceptance Testing: UAT) และการเตรียมความพร้อมสำหรับการตรวจประเมินคุณภาพ (Audit Readiness) ของระบบควบคุมการสอบเทียบและการทวนสอบเครื่องมือวัด (Verify and Calibration Center: VCC)

---

## 1. วิธีการเริ่มต้นระบบสำหรับทดสอบ (UAT Environment Setup)

1. **ติดตั้ง Dependencies:**
   ```bash
   pnpm install
   ```
2. **เตรียมข้อมูลทดสอบจำลอง (Seed Test Data):**
   ```bash
   pnpm --dir apps/api run db:seed:local
   ```
   *(คำสั่งนี้จะเตรียมบัญชีผู้ใช้ทดสอบตามบทบาท, รายการเครื่องมือวัดจำลอง `[ข้อมูลทดสอบ]`, และตั้งค่าความปลอดภัยเริ่มต้น)*
3. **เริ่มการทำงานของเซิร์ฟเวอร์จำลองในเครื่อง (Localhost):**
   - หน้าเว็บ (Web Frontend):
     ```bash
     pnpm run dev
     ```
     *(เปิดใช้งานที่ `http://localhost:5173`)*
   - เซิร์ฟเวอร์ API หลังบ้าน (Cloudflare Worker API):
     ```bash
     pnpm run dev:api
     ```
     *(เปิดใช้งานที่ `http://127.0.0.1:8787`)*
4. **เบราว์เซอร์ที่แนะนำ:** Google Chrome (เวอร์ชันล่าสุด) หรือ Safari สำหรับการทดสอบ Responsive บนอุปกรณ์พกพา

---

## 2. โครงสร้างชุดเอกสาร UAT (Document Index)

| ชื่อเอกสาร | รายละเอียดและวัตถุประสงค์ |
| :--- | :--- |
| [VCC_UAT_and_Audit_Readiness_Plan.md](./VCC_UAT_and_Audit_Readiness_Plan.md) | แผนแม่บท UAT, ขอบเขตมาตรฐาน ISO 9001:2015 / ISO/IEC 17025:2017 และ Go/No-Go Criteria |
| [VCC_UAT_Personas.md](./VCC_UAT_Personas.md) | ตารางบทบาทผู้ใช้, ระดับสิทธิ์ L1–L6, Department Isolation และ Self-Approval Prevention Matrix |
| [VCC_UAT_Test_Cases.md](./VCC_UAT_Test_Cases.md) | กรณีทดสอบแบบละเอียด 8 Scenarios (Preconditions, Steps, Expected Results, Evidence) |
| [VCC_UAT_Test_Cases.csv](./VCC_UAT_Test_Cases.csv) | ข้อมูลกรณีทดสอบในรูปแบบ CSV สำหรับนำเข้า Test Management Tools |
| [VCC_UAT_Test_Data.md](./VCC_UAT_Test_Data.md) | ข้อมูลจำลองสำหรับทดสอบ (เครื่องมือวัด, ใบสั่งงาน PASS/FAIL/ON_HOLD, ใบรับรอง PDF) |
| [VCC_UAT_Execution_Checklist.md](./VCC_UAT_Execution_Checklist.md) | เช็กลิสต์การตรวจสอบสภาพแวดล้อมก่อนและระหว่างการรัน UAT |
| [VCC_UAT_Defect_Log.md](./VCC_UAT_Defect_Log.md) | แบบฟอร์มบันทึกข้อบกพร่องและระดับความรุนแรง (Blocker, Critical, Major, Minor) |
| [VCC_UAT_Defect_Log.csv](./VCC_UAT_Defect_Log.csv) | ตารางบันทึก Defect ในรูปแบบตาราง CSV |
| [VCC_UAT_Summary_and_Signoff.md](./VCC_UAT_Summary_and_Signoff.md) | แบบฟอร์มสรุปผลการทดสอบรับมอบและใบลงนามอนุมัติ (Sign-off Template) |

---

## 3. ตารางความสอดคล้องย้อนกลับ (Requirements & Audit Traceability Matrix)

| Test Case ID | หัวข้อการทดสอบ | ข้อกำหนด ISO 9001:2015 | ข้อกำหนด ISO/IEC 17025:2017 | บทบาทผู้ทดสอบ | หลักฐานที่ต้องจัดเก็บ |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **VCC-UAT-001** | ขึ้นทะเบียนเครื่องมือวัดเดี่ยว & ชุดรวม | ข้อ 7.1.5.1 | ข้อ 6.4.4 | DCC Admin (`dc4`) | ภาพบันทึกหน้าทะเบียนและ Audit Log |
| **VCC-UAT-002** | จัดทำและขออนุมัติแผนประจำปี | ข้อ 7.1.5.2 | ข้อ 6.4.6 | QC L4 (`qc4`), QC Mgr L6 (`qc6`) | แผนประจำปีสถานะ `APPROVED` |
| **VCC-UAT-003** | เปิดใบสั่งงานในแผนและนอกแผน | ข้อ 7.1.5.2 | ข้อ 6.4.7 | QC Staff (`qc2`), DCC (`dc4`) | ใบสั่งงานสถานะ `OPEN` (รหัส WO) |
| **VCC-UAT-004** | บันทึกผลสอบเทียบ & อัปโหลด PDF | ข้อ 7.1.5.2 | ข้อ 7.8.2 | QC Staff (`qc2`) | SHA-256 Hash และหลักฐาน R2 |
| **VCC-UAT-005** | ตรวจรับผล PASS & FAIL (ON_HOLD) | ข้อ 7.1.5.1, 7.1.5.2 | ข้อ 6.4.7, 7.8.6 | QC Mgr L6 (`qc6`) | สถานะ `CLOSED` / ป้าย `ON_HOLD` |
| **VCC-UAT-006** | ขอแก้ไขผลอย่างควบคุม (Amendment) | ข้อ 7.5.3.2 | ข้อ 7.8.8 | QC Staff (`qc2`), QC L6 (`qc6`) | Snapshot สถานะเดิม & ตราประทับ |
| **VCC-UAT-007** | วิเคราะห์ผลกระทบ & ปลดระงับเครื่องมือ | ข้อ 8.7 | ข้อ 6.4.7 | QC Mgr L6 (`qc6`), QMR (`mg6`) | บันทึกการประเมินความเสี่ยง |
| **VCC-UAT-008** | การใช้งานผ่านมือถือ & พิมพ์หลายหน้า | ข้อ 7.5.3.1 | ข้อ 7.8.2 | ทุกบทบาท (Mobile Screen) | ไฟล์ PDF/กระดาษ A4 ครบทุกหน้า |

---

## 4. กฎการจัดเก็บหลักฐาน (Evidence Capture Rules)

- **การตั้งชื่อภาพถ่ายหน้าจอ:** `VCC-UAT-<CASE_ID>_<PERSONA>_<YYYYMMDD>_<STEP>.png`  
  *(ตัวอย่าง: `VCC-UAT-004_QC2_20261105_STEP3.png`)*
- **การบันทึก Defect:** ใช้รหัส `VCC-DEF-001`, `VCC-DEF-002` และบันทึกลงใน [VCC_UAT_Defect_Log.md](./VCC_UAT_Defect_Log.md)
- **ข้อห้ามเด็ดขาด:** ห้ามนำหลักฐานขึ้นระบบ Production หรือใช้ฐานข้อมูลจริงในการทดสอบ UAT

