# UAT: Portal Core และ DCC

| ไฟล์ | เนื้อหา |
|---|---|
| [CORE_DCC_UAT_Test_Cases.md](CORE_DCC_UAT_Test_Cases.md) | กรณีทดสอบ 15 กรณี: เข้าสู่ระบบ, 2FA, session บนเครื่องใช้ร่วม, รหัสอ้างอิงข้อผิดพลาด, สิทธิ์, Audit log, Approval Matrix และวงจรเอกสาร DCC |

ใช้ร่วมกับ:
- VCC: [../vcc/](../vcc/) (กรณีทดสอบ, ผู้ทดสอบ, defect log, ใบลงนาม)
- ทบทวนตามรอบ: [../periodic-review/](../periodic-review/)
- บันทึกข้อบกพร่อง: ใช้รูปแบบเดียวกับ `../vcc/VCC_UAT_Defect_Log.md` โดยใช้รหัสกรณีทดสอบ `CORE-UAT-xxx` / `DCC-UAT-xxx` และแนบ **รหัสอ้างอิง** จากข้อความ error ทุกครั้ง

ลำดับที่แนะนำ: CORE-UAT-001 ถึง 008 ก่อน (สร้างผู้ทดสอบและยืนยันค่าตั้งค่า) แล้ว DCC-UAT-001 ถึง 007 แล้วจึง VCC และทบทวนตามรอบ
