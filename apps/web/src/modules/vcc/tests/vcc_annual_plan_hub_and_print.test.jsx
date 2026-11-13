import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import AnnualPlansHub, { resolveDigitalPlanCode, resolvePlanCode } from '../components/AnnualPlansHub';
import { PLAN_STATUS_CONFIG, getPlanStatusBadgeLabel } from '../utils/planLabels';
import AnnualPlanPrintView, { parseMonths } from '../components/AnnualPlanPrintView';
import AnnualPlanMatrixSection from '../components/AnnualPlanMatrixSection';
import AnnualPlanWorkspaceHeader from '../components/AnnualPlanWorkspaceHeader';
import { exportAnnualPlansMultiSheet } from '../utils/exportPlanSummary';
import { resetVccLocalStore } from '../api/vccApi';
import * as XLSX from 'xlsx';

vi.mock('xlsx', () => {
  return {
    utils: {
      book_new: vi.fn(() => ({ SheetNames: [], Sheets: {} })),
      aoa_to_sheet: vi.fn((data) => ({ '!data': data })),
      book_append_sheet: vi.fn((wb, ws, name) => {
        wb.SheetNames.push(name);
        wb.Sheets[name] = ws;
      })
    },
    writeFile: vi.fn()
  };
});

const mockPlans = [
  {
    id: 'plan-qc-2026',
    plan_year: 2026,
    department: 'QC',
    department_name_th: 'ควบคุมคุณภาพ',
    document_code: 'FM-QC-42',
    revision: '01',
    status: 'APPROVED',
    title: 'แผนการทวนสอบประจำปี 2026 ฝ่ายควบคุมคุณภาพ',
    due_date_rule: 'END_OF_MONTH',
    planned_items_count: 10,
    item_count: 10,
    prepared_by: 'QC Staff',
    prepared_at: '2026-01-05T08:00:00Z',
    reviewed_by: 'QC Supervisor',
    reviewed_at: '2026-01-08T10:00:00Z',
    approved_by: 'QC Manager',
    approved_at: '2026-01-10T14:00:00Z',
    form_issue_date: '2026-01-01',
    effective_date: '2026-01-15'
  },
  {
    id: 'plan-qa-2026',
    plan_year: 2026,
    department: 'QA',
    department_name_th: 'ประกันคุณภาพ',
    document_code: 'FM-QA-11',
    revision: '01',
    status: 'PENDING_REVIEW',
    title: 'แผนการทวนสอบประจำปี 2026 ฝ่ายประกันคุณภาพ',
    due_date_rule: 'END_OF_MONTH',
    planned_items_count: 5,
    item_count: 5,
    prepared_by: 'QA Officer',
    prepared_at: '2026-02-01T08:00:00Z',
    assigned_reviewer_name: 'QA HOD'
  },
  {
    id: 'plan-lb-2026',
    plan_year: 2026,
    department: 'LB',
    department_name_th: 'ห้องปฏิบัติการ',
    document_code: 'FM-LB-11',
    revision: '01',
    status: 'DRAFT',
    title: 'แผนการทวนสอบประจำปี 2026 ฝ่ายแล็บ',
    due_date_rule: 'EXACT_DATE',
    planned_items_count: 8,
    item_count: 8,
    prepared_by: 'Lab Staff'
  }
];

const mockAssets = Array.from({ length: 25 }, (_, i) => ({
  id: `ast-${i + 1}`,
  asset_code: `AST-${100 + i}`,
  status: 'ACTIVE'
}));

const mockItems = [
  {
    id: 'item-1',
    asset_id: 'ast-1',
    asset_code: 'CAL-001',
    asset_name: 'Digital Caliper 150mm',
    model: 'CD-6"CSX',
    serial_no: 'SN12345',
    frequency_label: 'ราย 6 เดือน',
    provider_name: 'QC Lab',
    planned_months: [2, 8],
    remarks: 'สอบเทียบภายใน'
  },
  {
    id: 'item-2',
    asset_id: 'ast-2',
    asset_code: 'MIC-002',
    asset_name: 'Outside Micrometer 0-25mm',
    model: 'M100',
    serial_no: 'SN98765',
    frequency_label: 'รายปี',
    provider_name: 'External Lab',
    planned_months: [6],
    remarks: 'ส่งสอบเทียบภายนอก'
  }
];

describe('VCC Annual Plan Hub & Spoke Architecture and ISO Print View', () => {
  beforeEach(() => {
    resetVccLocalStore();
    useStore.setState({
      currentUser: {
        id: 'dc4',
        name: 'DC หัวหน้า (DCC)',
        email: 'dc4@qms.local',
        role: 'STAFF',
        department: 'DC',
        approval_level: 4,
        approvalLevel: 4,
        isDcc: true,
        isQmr: false
      },
      masterUsers: [
        {
          id: 'dc4',
          name: 'DC หัวหน้า (DCC)',
          department: 'DC',
          approval_level: 4,
          status: 'ACTIVE',
          isDcc: true,
          position: 'Document Control Supervisor',
          signatureImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
        },
        {
          id: 'qc4',
          name: 'QC Leader',
          department: 'QC',
          approval_level: 4,
          position: 'Quality Supervisor',
          signatureImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
        },
        {
          id: 'qc5',
          name: 'QC Manager',
          department: 'QC',
          approval_level: 5,
          position: 'Quality Manager',
          signatureImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
        }
      ],
      masterDepartments: [
        { code: 'DC', name_th: 'ศูนย์ควบคุมเอกสาร', status: 'ACTIVE' },
        { code: 'QC', name_th: 'ควบคุมคุณภาพ', status: 'ACTIVE' },
        { code: 'QA', name_th: 'ประกันคุณภาพ', status: 'ACTIVE' },
        { code: 'LB', name_th: 'ห้องปฏิบัติการ', status: 'ACTIVE' }
      ],
      approvalMatrix: [{ docType: 'FM', minRequesterLevel: 1, requiredReviewerLevel: 4, requiredApproverLevel: 5 }]
    });
  });

  describe('0. resolvePlanCode & PLAN_STATUS_CONFIG (SSOT)', () => {
    it('แปลงรหัสแบบฟอร์มกระดาษ FM- เป็น VCC-AP-[DEPT]-[YEAR] เสมอ และคงค่า VCC-AP- เดิมไว้', () => {
      const currentYear = new Date().getFullYear();
      expect(resolveDigitalPlanCode({ department: 'QC', plan_year: 2026, document_code: 'FM-QC-46' })).toBe('VCC-AP-QC-2026');
      expect(resolveDigitalPlanCode({ department: 'QA', plan_year: 2026, document_code: 'FM-QA-11' })).toBe('VCC-AP-QA-2026');
      expect(resolveDigitalPlanCode({ department: 'LB', plan_year: 2026, document_code: 'VCC-PLAN-LB' })).toBe('VCC-AP-LB-2026');
      expect(resolveDigitalPlanCode({ department: 'QC', plan_year: 2027, document_code: 'VCC-AP-QC-2027' })).toBe('VCC-AP-QC-2027');
      expect(resolveDigitalPlanCode(null)).toBe(`VCC-AP-GEN-${currentYear}`);
      expect(resolvePlanCode({ dept: 'LB', year: 2028 })).toBe('VCC-AP-LB-2028');
    });

    it('แมปสถานะแผนการทวนสอบผ่าน PLAN_STATUS_CONFIG จุดเดียวครบถ้วน', () => {
      expect(PLAN_STATUS_CONFIG.APPROVED.badgeLabel).toBe('บังคับใช้ (Active)');
      expect(PLAN_STATUS_CONFIG.PENDING_APPROVAL.badgeLabel).toBe('รออนุมัติ (L5+)');
      expect(PLAN_STATUS_CONFIG.PENDING_REVIEW.badgeLabel).toBe('รอทบทวน (L4)');
      expect(PLAN_STATUS_CONFIG.REJECTED.badgeLabel).toBe('ถูกส่งกลับ');
      expect(PLAN_STATUS_CONFIG.RETURNED.badgeLabel).toBe('ถูกส่งกลับ');
      expect(PLAN_STATUS_CONFIG.DRAFT.badgeLabel).toBe('ฉบับร่าง (Draft)');
      expect(getPlanStatusBadgeLabel('APPROVED')).toBe('บังคับใช้ (Active)');
    });
  });

  describe('1. AnnualPlansHub (Level 1 Directory)', () => {
    it('เรนเดอร์แถบสรุปสถิติ KPI Strip ครบถ้วน (Active, Pending, Draft, ความครอบคลุม)', () => {
      render(
        <AnnualPlansHub
          plans={mockPlans}
          activeAssets={mockAssets}
          activeDepartments={[{ code: 'QC' }, { code: 'QA' }, { code: 'LB' }]}
          filterYear="2026"
        />
      );

      expect(screen.getByText('สารบัญแผนการทวนสอบและสอบเทียบประจำปี')).toBeInTheDocument();
      // Active KPI
      expect(screen.getByText('มีผลบังคับใช้ (Active)')).toBeInTheDocument();
      expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1); // 1 approved plan
      // Pending KPI
      expect(screen.getByText('รอการอนุมัติ (Pending)')).toBeInTheDocument();
      // Draft KPI
      expect(screen.getByText('กำลังจัดทำ (Draft)')).toBeInTheDocument();
      // Coverage %
      expect(screen.getByText('ความครอบคลุมเครื่องมือ')).toBeInTheDocument();
    });

    it('ตัวกรองสถานะสามารถกรองแสดงเฉพาะแผนที่บังคับใช้ (Active) หรือรออนุมัติ (Pending) ได้', () => {
      render(
        <AnnualPlansHub
          plans={mockPlans}
          activeAssets={mockAssets}
          filterYear="2026"
        />
      );

      // เริ่มต้นแสดงทั้ง 3 แผนเป็นรหัสแผนดิจิทัล (VCC-AP-*) และไม่พบรหัสแบบฟอร์มกระดาษเดิม (FM-*)
      expect(screen.getByText('VCC-AP-QC-2026')).toBeInTheDocument();
      expect(screen.getByText('VCC-AP-QA-2026')).toBeInTheDocument();
      expect(screen.getByText('VCC-AP-LB-2026')).toBeInTheDocument();
      expect(screen.queryByText('FM-QC-42')).not.toBeInTheDocument();
      expect(screen.queryByText('FM-QA-11')).not.toBeInTheDocument();
      expect(screen.queryByText('FM-LB-11')).not.toBeInTheDocument();

      // กรองเฉพาะ บังคับใช้ (Active)
      fireEvent.click(screen.getByRole('button', { name: 'บังคับใช้ (Active)' }));
      expect(screen.getByText('VCC-AP-QC-2026')).toBeInTheDocument();
      expect(screen.queryByText('VCC-AP-QA-2026')).not.toBeInTheDocument();
      expect(screen.queryByText('VCC-AP-LB-2026')).not.toBeInTheDocument();

      // กรองเฉพาะ ฉบับร่าง (Draft)
      fireEvent.click(screen.getByRole('button', { name: 'ฉบับร่าง (Draft)' }));
      expect(screen.getByText('VCC-AP-LB-2026')).toBeInTheDocument();
      expect(screen.queryByText('VCC-AP-QC-2026')).not.toBeInTheDocument();
    });

    it('คลิกปุ่ม "เปิดแผนงาน" และ "พิมพ์เอกสาร" จะเรียก Callback ที่ถูกต้อง', () => {
      const onOpenPlan = vi.fn();
      const onPrintPlan = vi.fn();
      const onExportSummary = vi.fn();

      render(
        <AnnualPlansHub
          plans={mockPlans}
          activeAssets={mockAssets}
          onOpenPlan={onOpenPlan}
          onPrintPlan={onPrintPlan}
          onExportSummary={onExportSummary}
        />
      );

      // คลิกปุ่มส่งออกภาพรวมทุกแผนก
      fireEvent.click(screen.getByRole('button', { name: /ส่งออกภาพรวมทุกแผนก/ }));
      expect(onExportSummary).toHaveBeenCalledTimes(1);

      // คลิกปุ่มเปิดแผนงานในแถวแรก
      const openButtons = screen.getAllByRole('button', { name: /เปิดแผนงาน/ });
      fireEvent.click(openButtons[0]);
      expect(onOpenPlan).toHaveBeenCalledWith('plan-qc-2026');

      // คลิกปุ่มพิมพ์ในแถว
      const printButtons = screen.getAllByTitle('พิมพ์แบบฟอร์มเอกสารควบคุม (A4 แนวนอน)');
      fireEvent.click(printButtons[0]);
      expect(onPrintPlan).toHaveBeenCalledWith(mockPlans[0]);
    });
  });

  describe('2. AnnualPlanPrintView (Corporate Banner, Plan Control Box, Multi-Page A4 Pagination & Signatories)', () => {
    it('แสดงหัวกระดาษแบนเนอร์ บริษัท เศรษฐชล จำกัด กล่องข้อมูลควบคุมแผน 4 แถวมุมขวาบน และตาราง table-fixed แยกแถว Plan/Act.', () => {
      const onClose = vi.fn();
      render(
        <AnnualPlanPrintView
          plan={mockPlans[0]}
          items={mockItems}
          onClose={onClose}
        />
      );

      // แบนเนอร์ภาพทางการของ บริษัท เศรษฐชล จำกัด (/banner.png)
      const bannerImg = screen.getByAltText('บริษัท เศรษฐชล จำกัด (SETHACHON CO., LTD.)');
      expect(bannerImg).toBeInTheDocument();
      expect(bannerImg).toHaveAttribute('src', '/banner.png');

      // กล่องข้อมูลควบคุมแผน 4 แถวมุมขวาบน
      expect(screen.getByText('เลขที่แผน (Plan No.)')).toBeInTheDocument();
      expect(screen.getByText('VCC-AP-QC-2026')).toBeInTheDocument();
      expect(screen.getByText('แก้ไขครั้งที่ (Rev.)')).toBeInTheDocument();
      expect(screen.getByText('Rev.01')).toBeInTheDocument();
      expect(screen.getByText('วันที่บังคับใช้')).toBeInTheDocument();
      expect(screen.getByText('10/01/2569')).toBeInTheDocument();
      expect(screen.getByText('แผ่นที่ (Page)')).toBeInTheDocument();
      expect(screen.getByText('1 / 1')).toBeInTheDocument();

      // ชื่อเรื่องเอกสาร (แบบกะทัดรัด ไม่มีบรรทัดภาษาอังกฤษที่เปลืองพื้นที่)
      expect(screen.getByText('แผนการทวนสอบและสอบเทียบเครื่องมือวัด ประจำปี 2026 (พ.ศ. 2569)')).toBeInTheDocument();
      expect(screen.queryByText('Annual Equipment Verification & Calibration Plan')).not.toBeInTheDocument();
      expect(screen.getByText('หน่วยงาน / แผนก: ฝ่ายควบคุมคุณภาพ')).toBeInTheDocument();

      // แถบหัว Modal (ตัวอย่างก่อนพิมพ์: แผนการทวนสอบและสอบเทียบประจำปี 2569)
      expect(screen.getByText('ตัวอย่างก่อนพิมพ์: แผนการทวนสอบและสอบเทียบประจำปี 2569')).toBeInTheDocument();

      // ไม่มีข้อความผูกมัดของระบบอื่นๆ
      expect(screen.queryByText(/เกณฑ์วันครบกำหนด/)).not.toBeInTheDocument();
      expect(screen.queryByText(/จำนวนเครื่องมือทั้งหมดในแผน/)).not.toBeInTheDocument();
      expect(screen.queryByText(/ISO 9001:2015 Clause 7.1.5/)).not.toBeInTheDocument();
      expect(screen.queryByText(/เอกสารควบคุมฉบับอิเล็กทรอนิกส์/)).not.toBeInTheDocument();

      // ตรวจสอบโครงสร้างตาราง table-fixed ป้องกันหมายเหตุตกขอบขวา
      const matrixTable = screen.getByText('รายการเครื่องมือวัด').closest('table');
      expect(matrixTable).toHaveClass('table-fixed');
      expect(matrixTable).toHaveClass('w-full');

      // รายการเครื่องมือ
      expect(screen.getByText('CAL-001')).toBeInTheDocument();
      expect(screen.getByText('Digital Caliper 150mm')).toBeInTheDocument();
      expect(screen.getByText('MIC-002')).toBeInTheDocument();

      // ตาราง Matrix แยกแถวย่อย Plan / Act. และสัญลักษณ์ P
      expect(screen.getAllByText('Plan').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Act.').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('P').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/สัญลักษณ์: P \(Plan\) = เดือนที่กำหนดตามแผน/)).toBeInTheDocument();

      // ตารางลงนาม 3 ช่อง
      expect(screen.getByText('ผู้จัดทำ (Prepared By)')).toBeInTheDocument();
      expect(screen.getByText('ผู้ทบทวน (Reviewed By)')).toBeInTheDocument();
      expect(screen.getByText('ผู้อนุมัติ (Approved By)')).toBeInTheDocument();
    });

    it('แสดงเหตุผลการแก้ไขเมื่อเป็นฉบับปรับปรุง (revision_no > 1) และดึงเกณฑ์ยอมรับจากข้อมูลเครื่องมือ (tolerance)', () => {
      const revisedPlan = {
        ...mockPlans[0],
        plan_code: 'VCC-AP-QC-2026',
        revision_no: 2,
        revision_reason: 'เพิ่มเครื่องมือใหม่เข้าสายการผลิต'
      };
      const itemsWithAssetFallback = [
        {
          id: 'item-fallback-1',
          asset_id: 'ast-tol-1',
          asset_code: 'SCALE-09',
          asset_name: 'Digital Balance',
          provider_name: 'EXTERNAL',
          planned_months: [3],
          actual_months: [3],
          remarks: 'ข้อความหมายเหตุแบบยาวเพื่อทดสอบการขึ้นบรรทัดใหม่ไม่ให้ตกขอบขวา'
        }
      ];
      const assetsList = [
        {
          id: 'ast-tol-1',
          asset_code: 'SCALE-09',
          tolerance: '±0.05 g'
        }
      ];

      render(
        <AnnualPlanPrintView
          plan={revisedPlan}
          items={itemsWithAssetFallback}
          assets={assetsList}
        />
      );

      expect(screen.getByText('Rev.02')).toBeInTheDocument();
      expect(screen.getByText(/เหตุผลการแก้ไข \(Rev\.02\):/)).toBeInTheDocument();
      expect(screen.getByText(/เพิ่มเครื่องมือใหม่เข้าสายการผลิต/)).toBeInTheDocument();
      expect(screen.getByText('±0.05 g')).toBeInTheDocument();
    });

    it('ตัดแบ่งหน้ากระดาษ A4 แนวนอนอัตโนมัติ (10 รายการ/หน้า) พร้อมเลขหน้า หัวกระดาษ และกล่องลายเซ็น 3 ช่องครบทุกหน้า', () => {
      const fourteenItems = Array.from({ length: 14 }, (_, idx) => ({
        id: `multi-item-${idx + 1}`,
        asset_id: `ast-m-${idx + 1}`,
        asset_code: `EQ-${String(idx + 1).padStart(3, '0')}`,
        asset_name: `Measuring Device ${idx + 1}`,
        acceptance_criteria: `±0.${idx + 1} mm`,
        provider_name: 'INTERNAL',
        frequency_label: 'ปีละ 1 ครั้ง',
        planned_months: [(idx % 12) + 1],
        actual_months: idx < 6 ? [(idx % 12) + 1] : []
      }));

      render(
        <AnnualPlanPrintView
          plan={mockPlans[0]}
          items={fourteenItems}
        />
      );

      // 14 รายการ / 10 รายการต่อหน้า = 2 แผ่น A4 แนวนอน
      const sheet1 = screen.getByTestId('a4-landscape-sheet-1');
      const sheet2 = screen.getByTestId('a4-landscape-sheet-2');

      expect(sheet1).toHaveClass('print:break-after-page');
      expect(sheet2).toHaveClass('print:break-after-auto');

      // ตรวจสอบเลขหน้า 1 / 2, 2 / 2 และองค์ประกอบครบทั้ง 2 หน้า
      expect(within(sheet1).getByText('1 / 2')).toBeInTheDocument();
      expect(within(sheet2).getByText('2 / 2')).toBeInTheDocument();

      // ตรวจสอบลำดับที่รันต่อเนื่องข้ามหน้า (หน้า 1: EQ-001..010, หน้า 2: EQ-011..014)
      expect(within(sheet1).getByText('EQ-001')).toBeInTheDocument();
      expect(within(sheet1).getByText('EQ-010')).toBeInTheDocument();
      expect(within(sheet1).queryByText('EQ-011')).not.toBeInTheDocument();

      expect(within(sheet2).getByText('EQ-011')).toBeInTheDocument();
      expect(within(sheet2).getByText('EQ-014')).toBeInTheDocument();
      expect(within(sheet2).getByText('11')).toBeInTheDocument();
      expect(within(sheet2).getByText('14')).toBeInTheDocument();

      // ทุกหน้าต้องมีแบนเนอร์และกล่องลายเซ็นครบ 3 ช่องเสมอ
      [sheet1, sheet2].forEach((sheet) => {
        expect(within(sheet).getByAltText('บริษัท เศรษฐชล จำกัด (SETHACHON CO., LTD.)')).toBeInTheDocument();
        expect(within(sheet).getByText('ผู้จัดทำ (Prepared By)')).toBeInTheDocument();
        expect(within(sheet).getByText('ผู้ทบทวน (Reviewed By)')).toBeInTheDocument();
        expect(within(sheet).getByText('ผู้อนุมัติ (Approved By)')).toBeInTheDocument();
      });
    });

    it('แผนที่มี 5 รายการ (ST002, SW001, TC001, V001, V002) จะแสดงครบใน 1 หน้าเดียว (1 / 1) เนื่องจาก ITEMS_PER_PAGE = 10', () => {
      const fiveItems = [
        { id: 'it-1', asset_code: 'ST002', asset_name: 'Vernier Caliper ST002', planned_months: [2] },
        { id: 'it-2', asset_code: 'SW001', asset_name: 'Stopwatch SW001', planned_months: [4] },
        { id: 'it-3', asset_code: 'TC001', asset_name: 'Thermocouple TC001', planned_months: [6] },
        { id: 'it-4', asset_code: 'V001', asset_name: 'Viscometer V001', planned_months: [8] },
        { id: 'it-5', asset_code: 'V002', asset_name: 'Viscometer V002', planned_months: [10] }
      ];

      render(
        <AnnualPlanPrintView
          plan={mockPlans[0]}
          items={fiveItems}
        />
      );

      // 5 รายการ ≤ 10 รายการต่อหน้า → แสดงจบใน 1 หน้าเดียว
      const sheet1 = screen.getByTestId('a4-landscape-sheet-1');
      expect(screen.queryByTestId('a4-landscape-sheet-2')).not.toBeInTheDocument();

      expect(sheet1).toHaveClass('print:break-after-auto');
      expect(within(sheet1).getByText('1 / 1')).toBeInTheDocument();

      // หน้าเดียวมีรายการทั้ง 5 ครบ
      expect(within(sheet1).getByText('ST002')).toBeInTheDocument();
      expect(within(sheet1).getByText('SW001')).toBeInTheDocument();
      expect(within(sheet1).getByText('TC001')).toBeInTheDocument();
      expect(within(sheet1).getByText('V001')).toBeInTheDocument();
      expect(within(sheet1).getByText('V002')).toBeInTheDocument();

      // มีแบนเนอร์และกล่องลายเซ็นครบถ้วน
      expect(within(sheet1).getByAltText('บริษัท เศรษฐชล จำกัด (SETHACHON CO., LTD.)')).toBeInTheDocument();
      expect(within(sheet1).getByText('ผู้จัดทำ (Prepared By)')).toBeInTheDocument();
      expect(within(sheet1).getByText('ผู้อนุมัติ (Approved By)')).toBeInTheDocument();
    });

    it('แผนที่มี 10 รายการจะแสดงครบในหน้าเดียว (1 / 1) และเมื่อมี 12 รายการจะตัดแบ่งเป็น 2 หน้า (1 / 2 และ 2 / 2)', () => {
      const tenItems = Array.from({ length: 10 }, (_, idx) => ({
        id: `ten-it-${idx + 1}`,
        asset_code: `CAL-${String(idx + 1).padStart(3, '0')}`,
        asset_name: `Caliper ${idx + 1}`,
        planned_months: [(idx % 12) + 1]
      }));

      const { unmount } = render(
        <AnnualPlanPrintView
          plan={mockPlans[0]}
          items={tenItems}
        />
      );

      // 10 รายการ พอดี 1 หน้า A4 แนวนอน (1 / 1)
      const page1 = screen.getByTestId('a4-landscape-sheet-1');
      expect(screen.queryByTestId('a4-landscape-sheet-2')).not.toBeInTheDocument();
      expect(within(page1).getByText('1 / 1')).toBeInTheDocument();
      expect(within(page1).getByText('CAL-001')).toBeInTheDocument();
      expect(within(page1).getByText('CAL-010')).toBeInTheDocument();
      unmount();

      // 12 รายการ ต้องตัดแบ่งเป็น 2 หน้า (หน้า 1: 10 รายการ, หน้า 2: 2 รายการ)
      const twelveItems = Array.from({ length: 12 }, (_, idx) => ({
        id: `twelve-it-${idx + 1}`,
        asset_code: `EQ-${String(idx + 1).padStart(3, '0')}`,
        asset_name: `Device ${idx + 1}`,
        planned_months: [(idx % 12) + 1]
      }));

      render(
        <AnnualPlanPrintView
          plan={mockPlans[0]}
          items={twelveItems}
        />
      );

      const sheet1 = screen.getByTestId('a4-landscape-sheet-1');
      const sheet2 = screen.getByTestId('a4-landscape-sheet-2');
      expect(within(sheet1).getByText('1 / 2')).toBeInTheDocument();
      expect(within(sheet2).getByText('2 / 2')).toBeInTheDocument();

      // หน้า 1 มี EQ-001..EQ-010
      expect(within(sheet1).getByText('EQ-001')).toBeInTheDocument();
      expect(within(sheet1).getByText('EQ-010')).toBeInTheDocument();
      expect(within(sheet1).queryByText('EQ-011')).not.toBeInTheDocument();

      // หน้า 2 มี EQ-011..EQ-012
      expect(within(sheet2).getByText('EQ-011')).toBeInTheDocument();
      expect(within(sheet2).getByText('EQ-012')).toBeInTheDocument();
    });

    it('ล้างคำว่า [ข้อมูลทดสอบ] ออกจาก asset_name, remarks และ asset_code ทุกจุดก่อนแสดงผล (ทั้งต้นข้อความ กลางข้อความ หรือท้ายข้อความ)', () => {
      const testDataItems = [
        {
          id: 'test-seed-1',
          asset_code: '[ข้อมูลทดสอบ] TEST-001',
          asset_name: '[ข้อมูลทดสอบ] Vernier Caliper 150mm [ข้อมูลทดสอบ]',
          model: 'CD-6',
          serial_no: 'SN001',
          remarks: 'ข้อความหมายเหตุ [ข้อมูลทดสอบ] สอบเทียบภายในประจำปี'
        }
      ];

      render(
        <AnnualPlanPrintView
          plan={mockPlans[0]}
          items={testDataItems}
        />
      );

      // แสดงเฉพาะชื่อเครื่องมือและหมายเหตุที่ล้างคำว่า [ข้อมูลทดสอบ] แล้ว
      expect(screen.getByText('TEST-001')).toBeInTheDocument();
      expect(screen.getByText('Vernier Caliper 150mm')).toBeInTheDocument();
      expect(screen.getByText('ข้อความหมายเหตุ สอบเทียบภายในประจำปี')).toBeInTheDocument();
      expect(screen.queryByText(/\[ข้อมูลทดสอบ\]/)).not.toBeInTheDocument();
    });

    it('ดึงชื่อเครื่องมือ ยี่ห้อ/รุ่น หมายเลขเครื่อง และสถานที่ติดตั้ง จาก matchedAsset เมื่อ plan item มีเฉพาะรหัสเครื่องมือ', () => {
      const plan = { ...mockPlans[0], id: 'plan-asset-fallback-test' };
      const sparseItems = [
        {
          id: 'it-sparse-1',
          asset_id: 'ast-rich-1',
          asset_code: 'GAUGE-99',
          planned_months: [4]
        }
      ];
      const richAssets = [
        {
          id: 'ast-rich-1',
          asset_code: 'GAUGE-99',
          asset_name: 'Pressure Gauge 100 PSI',
          brand: 'Ashcroft',
          model: 'Type 1009',
          serial_no: 'ASH-88219',
          location: 'Production Line 2',
          tolerance: '±1.0 PSI'
        }
      ];

      render(
        <AnnualPlanPrintView
          plan={plan}
          items={sparseItems}
          assets={richAssets}
        />
      );

      // ชื่อเครื่องมือ ยี่ห้อ รุ่น SN สถานที่ และเกณฑ์ยอมรับ ถูกดึงมาจาก matchedAsset โดยไม่เป็น '-'
      expect(screen.getByText('GAUGE-99')).toBeInTheDocument();
      expect(screen.getByText('Pressure Gauge 100 PSI')).toBeInTheDocument();
      expect(screen.getByText(/รุ่น: Ashcroft Type 1009 • SN: ASH-88219 • สถานที่: Production Line 2/)).toBeInTheDocument();
      expect(screen.getByText('±1.0 PSI')).toBeInTheDocument();
    });

    it('ดึงชื่อแผนกภาษาไทยจาก masterDepartments อัตโนมัติเมื่อ plan ไม่มีระบุ department_name_th', () => {
      render(
        <AnnualPlanPrintView
          plan={{
            id: 'plan-no-dept-th',
            department: 'LB', // ห้องปฏิบัติการ ใน masterDepartments
            plan_year: 2026
          }}
          items={mockItems}
        />
      );

      // ดึง 'ห้องปฏิบัติการ' จาก masterDepartments แล้วจัดรูปแบบเป็น 'ฝ่ายห้องปฏิบัติการ'
      expect(screen.getByText('หน่วยงาน / แผนก: ฝ่ายห้องปฏิบัติการ')).toBeInTheDocument();
    });

    it('แผนที่มี 11 รายการจะตัดแบ่งเป็น 2 หน้าพอดี (หน้าแรก 10 รายการ และหน้าที่สอง 1 รายการ)', () => {
      const elevenItems = Array.from({ length: 11 }, (_, idx) => ({
        id: `eleven-it-${idx + 1}`,
        asset_code: `EQ-11-${String(idx + 1).padStart(2, '0')}`,
        asset_name: `Machine ${idx + 1}`,
        planned_months: [(idx % 12) + 1]
      }));

      render(
        <AnnualPlanPrintView
          plan={mockPlans[0]}
          items={elevenItems}
        />
      );

      const sheet1 = screen.getByTestId('a4-landscape-sheet-1');
      const sheet2 = screen.getByTestId('a4-landscape-sheet-2');
      expect(screen.queryByTestId('a4-landscape-sheet-3')).not.toBeInTheDocument();

      expect(within(sheet1).getByText('1 / 2')).toBeInTheDocument();
      expect(within(sheet2).getByText('2 / 2')).toBeInTheDocument();

      // หน้า 1 มี EQ-11-01 ถึง EQ-11-10
      expect(within(sheet1).getByText('EQ-11-01')).toBeInTheDocument();
      expect(within(sheet1).getByText('EQ-11-10')).toBeInTheDocument();
      expect(within(sheet1).queryByText('EQ-11-11')).not.toBeInTheDocument();

      // หน้า 2 มี EQ-11-11
      expect(within(sheet2).getByText('EQ-11-11')).toBeInTheDocument();
    });

    it('แสดงเครื่องหมาย ✓ ในแถว Act. เมื่อมีใบสั่งงานสถานะ CLOSED ในเดือนที่ทำจริง (performed_at หรือ planned_month)', () => {
      const plan = {
        ...mockPlans[0],
        id: 'plan-act-test',
        plan_year: 2026
      };
      const items = [
        {
          id: 'item-st002',
          asset_id: 'ast-st002',
          asset_code: 'ST002',
          asset_name: 'Vernier ST002',
          planned_months: [3]
        },
        {
          id: 'item-tc001',
          asset_id: 'ast-tc001',
          asset_code: 'TC001',
          asset_name: 'Thermocouple TC001',
          planned_months: [5]
        },
        {
          id: 'item-v002',
          asset_id: 'ast-v002',
          asset_code: 'V002',
          asset_name: 'Viscometer V002',
          planned_months: [7]
        }
      ];

      const workOrders = [
        {
          id: 'wo-1',
          plan_id: 'plan-act-test',
          plan_item_id: 'item-st002',
          asset_id: 'ast-st002',
          status: 'CLOSED',
          performed_at: '2026-03-25' // Month 3
        },
        {
          id: 'wo-2',
          plan_id: 'plan-act-test',
          plan_item_id: 'item-tc001',
          asset_id: 'ast-tc001',
          status: 'CLOSED',
          planned_month: 5 // Month 5 without performed_at
        },
        {
          id: 'wo-3',
          plan_id: 'plan-act-test',
          plan_item_id: 'item-v002',
          asset_id: 'ast-v002',
          status: 'IN_PROGRESS', // NOT closed
          planned_month: 7
        }
      ];

      render(
        <AnnualPlanPrintView
          plan={plan}
          items={items}
          workOrders={workOrders}
        />
      );

      // มีเครื่องหมาย ✓ สำหรับ ST002 (เดือน 3) และ TC001 (เดือน 5)
      // แต่ไม่มีสำหรับ V002 เพราะสถานะ IN_PROGRESS ยังไม่ CLOSED
      const checkmarks = screen.getAllByText('✓');
      expect(checkmarks.length).toBe(2);
    });

    it('ดึงเกณฑ์ยอมรับตามลำดับความสำคัญ item -> asset -> workOrders ได้ถูกต้อง', () => {
      const plan = { ...mockPlans[0], id: 'plan-crit-test', plan_year: 2026 };
      const items = [
        {
          id: 'it-crit-1',
          asset_id: 'ast-1',
          asset_code: 'EQ-01',
          acceptance_criteria: '± 0.01 mm' // from item direct
        },
        {
          id: 'it-crit-2',
          asset_id: 'ast-2',
          asset_code: 'EQ-02' // fallback to asset
        },
        {
          id: 'it-crit-3',
          asset_id: 'ast-3',
          asset_code: 'EQ-03' // fallback to workOrder
        },
        {
          id: 'it-crit-4',
          asset_id: 'ast-4',
          asset_code: 'EQ-04' // no criteria anywhere -> '-'
        }
      ];
      const assets = [
        { id: 'ast-2', asset_code: 'EQ-02', tolerance: '± 0.5 °C' }
      ];
      const workOrders = [
        {
          id: 'wo-crit-3',
          plan_id: 'plan-crit-test',
          plan_item_id: 'it-crit-3',
          asset_id: 'ast-3',
          acceptance_criteria: '± 0.05 bar'
        }
      ];

      render(
        <AnnualPlanPrintView
          plan={plan}
          items={items}
          assets={assets}
          workOrders={workOrders}
        />
      );

      expect(screen.getByText('± 0.01 mm')).toBeInTheDocument();
      expect(screen.getByText('± 0.5 °C')).toBeInTheDocument();
      expect(screen.getByText('± 0.05 bar')).toBeInTheDocument();
      expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(1);
    });

    it('parseMonths จัดการข้อมูลเดือนได้ครบทุกรูปแบบ ทั้ง array, number, json string และ comma-separated string', () => {
      expect(parseMonths([3, 5])).toEqual([3, 5]);
      expect(parseMonths(4)).toEqual([4]);
      expect(parseMonths('["3", 5]')).toEqual([3, 5]);
      expect(parseMonths('7')).toEqual([7]);
      expect(parseMonths('2, 6, 11')).toEqual([2, 6, 11]);
      expect(parseMonths('')).toEqual([]);
      expect(parseMonths(null)).toEqual([]);
      expect(parseMonths(undefined)).toEqual([]);
      expect(parseMonths([0, 13, -1])).toEqual([]);
    });

    it('ไม่แสดงเครื่องหมาย ✓ หากใบสั่งงานที่ CLOSED ดำเนินการคนละปีกับแผนประจำปี', () => {
      const plan = {
        ...mockPlans[0],
        id: 'plan-2026-test',
        plan_year: 2026
      };
      const items = [
        {
          id: 'it-prev-year',
          asset_id: 'ast-prev',
          asset_code: 'EQ-PREV',
          planned_months: [12]
        }
      ];
      const workOrders = [
        {
          id: 'wo-prev',
          plan_id: 'plan-2026-test',
          plan_item_id: 'it-prev-year',
          asset_id: 'ast-prev',
          status: 'CLOSED',
          performed_at: '2025-12-25' // Done in 2025, not 2026!
        }
      ];

      render(
        <AnnualPlanPrintView
          plan={plan}
          items={items}
          workOrders={workOrders}
        />
      );

      // ต้องไม่มี ✓ ในช่องเดือนของแผนปี 2026
      expect(screen.queryByText('✓')).not.toBeInTheDocument();
    });

    it('ดึงเกณฑ์ยอมรับจากใบสั่งงานที่มีข้อมูลเกณฑ์ แม้ใบสั่งงานล่าสุดจะเป็นค่าว่าง (ไม่ทำข้อมูลตกหล่น)', () => {
      const plan = { ...mockPlans[0], id: 'plan-wo-crit-test', plan_year: 2026 };
      const items = [
        {
          id: 'it-crit-multi',
          asset_id: 'ast-multi',
          asset_code: 'EQ-MULTI'
        }
      ];
      const workOrders = [
        {
          id: 'wo-older',
          plan_item_id: 'it-crit-multi',
          asset_id: 'ast-multi',
          performed_at: '2026-02-10',
          acceptance_criteria: '± 0.02 mm' // Older WO has criteria
        },
        {
          id: 'wo-newer',
          plan_item_id: 'it-crit-multi',
          asset_id: 'ast-multi',
          performed_at: '2026-08-15',
          acceptance_criteria: '' // Newer WO has empty criteria
        }
      ];

      render(
        <AnnualPlanPrintView
          plan={plan}
          items={items}
          workOrders={workOrders}
        />
      );

      expect(screen.getByText('± 0.02 mm')).toBeInTheDocument();
    });

    it('จับคู่เครื่องมือวัดกับ assets และ workOrders แบบ case-insensitive และตัดช่องว่างอย่างถูกต้อง', () => {
      const plan = { ...mockPlans[0], id: 'plan-case-test', plan_year: 2026 };
      const items = [
        {
          id: 'it-case',
          asset_code: 'st002 ', // lowercase + trailing space
          planned_months: [4]
        }
      ];
      const assets = [
        { id: 'ast-c', asset_code: 'ST002', tolerance: '± 0.05 mm' }
      ];
      const workOrders = [
        {
          id: 'wo-c',
          asset_code: ' ST002',
          status: 'CLOSED',
          performed_at: '2026-04-10'
        }
      ];

      render(
        <AnnualPlanPrintView
          plan={plan}
          items={items}
          assets={assets}
          workOrders={workOrders}
        />
      );

      // ดึง tolerance จาก asset ที่รหัสเครื่องมือตรงกันแบบ case-insensitive ได้
      expect(screen.getByText('± 0.05 mm')).toBeInTheDocument();
      // แสดงเครื่องหมาย ✓ จาก work order ที่รหัสเครื่องมือตรงกันแบบ case-insensitive ได้
      expect(screen.getByText('✓')).toBeInTheDocument();
    });

    it('ไม่แสดงคำว่า "ฝ่ายฝ่าย..." ซ้ำซ้อน หากชื่อแผนกมีคำว่า "ฝ่าย" นำหน้าอยู่แล้ว และจัดการคำว่า "แผนก" อย่างถูกต้อง', () => {
      const { unmount } = render(
        <AnnualPlanPrintView
          plan={{
            ...mockPlans[0],
            department_name_th: 'ฝ่ายฝ่ายควบคุมคุณภาพ'
          }}
          items={mockItems}
        />
      );

      expect(screen.getByText('หน่วยงาน / แผนก: ฝ่ายควบคุมคุณภาพ')).toBeInTheDocument();
      expect(screen.queryByText(/ฝ่ายฝ่าย/)).not.toBeInTheDocument();
      unmount();

      // เมื่อชื่อเป็น "แผนกวิจัยและพัฒนา" ต้องไม่เติม "ฝ่าย" กลายเป็น "ฝ่ายแผนก..."
      render(
        <AnnualPlanPrintView
          plan={{
            ...mockPlans[0],
            department_name_th: 'แผนกวิจัยและพัฒนา'
          }}
          items={mockItems}
        />
      );
      expect(screen.getByText('หน่วยงาน / แผนก: แผนกวิจัยและพัฒนา')).toBeInTheDocument();
      expect(screen.queryByText(/ฝ่ายแผนก/)).not.toBeInTheDocument();
    });

    it('แสดงค่าเกณฑ์ยอมรับที่เป็นตัวเลข 0 ได้อย่างถูกต้อง และแปลค่า INTERNAL/EXTERNAL เป็นภาษาไทยเต็ม', () => {
      const edgeItems = [
        {
          id: 'item-edge-1',
          asset_code: 'GAUGE-001',
          asset_name: 'Pin Gauge 5.0mm',
          brand: 'Eisen',
          model: 'EP-5',
          serial_no: 'SN-001',
          acceptance_criteria: 0,
          provider_name: 'INTERNAL',
          frequency_label: 'ปีละ 1 ครั้ง',
          planned_months: '[1, 6]',
          actual_months: '[1]'
        },
        {
          id: 'item-edge-2',
          asset_code: 'TORQUE-002',
          asset_name: 'Torque Wrench',
          mpe: '±1.0 Nm',
          provider_name: 'EXTERNAL',
          frequency_label: 'ปีละ 1 ครั้ง',
          planned_months: [4],
          actual_months: []
        }
      ];

      render(
        <AnnualPlanPrintView
          plan={mockPlans[0]}
          items={edgeItems}
        />
      );

      // เกณฑ์ยอมรับที่เป็น 0 ต้องไม่ถูกกลืนเป็น '-'
      expect(screen.getByText('0')).toBeInTheDocument();
      expect(screen.getByText('±1.0 Nm')).toBeInTheDocument();

      // แปลค่าผู้ให้บริการเป็นคำเต็มภาษาไทย
      expect(screen.getByText('ทวนสอบภายใน')).toBeInTheDocument();
      expect(screen.getByText('ห้องปฏิบัติการภายนอก')).toBeInTheDocument();
    });

    it('สำหรับแผนที่ยังไม่อนุมัติ (DRAFT) จะแสดงลายน้ำฉบับร่าง ห้ามใช้ปฏิบัติงาน และไม่แสดงภาพลายเซ็น', () => {
      render(
        <AnnualPlanPrintView
          plan={mockPlans[2]} // LB Draft plan
          items={mockItems}
        />
      );

      // ต้องมีลายน้ำ DRAFT
      expect(screen.getByText(/DRAFT \/ ฉบับร่าง/)).toBeInTheDocument();
      expect(screen.getAllByText(/ห้ามใช้ปฏิบัติงาน/).length).toBeGreaterThanOrEqual(1);

      // ช่องผู้ทบทวนและผู้อนุมัติยังไม่มีการลงนาม
      const unsignedNotes = screen.getAllByText('- ยังไม่มีการลงนาม -');
      expect(unsignedNotes.length).toBeGreaterThanOrEqual(1);
    });

    it('สำหรับแผนที่อนุมัติแล้ว (APPROVED) จะแสดงบล็อกลายเซ็นจริง และไม่มีป้ายดิจิทัลสีเขียว ทบทวนแล้ว/อนุมัติแล้ว', () => {
      useStore.setState({
        masterUsers: [
          {
            id: 'QC Staff',
            name: 'QC Staff',
            position: 'QC Technician',
            signatureImage: 'data:image/png;base64,MOCK_SIGNATURE_PREP'
          },
          {
            id: 'QC Supervisor',
            name: 'QC Supervisor',
            position: 'QC Supervisor',
            signatureImage: 'data:image/png;base64,MOCK_SIGNATURE_REV'
          },
          {
            id: 'QC Manager',
            name: 'QC Manager',
            position: 'QC Manager',
            signatureImage: 'data:image/png;base64,MOCK_SIGNATURE_APP'
          }
        ]
      });

      render(
        <AnnualPlanPrintView
          plan={mockPlans[0]} // QC Approved plan
          items={mockItems}
        />
      );

      // มีป้ายกำกับอนุมัติแล้วใน Toolbar
      expect(screen.getByText('มีผลบังคับใช้ (พร้อมลายเซ็น)')).toBeInTheDocument();

      // เอาป้ายสีเขียวดิจิทัลในช่องลายเซ็นออกตาม requirement
      expect(screen.queryByText('ทบทวนแล้ว')).not.toBeInTheDocument();
      expect(screen.queryByText('อนุมัติแล้ว')).not.toBeInTheDocument();

      // ลายเซ็นต์ของผู้ลงนามต้องถูกเรนเดอร์ในรูป img
      const sigImages = screen.getAllByRole('img');
      expect(sigImages.length).toBeGreaterThanOrEqual(1);
    });

    it('เรนเดอร์ผ่าน createPortal ไปยัง document.body ด้วย #vcc-print-portal, มีคลาส no-print, print-scroll-container, a4-landscape-sheet และสไตล์ตัดขอบพิมพ์ 0mm', () => {
      const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
      const { unmount } = render(
        <AnnualPlanPrintView
          plan={mockPlans[0]}
          items={mockItems}
          assets={[]}
          onClose={vi.fn()}
        />
      );

      // 1. ตรวจสอบว่ามี #vcc-print-portal อยู่ใต้ document.body โดยตรง
      const portalEl = document.getElementById('vcc-print-portal');
      expect(portalEl).toBeInTheDocument();
      expect(portalEl.parentElement).toBe(document.body);

      // 2. แถบ Toolbar มีคลาส no-print
      const toolbar = portalEl.querySelector('.no-print');
      expect(toolbar).toBeInTheDocument();
      expect(within(toolbar).getByText(/ตัวอย่างก่อนพิมพ์/)).toBeInTheDocument();

      // 3. กล่องครอบแผ่นกระดาษมีคลาส print-scroll-container
      const scrollContainer = portalEl.querySelector('.print-scroll-container');
      expect(scrollContainer).toBeInTheDocument();
      expect(scrollContainer).toHaveAttribute('id', 'vcc-plan-print-root');

      // 4. แผ่นกระดาษมีคลาส a4-landscape-sheet
      const sheet = portalEl.querySelector('.a4-landscape-sheet');
      expect(sheet).toBeInTheDocument();

      // 5. สไตล์ @media print แยกตัวจาก #root และกำหนด margin 0mm ป้องกัน URL และหน้าขาว
      const styleTag = portalEl.querySelector('style');
      expect(styleTag).toBeInTheDocument();
      expect(styleTag.textContent).toContain('body > *:not(#vcc-print-portal)');
      expect(styleTag.textContent).toContain('size: A4 landscape');
      expect(styleTag.textContent).toContain('margin: 5mm');
      expect(styleTag.textContent).toContain('#vcc-print-portal .no-print');
      expect(styleTag.textContent).toContain('#vcc-print-portal .print-scroll-container');
      expect(styleTag.textContent).toContain('#vcc-print-portal .a4-landscape-sheet');
      expect(styleTag.textContent).not.toContain('body * {');

      // 6. คลิกปุ่มพิมพ์เอกสาร เรียก window.print()
      const printBtn = screen.getByRole('button', { name: /พิมพ์เอกสาร \(Print\)/ });
      fireEvent.click(printBtn);
      expect(printSpy).toHaveBeenCalledTimes(1);

      printSpy.mockRestore();
      unmount();
      expect(document.getElementById('vcc-print-portal')).toBeNull();
    });
  });

  describe('3. Hub & Spoke Navigation & State Preservation in AnnualPlanMatrixSection', () => {
    it('เมื่อเข้า URL /vcc/annual-plans จะแสดงหน้า Hub สารบัญก่อนเป็นค่าเริ่มต้น และมี Breadcrumb เมื่อเปิด Workspace', async () => {
      render(
        <MemoryRouter initialEntries={['/vcc/annual-plans']}>
          <AnnualPlanMatrixSection activeDepartments={[{ code: 'QC', nameTh: 'ควบคุมคุณภาพ' }]} />
        </MemoryRouter>
      );

      // เริ่มต้นในหน้า Hub
      expect(await screen.findByText('สารบัญแผนการทวนสอบและสอบเทียบประจำปี')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /ส่งออกภาพรวมทุกแผนก/ })).toBeInTheDocument();

      // เมื่อคลิกเปิดแผนงาน จะเข้าสู่ Workspace พร้อม Breadcrumb นำทาง
      const openBtns = await screen.findAllByRole('button', { name: /เปิดแผนงาน/ });
      expect(openBtns.length).toBeGreaterThanOrEqual(1);
      fireEvent.click(openBtns[0]);

      // ใน Workspace มี Breadcrumb แสดงปุ่มย้อนกลับไปหน้ารวม
      expect(await screen.findByRole('button', { name: /กลับหน้ารวมสารบัญแผน/ })).toBeInTheDocument();
      expect(screen.getByTestId('annual-plan-workspace-header')).toBeInTheDocument();

      // เมื่อคลิก "← กลับหน้ารวมสารบัญแผน" จะกลับไปหน้ารวม Hub
      fireEvent.click(screen.getByRole('button', { name: /กลับหน้ารวมสารบัญแผน/ }));
      expect(await screen.findByText('สารบัญแผนการทวนสอบและสอบเทียบประจำปี')).toBeInTheDocument();
    });

    it('fallback แผนก 5 แผนก (DC, QC, QA, MGT, LB) ยังคงทำงานได้เมื่อ activeDepartments ว่าง', () => {
      render(
        <AnnualPlansHub
          plans={[]}
          activeAssets={[]}
          activeDepartments={[]}
        />
      );

      const deptSelect = screen.getByLabelText('เลือกแผนก');
      const options = within(deptSelect).getAllByRole('option');
      const optionTexts = options.map((o) => o.textContent);

      expect(optionTexts.some((t) => t.includes('DC'))).toBe(true);
      expect(optionTexts.some((t) => t.includes('QC'))).toBe(true);
      expect(optionTexts.some((t) => t.includes('QA'))).toBe(true);
      expect(optionTexts.some((t) => t.includes('MGT'))).toBe(true);
      expect(optionTexts.some((t) => t.includes('LB'))).toBe(true);
    });

    it('เมื่อเข้าผ่าน Deep link ?planId=... หรือ ?id=... จะเปิดเข้าหน้า Workspace ของแผนนั้นโดยตรง', async () => {
      render(
        <MemoryRouter initialEntries={['/vcc/annual-plans?planId=vcc-plan-2026-qc']}>
          <AnnualPlanMatrixSection activeDepartments={[{ code: 'QC', nameTh: 'ควบคุมคุณภาพ' }]} />
        </MemoryRouter>
      );

      // เปิดเข้าสู่หน้า Workspace ทันที
      expect(await screen.findByTestId('annual-plan-workspace-header')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /กลับหน้ารวมสารบัญแผน/ })).toBeInTheDocument();
    });

    it('แสดงปุ่ม "ขอจัดทำฉบับแก้ไข (Revise Plan)" เมื่อแผนมีผลบังคับใช้ (APPROVED / Effective)', () => {
      render(
        <AnnualPlanWorkspaceHeader
          statusTab="APPROVED"
          setStatusTab={() => {}}
          activePlan={{
            id: 'vcc-plan-2026-qc',
            plan_year: 2026,
            department: 'QC',
            document_code: 'FM-QC-46',
            revision: '01',
            status: 'APPROVED',
            is_current: 1
          }}
          canCreatePlan={true}
          canEditPlan={true}
          onOpenRevision={vi.fn()}
          plans={[]}
          planItems={[]}
        />
      );

      expect(screen.getByRole('button', { name: /ขอจัดทำฉบับแก้ไข/ })).toBeInTheDocument();
    });
  });

  describe('4. Multi-sheet Excel Export Utility', () => {
    it('exportAnnualPlansMultiSheet สร้างโครงสร้างไฟล์ 2 แท็บ หัวบริษัท เศรษฐชล จำกัด ไม่มีรหัสเอกสาร/Rev และแยกแถว Plan (P) / Act. (✓)', () => {
      exportAnnualPlansMultiSheet(mockPlans, mockItems, 2026);

      expect(XLSX.utils.book_new).toHaveBeenCalled();
      expect(XLSX.utils.book_append_sheet).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'ภาพรวมสถานะรายแผนก'
      );
      expect(XLSX.utils.book_append_sheet).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'รายการเครื่องมือรวมทุกแผนก'
      );

      // ตรวจสอบข้อมูล Sheet 1: หัวบริษัท และไม่มีคอลัมน์รหัสเอกสาร/Rev
      const sheet1Calls = XLSX.utils.aoa_to_sheet.mock.calls;
      const sheet1Rows = sheet1Calls[sheet1Calls.length - 2][0];
      expect(sheet1Rows[0][0]).toContain('บริษัท เศรษฐชล จำกัด');
      expect(sheet1Rows[3]).not.toContain('รหัสแบบฟอร์มควบคุม (DCC)');
      expect(sheet1Rows[3]).not.toContain('แก้ไขครั้งที่ (Rev)');

      // ตรวจสอบข้อมูล Sheet 2: หัวบริษัท และแยกแถว Plan (P) และ Act. (✓)
      const sheet2Rows = sheet1Calls[sheet1Calls.length - 1][0];
      expect(sheet2Rows[0][0]).toContain('บริษัท เศรษฐชล จำกัด');
      expect(sheet2Rows[3]).toContain('Plan / Act.');
      const dataRows = sheet2Rows.slice(4);
      expect(dataRows.some((r) => r.includes('Plan'))).toBe(true);
      expect(dataRows.some((r) => r.includes('Act.'))).toBe(true);
      expect(dataRows.some((r) => r.includes('P'))).toBe(true);

      expect(XLSX.writeFile).toHaveBeenCalled();
    });

    it('exportAnnualPlansMultiSheet รองรับรายการว่าง และ JSON เดือนที่ผิดปกติโดยไม่ throw error', () => {
      // 1. ทดสอบกรณีไม่มีข้อมูลรายการเครื่องมือ (Empty List)
      expect(() => exportAnnualPlansMultiSheet([], [], 2026)).not.toThrow();

      // 2. ทดสอบกรณี planned_months / actual_months เป็น JSON String ผิดรูปแบบ
      const corruptedItem = {
        asset_code: 'BROKEN-01',
        asset_name: 'Test Corrupt',
        planned_months: '{invalid_json',
        actual_months: null,
        acceptance_criteria: 0,
        provider_name: 'INTERNAL'
      };

      expect(() => exportAnnualPlansMultiSheet(mockPlans, [corruptedItem], 2026)).not.toThrow();

      const sheetCalls = XLSX.utils.aoa_to_sheet.mock.calls;
      const lastSheet2 = sheetCalls[sheetCalls.length - 1][0];
      const planRow = lastSheet2.find((r) => r.includes('Plan') && r.includes('BROKEN-01'));
      expect(planRow).toBeDefined();
      expect(planRow).toContain(0); // เกณฑ์ยอมรับ 0 ไม่หาย
      expect(planRow).toContain('ทวนสอบภายใน'); // แปลง INTERNAL เป็น ทวนสอบภายใน
    });
  });
});
