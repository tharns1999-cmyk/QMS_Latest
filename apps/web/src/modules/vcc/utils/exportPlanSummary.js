import * as XLSX from 'xlsx';
import { getPlanStatusLabel } from './planLabels';
import { formatVccDate } from './vccDateUtils';

const MONTH_NAMES = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

const COMPANY_HEADER = 'บริษัท เศรษฐชล จำกัด  |  SETHACHON CO., LTD.  |  勝豐有限公司';

// Clean department name: prevent "ฝ่ายฝ่าย..." duplicate if name already starts with "ฝ่าย"
const formatDepartment = (name) => {
  if (!name || name === '-' || name === 'GEN') return '-';
  let s = String(name).trim();
  if (!s || s === '-') return '-';
  s = s.replace(/^(?:ฝ่าย\s*)+/, 'ฝ่าย');
  if (s.startsWith('ฝ่าย') || s.startsWith('แผนก')) return s;
  return `ฝ่าย${s}`;
};

// Safe helper for provider name display (avoiding raw 'INTERNAL' / 'EXTERNAL')
const formatProvider = (item) => {
  const raw = item.provider_name || item.responsible_label || item.provider_type || item.calibration_type;
  if (!raw) return '-';
  const s = String(raw).trim();
  const upper = s.toUpperCase();
  if (upper === 'INTERNAL' || upper === 'INTERNAL_LAB' || upper === 'IN_HOUSE') return 'ทวนสอบภายใน';
  if (upper === 'EXTERNAL' || upper === 'EXTERNAL_LAB') return 'ห้องปฏิบัติการภายนอก';
  return s;
};

// Safe helper to parse month array without throwing SyntaxError on corrupt strings
const parseMonths = (val) => {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val.trim()) {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
  }
  return [];
};

/**
 * Exports a multi-sheet Excel report for Sethachon Co., Ltd.
 * Sheet 1: ภาพรวมสถานะรายแผนก (Audit-Safe: No document code, no revision)
 * Sheet 2: รายการเครื่องมือรวมทุกแผนก (Dual-row Plan [P] / Act. [✓])
 * 
 * @param {Array} plans - List of annual plans
 * @param {Array} allItems - List of all planned items across plans
 * @param {string|number} year - Selected plan year
 */
export const exportAnnualPlansMultiSheet = (plans = [], allItems = [], year = '') => {
  const wb = XLSX.utils.book_new();
  const planYear = year || new Date().getFullYear();

  // ─────────────────────────────────────────────────────────────
  // SHEET 1: ภาพรวมสถานะรายแผนก
  // ─────────────────────────────────────────────────────────────
  const sheet1Data = [
    [COMPANY_HEADER],
    [`รายงานสรุปสถานะแผนการทวนสอบและสอบเทียบประจำปี ${planYear}`],
    [],
    [
      'ปีแผนงาน',
      'รหัสแผนก',
      'ชื่อแผนก',
      'สถานะเอกสาร',
      'จำนวนเครื่องมือที่วางแผน',
      'ผู้จัดทำ (Prepared By)',
      'ผู้ทบทวน (Reviewed By)',
      'ผู้อนุมัติ (Approved By)',
      'วันที่อนุมัติมีผล'
    ],
    ...plans.map((p) => {
      const dept = p.department || 'GEN';
      const rawDeptName = p.department_name_th || p.department || dept;
      const deptName = formatDepartment(rawDeptName);
      const itemCount = Number(p.planned_items_count || p.item_count || 0);

      return [
        p.plan_year || planYear,
        dept,
        deptName,
        getPlanStatusLabel(p.status),
        itemCount,
        p.prepared_by_name || p.prepared_by || '-',
        p.reviewed_by_name || p.reviewed_by || '-',
        p.approved_by_name || p.approved_by || '-',
        p.approved_at ? formatVccDate(p.approved_at) : (p.effective_date || '-')
      ];
    })
  ];

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);

  // Column widths for Sheet 1
  ws1['!cols'] = [
    { wch: 10 }, // Year
    { wch: 10 }, // Dept code
    { wch: 24 }, // Dept name
    { wch: 20 }, // Status
    { wch: 24 }, // Item count
    { wch: 22 }, // Prepared by
    { wch: 22 }, // Reviewed by
    { wch: 22 }, // Approved by
    { wch: 18 }  // Effective date
  ];

  XLSX.utils.book_append_sheet(wb, ws1, 'ภาพรวมสถานะรายแผนก');

  // ─────────────────────────────────────────────────────────────
  // SHEET 2: รายการเครื่องมือรวมทุกแผนก
  // ─────────────────────────────────────────────────────────────
  const sheet2Header = [
    'ปี',
    'แผนก',
    'ลำดับ',
    'รหัสเครื่องมือ',
    'ชื่อเครื่องมือ',
    'ยี่ห้อ/รุ่น',
    'Serial No.',
    'สถานที่ใช้งาน',
    'เกณฑ์ยอมรับ',
    'หน่วยงานที่ทวนสอบ/สอบเทียบ',
    'ความถี่',
    'Plan / Act.',
    ...MONTH_NAMES,
    'ผู้รับผิดชอบ',
    'หมายเหตุ'
  ];

  const sheet2Rows = [];
  allItems.forEach((item, idx) => {
    const plannedMonths = parseMonths(item.planned_months);
    const actualMonths = parseMonths(item.actual_months);

    const planMonthChecks = Array.from({ length: 12 }, (_, i) => (plannedMonths.includes(i + 1) ? 'P' : ''));
    const actMonthChecks = Array.from({ length: 12 }, (_, i) => (actualMonths.includes(i + 1) ? '✓' : ''));

    const brandModel = [item.brand, item.model]
      .map((v) => (typeof v === 'string' ? v.trim() : v))
      .filter(Boolean)
      .join(' ') || item.model || '-';
    const serialNo = (item.serial_no && String(item.serial_no).trim()) || '-';
    const location = item.location || item.location_name || item.installation_location || '-';
    const criteria = (item.acceptance_criteria != null && item.acceptance_criteria !== '')
      ? item.acceptance_criteria
      : ((item.mpe != null && item.mpe !== '') ? item.mpe : '-');
    const provider = formatProvider(item);
    const freq = item.frequency_label || item.frequency || 'ปีละ 1 ครั้ง';
    const responsible = item.responsible_name || item.responsible_person || item.responsible_label || '-';
    const remarks = item.remarks || item.remark || '-';
    const yearVal = item.plan_year || planYear;
    const deptVal = item.department || item.dept || '-';

    // Row 1: Plan (P)
    sheet2Rows.push([
      yearVal,
      deptVal,
      idx + 1,
      item.asset_code || '-',
      item.asset_name || item.name || '-',
      brandModel,
      serialNo,
      location,
      criteria,
      provider,
      freq,
      'Plan',
      ...planMonthChecks,
      responsible,
      remarks
    ]);

    // Row 2: Act. (✓)
    sheet2Rows.push([
      yearVal,
      deptVal,
      idx + 1,
      item.asset_code || '-',
      item.asset_name || item.name || '-',
      brandModel,
      serialNo,
      location,
      criteria,
      provider,
      freq,
      'Act.',
      ...actMonthChecks,
      responsible,
      remarks
    ]);
  });

  const sheet2Data = [
    [COMPANY_HEADER],
    [`แผนการทวนสอบและสอบเทียบเครื่องมือวัด ประจำปี ${planYear}`],
    [],
    sheet2Header,
    ...sheet2Rows
  ];

  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);

  // Column widths for Sheet 2
  ws2['!cols'] = [
    { wch: 8 },  // Year
    { wch: 10 }, // Dept
    { wch: 6 },  // No.
    { wch: 16 }, // Asset code
    { wch: 28 }, // Asset name
    { wch: 18 }, // Brand/Model
    { wch: 16 }, // Serial No.
    { wch: 18 }, // Location
    { wch: 20 }, // Criteria
    { wch: 22 }, // Provider
    { wch: 12 }, // Freq
    { wch: 10 }, // Plan / Act.
    ...Array(12).fill({ wch: 6 }), // Months
    { wch: 18 }, // Responsible
    { wch: 24 }  // Remarks
  ];

  XLSX.utils.book_append_sheet(wb, ws2, 'รายการเครื่องมือรวมทุกแผนก');

  // ─────────────────────────────────────────────────────────────
  // Save / Trigger Download
  // ─────────────────────────────────────────────────────────────
  const fileName = `Sethachon_Annual_Plans_Summary_${planYear}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
};
