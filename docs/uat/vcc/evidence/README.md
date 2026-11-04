# แหล่งจัดเก็บหลักฐานการทดสอบรับมอบระบบ (VCC UAT Evidence Directory)

ไดเรกทอรีนี้ใช้สำหรับจัดเก็บหลักฐานดิจิทัลที่ได้จากการรันการทดสอบรับมอบระบบ (UAT) ใน Phase 2 ตามมาตรฐาน ISO 9001:2015 และ ISO/IEC 17025:2017

---

## โครงสร้างการจัดเก็บ (Directory Structure)

1. **`screenshots/`**:
   - ภาพถ่ายหน้าจอขณะดำเนินการทดสอบและผลลัพธ์
   - รูปแบบการตั้งชื่อไฟล์: `VCC-UAT-<ID>_<PERSONA>_<YYYYMMDD>_<STEP>.png`
   - ตัวอย่าง:
     - `VCC-UAT-001_DC4_20261105_AssetRegister.png`
     - `VCC-UAT-002_QC4_20261105_SelfApproval_Blocked.png`
     - `VCC-UAT-002_QC6_20261105_Plan_Approved.png`
     - `VCC-UAT-004_QC2_20261105_Upload_Cert_Hash.png`
     - `VCC-UAT-005_QC6_20261105_Auto_OnHold_TC001.png`
     - `VCC-UAT-006_QC6_20261105_Amended_Snapshot.png`
     - `VCC-UAT-007_QC6_20261105_Release_Hold_Assessment.png`
     - `VCC-UAT-008_QC2_20261105_Mobile_MultiPage_Print.png`

2. **`downloads/`**:
   - ไฟล์ใบรับรองหรือเอกสาร PDF ที่ผู้ทดสอบดาวน์โหลดกลับมาจากระบบ เพื่อตรวจความสมบูรณ์
   - ตัวอย่าง: `VCC-UAT-004_downloaded_cert_ST002.pdf`

3. **`audit_logs/`**:
   - ไฟล์ Export ข้อมูลประวัติการบันทึก Audit Trail จาก SQLite D1
   - ตัวอย่าง: `VCC-UAT-Phase2_audit_trail_export.json`

