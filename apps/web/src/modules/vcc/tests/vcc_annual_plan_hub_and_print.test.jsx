import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import AnnualPlansHub, { resolveDigitalPlanCode, resolvePlanCode } from '../components/AnnualPlansHub';
import { PLAN_STATUS_CONFIG, getPlanStatusBadgeLabel } from '../utils/planLabels';
import AnnualPlanPrintView from '../components/AnnualPlanPrintView';
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

  describe('2. AnnualPlanPrintView (ISO Controlled Document & Signatures)', () => {
    it('แสดงหัวกระดาษเอกสารควบคุม, รหัสแบบฟอร์ม DCC, Revision และตาราง Matrix 12 เดือน', () => {
      const onClose = vi.fn();
      render(
        <AnnualPlanPrintView
          plan={mockPlans[0]}
          items={mockItems}
          onClose={onClose}
        />
      );

      expect(screen.getByText(/บริษัท ควอลิตี้ แมนูแฟคเจอริ่ง ซิสเต็มส์ จำกัด/)).toBeInTheDocument();
      expect(screen.getByText('FM-QC-42')).toBeInTheDocument();
      expect(screen.getByText('Rev.01')).toBeInTheDocument();
      expect(screen.getByText('2026-01-15')).toBeInTheDocument();

      // รายการเครื่องมือ
      expect(screen.getByText('CAL-001')).toBeInTheDocument();
      expect(screen.getByText('Digital Caliper 150mm')).toBeInTheDocument();
      expect(screen.getByText('MIC-002')).toBeInTheDocument();

      // ตารางลงนาม 3 ช่อง
      expect(screen.getByText('ผู้จัดทำ (Prepared By)')).toBeInTheDocument();
      expect(screen.getByText('ผู้ทบทวน (Reviewed By)')).toBeInTheDocument();
      expect(screen.getByText('ผู้อนุมัติ (Approved By)')).toBeInTheDocument();
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

    it('สำหรับแผนที่อนุมัติแล้ว (APPROVED) จะแสดงบล็อกลายเซ็นจริงของผู้ลงนาม', () => {
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

      // มีป้ายกำกับอนุมัติแล้ว
      expect(screen.getByText('มีผลบังคับใช้ (พร้อมลายเซ็น)')).toBeInTheDocument();
      expect(screen.getByText('ทบทวนแล้ว')).toBeInTheDocument();
      expect(screen.getByText('อนุมัติแล้ว')).toBeInTheDocument();

      // ลายเซ็นต์ของผู้ลงนามต้องถูกเรนเดอร์ในรูป img
      const sigImages = screen.getAllByRole('img');
      expect(sigImages.length).toBeGreaterThanOrEqual(1);
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
    it('exportAnnualPlansMultiSheet สร้างโครงสร้างไฟล์ 2 แท็บ (ภาพรวมสถานะรายแผนก และ รายการเครื่องมือรวมทุกแผนก)', () => {
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
      expect(XLSX.writeFile).toHaveBeenCalled();
    });
  });
});
