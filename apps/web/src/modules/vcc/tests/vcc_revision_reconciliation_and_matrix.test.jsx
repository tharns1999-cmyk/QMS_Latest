import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AnnualPlansHub, isPlanSuperseded } from '../components/AnnualPlansHub';
import AnnualPlanMonthCell from '../components/AnnualPlanMonthCell';
import { approveVccPlan } from '../api/vccPlanApi';
import useStore from '../../../store/useStore';

// Mock localStorage for node environment
const storageStore = new Map();
const mockLocalStorage = {
  getItem: (k) => storageStore.get(k) ?? null,
  setItem: (k, v) => storageStore.set(k, String(v)),
  removeItem: (k) => storageStore.delete(k),
  clear: () => storageStore.clear()
};
global.localStorage = mockLocalStorage;

describe('VCC Revision Reconciliation & Plan vs Actual Matrix Suite', () => {
  beforeEach(() => {
    storageStore.clear();
    vi.clearAllMocks();
  });

  describe('Part 1: Revision Management in Hub Directory & KPI Calculation', () => {
    const mockPlansWithRevisions = [
      {
        id: 'plan-qc-2026-rev01',
        plan_year: 2026,
        department: 'QC',
        department_name_th: 'ควบคุมคุณภาพ',
        document_code: 'FM-QC-46',
        revision: '01',
        status: 'APPROVED',
        is_current: 0,
        effective_status: 'SUPERSEDED',
        title: 'แผนการทวนสอบประจำปี 2026 ฝ่ายควบคุมคุณภาพ',
        planned_items_count: 5,
        item_count: 5,
        prepared_by: 'u-qc',
        approved_by: 'u-mgt'
      },
      {
        id: 'plan-qc-2026-rev02',
        plan_year: 2026,
        department: 'QC',
        department_name_th: 'ควบคุมคุณภาพ',
        document_code: 'FM-QC-46',
        revision: '02',
        status: 'APPROVED',
        is_current: 1,
        effective_status: 'EFFECTIVE',
        title: 'แผนการทวนสอบประจำปี 2026 ฝ่ายควบคุมคุณภาพ (ปรับปรุงรอบ)',
        planned_items_count: 5,
        item_count: 5,
        prepared_by: 'u-qc',
        approved_by: 'u-mgt'
      }
    ];

    const mockAssets = [
      { id: 'TC001', asset_code: 'TC001', name: 'Thermocouple 1', department: 'QC', status: 'ACTIVE' },
      { id: 'TC002', asset_code: 'TC002', name: 'Thermocouple 2', department: 'QC', status: 'ACTIVE' },
      { id: 'ST001', asset_code: 'ST001', name: 'Stopwatch 1', department: 'QC', status: 'ACTIVE' },
      { id: 'ST002', asset_code: 'ST002', name: 'Stopwatch 2', department: 'QC', status: 'ACTIVE' },
      { id: 'PH001', asset_code: 'PH001', name: 'pH Meter 1', department: 'QC', status: 'ACTIVE' }
    ];

    it('isPlanSuperseded correctly detects superseded revisions', () => {
      expect(isPlanSuperseded(mockPlansWithRevisions[0], mockPlansWithRevisions)).toBe(true);
      expect(isPlanSuperseded(mockPlansWithRevisions[1], mockPlansWithRevisions)).toBe(false);
    });

    it('Hub Directory hides Rev.01 and shows ONLY active Rev.02 in the main table', () => {
      render(
        <AnnualPlansHub
          plans={mockPlansWithRevisions}
          activeAssets={mockAssets}
          activeDepartments={[{ code: 'QC', nameTh: 'ควบคุมคุณภาพ' }]}
          filterYear={2026}
          currentUser={{ id: 'u-dcc', isDcc: true, approval_level: 6, departments: ['QC'] }}
        />
      );

      // Only Rev.02 is displayed in table rows
      expect(screen.getByText('Rev.02')).toBeInTheDocument();
      expect(screen.queryByText('Rev.01')).not.toBeInTheDocument();
    });

    it('KPI Strip calculates activeCount = 1 (not 2) and coverage counts 5 instruments (no double counting)', () => {
      render(
        <AnnualPlansHub
          plans={mockPlansWithRevisions}
          activeAssets={mockAssets}
          activeDepartments={[{ code: 'QC', nameTh: 'ควบคุมคุณภาพ' }]}
          filterYear={2026}
          currentUser={{ id: 'u-dcc', isDcc: true, approval_level: 6, departments: ['QC'] }}
        />
      );

      // Active KPI value must be 1, not 2
      const activeCard = screen.getByText('มีผลบังคับใช้ (Active)').closest('.rounded-xl');
      expect(activeCard).toHaveTextContent('1');
      expect(activeCard).toHaveTextContent('/ 1 แผน');

      // Instrument coverage must be 5 items (100% of 5 assets), not 10 items
      expect(screen.getByText('(5 รายการ)')).toBeInTheDocument();
      expect(screen.queryByText('(10 รายการ)')).not.toBeInTheDocument();
    });

    it('KPI Strip does not double-count instruments when an in-flight Draft revision exists alongside an approved revision', () => {
      const plansWithDraftRevision = [
        {
          id: 'plan-qc-rev01-approved',
          plan_year: 2026,
          department: 'QC',
          revision: '01',
          status: 'APPROVED',
          is_current: 1,
          effective_status: 'CURRENT',
          planned_items_count: 5,
          item_count: 5
        },
        {
          id: 'plan-qc-rev02-draft',
          plan_year: 2026,
          department: 'QC',
          revision: '02',
          status: 'DRAFT',
          is_current: 0,
          effective_status: 'DRAFT',
          planned_items_count: 5,
          item_count: 5
        }
      ];

      render(
        <AnnualPlansHub
          plans={plansWithDraftRevision}
          activeAssets={mockAssets}
          activeDepartments={[{ code: 'QC', nameTh: 'ควบคุมคุณภาพ' }]}
          filterYear={2026}
          currentUser={{ id: 'u-dcc', isDcc: true, approval_level: 6, departments: ['QC'] }}
        />
      );

      // KPI coverage must still be 5 items, NOT 10 items!
      expect(screen.getByText('(5 รายการ)')).toBeInTheDocument();
      expect(screen.queryByText('(10 รายการ)')).not.toBeInTheDocument();
    });
  });

  describe('Part 2: Work Order Reconciliation on Revision Approval', () => {
    it('updates pending work order when month is moved (TC001 from Month 6 to Month 11) and cancels removed assets', async () => {
      const STORAGE_PLANS_KEY = 'qms-vcc-local-plans-v1';
      const STORAGE_PLAN_ITEMS_KEY = 'qms-vcc-local-plan-items-v1';
      const STORAGE_WO_KEY = 'qms-vcc-local-work-orders-v1';

      // Setup current user with approval permission
      useStore.setState({
        currentUser: {
          id: 'u-mgt-approver',
          name: 'Manager Approver',
          approval_level: 6,
          isDcc: false,
          isQmr: false,
          departments: ['QC'],
          status: 'ACTIVE'
        }
      });

      // Rev.01 (already approved) and Rev.02 (PENDING_APPROVAL)
      const rev01 = {
        id: 'plan-2026-qc-rev01',
        plan_year: 2026,
        department: 'QC',
        revision: '01',
        status: 'APPROVED',
        is_current: 1,
        effective_status: 'EFFECTIVE',
        prepared_by: 'u-qc-preparer',
        reviewed_by: 'u-qc-reviewer',
        assigned_approver_id: 'u-mgt-approver',
        due_date_rule: 'END_OF_MONTH'
      };

      const rev02 = {
        id: 'plan-2026-qc-rev02',
        plan_year: 2026,
        department: 'QC',
        revision: '02',
        parent_plan_id: rev01.id,
        status: 'PENDING_APPROVAL',
        is_current: 0,
        effective_status: 'PENDING',
        prepared_by: 'u-qc-preparer',
        reviewed_by: 'u-qc-reviewer',
        assigned_approver_id: 'u-mgt-approver',
        due_date_rule: 'END_OF_MONTH'
      };

      // In Rev.02: TC001 moved to month 11; RemovedAsset REMOVED from plan; ClosedAsset unchanged
      const rev02Items = [
        {
          id: 'item-tc001-rev02',
          plan_id: rev02.id,
          asset_id: 'TC001',
          planned_months: [11],
          is_group: 0,
          provider_name: 'ทวนสอบภายใน'
        },
        {
          id: 'item-closed-rev02',
          plan_id: rev02.id,
          asset_id: 'CLOSED_ASSET',
          planned_months: [3],
          is_group: 0,
          provider_name: 'ทวนสอบภายใน'
        }
      ];

      // Existing Work Orders from Rev.01
      const existingWos = [
        // 1. TC001 originally opened in month 6 (pending)
        {
          id: 'wo-tc001-month06',
          wo_code: 'WO-2026-001',
          plan_year: 2026,
          department: 'QC',
          plan_id: rev01.id,
          asset_id: 'TC001',
          planned_month: 6,
          due_date: '2026-06-30',
          status: 'OPEN',
          result_status: 'PENDING'
        },
        // 2. An asset removed in Rev.02 (pending)
        {
          id: 'wo-removed-month04',
          wo_code: 'WO-2026-002',
          plan_year: 2026,
          department: 'QC',
          plan_id: rev01.id,
          asset_id: 'REMOVED_ASSET',
          planned_month: 4,
          due_date: '2026-04-30',
          status: 'SCHEDULED',
          result_status: 'PENDING'
        },
        // 3. A closed work order from month 3 (history must be preserved!)
        {
          id: 'wo-closed-month03',
          wo_code: 'WO-2026-003',
          plan_year: 2026,
          department: 'QC',
          plan_id: rev01.id,
          asset_id: 'CLOSED_ASSET',
          planned_month: 3,
          due_date: '2026-03-31',
          status: 'CLOSED',
          result_status: 'PASS',
          performed_at: '2026-03-25'
        }
      ];

      storageStore.set(STORAGE_PLANS_KEY, JSON.stringify([rev01, rev02]));
      storageStore.set(STORAGE_PLAN_ITEMS_KEY, JSON.stringify(rev02Items));
      storageStore.set(STORAGE_WO_KEY, JSON.stringify(existingWos));

      // Approve Rev.02
      await approveVccPlan(rev02.id, 'อนุมัติปรับรอบการทวนสอบ');

      const savedWos = JSON.parse(storageStore.get(STORAGE_WO_KEY));

      // 1. TC001 work order must be updated to Month 11 and NOT left in Month 6
      const tc001Wo = savedWos.find((w) => w.id === 'wo-tc001-month06');
      expect(tc001Wo).toBeDefined();
      expect(tc001Wo.planned_month).toBe(11);
      expect(tc001Wo.due_date).toBe('2026-11-30');
      expect(tc001Wo.plan_revision).toBe('02');
      expect(tc001Wo.plan_id).toBe(rev02.id);

      // Verify no orphan work order for TC001 remains in Month 6
      const month6Wos = savedWos.filter((w) => w.asset_id === 'TC001' && w.planned_month === 6);
      expect(month6Wos.length).toBe(0);

      // 2. Removed asset work order must be CANCELLED automatically
      const removedWo = savedWos.find((w) => w.id === 'wo-removed-month04');
      expect(removedWo).toBeDefined();
      expect(removedWo.status).toBe('CANCELLED');
      expect(removedWo.cancellation_category).toBe('PLAN_REVISION');
      expect(removedWo.cancellation_reason).toContain('เครื่องมือไม่อยู่ในแผนฉบับใหม่');

      // 3. CLOSED work order remains completely intact
      const closedWo = savedWos.find((w) => w.id === 'wo-closed-month03');
      expect(closedWo).toBeDefined();
      expect(closedWo.status).toBe('CLOSED');
      expect(closedWo.result_status).toBe('PASS');
      expect(closedWo.performed_at).toBe('2026-03-25');
      expect(closedWo.planned_month).toBe(3);
    });

    it('Handles quarterly multi-cycle rescheduling: cancels removed Month 6 and pairs shifted Month 9 -> Month 10 by closest distance', async () => {
      const STORAGE_PLANS_KEY = 'qms-vcc-local-plans-v1';
      const STORAGE_PLAN_ITEMS_KEY = 'qms-vcc-local-plan-items-v1';
      const STORAGE_WO_KEY = 'qms-vcc-local-work-orders-v1';

      useStore.setState({
        currentUser: {
          id: 'u-mgt-approver',
          approval_level: 6,
          departments: ['QC'],
          status: 'ACTIVE'
        }
      });

      const rev01 = {
        id: 'plan-quarterly-rev01',
        plan_year: 2026,
        department: 'QC',
        revision: '01',
        status: 'APPROVED',
        is_current: 1,
        effective_status: 'CURRENT'
      };

      const rev02 = {
        id: 'plan-quarterly-rev02',
        plan_year: 2026,
        department: 'QC',
        revision: '02',
        parent_plan_id: rev01.id,
        status: 'PENDING_APPROVAL',
        is_current: 0,
        effective_status: 'PENDING',
        due_date_rule: 'END_OF_MONTH'
      };

      // In Rev.02: Month 6 is removed, and Month 9 is shifted to Month 10. Months 3 and 12 remain unchanged.
      const rev02Items = [
        {
          id: 'item-q-rev02',
          plan_id: rev02.id,
          asset_id: 'MULTI_CYCLE_01',
          planned_months: [3, 10, 12],
          is_group: 0,
          provider_name: 'ทวนสอบภายใน'
        }
      ];

      // Existing 4 quarterly work orders from Rev.01
      const existingWos = [
        { id: 'wo-m03', wo_code: 'WO-2026-010', plan_year: 2026, department: 'QC', plan_id: rev01.id, asset_id: 'MULTI_CYCLE_01', planned_month: 3, due_date: '2026-03-31', status: 'OPEN' },
        { id: 'wo-m06', wo_code: 'WO-2026-011', plan_year: 2026, department: 'QC', plan_id: rev01.id, asset_id: 'MULTI_CYCLE_01', planned_month: 6, due_date: '2026-06-30', status: 'OPEN' },
        { id: 'wo-m09', wo_code: 'WO-2026-012', plan_year: 2026, department: 'QC', plan_id: rev01.id, asset_id: 'MULTI_CYCLE_01', planned_month: 9, due_date: '2026-09-30', status: 'OPEN' },
        { id: 'wo-m12', wo_code: 'WO-2026-013', plan_year: 2026, department: 'QC', plan_id: rev01.id, asset_id: 'MULTI_CYCLE_01', planned_month: 12, due_date: '2026-12-31', status: 'OPEN' }
      ];

      storageStore.set(STORAGE_PLANS_KEY, JSON.stringify([rev01, rev02]));
      storageStore.set(STORAGE_PLAN_ITEMS_KEY, JSON.stringify(rev02Items));
      storageStore.set(STORAGE_WO_KEY, JSON.stringify(existingWos));

      await approveVccPlan(rev02.id, 'อนุมัติรอบไตรมาสใหม่');

      const savedWos = JSON.parse(storageStore.get(STORAGE_WO_KEY));

      // Month 3 and Month 12 remain mapped to their work orders
      expect(savedWos.find((w) => w.id === 'wo-m03').planned_month).toBe(3);
      expect(savedWos.find((w) => w.id === 'wo-m12').planned_month).toBe(12);

      // Month 9 was shifted to Month 10: wo-m09 must be mapped to Month 10 (diff = 1 vs diff = 4 for wo-m06)
      const wo10 = savedWos.find((w) => w.id === 'wo-m09');
      expect(wo10.planned_month).toBe(10);
      expect(wo10.due_date).toBe('2026-10-31');
      expect(wo10.status).toBe('OPEN');

      // Month 6 was removed from plan: wo-m06 must be CANCELLED
      const wo06 = savedWos.find((w) => w.id === 'wo-m06');
      expect(wo06.status).toBe('CANCELLED');
      expect(wo06.cancellation_category).toBe('PLAN_REVISION');
    });

    it('Cancels work order of removed asset even when department is only specified on asset record', async () => {
      const STORAGE_PLANS_KEY = 'qms-vcc-local-plans-v1';
      const STORAGE_PLAN_ITEMS_KEY = 'qms-vcc-local-plan-items-v1';
      const STORAGE_WO_KEY = 'qms-vcc-local-work-orders-v1';
      const STORAGE_ASSETS_KEY = 'qms-vcc-local-assets-v1';

      useStore.setState({
        currentUser: {
          id: 'u-mgt-approver',
          approval_level: 6,
          departments: ['QC'],
          status: 'ACTIVE'
        }
      });

      const rev01 = {
        id: 'plan-dept-asset-rev01',
        plan_year: 2026,
        department: 'QC',
        revision: '01',
        status: 'APPROVED',
        is_current: 1
      };

      const rev02 = {
        id: 'plan-dept-asset-rev02',
        plan_year: 2026,
        department: 'QC',
        revision: '02',
        parent_plan_id: rev01.id,
        status: 'PENDING_APPROVAL',
        is_current: 0,
        due_date_rule: 'END_OF_MONTH'
      };

      // In Rev.02, ASSET_REMOVED_NO_DEPT is removed! Only KEPT_ASSET remains
      const rev02Items = [
        { id: 'item-kept', plan_id: rev02.id, asset_id: 'KEPT_ASSET', planned_months: [7], is_group: 0 }
      ];

      // Assets registry has department 'QC'
      const assets = [
        { id: 'KEPT_ASSET', asset_code: 'KEPT_ASSET', department: 'QC', status: 'ACTIVE' },
        { id: 'ASSET_REMOVED_NO_DEPT', asset_code: 'REM001', department: 'QC', status: 'ACTIVE' }
      ];

      // Work order has NO department field on the work order object directly
      const existingWos = [
        {
          id: 'wo-no-dept-prop',
          wo_code: 'WO-2026-030',
          plan_year: 2026,
          plan_id: rev01.id,
          asset_id: 'ASSET_REMOVED_NO_DEPT',
          planned_month: 5,
          due_date: '2026-05-31',
          status: 'SCHEDULED'
          // notice: no department property here!
        }
      ];

      storageStore.set(STORAGE_PLANS_KEY, JSON.stringify([rev01, rev02]));
      storageStore.set(STORAGE_PLAN_ITEMS_KEY, JSON.stringify(rev02Items));
      storageStore.set(STORAGE_ASSETS_KEY, JSON.stringify(assets));
      storageStore.set(STORAGE_WO_KEY, JSON.stringify(existingWos));

      await approveVccPlan(rev02.id, 'อนุมัติแผนนำเครื่องมือออก');

      const savedWos = JSON.parse(storageStore.get(STORAGE_WO_KEY));
      const removedWo = savedWos.find((w) => w.id === 'wo-no-dept-prop');
      expect(removedWo).toBeDefined();
      expect(removedWo.status).toBe('CANCELLED');
      expect(removedWo.cancellation_category).toBe('PLAN_REVISION');
    });
  });

  describe('Part 3: Plan vs Actual Badge Display in AnnualPlanMonthCell', () => {
    const sampleItem = {
      id: 'item-st002',
      asset_id: 'ST002',
      asset_code: 'ST002',
      asset_name: 'Stopwatch ST002',
      planned_months: [3], // Planned in March
      provider_name: 'ทวนสอบภายใน'
    };

    const samplePlan = {
      id: 'plan-2026-qc',
      plan_year: 2026,
      department: 'QC',
      due_date_rule: 'END_OF_MONTH'
    };

    it('Case 1: Planned in March (Month 3) but actually executed in November (Month 11)', () => {
      const woDelayed = {
        id: 'wo-st002',
        wo_code: 'WO-2026-099',
        plan_id: samplePlan.id,
        plan_item_id: sampleItem.id,
        asset_id: sampleItem.asset_id,
        planned_month: 3,
        status: 'CLOSED',
        result_status: 'PASS',
        performed_at: '2026-11-20',
        due_date: '2026-03-31'
      };

      // 1. Render March Cell (Month 3) - Month A
      const { unmount: unmountMarch } = render(
        <table>
          <tbody>
            <tr>
              <AnnualPlanMonthCell
                month={3}
                item={sampleItem}
                plan={samplePlan}
                workOrders={[woDelayed]}
                canEditPlan={false}
              />
            </tr>
          </tbody>
        </table>
      );

      // March must show dashed indicator "แผน ➔ พ.ย." without checkmark and without green background
      const marchButton = screen.getByRole('button', { name: /เป้าหมายทวนสอบเดือน 3/i });
      expect(marchButton).toHaveTextContent('แผน ➔ พ.ย.');
      expect(marchButton).not.toHaveTextContent('✓');
      expect(marchButton.className).toContain('border-dashed');

      unmountMarch();

      // 2. Render November Cell (Month 11) - Month B
      render(
        <table>
          <tbody>
            <tr>
              <AnnualPlanMonthCell
                month={11}
                item={sampleItem}
                plan={samplePlan}
                workOrders={[woDelayed]}
                canEditPlan={false}
              />
            </tr>
          </tbody>
        </table>
      );

      // November must show single green badge "✓ ทำจริง (แผน มี.ค.)"
      const novBadge = screen.getByText(/✓ ทำจริง \(แผน มี\.ค\.\)/i);
      expect(novBadge).toBeInTheDocument();
      expect(novBadge.closest('button').className).toContain('bg-emerald-50');
    });

    it('Case 2: Completed on-time in the planned month (Month A == Month B)', () => {
      const onTimeItem = {
        id: 'item-st003',
        asset_id: 'ST003',
        asset_code: 'ST003',
        planned_months: [5], // Planned in May
        provider_name: 'ทวนสอบภายใน'
      };

      const woOnTime = {
        id: 'wo-st003',
        wo_code: 'WO-2026-100',
        plan_id: samplePlan.id,
        plan_item_id: onTimeItem.id,
        asset_id: onTimeItem.asset_id,
        planned_month: 5,
        status: 'CLOSED',
        result_status: 'PASS',
        performed_at: '2026-05-18',
        due_date: '2026-05-31'
      };

      render(
        <table>
          <tbody>
            <tr>
              <AnnualPlanMonthCell
                month={5}
                item={onTimeItem}
                plan={samplePlan}
                workOrders={[woOnTime]}
                canEditPlan={false}
              />
            </tr>
          </tbody>
        </table>
      );

      // May must show single green badge "✓ เสร็จสิ้น"
      const mayButton = screen.getByRole('button', { name: /เป้าหมายทวนสอบเดือน 5/i });
      expect(mayButton).toHaveTextContent('✓ เสร็จสิ้น');
      expect(mayButton.className).toContain('bg-emerald-50');
    });
  });
});
