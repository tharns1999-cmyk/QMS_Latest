// ป้ายสถานะภาษาไทยชุดเดียวของ VCC (รหัสอังกฤษเป็นค่าภายในระบบ รายงาน Export และ Audit Trail ไม่แสดงบนหน้าจอ)
export const WORK_ORDER_STATUS_LABELS = {
  SCHEDULED: 'ตามแผน',
  OPEN: 'เปิดงาน',
  PENDING_REVIEW: 'รอตรวจรับ',
  REJECTED: 'ส่งกลับแก้ไข',
  CLOSED: 'ปิดงานแล้ว',
  ON_HOLD: 'ระงับใช้',
  CANCELLED: 'ยกเลิกแล้ว'
};

export const RESULT_STATUS_LABELS = {
  PASS: 'ผ่านเกณฑ์',
  FAIL: 'ไม่ผ่านเกณฑ์',
  INCONCLUSIVE: 'รอผลตรวจซ้ำ',
  PENDING: 'รอบันทึกผล'
};

export const ASSET_STATUS_LABELS = {
  ACTIVE: 'ใช้งานปกติ',
  ON_HOLD: 'ระงับใช้',
  UNDER_REPAIR: 'ซ่อมบำรุง',
  RETIRED: 'ปลดออกแล้ว'
};

export const NOTIFICATION_STATUS_LABELS = {
  PENDING: 'รอการรับทราบ',
  ACKNOWLEDGED: 'รับทราบแล้ว',
  RESOLVED: 'ปิดจบแล้ว'
};

export const CALIBRATION_METHOD_LABELS = {
  EXTERNAL_LAB: 'ห้องปฏิบัติการภายนอก (External Lab)',
  IN_HOUSE: 'ทวนสอบภายใน (In-House)',
  MANUFACTURER: 'ผู้ผลิต/ตัวแทนจำหน่าย (Manufacturer)',
  ON_SITE: 'สอบเทียบนอกสถานที่ (On-Site Calibration)'
};

export const getWorkOrderStatusLabel = (status) => WORK_ORDER_STATUS_LABELS[status] || status || '-';
export const getResultStatusLabel = (status) => RESULT_STATUS_LABELS[status] || status || '-';
export const getAssetStatusLabel = (status) => ASSET_STATUS_LABELS[status] || status || '-';
export const getCalibrationMethodLabel = (method) => CALIBRATION_METHOD_LABELS[method] || method || '-';
