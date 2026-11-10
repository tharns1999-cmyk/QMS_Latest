import * as XLSX from 'xlsx';
import { getPlanStatusLabel } from './planLabels';
import { formatVccDate } from './vccDateUtils';

const MONTH_NAMES = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

/**
 * Exports a multi-sheet Excel report for executive management and audit presentation
 * Sheet 1: ภาพรวมสถานะรายแผนก
 * Sheet 2: รายการเครื่องมือรวมทุกแผนก
 * 
 * @param {Array} plans - List of annual plans
 * @param {Array} allItems - List of all planned items across plans
 * @param {string|number} year - Selected plan year
 */
export const exportAnnualPlansMultiSheet = (plans = [], allItems = [], year = '') => {
  const wb = XLSX.utils.book_new();

  // ─────────────────────────────────────────────────────────────
  // SHEET 1: ภาพรวมสถานะรายแผนก
  // ─────────────────────────────────────────────────────────────
  const sheet1Data = [
    [
      'ปีแผนงาน',
      'รหัสแผนก',
      'ชื่อแผนก',
      'รหัสแบบฟอร์มควบคุม (DCC)',
      'แก้ไขครั้งที่ (Rev)',
      'สถานะเอกสาร',
      'จำนวนเครื่องมือที่วางแผน',
      'ผู้จัดทำ (Prepared By)',
      'ผู้ทบทวน (Reviewed By)',
      'ผู้อนุมัติ (Approved By)',
      'วันที่อนุมัติมีผล'
    ],
    ...plans.map((p) => {
      const dept = p.department || 'GEN';
      const deptName = p.department_name_th || dept;
      const docCode = p.document_code || `FM-${dept}-42`;
      const itemCount = Number(p.planned_items_count || p.item_count || 0);

      return [
        p.plan_year || year || new Date().getFullYear(),
        dept,
        deptName,
        docCode,
        `Rev.${p.revision || '01'}`,
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
    { wch: 22 }, // Dept name
    { wch: 24 }, // Doc code
    { wch: 16 }, // Rev
    { wch: 20 }, // Status
    { wch: 22 }, // Item count
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
    'ความถี่',
    'ผู้ดำเนินการตรวจ',
    ...MONTH_NAMES,
    'หมายเหตุ'
  ];

  const sheet2Rows = allItems.map((item, idx) => {
    const months = Array.isArray(item.planned_months)
      ? item.planned_months
      : (typeof item.planned_months === 'string' ? JSON.parse(item.planned_months || '[]') : []);

    const monthChecks = Array.from({ length: 12 }, (_, i) => (months.includes(i + 1) ? '✓' : ''));

    return [
      item.plan_year || year || new Date().getFullYear(),
      item.department || item.dept || '-',
      idx + 1,
      item.asset_code || '-',
      item.asset_name || item.name || '-',
      item.model || item.serial_no ? `${item.model || ''} ${item.serial_no ? `(${item.serial_no})` : ''}`.trim() : '-',
      item.frequency_label || 'รายปี',
      item.provider_name || item.responsible_label || '-',
      ...monthChecks,
      item.remarks || '-'
    ];
  });

  const ws2 = XLSX.utils.aoa_to_sheet([sheet2Header, ...sheet2Rows]);

  // Column widths for Sheet 2
  ws2['!cols'] = [
    { wch: 8 },  // Year
    { wch: 10 }, // Dept
    { wch: 6 },  // No.
    { wch: 16 }, // Asset code
    { wch: 26 }, // Asset name
    { wch: 18 }, // Model/Serial
    { wch: 12 }, // Freq
    { wch: 16 }, // Provider
    ...Array(12).fill({ wch: 5 }), // Months
    { wch: 24 }  // Remarks
  ];

  XLSX.utils.book_append_sheet(wb, ws2, 'รายการเครื่องมือรวมทุกแผนก');

  // ─────────────────────────────────────────────────────────────
  // Save / Trigger Download
  // ─────────────────────────────────────────────────────────────
  const fileName = `VCC_Annual_Plans_Summary_${year || new Date().getFullYear()}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
};
