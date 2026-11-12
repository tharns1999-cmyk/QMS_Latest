import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import AssetRegisterPage from '../pages/AssetRegisterPage';
import { resetVccLocalStore } from '../api/vccApi';
import { fetchVccWorkTasks, syncVccWorkTasks } from '../api/vccWorkOrderApi';

const WO_KEY = 'qms-vcc-local-work-orders-v1';
const base = {
  asset_id: 'vcc-seed-st002', provider_name: 'ห้องปฏิบัติการภายนอก', planned_month: 3, due_date: '2026-03-31',
  original_due_date: '2026-03-31', result_status: 'PENDING', nc_status: null, performed_by: null,
  created_at: '2026-10-28T04:00:00.000Z', created_by: 'dc4', updated_at: '2026-10-28T04:00:00.000Z', updated_by: 'dc4'
};
const WORK_ORDERS = [
  { ...base, id: 'wo-open', wo_code: 'WO-T-OPEN', status: 'OPEN' },
  { ...base, id: 'wo-far', wo_code: 'WO-T-FAR', status: 'SCHEDULED', due_date: '2099-12-31' },
  { ...base, id: 'wo-pending', wo_code: 'WO-T-PEND', status: 'PENDING_REVIEW', result_status: 'PASS', performed_by: 'qc2' },
  { ...base, id: 'wo-rejected', wo_code: 'WO-T-REJ', status: 'REJECTED', performed_by: 'qc2', rejected_reason: 'แนบใบรับรองผิด' },
  { ...base, id: 'wo-hold', wo_code: 'WO-T-HOLD', status: 'CLOSED', result_status: 'FAIL', nc_status: 'OPEN', performed_by: 'qc2' }
];
const user = (id, level, department = 'QC') => ({
  id, name: id, role: 'STAFF', department, depts: [department], approval_level: level, approvalLevel: level, isDcc: false, isQmr: false
});
const kindsFor = (tasks, woId) => tasks.filter((t) => t.wo_id === woId).map((t) => t.kind);

describe('VCC task inbox — work-order tasks', () => {
  beforeEach(() => {
    resetVccLocalStore();
    localStorage.setItem(WO_KEY, JSON.stringify(WORK_ORDERS));
    useStore.setState({
      masterDepartments: [{ code: 'QC', name_th: 'ควบคุมคุณภาพ', status: 'ACTIVE' }, { code: 'LB', name_th: 'ห้องแล็บ', status: 'ACTIVE' }],
      approvalMatrix: [{ docType: 'FM', minRequesterLevel: 1, requiredReviewerLevel: 4, requiredApproverLevel: 5 }]
    });
  });

  it('lists a step only for a user who may do it now (department, level, not their own result)', async () => {
    useStore.setState({ currentUser: user('qc2', 2) });
    let tasks = await fetchVccWorkTasks();
    expect(kindsFor(tasks, 'wo-open')).toEqual(['RECORD_RESULT']);
    expect(kindsFor(tasks, 'wo-far')).toEqual([]); // scheduled far ahead: not work yet
    expect(kindsFor(tasks, 'wo-rejected')).toEqual([]); // direct completion workflow: no revise task
    expect(kindsFor(tasks, 'wo-pending')).toEqual([]);
    expect(kindsFor(tasks, 'wo-hold')).toEqual([]);

    useStore.setState({ currentUser: user('qc4', 4) });
    tasks = await fetchVccWorkTasks();
    expect(kindsFor(tasks, 'wo-pending')).toEqual([]); // direct completion workflow: no review task
    expect(kindsFor(tasks, 'wo-rejected')).toEqual([]);
    expect(kindsFor(tasks, 'wo-hold')).toEqual([]); // below the approver level

    useStore.setState({ currentUser: user('qc5', 5) });
    tasks = await fetchVccWorkTasks();
    expect(kindsFor(tasks, 'wo-hold')).toEqual(['RELEASE_HOLD']);
    expect(tasks.map((t) => t.id)).toEqual([...new Set(tasks.map((t) => t.id))]);

    useStore.setState({ currentUser: user('lb4', 4, 'LB') });
    expect(await fetchVccWorkTasks()).toEqual([]);
  });

  it('the sidebar count source holds the same tasks, apart from the DCC task list', async () => {
    useStore.setState({ currentUser: user('qc5', 5) });
    const dccTasksBefore = useStore.getState().tasks;
    await syncVccWorkTasks();
    const { vccWorkTasks, tasks } = useStore.getState();
    expect(vccWorkTasks).toHaveLength((await fetchVccWorkTasks()).length);
    expect(vccWorkTasks.length).toBeGreaterThan(0);
    expect(tasks).toBe(dccTasksBefore);
  });

  it('inbox shows them under the right tabs with counts that add up, and opening one lands on that work order', async () => {
    useStore.setState({ currentUser: user('qc5', 5) });
    render(
      <MemoryRouter initialEntries={['/vcc/tasks']}>
        <AssetRegisterPage />
      </MemoryRouter>
    );

    const tab = (id) => screen.findByTestId(`vcc-inbox-tab-${id}`);
    await waitFor(async () => expect(within(await tab('RECORD_RESULT')).getByText('1')).toBeInTheDocument());
    expect(screen.getByTestId('vcc-work-task-RECORD_RESULT:wo-open')).toBeInTheDocument();
    expect(screen.getByTestId('vcc-work-task-RELEASE_HOLD:wo-hold')).toBeInTheDocument();
    expect(screen.queryByTestId('vcc-work-task-RECORD_RESULT:wo-far')).not.toBeInTheDocument();

    fireEvent.click(await tab('PENDING_APPROVAL'));
    expect(screen.getByTestId('vcc-work-task-RELEASE_HOLD:wo-hold')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('vcc-work-task-open-RELEASE_HOLD:wo-hold'));
    // the drawer of that very work order opens (on the tab it belongs to)
    await waitFor(() => expect(screen.getAllByText('WO-T-HOLD').length).toBeGreaterThan(0));
    expect(screen.queryByText('WO-T-OPEN')).not.toBeInTheDocument();
  });

  it('?wo=<id> opens that work order straight away on its own tab', async () => {
    useStore.setState({ currentUser: user('qc4', 4) });
    render(
      <MemoryRouter initialEntries={['/vcc/work-orders?wo=wo-pending']}>
        <AssetRegisterPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getAllByText('WO-T-PEND').length).toBeGreaterThan(1)); // table row + drawer
    expect(screen.getByRole('tab', { name: /ปิดงานแล้ว/ })).toHaveAttribute('aria-selected', 'true');
  });
});
