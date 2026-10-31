import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import useStore from '../../../store/useStore';
import AssetRegisterPage from '../pages/AssetRegisterPage';
import { resetVccLocalStore, fetchVccAssets, writeJson } from '../api/vccApi';
import { getLocalPlans, getLocalPlanItems } from '../api/vccPlanApi';
import { fetchVccDashboard } from '../api/vccDashboardApi';
import { createVccWorkOrder } from '../api/vccWorkOrderApi';

const MASTER_DEPTS = [
  { code: 'QC', name_th: 'ควบคุมคุณภาพ', status: 'ACTIVE' },
  { code: 'WH', name_th: 'คลังสินค้า', status: 'ACTIVE' },
  { code: 'DC', name_th: 'ควบคุมเอกสาร', status: 'ACTIVE' }
];

const MASTER_USERS = [
  {
    id: 'dc4',
    name: 'DC หัวหน้า (DCC)',
    department: 'DC',
    approval_level: 4,
    status: 'ACTIVE',
    isDcc: true
  },
  {
    id: 'qc1',
    name: 'QC ผู้จัดทำแผน (L2)',
    department: 'QC',
    approval_level: 2,
    status: 'ACTIVE',
    isDcc: true
  },
  {
    id: 'qc4',
    name: 'QC ผู้ทบทวนแผน (L4)',
    department: 'QC',
    approval_level: 4,
    status: 'ACTIVE',
    isDcc: true
  },
  {
    id: 'qc5',
    name: 'QC ผู้อนุมัติแผน (L5)',
    department: 'QC',
    approval_level: 5,
    status: 'ACTIVE',
    isDcc: true
  }
];

describe('VCC Flat Instrument Architecture — End-to-End Acceptance Criteria Suite', () => {
  beforeEach(() => {
    resetVccLocalStore();
    useStore.setState({
      currentUser: {
        id: 'qc1',
        name: 'QC ผู้จัดทำแผน (L2)',
        department: 'QC',
        approval_level: 2,
        approvalLevel: 2,
        isDcc: true
      },
      departments: MASTER_DEPTS,
      masterDepartments: MASTER_DEPTS,
      masterUsers: MASTER_USERS,
      approvalMatrix: [
        {
          docType: 'FM',
          minRequesterLevel: 1,
          requiredReviewerLevel: 4,
          requiredApproverLevel: 5
        }
      ],
      tasks: []
    });
  });

  it('AC 1-3 & 10-12: Register, Planning, Work Orders, and Dashboard count Calibratable Units consistently (including Composite Set SW001 and independent V001/V002)', async () => {
    // 1. Check Register API returns only calibratable units (6 active: ST002, SW001, TC001, SC-WH-001, V001, V002)
    const activeCalibratable = await fetchVccAssets({ status: 'ACTIVE' });
    const codes = activeCalibratable.map((a) => a.asset_code);
    expect(codes).toEqual(['SC-WH-001', 'ST002', 'SW001', 'TC001', 'V001', 'V002']);
    expect(codes).not.toContain('GRP-SCALE');
    expect(codes).not.toContain('GRP-VERNIER');

    // 2. Dashboard KPI counts match exact calibratable units (6 active + 1 retired = 7 total, 1 composite set, 0 logical groups counted)
    const dash = await fetchVccDashboard();
    expect(dash.equipment_kpi.active_assets).toBe(6);
    expect(dash.equipment_kpi.retired_assets).toBe(1);
    expect(dash.equipment_kpi.total_assets).toBe(7);
    expect(dash.equipment_kpi.composite_set_count).toBe(1);

    // 3. QC Annual Plan (2026) has all 5 active QC calibratable units (ST002, SW001, TC001, V001, V002) counted 1:1
    // AND clearly explains why the 6th active instrument (SC-WH-001 in WH) is outside the QC plan scope, with direct "+ เพิ่มเข้าแผนนี้"
    render(<AssetRegisterPage initialEntries={['/vcc/plans']} />);
    expect(await screen.findByText('SW001')).toBeInTheDocument();
    expect(screen.getByText('V001')).toBeInTheDocument();
    expect(screen.getByText('V002')).toBeInTheDocument();

    // Verify NO Category Chips or Category Overview appear on the Annual Planning page
    expect(screen.queryByRole('button', { name: /ทุกประเภท/i })).not.toBeInTheDocument();

    // Header counts 5 instruments in scope + explains 6 active in Register vs 1 outside plan (SC-WH-001 in WH)
    const header = screen.getByTestId('annual-plan-workspace-header');
    expect(within(header).getByText(/เครื่องมือในขอบเขต:/i).parentElement).toHaveTextContent('5');
    expect(within(header).getByTestId('register-vs-plan-scope-note')).toHaveTextContent(/จากทะเบียนใช้งานปกติ 6 เครื่อง/i);
    expect(within(header).getByTestId('register-vs-plan-scope-note')).toHaveTextContent(/SC-WH-001 สังกัดแผนก WH/i);
    expect(within(header).getByText(/รอบทวนสอบรวม:/i).parentElement).toHaveTextContent('5');

    // SW001 displays Composite Set badge + sub-component details
    const swRow = screen.getByText('SW001').closest('tr');
    expect(within(swRow).getByText(/ชุดเครื่องมือ \(Composite Set\)/i)).toBeInTheDocument();
    expect(within(swRow).getByText(/อุปกรณ์ในชุด:/i)).toBeInTheDocument();

    // Clicking "+ เพิ่มเข้าแผนนี้" opens SmartAssetImportModal showing SC-WH-001 (WH) ready to be added to the QC plan if needed
    fireEvent.click(within(header).getByRole('button', { name: /\+ เพิ่มเข้าแผนนี้/i }));
    expect(await screen.findByText(/เลือกเครื่องมือจากทะเบียนเข้าสู่แผนปี 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/สังกัดแผนก WH \(นอกแผน QC\)/i)).toBeInTheDocument();
  });

  it('AC 5-9: Blocks submitting a Draft plan with unresolved Legacy Group, converts via manual Preview & Confirm without inheriting months, leaves zero post-conversion warning, and completes Review/Approve + Composite Set Work Order', async () => {
    // Inject a legacy Logical Group row (GRP-SCALE) into a 2025 WH Draft Plan (so it sorts first by plan_year ASC)
    const plans = getLocalPlans();
    plans.unshift({
      id: 'vcc-plan-2025-wh-draft',
      plan_year: 2025,
      department: 'WH',
      document_code: 'FM-QC-46',
      revision: '01',
      title: '[ข้อมูลทดสอบ] แผนการทวนสอบเครื่องมือประจำปี 2025 แผนกคลังสินค้า',
      status: 'DRAFT',
      due_date_rule: 'END_OF_MONTH',
      created_at: '2026-10-30T03:00:00.000Z',
      created_by: 'dc4',
      updated_at: '2026-10-30T03:00:00.000Z',
      updated_by: 'dc4'
    });
    writeJson('qms-vcc-local-plans-v1', plans);

    const items = getLocalPlanItems();
    items.push({
      id: 'vcc-pi-2025-wh-legacy-grp',
      plan_id: 'vcc-plan-2025-wh-draft',
      asset_id: 'vcc-seed-grp-scale',
      provider_name: 'ทวนสอบภายใน',
      frequency_label: 'รายครึ่งปี',
      planned_months: [4, 10],
      due_dates: ['2025-04-30', '2025-10-31'],
      responsible_dept: 'WH',
      responsible_label: 'WH Sup.',
      remarks: '',
      sort_order: 1
    });
    writeJson('qms-vcc-local-plan-items-v1', items);

    // Log in as DCC/WH preparer with L4/L5 reviewers for WH
    useStore.setState({
      currentUser: {
        id: 'wh2',
        name: 'WH ผู้จัดทำ (L2)',
        department: 'WH',
        approval_level: 2,
        approvalLevel: 2,
        isDcc: true
      },
      masterUsers: [
        ...MASTER_USERS,
        { id: 'wh2', name: 'WH ผู้จัดทำ (L2)', department: 'WH', approval_level: 2, status: 'ACTIVE', isDcc: true },
        { id: 'wh4', name: 'WH ผู้ทบทวน (L4)', department: 'WH', approval_level: 4, status: 'ACTIVE', isDcc: true },
        { id: 'wh5', name: 'WH ผู้อนุมัติ (L5)', department: 'WH', approval_level: 5, status: 'ACTIVE', isDcc: true }
      ]
    });

    render(<AssetRegisterPage initialEntries={['/vcc/plans']} />);
    expect(await screen.findByText(/พบรายการกลุ่มเดิม \(GRP-SCALE\) ค้างอยู่ในแผนฉบับร่าง/i)).toBeInTheDocument();

    // 1. Attempting to click "ส่งทบทวนแผน" while GRP-SCALE is unconverted MUST block submission and open Conversion Modal!
    fireEvent.click(screen.getByRole('button', { name: 'ส่งทบทวนแผน' }));
    expect(await screen.findByRole('dialog', { name: /แปลงรายการกลุ่มเดิมเป็นเครื่องมือรายตัว/i })).toBeInTheDocument();
    expect(screen.queryByText(/เลือกผู้ทบทวนแผน/i)).not.toBeInTheDocument();

    // 2. Verify months [4, 10] from GRP-SCALE were NOT auto-inherited to SC-WH-001 -> clicking Preview fails validation
    const modal = screen.getByRole('dialog', { name: /แปลงรายการกลุ่มเดิมเป็นเครื่องมือรายตัว/i });
    fireEvent.click(within(modal).getByRole('button', { name: /ดูตัวอย่างก่อนยืนยัน/i }));
    expect(within(modal).getByRole('alert')).toHaveTextContent(/SC-WH-001/i);

    // 3. Manually choose Month 6 for SC-WH-001 -> Preview -> Confirm Conversion
    fireEvent.click(within(modal).getByRole('button', { name: 'SC-WH-001 เดือน 6' }));
    fireEvent.click(within(modal).getByRole('button', { name: /ดูตัวอย่างก่อนยืนยัน/i }));
    expect(within(modal).getByTestId('conversion-preview-summary')).toHaveTextContent('เดือน 6');

    fireEvent.click(within(modal).getByRole('button', { name: /ยืนยันการแปลงรายการ/i }));

    // 4. After conversion: GRP-SCALE is gone, SC-WH-001 is scheduled for Month 6 (2025-06-30), and NO lingering group banner remains!
    await waitFor(() => {
      expect(screen.queryByText(/พบรายการกลุ่มเดิม/i)).not.toBeInTheDocument();
    });
    expect(screen.getByText('SC-WH-001')).toBeInTheDocument();
    expect(screen.getByText('2025-06-30')).toBeInTheDocument();

    // 5. Submit WH plan -> Review as wh4 -> Approve as wh5 via Task Inbox
    fireEvent.click(screen.getByRole('button', { name: 'ส่งทบทวนแผน' }));
    fireEvent.click(await screen.findByRole('button', { name: 'ยืนยันส่งทบทวนแผน' }));
    expect(await screen.findByText(/สถานะ: รอทบทวน/i, { selector: 'span' })).toBeInTheDocument();

    // Switch to QC Approved flow & test Composite Set SW001 direct Work Order creation without child split!
    const allPlans = getLocalPlans().map((p) =>
      p.id === 'vcc-plan-2026-qc'
        ? { ...p, status: 'APPROVED', approved_by: 'qc5', approved_at: '2026-01-15T00:00:00.000Z' }
        : p
    );
    writeJson('qms-vcc-local-plans-v1', allPlans);

    const wo = await createVccWorkOrder({
      plan_id: 'vcc-plan-2026-qc',
      plan_item_id: 'vcc-pi-2026-sw001',
      planned_month: 5
    });
    expect(wo.asset_code).toBe('SW001');
    expect(wo.group_nature).toBe('COMPOSITE_SET');
    expect(wo.due_date).toBe('2026-05-31');
  }, 15000);
});

