import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../../../store/useStore';
import VccComplianceReportTab from '../components/VccComplianceReportTab';
import { canReadAllVccDepartments, filterReadableDepartments } from '../utils/departmentScope';
import { resetVccLocalStore } from '../api/vccApi';

const user = (over) => ({ id: 'u', name: 'U', department: 'QC', depts: ['QC'], approval_level: 2, ...over });

describe('VCC read scope: own department only, except MGT, DCC, QMR and L6+', () => {
  it('canReadAllVccDepartments follows the API rule', () => {
    expect(canReadAllVccDepartments(user())).toBe(false);
    expect(canReadAllVccDepartments(user({ department: 'LB', depts: ['LB'], approval_level: 5 }))).toBe(false);
    expect(canReadAllVccDepartments(user({ department: 'MGT', depts: ['MGT'] }))).toBe(true);
    expect(canReadAllVccDepartments(user({ depts: ['QC', 'MGT'] }))).toBe(true);
    expect(canReadAllVccDepartments(user({ isDcc: true, department: 'DC', depts: ['DC'] }))).toBe(true);
    expect(canReadAllVccDepartments(user({ isQmr: true }))).toBe(true);
    expect(canReadAllVccDepartments(user({ department: 'HR', depts: ['HR'], approval_level: 6 }))).toBe(true);
    expect(canReadAllVccDepartments(null)).toBe(false);
  });

  it('filterReadableDepartments keeps only the user\'s own departments unless they may read all', () => {
    const all = [{ code: 'QC' }, { code: 'LB' }, { code: 'MGT' }];
    const codes = (u) => filterReadableDepartments(u, all, (d) => d.code).map((d) => d.code);
    expect(codes(user({ depts: ['QC', 'LB'] }))).toEqual(['QC', 'LB']);
    expect(codes(user())).toEqual(['QC']);
    expect(codes(user({ department: 'MGT', depts: ['MGT'] }))).toEqual(['QC', 'LB', 'MGT']);
    expect(codes(user({ isDcc: true }))).toEqual(['QC', 'LB', 'MGT']);
  });

  describe('compliance report department filter', () => {
    beforeEach(() => {
      resetVccLocalStore();
    });

    const options = async () => {
      const select = await screen.findByLabelText('เลือกแผนกรายงาน Compliance');
      return [...select.querySelectorAll('option')].map((o) => o.value);
    };

    it('offers a QC user only QC', async () => {
      useStore.setState({ currentUser: user() });
      render(<MemoryRouter><VccComplianceReportTab /></MemoryRouter>);
      expect(await options()).toEqual(['', 'QC']);
    });

    it('offers MGT every department', async () => {
      useStore.setState({ currentUser: user({ department: 'MGT', depts: ['MGT'] }) });
      render(<MemoryRouter><VccComplianceReportTab /></MemoryRouter>);
      expect(await options()).toEqual(['', 'DC', 'QC', 'QA', 'MGT', 'LB', 'PD', 'WH', 'ENG']);
    });
  });
});
