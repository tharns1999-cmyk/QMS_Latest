import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import AnnualPlanMatrixSection from '../components/AnnualPlanMatrixSection';
import { resetVccLocalStore } from '../api/vccApi';
import { getLocalPlans, fetchVccPlans } from '../api/vccPlanApi';

describe('VCC User Department Auto-Scoping and Legacy Form Code Sanitization', () => {
  beforeEach(() => {
    resetVccLocalStore();
    useStore.setState({
      currentUser: {
        id: 'sairung-lb',
        name: 'สายรุ้ง โคตรทองใส',
        department: 'LB',
        dept: 'LB',
        approval_level: 3,
        approvalLevel: 3,
        isDcc: false,
        isQmr: false
      },
      masterUsers: [
        { id: 'sairung-lb', name: 'สายรุ้ง โคตรทองใส', department: 'LB', approval_level: 3, status: 'ACTIVE' },
        { id: 'dc4', name: 'DC หัวหน้า (DCC)', department: 'DC', approval_level: 4, isDcc: true, status: 'ACTIVE' }
      ],
      masterDepartments: [
        { code: 'QC', name_th: 'ฝ่ายประกันและควบคุมคุณภาพ', status: 'ACTIVE' },
        { code: 'LB', name_th: 'ห้องปฏิบัติการจุลชีววิทยา', status: 'ACTIVE' },
        { code: 'DC', name_th: 'ศูนย์ควบคุมเอกสาร', status: 'ACTIVE' }
      ],
      departments: [
        { code: 'QC', name_th: 'ฝ่ายประกันและควบคุมคุณภาพ', status: 'ACTIVE' },
        { code: 'LB', name_th: 'ห้องปฏิบัติการจุลชีววิทยา', status: 'ACTIVE' },
        { code: 'DC', name_th: 'ศูนย์ควบคุมเอกสาร', status: 'ACTIVE' }
      ]
    });
  });

  it('1. automatically migrates legacy electronic codes (VCC-PLAN-LB) in localStorage to DCC controlled document codes', () => {
    // Seed legacy items in localStorage
    localStorage.setItem(
      'qms-vcc-local-plans-v1',
      JSON.stringify([
        {
          id: 'vcc-plan-2026-lb-legacy',
          plan_year: 2026,
          department: 'LB',
          document_code: 'VCC-PLAN-LB',
          revision: '01',
          title: 'แผนการทวนสอบประจำปี 2026',
          status: 'DRAFT',
          due_date_rule: 'END_OF_MONTH'
        }
      ])
    );

    const plans = getLocalPlans();
    const lbLegacy = plans.find((p) => p.id === 'vcc-plan-2026-lb-legacy');
    expect(lbLegacy.document_code).toBe('FM-LB-11');

    // Also verifies LB default plans were automatically appended
    const lbPlan = plans.find((p) => p.department === 'LB');
    expect(lbPlan).toBeDefined();
    expect(lbPlan.document_code).toBe('FM-LB-11');
  });

  it('2. restricts fetchVccPlans to user department for single-department user', async () => {
    const lbPlans = await fetchVccPlans({ status: 'ALL' });
    expect(lbPlans.every((p) => p.department === 'LB')).toBe(true);
    expect(lbPlans.some((p) => p.department === 'QC')).toBe(false);
  });

  it('3. renders LB plan when logged in as LB user', async () => {
    render(
      <MemoryRouter>
        <AnnualPlanMatrixSection
          activeDepartments={[{ code: 'LB', nameTh: 'ห้องปฏิบัติการจุลชีววิทยา', status: 'ACTIVE' }]}
        />
      </MemoryRouter>
    );

    // Verifies paperless revision badge is rendered
    const planBadges = await screen.findAllByText(/Rev\.01/i);
    expect(planBadges.length).toBeGreaterThanOrEqual(1);

    // Verifies department badge displays LB, not QC
    expect(screen.getAllByText(/ห้องปฏิบัติการจุลชีววิทยา \(LB\)/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/ฝ่ายประกันและควบคุมคุณภาพ \(QC\)/i)).not.toBeInTheDocument();
  });

  it('4. ensures controlled DCC document codes are used for LB plans without VCC-PLAN identifiers', () => {
    const plans = getLocalPlans();
    const lbPlans = plans.filter((p) => p.department === 'LB');
    expect(lbPlans.length).toBeGreaterThanOrEqual(1);
    for (const p of lbPlans) {
      expect(p.document_code).toBe('FM-LB-11');
      expect(p.document_code).not.toContain('VCC-PLAN');
    }
  });
});
