import { describe, it, expect, vi, beforeEach } from 'vitest';
import useStore from '../../../store/useStore';
import { readJson, writeJson } from '../api/vccApi';
import {
  createVccPlanRevision,
  approveVccPlan,
  fetchVccPlans,
  getLocalPlans,
  getLocalPlanItems
} from '../api/vccPlanApi';

vi.mock('../../../api/client', () => ({
  isApiMode: false,
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiBlob: vi.fn(),
  apiUpload: vi.fn()
}));

const STORAGE_PLANS_KEY = 'qms-vcc-local-plans-v1';
const STORAGE_PLAN_ITEMS_KEY = 'qms-vcc-local-plan-items-v1';
const STORAGE_AUDIT_KEY = 'qms-vcc-local-audit-v1';

describe('VCC Plan Revision in Local Storage / Demo Mode', () => {
  const qcStaff = {
    id: 'usr-qc-staff',
    name: 'เจ้าหน้าที่ QC',
    department: 'QC',
    departments: ['QC'],
    approval_level: 4,
    isDcc: false,
    isQmr: false
  };

  const approverQmr = {
    id: 'usr-qmr-mgr',
    name: 'ผู้จัดการ QMR',
    department: 'MGT',
    departments: ['MGT'],
    approval_level: 6,
    isDcc: false,
    isQmr: true
  };

  const initialApprovedPlan = {
    id: 'plan-2026-qc-rev01',
    plan_year: 2026,
    department: 'QC',
    document_code: 'FM-QC-46',
    revision: '01',
    title: 'แผนการทวนสอบเครื่องมือประจำปี 2026 (Rev.01)',
    status: 'APPROVED',
    is_current: 1,
    effective_status: 'EFFECTIVE',
    due_date_rule: 'END_OF_MONTH',
    prepared_by: 'usr-qc-staff',
    approved_by: 'usr-qmr-mgr',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z'
  };

  const initialItems = [
    {
      id: 'item-st001',
      plan_id: 'plan-2026-qc-rev01',
      asset_id: 'asset-st001',
      provider_name: 'ห้องปฏิบัติการภายนอก',
      frequency_label: 'รายปี',
      planned_months: [3, 9],
      due_dates: ['2026-03-31', '2026-09-30'],
      responsible_dept: 'QC',
      remarks: 'เครื่องทดสอบ 1',
      sort_order: 1
    },
    {
      id: 'item-st002',
      plan_id: 'plan-2026-qc-rev01',
      asset_id: 'asset-st002',
      provider_name: 'ทวนสอบภายใน',
      frequency_label: 'รายปี',
      planned_months: [6],
      due_dates: ['2026-06-30'],
      responsible_dept: 'QC',
      remarks: 'เครื่องทดสอบ 2',
      sort_order: 2
    }
  ];

  beforeEach(() => {
    useStore.setState({
      currentUser: qcStaff,
      departments: [
        { id: 'd1', code: 'QC', name_th: 'ควบคุมคุณภาพ' },
        { id: 'd2', code: 'LB', name_th: 'ห้องปฏิบัติการ' },
        { id: 'd3', code: 'DC', name_th: 'ควบคุมเอกสาร' },
        { id: 'd4', code: 'MGT', name_th: 'ฝ่ายบริหาร' }
      ],
      approvalMatrix: [
        { docType: 'FM', minRequesterLevel: 1, requiredReviewerLevel: 4, requiredApproverLevel: 6 }
      ]
    });

    writeJson(STORAGE_PLANS_KEY, [initialApprovedPlan]);
    writeJson(STORAGE_PLAN_ITEMS_KEY, [...initialItems]);
    writeJson(STORAGE_AUDIT_KEY, []);
  });

  it('1. Guards & Validations: Enforces reason, status, current validity and blocks in-flight revisions', async () => {
    // 1.1 Non-existent plan
    await expect(
      createVccPlanRevision('non-existent', { revision_reason: 'test' })
    ).rejects.toThrow('ไม่พบแผนการสอบเทียบประจำปี');

    // 1.2 Empty revision reason
    await expect(
      createVccPlanRevision('plan-2026-qc-rev01', { revision_reason: '' })
    ).rejects.toThrow('กรุณาระบุเหตุผลการขอปรับปรุงแผน');

    // 1.3 Cannot revise from a DRAFT plan
    const draftPlan = { ...initialApprovedPlan, id: 'plan-draft', status: 'DRAFT' };
    writeJson(STORAGE_PLANS_KEY, [draftPlan]);
    await expect(
      createVccPlanRevision('plan-draft', { revision_reason: 'test' })
    ).rejects.toThrow('สร้าง Revision ใหม่ได้เฉพาะจากแผนที่ได้รับอนุมัติแล้ว');

    // 1.4 Cannot revise from a SUPERSEDED plan
    const supersededPlan = {
      ...initialApprovedPlan,
      id: 'plan-superseded',
      is_current: 0,
      effective_status: 'SUPERSEDED'
    };
    writeJson(STORAGE_PLANS_KEY, [supersededPlan]);
    await expect(
      createVccPlanRevision('plan-superseded', { revision_reason: 'test' })
    ).rejects.toThrow('สร้าง Revision ใหม่ได้จากแผนฉบับที่มีผลใช้งาน (CURRENT) เท่านั้น');

    // 1.5 In-flight revision blocks duplicate creation
    const inFlightDraft = {
      id: 'plan-2026-qc-in-flight',
      plan_year: 2026,
      department: 'QC',
      revision: '02',
      status: 'DRAFT'
    };
    writeJson(STORAGE_PLANS_KEY, [initialApprovedPlan, inFlightDraft]);
    await expect(
      createVccPlanRevision('plan-2026-qc-rev01', { revision_reason: 'test' })
    ).rejects.toThrow(/มีแผนประจำปี 2026 แผนก QC \(Rev\.02\) อยู่ในสถานะ DRAFT แล้ว/);
  });

  it('2. RBAC: Unauthorized user from another department cannot revise plan', async () => {
    useStore.setState({
      currentUser: {
        id: 'usr-lb-staff',
        name: 'เจ้าหน้าที่ LB',
        department: 'LB',
        departments: ['LB'],
        approval_level: 4
      }
    });

    await expect(
      createVccPlanRevision('plan-2026-qc-rev01', { revision_reason: 'ขอแก้ไข' })
    ).rejects.toThrow('ไม่มีสิทธิ์จัดการแผนของแผนกนี้');
  });

  it('3. Successful Revision: Clones plan to Rev.02 with new unique item IDs and audit entry', async () => {
    const newPlan = await createVccPlanRevision('plan-2026-qc-rev01', {
      revision_reason: 'เพิ่มเครื่องมือใหม่และปรับเดือนทวนสอบ'
    });

    expect(newPlan).toBeDefined();
    expect(newPlan.id).not.toBe('plan-2026-qc-rev01');
    expect(newPlan.revision).toBe('02');
    expect(newPlan.status).toBe('DRAFT');
    expect(newPlan.is_current).toBe(0);
    expect(newPlan.effective_status).toBe('DRAFT');
    expect(newPlan.parent_plan_id).toBe('plan-2026-qc-rev01');
    expect(newPlan.revision_reason).toBe('เพิ่มเครื่องมือใหม่และปรับเดือนทวนสอบ');
    expect(newPlan.prepared_by).toBe('usr-qc-staff');

    // Verify source plan remains APPROVED and current
    const allPlans = getLocalPlans();
    const sourceInStorage = allPlans.find((p) => p.id === 'plan-2026-qc-rev01');
    expect(sourceInStorage.status).toBe('APPROVED');
    expect(sourceInStorage.is_current).toBe(1);

    // Verify cloned items in storage
    const allItems = getLocalPlanItems();
    const clonedItems = allItems.filter((i) => i.plan_id === newPlan.id);
    expect(clonedItems).toHaveLength(2);

    // Verify item IDs are distinct from source item IDs
    expect(clonedItems[0].id).not.toBe('item-st001');
    expect(clonedItems[1].id).not.toBe('item-st002');
    expect(clonedItems[0].plan_id).toBe(newPlan.id);
    expect(clonedItems[1].plan_id).toBe(newPlan.id);
    expect(clonedItems[0].planned_months).toEqual([3, 9]);
    expect(clonedItems[1].planned_months).toEqual([6]);

    // Deep clone proof: Mutating cloned item arrays does not alter source item
    clonedItems[0].planned_months.push(11);
    const sourceItems = allItems.filter((i) => i.plan_id === 'plan-2026-qc-rev01');
    expect(sourceItems[0].planned_months).toEqual([3, 9]);

    // Verify audit log
    const auditLogs = readJson(STORAGE_AUDIT_KEY, () => []);
    const revisionAudit = auditLogs.find((a) => a.action === 'VCC_PLAN_REVISED');
    expect(revisionAudit).toBeDefined();
    expect(revisionAudit.details.plan_id).toBe(newPlan.id);
    expect(revisionAudit.details.parent_plan_id).toBe('plan-2026-qc-rev01');
    expect(revisionAudit.details.revision).toBe('02');
    expect(revisionAudit.details.parent_revision).toBe('01');
    expect(revisionAudit.details.revision_reason).toBe('เพิ่มเครื่องมือใหม่และปรับเดือนทวนสอบ');
    expect(revisionAudit.details.items_cloned).toBe(2);
  });

  it('4. Approval of Revision: Sets Rev.02 to EFFECTIVE and supersedes Rev.01', async () => {
    // Create Rev.02
    const rev02 = await createVccPlanRevision('plan-2026-qc-rev01', {
      revision_reason: 'ปรับปรุงรอบประจำปี'
    });

    // Simulate approval workflow progression to PENDING_APPROVAL
    const plansWithPending = getLocalPlans().map((p) =>
      p.id === rev02.id ? { ...p, status: 'PENDING_APPROVAL', prepared_by: 'usr-qc-staff' } : p
    );
    writeJson(STORAGE_PLANS_KEY, plansWithPending);

    // Approve as QMR
    useStore.setState({ currentUser: approverQmr });
    const approved = await approveVccPlan(rev02.id, 'อนุมัติแผนฉบับปรับปรุง Rev.02');

    expect(approved.status).toBe('APPROVED');
    expect(approved.is_current).toBe(1);
    expect(approved.effective_status).toBe('EFFECTIVE');

    // Verify previous revision (Rev.01) is SUPERSEDED
    const updatedPlans = getLocalPlans();
    const rev01After = updatedPlans.find((p) => p.id === 'plan-2026-qc-rev01');
    expect(rev01After.is_current).toBe(0);
    expect(rev01After.effective_status).toBe('SUPERSEDED');
    expect(rev01After.superseded_by).toBe(rev02.id);
    expect(rev01After.superseded_at).toBeDefined();

    const rev02After = updatedPlans.find((p) => p.id === rev02.id);
    expect(rev02After.is_current).toBe(1);
    expect(rev02After.effective_status).toBe('EFFECTIVE');
  });

  it('5. Plan Listing: fetchVccPlans returns both revisions when status is ALL', async () => {
    const rev02 = await createVccPlanRevision('plan-2026-qc-rev01', {
      revision_reason: 'ขอแก้ไข'
    });

    const allStatusPlans = await fetchVccPlans({ status: 'ALL', year: 2026, department: 'QC' });
    expect(allStatusPlans.length).toBeGreaterThanOrEqual(2);
    expect(allStatusPlans.some((p) => p.id === 'plan-2026-qc-rev01')).toBe(true);
    expect(allStatusPlans.some((p) => p.id === rev02.id)).toBe(true);
  });
});
